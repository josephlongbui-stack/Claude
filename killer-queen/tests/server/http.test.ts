import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { assertInvariants } from '../helpers/invariants.js';
import { TASK, seedExecutors, startTestServer, type TestServer } from '../helpers/server.js';

let s: TestServer;
before(async () => {
  s = await startTestServer();
  seedExecutors(s);
});
after(() => s.stop());

describe('HTTP API', () => {
  it('rejects unauthenticated and unknown keys with 401 { error, code }', async () => {
    const r = await s.api('GET', '/api/me');
    assert.equal(r.status, 401);
    assert.deepEqual(Object.keys(r.body).sort(), ['code', 'error']);
    assert.equal(r.body.code, 'unauthorized');
    const r2 = await s.api('GET', '/api/portfolio', { token: 'kq_nope' });
    assert.equal(r2.status, 401);
    const r3 = await s.api('POST', '/api/orders', { body: {} });
    assert.equal(r3.status, 401);
  });

  it('creates accounts, returns the key once, and never stores or returns it again', async () => {
    const r = await s.api('POST', '/api/accounts', { body: { name: 'Alice', kind: 'human', role: 'trader' } });
    assert.equal(r.status, 201);
    assert.match(r.body.apiKey, /^kq_[0-9a-f]{48}$/);
    assert.equal(r.body.account.cash, 100_000);
    assert.equal('keyHash' in r.body.account, false);
    const me = await s.api('GET', '/api/me', { token: r.body.apiKey });
    assert.equal(me.status, 200);
    assert.equal(me.body.account.id, r.body.account.id);
    assert.equal('keyHash' in me.body.account, false);
    assert.equal(JSON.stringify(s.booted.venue.engine.state).includes(r.body.apiKey), false);
    const bad = await s.api('POST', '/api/accounts', { body: { name: 'X', kind: 'human', role: 'admin' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'validation');
    const extra = await s.api('POST', '/api/accounts', { body: { name: 'X', kind: 'human', role: 'trader', cash: 1 } });
    assert.equal(extra.status, 400);
  });

  it('customer creates a task, traders place orders, quotes move, books show in market view', async () => {
    const cust = await s.signup('Customer', 'customer', 'human', 'Example Org');
    const alice = await s.signup('Alice', 'trader');
    const bob = await s.signup('Bob', 'trader');
    const forbidden = await s.api('POST', '/api/tasks', { token: alice.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, 'forbidden_role');
    const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['claude-code', 'codex'] } });
    assert.equal(created.status, 201);
    const taskId: string = created.body.task.id;
    assert.equal(created.body.markets.length, 2);
    assert.equal(created.body.task.status, 'open');
    assert.equal(created.body.task.closesAt, s.clock.now() + 600_000);
    const codex = `${taskId}:codex`;
    const q0 = (await s.api('GET', `/api/markets/${codex}`)).body.quote;
    assert.equal(q0.yesBid, null);
    assert.equal(q0.chance, 50);

    const o1 = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: codex, side: 'yes', price: 55, quantity: 10 } });
    assert.equal(o1.status, 201);
    assert.equal(o1.body.order.status, 'open');
    const o2 = await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', action: 'buy', type: 'limit', price: 40, quantity: 10 } });
    assert.equal(o2.status, 201);
    const q1 = (await s.api('GET', `/api/markets/${codex}`)).body;
    assert.equal(q1.quote.yesBid, 55);
    assert.equal(q1.quote.yesAsk, 60);
    assert.equal(q1.quote.chance, 58);
    assert.equal(q1.book.yes[0].price, 55);
    assert.equal(q1.book.no[0].price, 40);
    assert.equal(q1.packet.marketId, codex);
    assert.equal(q1.packet.executor.org, 'OpenAI');

    const o3 = await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 45, quantity: 4 } });
    assert.equal(o3.body.fills.length, 1);
    assert.equal(o3.body.fills[0].yesPrice, 55);
    const q2 = (await s.api('GET', `/api/markets/${codex}`)).body;
    assert.equal(q2.quote.lastPrice, 55);
    assert.equal(q2.quote.volume, 4);
    assert.equal(q2.trades.length, 1);
    const tasks = await s.api('GET', '/api/tasks');
    assert.equal(tasks.status, 200);
    const tv = tasks.body.tasks.find((t: any) => t.task.id === taskId);
    assert.equal(tv.recommendation.executorId, 'codex');
    const one = await s.api('GET', `/api/tasks/${taskId}`);
    assert.equal(one.body.markets[1].traders, 2);
    assert.equal('forceOutcome' in one.body.task, false);

    const pf = await s.api('GET', '/api/portfolio', { token: alice.apiKey });
    assert.equal(pf.body.positions[0].quantity, 4);
    assert.equal(pf.body.openOrders.length, 1);
    const cancel = await s.api('DELETE', `/api/orders/${o1.body.order.id}`, { token: bob.apiKey });
    assert.equal(cancel.status, 403);
    const cancel2 = await s.api('DELETE', `/api/orders/${o1.body.order.id}`, { token: alice.apiKey });
    assert.equal(cancel2.status, 200);
    assert.equal(cancel2.body.refunded, 6 * 56);
    const am = await s.api('GET', '/api/agent/markets', { token: alice.apiKey });
    assert.ok(am.body.markets.length >= 2);
    const c = await s.api('POST', `/api/markets/${codex}/comments`, { token: alice.apiKey, body: { text: 'Cart tests are simple.', probability: 62 } });
    assert.equal(c.status, 201);
    const theses = (await s.api('GET', `/api/markets/${codex}`)).body.theses;
    assert.equal(theses[0].probability, 62);
    assertInvariants(s.booted.venue.engine, 'after http trading');
  });

  it('validation errors are 400 with { error, code }, bad JSON is 400, unknown routes 404', async () => {
    const alice = await s.signup('Alice2', 'trader');
    const r = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: 'x', side: 'yes', price: 150, quantity: 1 } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'validation');
    const r2 = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: 'x', side: 'yes', quantity: 1 } });
    assert.equal(r2.status, 400);
    assert.match(r2.body.error, /price is required/);
    const r3 = await s.api('POST', '/api/orders', { token: alice.apiKey, raw: '{bad' });
    assert.equal(r3.status, 400);
    assert.equal(r3.body.code, 'bad_json');
    const r4 = await s.api('GET', '/api/nothing');
    assert.equal(r4.status, 404);
    const r5 = await s.api('GET', '/api/tasks/tsk_none');
    assert.equal(r5.status, 404);
    assert.equal(r5.body.code, 'task_not_found');
    const r6 = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: 'tsk_none:codex', side: 'yes', price: 50, quantity: 1 } });
    assert.equal(r6.status, 404);
    assert.equal(r6.body.code, 'market_not_found');
  });

  it('faucet works in sandbox and is refused inside the 24h window', async () => {
    const alice = await s.signup('Faucet Alice', 'trader');
    const r = await s.api('POST', '/api/wallet/faucet', { token: alice.apiKey });
    assert.equal(r.status, 200);
    assert.equal(r.body.account.cash, 200_000);
    const r2 = await s.api('POST', '/api/wallet/faucet', { token: alice.apiKey });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.code, 'faucet_cooldown');
    s.clock.advance(24 * 3_600_000);
    const r3 = await s.api('POST', '/api/wallet/faucet', { token: alice.apiKey });
    assert.equal(r3.status, 200);
  });

  it('conflicts are rejected over HTTP with 403', async () => {
    const cust = await s.signup('Conflict Customer', 'customer', 'human', 'Acme');
    const staffer = await s.signup('OpenAI staffer', 'trader', 'human', 'OpenAI');
    const colleague = await s.signup('Acme colleague', 'trader', 'human', 'Acme');
    const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
    const taskId = created.body.task.id;
    const r = await s.api('POST', '/api/orders', { token: staffer.apiKey, body: { marketId: `${taskId}:codex`, side: 'yes', price: 50, quantity: 1 } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'conflict');
    const ok = await s.api('POST', '/api/orders', { token: staffer.apiKey, body: { marketId: `${taskId}:claude-code`, side: 'yes', price: 50, quantity: 1 } });
    assert.equal(ok.status, 201);
    const r2 = await s.api('POST', '/api/orders', { token: cust.apiKey, body: { marketId: `${taskId}:codex`, side: 'yes', price: 50, quantity: 1 } });
    assert.equal(r2.status, 403);
    const r3 = await s.api('POST', '/api/orders', { token: colleague.apiKey, body: { marketId: `${taskId}:codex`, side: 'yes', price: 50, quantity: 1 } });
    assert.equal(r3.status, 403);
    const r4 = await s.api('POST', `/api/markets/${taskId}:codex/comments`, { token: staffer.apiKey, body: { text: 'no' } });
    assert.equal(r4.status, 403);
    const am = await s.api('GET', '/api/agent/markets', { token: staffer.apiKey });
    const codexView = am.body.markets.find((m: any) => m.packet.marketId === `${taskId}:codex`);
    assert.equal(codexView.canTrade, false);
  });

  it('leaderboard, stats, executors and health respond', async () => {
    for (const path of ['/api/leaderboard', '/api/stats', '/api/executors', '/api/health']) {
      const r = await s.api('GET', path);
      assert.equal(r.status, 200, path);
    }
    const ex = await s.api('GET', '/api/executors');
    assert.equal(ex.body.executors.length, 3);
    const h = await s.api('GET', '/api/health');
    assert.equal(h.body.mode, 'sandbox');
  });

  it('customer closes early and decides over HTTP; nobody else can', async () => {
    const cust = await s.signup('Closer', 'customer');
    const alice = await s.signup('Closer Alice', 'trader');
    const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
    const taskId = created.body.task.id;
    const r = await s.api('POST', `/api/tasks/${taskId}/close`, { token: alice.apiKey });
    assert.equal(r.status, 403);
    const r2 = await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.task.status, 'closed');
    const r3 = await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'gemini-cli' } });
    assert.equal(r3.status, 404);
    const r4 = await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: null } });
    assert.equal(r4.status, 200);
    assert.equal(r4.body.task.status, 'skipped');
    assert.equal(r4.body.markets[0].status, 'settled');
    assert.equal(r4.body.markets[0].outcome, 'skipped');
  });

  it('admin hand-settle needs the admin key and a running task', async () => {
    const cust = await s.signup('Admin Customer', 'customer');
    const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
    const taskId = created.body.task.id;
    await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
    await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'codex' } });
    const r = await s.api('POST', `/api/admin/tasks/${taskId}/settle`, { body: { outcome: 'passed' } });
    assert.equal(r.status, 401);
    const r2 = await s.api('POST', `/api/admin/tasks/${taskId}/settle`, { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { outcome: 'passed' } });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.task.status, 'resolved');
    assert.equal(r2.body.task.passed, true);
  });
});
