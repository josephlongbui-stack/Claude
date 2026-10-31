import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { agentMarkets, leaderboard, packet, portfolio, stats, taskView } from '../../src/engine/index.js';
import { buy, must, seedExchange } from '../helpers/fixtures.js';

describe('views', () => {
  it('packet has exactly the documented fields', () => {
    const f = seedExchange();
    const codex = f.markets[1]!;
    buy(f.venue, 'alice', codex, 'yes', 66, 10);
    buy(f.venue, 'bob', codex, 'no', 29, 10);
    const p = packet(f.venue.engine, codex);
    assert.deepEqual(Object.keys(p).sort(), ['closesAt', 'commit', 'executor', 'lastPrice', 'marketId', 'prompt', 'quote', 'repo', 'testCommand', 'title'].sort());
    assert.deepEqual(Object.keys(p.executor).sort(), ['chosen', 'id', 'name', 'org', 'passed', 'version'].sort());
    assert.deepEqual(p.quote, { yesBid: 66, yesAsk: 71, noBid: 29, noAsk: 34 });
    assert.equal(p.marketId, 'tsk_1:codex');
    assert.equal(p.executor.org, 'OpenAI');
    assert.equal(p.executor.version, '0.48.0');
    assert.equal(p.lastPrice, null);
    assert.equal(p.closesAt, f.venue.engine.task(f.taskId)!.closesAt);
    assert.equal(JSON.stringify(p).includes('forceOutcome'), false);
  });

  it('recommendation picks the highest-chance agent', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    buy(f.venue, 'alice', claude, 'yes', 40, 10);
    buy(f.venue, 'bob', claude, 'no', 50, 10); // mid 45
    buy(f.venue, 'carol', codex, 'yes', 70, 10);
    buy(f.venue, 'botty', codex, 'no', 24, 10); // mid 73
    const v = taskView(f.venue.engine, f.taskId);
    assert.deepEqual(v.recommendation, { executorId: 'codex', chance: 73 });
    assert.equal(v.markets.length, 2);
    assert.equal(v.markets[0]!.quote.chance, 45);
    assert.equal('forceOutcome' in v.task, false);
  });

  it('portfolio reflects netting, open orders and settled history', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', claude, 'no', 40, 10);
    buy(f.venue, 'bob', claude, 'yes', 60, 10);
    buy(f.venue, 'carol', claude, 'yes', 75, 10);
    buy(f.venue, 'bob', claude, 'no', 30, 10); // nets bob out at +150
    buy(f.venue, 'bob', claude, 'yes', 20, 3); // rests
    const p = portfolio(e, 'bob');
    assert.equal(p.positions.length, 0);
    assert.equal(p.openOrders.length, 1);
    assert.equal(p.pnl.realized, 150);
    assert.equal(p.pnl.fees, 20);
    assert.equal(p.locked, 3 * 21);
    const pa = portfolio(e, 'alice');
    assert.equal(pa.positions[0]!.side, 'no');
    assert.equal(pa.positions[0]!.quantity, 10);
    assert.equal(pa.positions[0]!.avgCost, 40);
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'failed', log: 'x' });
    const pa2 = portfolio(e, 'alice');
    assert.equal(pa2.positions.length, 0);
    assert.equal(pa2.history.length, 1);
    assert.equal(pa2.history[0]!.payout, 1000);
    assert.equal(pa2.pnl.realized, 600);
  });

  it('leaderboard includes humans and agents, ranked by profit and by accuracy', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    buy(f.venue, 'alice', claude, 'no', 40, 10);
    buy(f.venue, 'botty', claude, 'yes', 60, 10);
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: 'x' });
    const rows = leaderboard(f.venue.engine);
    const kinds = new Set(rows.map((r) => r.kind));
    assert.ok(kinds.has('human') && kinds.has('agent'));
    assert.ok(!rows.some((r) => r.id === 'mm' || r.id === 'house' || r.id === 'cust'));
    assert.equal(rows[0]!.id, 'botty');
    assert.equal(rows[0]!.profit, 400 - 10);
    assert.equal(rows[0]!.rankByProfit, 1);
    assert.equal(rows[0]!.rankByAccuracy, 1);
    assert.equal(rows[0]!.hits, 1);
    assert.ok(Math.abs(rows[0]!.brier! - 0.04) < 1e-9); // Yes at 60 → forecast 0.8 vs 1
    const alice = rows.find((r) => r.id === 'alice')!;
    assert.equal(alice.profit, -400);
    assert.equal(alice.hits, 0);
    assert.ok(Math.abs(alice.brier! - 0.49) < 1e-9); // No at 40 (Yes 60) → forecast 0.3 vs 1
    assert.equal(alice.rankByAccuracy, 2);
    const idle = rows.find((r) => r.id === 'carol')!;
    assert.equal(idle.brier, null);
    assert.equal(idle.rankByAccuracy, null);
  });

  it('stats computes gate metrics from settled markets', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    buy(f.venue, 'alice', claude, 'yes', 74, 10);
    buy(f.venue, 'bob', claude, 'no', 26, 10); // trade at 74, no book → closing 74
    buy(f.venue, 'carol', codex, 'yes', 40, 1);
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    must(f.venue, { type: 'settle', taskId: f.taskId, outcome: 'passed', log: 'x' });
    const s = stats(f.venue.engine);
    assert.equal(s.markets.settled, 2);
    assert.equal(s.markets.settledOnTests, 1);
    assert.ok(Math.abs(s.priceBrier! - 0.26 ** 2) < 1e-9);
    assert.ok(Math.abs(s.baseRateBrier! - 0.25) < 1e-9); // no history → 0.5
    assert.deepEqual(s.calibration70to80, { count: 1, passRate: 1 });
    assert.equal(s.medianTradersPerMarket, 1); // claude 2 traders, codex 0 → median 1
    assert.equal(s.volume, 10);
    assert.equal(s.fees, 10);
  });

  it('agent markets lists open markets with packet, book, position and conflict flag', () => {
    const f = seedExchange();
    const claude = f.markets[0]!;
    buy(f.venue, 'alice', claude, 'no', 40, 10);
    buy(f.venue, 'botty', claude, 'yes', 60, 10);
    buy(f.venue, 'botty', claude, 'yes', 50, 2);
    const ms = agentMarkets(f.venue.engine, 'botty');
    assert.equal(ms.length, 2);
    const m = ms.find((x) => x.packet.marketId === claude)!;
    assert.deepEqual(m.position, { yes: 10, no: 0, yesCost: 600, noCost: 0 });
    assert.equal(m.openOrders.length, 1);
    assert.equal(m.canTrade, true);
    const staff = agentMarkets(f.venue.engine, 'anthropic-staffer').find((x) => x.packet.marketId === claude)!;
    assert.equal(staff.canTrade, false);
    assert.match(staff.conflict!, /Anthropic/);
  });
});
