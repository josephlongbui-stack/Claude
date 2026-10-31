import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEventId } from '../../src/server/events.js';
import { TASK, seedExecutors, startTestServer, type TestServer } from '../helpers/server.js';

interface Frame {
  id: string | null;
  event: string;
  data: any;
}

/** A minimal SSE reader over fetch streaming. */
async function openStream(s: TestServer, query = '', lastEventId?: string) {
  const ctrl = new AbortController();
  const headers: Record<string, string> = {};
  if (lastEventId) headers['last-event-id'] = lastEventId;
  const res = await fetch(`${s.url}/api/events${query}`, { headers, signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const frames: Frame[] = [];
  const waiters: (() => void)[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (chunk.startsWith(':') || chunk.startsWith('retry:')) continue;
          const f: Frame = { id: null, event: 'message', data: null };
          for (const line of chunk.split('\n')) {
            if (line.startsWith('id: ')) f.id = line.slice(4);
            else if (line.startsWith('event: ')) f.event = line.slice(7);
            else if (line.startsWith('data: ')) f.data = JSON.parse(line.slice(6));
          }
          frames.push(f);
          for (const w of waiters.splice(0)) w();
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const waitFor = async (n: number, ms = 3000) => {
    const start = Date.now();
    while (frames.length < n) {
      if (Date.now() - start > ms) throw new Error(`timed out waiting for ${n} frames, have ${frames.length}: ${JSON.stringify(frames.map((f) => f.event))}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
  };
  return { frames, waitFor, close: () => ctrl.abort() };
}

describe('live events (SSE)', () => {
  it('event ids order by command sequence', () => {
    assert.equal(parseEventId('12-3'), 12003);
    assert.ok(parseEventId('13-0')! > parseEventId('12-999')!);
    assert.equal(parseEventId('nope'), null);
  });

  it('streams book, trade, task and thesis events in order; a reconnect with Last-Event-ID receives every missed event exactly once', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = await s.signup('SSE customer', 'customer');
      const alice = await s.signup('SSE Alice', 'trader');
      const bob = await s.signup('SSE Bob', 'trader');
      const stream = await openStream(s);
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
      const taskId = created.body.task.id;
      const codex = `${taskId}:codex`;
      await stream.waitFor(3); // task + 2 books
      assert.deepEqual(stream.frames.map((f) => f.event), ['task', 'book', 'book']);
      assert.equal(stream.frames[0]!.data.taskId, taskId);
      assert.equal(stream.frames[0]!.data.status, 'open');
      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 40, quantity: 5 } });
      await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: codex, side: 'yes', price: 60, quantity: 5 } });
      await s.api('POST', `/api/markets/${codex}/comments`, { token: alice.apiKey, body: { text: 'thesis', probability: 60 } });
      await stream.waitFor(7);
      const kinds = stream.frames.slice(3).map((f) => f.event);
      assert.deepEqual(kinds, ['book', 'trade', 'book', 'thesis']);
      assert.equal(stream.frames[4]!.data.fill.yesPrice, 60);
      assert.equal(stream.frames[5]!.data.quote.lastPrice, 60);
      const ids = stream.frames.map((f) => f.id!);
      for (let i = 1; i < ids.length; i++) assert.ok(parseEventId(ids[i])! > parseEventId(ids[i - 1])!, `ids in order: ${ids.join(' ')}`);
      const lastSeen = ids[ids.length - 1]!;
      stream.close();

      // While disconnected: a cancel, a close, a decide.
      const o = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: codex, side: 'yes', price: 30, quantity: 1 } });
      await s.api('DELETE', `/api/orders/${o.body.order.id}`, { token: alice.apiKey });
      await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
      await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'codex' } });

      const resumed = await openStream(s, '', lastSeen);
      await resumed.waitFor(8); // book, book, task+2 books, task+2 books
      const seqs = resumed.frames.map((f) => parseEventId(f.id!)!);
      assert.ok(seqs[0]! > parseEventId(lastSeen)!, 'nothing before the last seen id');
      for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i]! > seqs[i - 1]!, 'strictly increasing');
      assert.equal(new Set(resumed.frames.map((f) => f.id)).size, resumed.frames.length, 'no duplicates');
      assert.deepEqual(resumed.frames.map((f) => f.event), ['book', 'book', 'task', 'book', 'book', 'task', 'book', 'book']);
      assert.equal(resumed.frames[2]!.data.status, 'closed');
      assert.equal(resumed.frames[5]!.data.status, 'running');
      // and live events keep flowing on the resumed stream
      s.booted.runner!.flush();
      await resumed.waitFor(11);
      assert.equal(resumed.frames[8]!.event, 'task');
      assert.equal(resumed.frames[8]!.data.status, 'resolved');
      resumed.close();

      // filtered stream: only one market
      const filtered = await openStream(s, `?markets=${encodeURIComponent(`${taskId}:claude-code`)}`);
      const t2 = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${t2.body.task.id}:codex`, side: 'yes', price: 10, quantity: 1 } });
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(filtered.frames.length, 0, 'other markets filtered out');
      filtered.close();
    } finally {
      await s.stop();
    }
  });

  it('a client too far behind the buffer gets a reset', async () => {
    const s = await startTestServer({ env: { EVENTS_BUFFER_SIZE: '10' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Reset customer', 'customer');
      const alice = await s.signup('Reset Alice', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const m = `${created.body.task.id}:codex`;
      for (let i = 0; i < 15; i++) await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'yes', price: 10 + i, quantity: 1 } });
      const stream = await openStream(s, '', '1-0');
      await stream.waitFor(1);
      assert.equal(stream.frames[0]!.event, 'reset');
      stream.close();
    } finally {
      await s.stop();
    }
  });
});
