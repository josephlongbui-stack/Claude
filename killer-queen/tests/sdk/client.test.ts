import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tradeOnce } from '../../sdk/src/agentTemplate.js';
import { ApiError, KillerQueenClient } from '../../sdk/src/index.js';
import { houseBotFactories } from '../../src/bots/index.js';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('SDK client', () => {
  it('drives the whole loop against a sandbox exchange with typed calls', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = new KillerQueenClient({ baseUrl: s.url });
      const acct = await cust.createAccount({ name: 'SDK customer', kind: 'human', role: 'customer' });
      assert.match(acct.apiKey, /^kq_/);
      assert.equal(cust.apiKey, acct.apiKey);
      const task = await cust.createTask({ ...TASK, candidateAgents: ['codex', 'claude-code'] });
      assert.equal(task.task.status, 'open');
      const codex = task.markets[0]!.marketId;

      const alice = new KillerQueenClient({ baseUrl: s.url });
      await alice.createAccount({ name: 'SDK Alice', kind: 'agent', role: 'trader', org: 'Indie' });
      const bob = new KillerQueenClient({ baseUrl: s.url });
      await bob.createAccount({ name: 'SDK Bob', kind: 'human', role: 'trader' });
      const resting = await bob.placeOrder({ marketId: codex, side: 'no', price: 40, quantity: 10 });
      assert.equal(resting.order.status, 'open');
      const am = await alice.agentMarkets();
      assert.equal(am.markets.length, 2);
      const taken = await alice.placeOrder({ marketId: codex, side: 'yes', type: 'limit', price: 60, quantity: 4, tif: 'ioc' });
      assert.equal(taken.fills.length, 1);
      await alice.comment(codex, { text: 'thesis', probability: 60 });
      const mv = await alice.market(codex);
      assert.equal(mv.theses.length, 1);
      assert.equal((await alice.portfolio()).positions[0]!.quantity, 4);
      await assert.rejects(() => cust.placeOrder({ marketId: codex, side: 'yes', price: 50, quantity: 1 }), (e: unknown) => e instanceof ApiError && e.status === 403 && e.code === 'conflict');
      await assert.rejects(() => alice.placeOrder({ marketId: codex, side: 'yes', price: 150 as never, quantity: 1 }), (e: unknown) => e instanceof ApiError && e.status === 400);
      await bob.cancelOrder(resting.order.id);
      await cust.closeTask(task.task.id);
      const decided = await cust.decide(task.task.id, { executorId: 'codex' });
      assert.equal(decided.task.status, 'running');
      s.booted.runner!.flush();
      assert.equal((await alice.task(task.task.id)).task.status, 'resolved');
      assert.ok((await alice.leaderboard()).leaderboard.length >= 2);
      assert.ok((await alice.stats()).markets.settled >= 2);
      assert.equal((await alice.executors()).executors.length, 3);
      assert.equal((await alice.faucet()).added, 100_000);
    } finally {
      await s.stop();
    }
  });

  it('a retried order reuses its Idempotency-Key and never places twice', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = new KillerQueenClient({ baseUrl: s.url });
      await cust.createAccount({ name: 'Retry customer', kind: 'human', role: 'customer' });
      const task = await cust.createTask({ ...TASK, candidateAgents: ['codex'] });
      let failures = 2;
      const flakyFetch: typeof fetch = async (url, init) => {
        const r = await fetch(url, init);
        if (String(url).endsWith('/api/orders') && failures > 0) {
          failures -= 1;
          throw new TypeError('fetch failed: connection reset after the request was sent');
        }
        return r;
      };
      const alice = new KillerQueenClient({ baseUrl: s.url, fetchImpl: flakyFetch, sleep: async () => undefined });
      await alice.createAccount({ name: 'Retry Alice', kind: 'human', role: 'trader' });
      const r = await alice.placeOrder({ marketId: task.markets[0]!.marketId, side: 'yes', price: 30, quantity: 3 });
      assert.equal(r.replayed, true, 'the third attempt replayed the order placed by the first');
      assert.equal(s.booted.venue.engine.state.orders.size, 1);
      assert.equal(failures, 0);
    } finally {
      await s.stop();
    }
  });

  it('backs off on 429 and the stream resumes', async () => {
    const s = await startTestServer({ env: { RATE_LIMIT_ORDERS_PER_MIN: '2' } });
    try {
      seedExecutors(s);
      const cust = new KillerQueenClient({ baseUrl: s.url });
      await cust.createAccount({ name: 'RL customer', kind: 'human', role: 'customer' });
      const task = await cust.createTask({ ...TASK, candidateAgents: ['codex'] });
      const m = task.markets[0]!.marketId;
      const sleeps: number[] = [];
      const alice = new KillerQueenClient({
        baseUrl: s.url,
        retries: 2,
        sleep: async (ms) => {
          sleeps.push(ms);
          s.clock.advance(60_000); // the server's bucket refills while we "wait"
        },
      });
      await alice.createAccount({ name: 'RL Alice', kind: 'human', role: 'trader' });
      const events: string[] = [];
      const stop = alice.events((e) => events.push(e.type), { markets: [m] });
      for (let i = 0; i < 3; i++) await alice.placeOrder({ marketId: m, side: 'yes', price: 10 + i, quantity: 1 });
      assert.equal(sleeps.length, 1, 'third order hit the limit once and retried after backing off');
      await new Promise((r) => setTimeout(r, 200));
      stop();
      assert.deepEqual(events, ['book', 'book', 'book']);
    } finally {
      await s.stop();
    }
  });

  it('the agent template posts a thesis, trades the edge and respects limits and conflicts', async () => {
    const s = await startTestServer({ env: { HOUSE_BOTS: 'mm' }, bots: houseBotFactories() });
    try {
      seedExecutors(s);
      const cust = new KillerQueenClient({ baseUrl: s.url });
      await cust.createAccount({ name: 'Tpl customer', kind: 'human', role: 'customer' });
      const task = await cust.createTask({ ...TASK, candidateAgents: ['codex', 'claude-code'] });
      await s.booted.tick(); // market maker quotes 46/54
      const agent = new KillerQueenClient({ baseUrl: s.url });
      await agent.createAccount({ name: 'Template agent', kind: 'agent', role: 'trader', org: 'Anthropic' });
      const estimate = async (packet: { marketId: string }) => ({ probability: packet.marketId.endsWith(':codex') ? 70 : 30, rationale: 'template says so' });
      const a1 = await tradeOnce(agent, { estimate, size: 10, maxPosition: 15 });
      const codex = a1.find((a) => a.marketId.endsWith(':codex'))!;
      const claude = a1.find((a) => a.marketId.endsWith(':claude-code'))!;
      assert.equal(codex.action, 'buy-yes');
      assert.match(codex.detail, /10 filled/);
      assert.equal(claude.action, 'blocked');
      await s.booted.tick();
      const a2 = await tradeOnce(agent, { estimate, size: 10, maxPosition: 15 });
      assert.match(a2.find((a) => a.marketId.endsWith(':codex'))!.detail, /×5/); // capped at the limit
      await s.booted.tick();
      const a3 = await tradeOnce(agent, { estimate, size: 10, maxPosition: 15 });
      assert.equal(a3.find((a) => a.marketId.endsWith(':codex'))!.action, 'at-limit');
      const mv = await agent.market(task.markets[0]!.marketId);
      assert.equal(mv.theses.filter((t) => t.text === 'template says so').length, 1);
    } finally {
      await s.stop();
    }
  });
});
