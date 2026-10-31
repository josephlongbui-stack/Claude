import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executorRecords, quote } from '../../src/engine/index.js';
import { START_CASH, buy, must, mustReject, seedExchange } from '../helpers/fixtures.js';

describe('close, decide, settle', () => {
  it('close cancels open orders, returns locks, records closing prices; nobody can trade after', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    const e = f.venue.engine;
    buy(f.venue, 'alice', claude, 'yes', 60, 10);
    buy(f.venue, 'bob', claude, 'no', 34, 10); // yes ask 66, spread 6 → mid 63
    buy(f.venue, 'carol', codex, 'yes', 30, 5); // one-sided, no trades → 50
    mustReject(f.venue, { type: 'closeTask', taskId: f.taskId, by: 'alice' }, 'forbidden');
    const r = must(f.venue, { type: 'closeTask', taskId: f.taskId, by: 'cust' });
    assert.equal(r.task.status, 'closed');
    assert.equal(r.cancelledOrders, 3);
    assert.equal(e.market(claude)!.closingPrice, 63);
    assert.equal(e.market(claude)!.closingSpread, 6);
    assert.equal(e.market(codex)!.closingPrice, 50);
    for (const id of ['alice', 'bob', 'carol']) {
      assert.equal(e.account(id)!.locked, 0);
      assert.equal(e.account(id)!.cash, START_CASH);
    }
    mustReject(f.venue, { type: 'placeOrder', account: 'alice', market: claude, side: 'yes', action: 'buy', orderType: 'limit', price: 50, quantity: 1 }, 'market_closed');
    mustReject(f.venue, { type: 'closeTask', taskId: f.taskId, by: 'cust' }, 'task_not_open');
    mustReject(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: '' }, 'task_not_running');
  });

  it('closing price: wide spread falls back to last trade, then 50', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    const e = f.venue.engine;
    buy(f.venue, 'alice', claude, 'no', 40, 10);
    buy(f.venue, 'bob', claude, 'yes', 60, 10); // trade at 60
    buy(f.venue, 'alice', claude, 'yes', 30, 10);
    buy(f.venue, 'bob', claude, 'no', 40, 10); // bid 30 / ask 60: spread 30 > 20
    buy(f.venue, 'carol', codex, 'yes', 10, 1);
    buy(f.venue, 'alice', codex, 'no', 10, 1); // bid 10 / ask 90, no trades
    must(f.venue, { type: 'closeTask', taskId: f.taskId, by: null });
    assert.equal(e.market(claude)!.closingPrice, 60);
    assert.equal(e.market(codex)!.closingPrice, 50);
  });

  it('closing mid rounds half up (D7)', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    buy(f.venue, 'alice', claude, 'yes', 66, 1);
    buy(f.venue, 'bob', claude, 'no', 29, 1); // ask 71; (66+71)/2 = 68.5 → 69
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    assert.equal(f.venue.engine.market(claude)!.closingPrice, 69);
  });

  it('decide settles unchosen markets at the closing price; settle pays the chosen one on the test result', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    const e = f.venue.engine;
    // claude market: alice 10 Yes at 60, bob 10 No at 40; book left: alice yes 62 / bob no 32 → mid 65
    buy(f.venue, 'bob', claude, 'no', 40, 10);
    buy(f.venue, 'alice', claude, 'yes', 60, 10);
    buy(f.venue, 'alice', claude, 'yes', 62, 5);
    buy(f.venue, 'bob', claude, 'no', 32, 5);
    // codex market: carol 20 Yes at 30 vs botty 20 No at 70; closing: no book → last trade 30
    buy(f.venue, 'botty', codex, 'no', 70, 20);
    buy(f.venue, 'carol', codex, 'yes', 30, 20);
    const cash = (id: string) => e.account(id)!.cash;
    const before = { alice: cash('alice'), bob: cash('bob'), carol: cash('carol'), botty: cash('botty') };
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    assert.equal(e.market(claude)!.closingPrice, 65);
    assert.equal(e.market(codex)!.closingPrice, 30);
    // locks came back
    assert.equal(cash('alice'), before.alice + 5 * 63);
    assert.equal(cash('bob'), before.bob + 5 * 33);

    mustReject(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'gemini-cli', by: 'cust' }, 'not_a_candidate');
    mustReject(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code', by: 'bob' }, 'forbidden');
    const d = must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code', by: 'cust' });
    assert.equal(d.task.status, 'running');
    assert.equal(d.task.chosenAgent, 'claude-code');
    assert.equal(d.settled.length, 1);
    // codex settled at 30: carol gets 20 × 30 = 600 for Yes; botty 20 × 70 = 1400 for No
    const cx = e.market(codex)!;
    assert.equal(cx.status, 'settled');
    assert.equal(cx.outcome, 'unchosen');
    assert.equal(cx.settlementPrice, 30);
    assert.equal(cx.escrow, 0);
    assert.equal(cash('carol'), before.carol + 600);
    assert.equal(cash('botty'), before.botty + 1400);
    assert.equal(e.position(codex, 'carol')!.realized, 0); // bought at 30, paid 30
    assert.equal(e.position(codex, 'carol')!.closed!.outcome, 'unchosen');
    assert.equal(e.market(claude)!.status, 'running');
    mustReject(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code', by: 'cust' }, 'task_not_closed');
    mustReject(f.venue, { type: 'decide', taskId: f.taskId, executorId: null, by: 'cust' }, 'task_not_closed');
    assert.equal(executorRecords(f.venue.engine).find((r) => r.id === 'claude-code')!.chosen, 1);

    const s = must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: 'all green', runId: 'run-1' });
    assert.equal(s.task.status, 'resolved');
    assert.equal(s.task.passed, true);
    assert.equal(s.task.runLog, 'all green');
    const cl = e.market(claude)!;
    assert.equal(cl.status, 'settled');
    assert.equal(cl.settlementPrice, 100);
    assert.equal(cl.outcome, 'passed');
    assert.equal(cl.escrow, 0);
    assert.equal(cl.openInterest, 0);
    assert.equal(cash('alice'), before.alice + 5 * 63 + 10 * 100);
    assert.equal(cash('bob'), before.bob + 5 * 33 + 0);
    assert.equal(e.position(claude, 'alice')!.realized, 400); // 1000 − 600
    assert.equal(e.position(claude, 'bob')!.realized, -400);
    const rec = executorRecords(f.venue.engine).find((r) => r.id === 'claude-code')!;
    assert.equal(rec.chosen, 1);
    assert.equal(rec.passed, 1);
    assert.deepEqual(rec.byVersion, { '2.1.0': { chosen: 1, passed: 1 } });
    mustReject(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: '', runId: 'run-2' }, 'task_not_running');
    assert.equal(quote(f.venue.engine, claude).chance, 100);
  });

  it('a failed result pays No holders; a reused runId is rejected', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'bob', claude, 'no', 40, 10);
    buy(f.venue, 'alice', claude, 'yes', 60, 10);
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    const bob = e.account('bob')!.cash;
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'failed', log: 'red', runId: 'run-A' });
    assert.equal(e.account('bob')!.cash, bob + 1000);
    assert.equal(e.market(claude)!.settlementPrice, 0);
    assert.equal(e.task(f.taskId)!.passed, false);
    // second task, same runId
    const t2 = must(f.venue, { type: 'createTask', customer: 'cust', title: 't2', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] });
    must(f.venue, { type: 'closeTask', taskId: t2.task.id });
    must(f.venue, { type: 'decide', taskId: t2.task.id, executorId: 'codex' });
    mustReject(f.venue, { type: 'settle', taskId: t2.task.id, outcome: 'failed', log: '', runId: 'run-A' }, 'run_id_used');
    mustReject(f.venue, { type: 'settle', taskId: t2.task.id, outcome: 'maybe' as never, log: '' }, 'bad_outcome');
  });

  it('infra_error settles the chosen market at the closing price and does not count in the record (D6)', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'bob', claude, 'no', 40, 10);
    buy(f.venue, 'alice', claude, 'yes', 60, 10); // last trade 60; no book → closing 60
    const aliceBefore = e.account('alice')!.cash;
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'infra_error', log: 'container died' });
    assert.equal(e.market(claude)!.settlementPrice, 60);
    assert.equal(e.market(claude)!.outcome, 'infra_error');
    assert.equal(e.account('alice')!.cash, aliceBefore + 600);
    assert.equal(e.task(f.taskId)!.passed, null);
    const rec = executorRecords(f.venue.engine).find((r) => r.id === 'claude-code')!;
    assert.equal(rec.chosen, 0);
  });

  it('skip settles every market at its closing price and marks the task skipped', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    const e = f.venue.engine;
    buy(f.venue, 'bob', claude, 'no', 40, 10);
    buy(f.venue, 'alice', claude, 'yes', 60, 10);
    buy(f.venue, 'carol', codex, 'yes', 20, 10);
    buy(f.venue, 'botty', codex, 'no', 80, 10);
    const alice = e.account('alice')!.cash;
    const carol = e.account('carol')!.cash;
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    const d = must(f.venue, { type: 'decide', taskId: f.taskId, executorId: null, by: 'cust' });
    assert.equal(d.task.status, 'skipped');
    assert.equal(d.settled.length, 2);
    assert.equal(e.market(claude)!.outcome, 'skipped');
    assert.equal(e.market(codex)!.outcome, 'skipped');
    assert.equal(e.account('alice')!.cash, alice + 600);
    assert.equal(e.account('carol')!.cash, carol + 200);
    let escrow = 0;
    for (const m of e.state.markets.values()) escrow += m.escrow;
    assert.equal(escrow, 0);
    mustReject(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: '' }, 'task_not_running');
  });

  it('createTask validation: customer role, candidates, closesAt, minimumChance', () => {
    const f = seedExchange({ withTask: false });
    const base = { type: 'createTask' as const, customer: 'cust', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] };
    mustReject(f.venue, { ...base, customer: 'alice' }, 'forbidden_role');
    mustReject(f.venue, { ...base, candidateAgents: [] }, 'no_candidates');
    mustReject(f.venue, { ...base, candidateAgents: ['codex', 'codex'] }, 'duplicate_candidate');
    mustReject(f.venue, { ...base, candidateAgents: ['nope'] }, 'executor_not_found');
    mustReject(f.venue, { ...base, title: ' ' }, 'bad_field');
    mustReject(f.venue, { ...base, closesAt: f.clock.now() }, 'bad_closes_at');
    mustReject(f.venue, { ...base, minimumChance: 100 }, 'bad_minimum_chance');
    const r = must(f.venue, { ...base, closesAt: f.clock.now() + 1000, autoDecide: true, minimumChance: 70 });
    assert.equal(r.task.closesAt, f.clock.now() + 1000);
    assert.equal(r.task.autoDecide, true);
    assert.equal(r.task.minimumChance, 70);
    const r2 = must(f.venue, { ...base });
    assert.equal(r2.task.closesAt, f.clock.now() + 600_000);
    assert.equal(r2.task.id, 'tsk_2');
  });
});

describe('pause trading (D26) and client keys (D27)', () => {
  it('while paused no order is accepted; cancels, close, decide and settle still work', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const o = buy(f.venue, 'alice', m, 'yes', 40, 5);
    mustReject(f.venue, { type: 'pauseTrading', paused: true, reason: 'x', by: 'alice' }, 'forbidden');
    const p = must(f.venue, { type: 'pauseTrading', paused: true, reason: 'incident 12', by: 'admin' });
    assert.equal(p.paused, true);
    assert.equal(f.venue.engine.state.trading.since, f.clock.now());
    mustReject(f.venue, { type: 'placeOrder', account: 'bob', market: m, side: 'no', action: 'buy', orderType: 'limit', price: 60, quantity: 5 }, 'trading_paused');
    must(f.venue, { type: 'cancelOrder', account: 'alice', orderId: o.order.id });
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'codex' });
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'failed', log: '' });
    must(f.venue, { type: 'pauseTrading', paused: false, by: null });
    assert.equal(f.venue.engine.state.trading.paused, false);
    assert.equal(f.venue.engine.state.trading.reason, '');
    const t2 = must(f.venue, { type: 'createTask', customer: 'cust', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] });
    buy(f.venue, 'bob', t2.markets[0]!.id, 'no', 60, 5);
  });

  it('a second order with the same client key is rejected and the first can be looked up', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const first = must(f.venue, { type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 40, quantity: 5, clientKey: 'retry-1' });
    mustReject(f.venue, { type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 40, quantity: 5, clientKey: 'retry-1' }, 'duplicate_client_key');
    assert.equal(f.venue.engine.orderByClientKey('alice', 'retry-1')!.id, first.order.id);
    // another account may reuse the same key string
    must(f.venue, { type: 'placeOrder', account: 'bob', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 40, quantity: 5, clientKey: 'retry-1' });
    mustReject(f.venue, { type: 'placeOrder', account: 'bob', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 40, quantity: 5, clientKey: '' }, 'bad_client_key');
    // a rejected order does not consume its key
    mustReject(f.venue, { type: 'placeOrder', account: 'carol', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 0, quantity: 5, clientKey: 'k2' }, 'bad_price');
    must(f.venue, { type: 'placeOrder', account: 'carol', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 10, quantity: 5, clientKey: 'k2' });
  });
});
