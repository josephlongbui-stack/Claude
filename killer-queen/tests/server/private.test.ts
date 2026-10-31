import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { agentMarkets, allTasks } from '../../src/engine/index.js';
import { must, mustReject, seedExchange } from '../helpers/fixtures.js';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('private tasks (5.4)', () => {
  it('engine: only the customer, admins, the house and vetted traders see or trade a private task', () => {
    const f = seedExchange();
    const t = must(f.venue, { type: 'createTask', customer: 'cust', title: 'secret', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'x', candidateAgents: ['codex'], visibility: 'private' });
    const m = t.markets[0]!.id;
    const e = f.venue.engine;
    assert.equal(e.canSeeTask(null, t.task), false);
    assert.equal(e.canSeeTask(e.account('alice'), t.task), false);
    assert.equal(e.canSeeTask(e.account('cust'), t.task), true);
    assert.equal(e.canSeeTask(e.account('admin'), t.task), true);
    assert.equal(e.canSeeTask(e.account('mm'), t.task), true);
    mustReject(f.venue, { type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 50, quantity: 1 }, 'private_task');
    mustReject(f.venue, { type: 'comment', account: 'alice', market: m, text: 'x' }, 'private_task');
    assert.deepEqual(allTasks(e, null).map((x) => x.task.id), [f.taskId]);
    assert.deepEqual(allTasks(e, e.account('alice')).map((x) => x.task.id), [f.taskId]);
    assert.deepEqual(allTasks(e, e.account('cust')).map((x) => x.task.id).sort(), [f.taskId, t.task.id].sort());
    assert.equal(agentMarkets(e, 'alice').some((x) => x.packet.marketId === m), false);
    must(f.venue, { type: 'reviewAccount', account: 'alice', vetted: true, by: 'admin' });
    assert.equal(agentMarkets(e, 'alice').some((x) => x.packet.marketId === m), true);
    must(f.venue, { type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 50, quantity: 1 });
  });

  it('HTTP and the event stream never hand a private packet to an unvetted account or the public', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = await s.signup('Private customer', 'customer');
      const alice = await s.signup('Unvetted Alice', 'trader');
      const vera = await s.signup('Vetted Vera', 'trader');
      const vet = await s.api('POST', `/api/admin/accounts/${vera.id}/review`, { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { vetted: true } });
      assert.equal(vet.status, 200);
      assert.equal(vet.body.account.vetted, true);
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, title: 'SECRET-PACKET', candidateAgents: ['codex'], visibility: 'private' } });
      assert.equal(created.status, 201);
      const taskId = created.body.task.id;
      const m = `${taskId}:codex`;
      const publicTask = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });

      // an unvetted stream opened before the private task existed
      const ctrl = new AbortController();
      const streamRes = await fetch(`${s.url}/api/events`, { headers: { authorization: `Bearer ${alice.apiKey}` }, signal: ctrl.signal });
      const reader = streamRes.body!.getReader();
      let streamText = '';
      const pump = (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            streamText += new TextDecoder().decode(value);
          }
        } catch {
          /* aborted */
        }
      })();

      for (const token of [undefined, alice.apiKey]) {
        const list = await s.api('GET', '/api/tasks', { token });
        assert.equal(JSON.stringify(list.body).includes('SECRET-PACKET'), false);
        assert.equal(list.body.tasks.some((t: any) => t.task.id === taskId), false);
        assert.equal((await s.api('GET', `/api/tasks/${taskId}`, { token })).status, 404);
        assert.equal((await s.api('GET', `/api/markets/${m}`, { token })).status, 404);
      }
      const am = await s.api('GET', '/api/agent/markets', { token: alice.apiKey });
      assert.equal(JSON.stringify(am.body).includes('SECRET-PACKET'), false);
      const order = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'yes', price: 50, quantity: 1 } });
      assert.equal(order.status, 404);
      assert.equal((await s.api('POST', `/api/markets/${m}/comments`, { token: alice.apiKey, body: { text: 'x' } })).status, 404);

      // the customer and the vetted trader see it; vera trades it
      assert.equal((await s.api('GET', `/api/tasks/${taskId}`, { token: cust.apiKey })).status, 200);
      const vv = await s.api('GET', `/api/markets/${m}`, { token: vera.apiKey });
      assert.equal(vv.status, 200);
      assert.equal(vv.body.packet.title, 'SECRET-PACKET');
      assert.equal((await s.api('POST', '/api/orders', { token: vera.apiKey, body: { marketId: m, side: 'yes', price: 50, quantity: 2 } })).status, 201);
      await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${publicTask.body.task.id}:codex`, side: 'yes', price: 50, quantity: 1 } });
      await new Promise((r) => setTimeout(r, 200));
      ctrl.abort();
      await pump;
      assert.equal(streamText.includes(taskId), false, 'no private task id on the unvetted stream');
      assert.equal(streamText.includes('SECRET-PACKET'), false);
      assert.ok(streamText.includes(publicTask.body.task.id), 'public events still flow');
      // leaderboard/stats are aggregate only
      const lb = await s.api('GET', '/api/leaderboard');
      assert.equal(JSON.stringify(lb.body).includes('SECRET-PACKET'), false);
      assert.equal(JSON.stringify(lb.body).includes(taskId), false);
    } finally {
      await s.stop();
    }
  });
});
