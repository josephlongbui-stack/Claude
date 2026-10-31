import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alerts, linkedBy } from '../../src/engine/index.js';
import { buy, must, seedExchange } from '../helpers/fixtures.js';

const kinds = (f: ReturnType<typeof seedExchange>, opts = {}) => alerts(f.venue.engine, opts).map((a) => a.kind);

describe('surveillance (5.1): alerts from the journal', () => {
  it('a clean exchange has no alerts', () => {
    const f = seedExchange();
    buy(f.venue, 'alice', f.markets[0]!, 'no', 40, 10);
    buy(f.venue, 'bob', f.markets[0]!, 'yes', 60, 10);
    assert.deepEqual(kinds(f), []);
  });

  it('wash trading: fills between accounts that share an org, person, email or device', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    must(f.venue, { type: 'createAccount', id: 'twin-a', name: 'A', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000, emailHash: 'a'.repeat(64) });
    must(f.venue, { type: 'createAccount', id: 'twin-b', name: 'B', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000, emailHash: 'a'.repeat(64) });
    assert.equal(linkedBy(f.venue.engine.account('twin-a')!, f.venue.engine.account('twin-b')!), 'same email');
    assert.equal(linkedBy(f.venue.engine.account('alice')!, f.venue.engine.account('bob')!), null);
    buy(f.venue, 'twin-a', m, 'no', 40, 10);
    buy(f.venue, 'twin-b', m, 'yes', 60, 10);
    buy(f.venue, 'twin-a', m, 'no', 42, 5);
    buy(f.venue, 'twin-b', m, 'yes', 58, 5);
    const a = alerts(f.venue.engine).filter((x) => x.kind === 'wash_trade');
    assert.equal(a.length, 1);
    assert.deepEqual(a[0]!.accounts, ['twin-a', 'twin-b']);
    assert.equal(a[0]!.evidence.fills, 2);
    assert.equal(a[0]!.evidence.quantity, 15);
    assert.equal(a[0]!.severity, 'high');
    // the same org on both sides counts too
    must(f.venue, { type: 'createAccount', id: 'fund-1', name: 'F1', kind: 'agent', role: 'trader', org: 'Fund', keyHash: null, startingCash: 100_000 });
    must(f.venue, { type: 'createAccount', id: 'fund-2', name: 'F2', kind: 'agent', role: 'trader', org: 'Fund', keyHash: null, startingCash: 100_000 });
    buy(f.venue, 'fund-1', f.markets[1]!, 'no', 50, 3);
    buy(f.venue, 'fund-2', f.markets[1]!, 'yes', 50, 3);
    assert.equal(alerts(f.venue.engine).filter((x) => x.kind === 'wash_trade').length, 2);
  });

  it('spoofing: three large orders cancelled within the window and never filled; smaller or slower cancels do not count', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    must(f.venue, { type: 'deposit', account: 'alice', amount: 10_000_000, reason: 'admin' });
    for (let i = 0; i < 3; i++) {
      const o = buy(f.venue, 'alice', m, 'yes', 30, 150);
      f.clock.advance(2_000);
      must(f.venue, { type: 'cancelOrder', account: 'alice', orderId: o.order.id });
    }
    const a = alerts(f.venue.engine).filter((x) => x.kind === 'spoofing');
    assert.equal(a.length, 1);
    assert.deepEqual(a[0]!.accounts, ['alice']);
    assert.equal((a[0]!.evidence.orders as unknown[]).length, 3);
    // bob: big but slow cancels (not spoofing); carol: fast but small (not spoofing)
    for (let i = 0; i < 3; i++) {
      const o = buy(f.venue, 'bob', m, 'yes', 30, 150);
      f.clock.advance(60_000);
      must(f.venue, { type: 'cancelOrder', account: 'bob', orderId: o.order.id });
    }
    for (let i = 0; i < 3; i++) {
      const o = buy(f.venue, 'carol', m, 'yes', 30, 5);
      f.clock.advance(1_000);
      must(f.venue, { type: 'cancelOrder', account: 'carol', orderId: o.order.id });
    }
    assert.equal(alerts(f.venue.engine).filter((x) => x.kind === 'spoofing').length, 1);
    // IOC and close cancels are not spoofing either
    buy(f.venue, 'bob', m, 'yes', 30, 200, 'ioc');
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    assert.equal(alerts(f.venue.engine).filter((x) => x.kind === 'spoofing').length, 1);
  });

  it('closing-price pressure: a big move in the final minute of a market that then settles unchosen', () => {
    const f = seedExchange();
    const [claude, codex] = f.markets as [string, string];
    // codex trades at 40 early; in the last minute alice lifts it to 70; codex is not chosen → settles at 70.
    buy(f.venue, 'bob', codex, 'no', 60, 10);
    buy(f.venue, 'alice', codex, 'yes', 40, 10);
    f.clock.advance(5 * 60_000);
    buy(f.venue, 'bob', codex, 'no', 30, 10);
    buy(f.venue, 'alice', codex, 'yes', 75, 10); // fills at 70
    f.clock.advance(10_000);
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    assert.equal(f.venue.engine.market(codex)!.closingPrice, 70);
    must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
    const a = alerts(f.venue.engine).filter((x) => x.kind === 'closing_pressure');
    assert.equal(a.length, 1);
    assert.equal(a[0]!.marketId, codex);
    assert.deepEqual(a[0]!.accounts, ['alice']);
    assert.equal(a[0]!.evidence.move, 30);
    assert.equal(a[0]!.evidence.reference, 40);
    assert.equal(claude.length > 0, true);
    // a small move, or a market that settles on the test result, raises nothing
    const g = seedExchange();
    buy(g.venue, 'bob', g.markets[1]!, 'no', 60, 10);
    buy(g.venue, 'alice', g.markets[1]!, 'yes', 40, 10);
    g.clock.advance(5 * 60_000);
    buy(g.venue, 'bob', g.markets[1]!, 'no', 55, 10);
    buy(g.venue, 'alice', g.markets[1]!, 'yes', 45, 10);
    must(g.venue, { type: 'closeTask', taskId: g.taskId });
    must(g.venue, { type: 'decide', taskId: g.taskId, executorId: 'claude-code' });
    assert.deepEqual(kinds(g).filter((k) => k === 'closing_pressure'), []);
  });

  it('conflicted trading is reported if it ever appears in the journal', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    buy(f.venue, 'bob', m, 'yes', 60, 10);
    assert.deepEqual(kinds(f).filter((k) => k === 'conflicted_trade'), []);
    // Simulate a conflict that slipped through: bob joins Anthropic after trading claude-code (org changes are not journaled today, so poke state directly).
    f.venue.engine.state.accounts.get('bob')!.org = 'Anthropic';
    const a = alerts(f.venue.engine).filter((x) => x.kind === 'conflicted_trade');
    assert.equal(a.length, 1);
    assert.deepEqual(a[0]!.accounts, ['bob']);
    assert.equal(a[0]!.severity, 'high');
  });

  it('unusual win rate: right on 90% of at least 10 scored markets', () => {
    const f = seedExchange({ withTask: false });
    for (let i = 0; i < 10; i++) {
      const t = must(f.venue, { type: 'createTask', customer: 'cust', title: `t${i}`, prompt: 'p', repo: 'r', commit: 'c', testCommand: 'x', candidateAgents: ['codex'] });
      const m = t.markets[0]!.id;
      buy(f.venue, 'bob', m, 'no', 50, 1);
      buy(f.venue, 'alice', m, 'yes', 50, 1);
      must(f.venue, { type: 'closeTask', taskId: t.task.id });
      must(f.venue, { type: 'decide', taskId: t.task.id, executorId: 'codex' });
      must(f.venue, { type: 'settle', taskId: t.task.id, outcome: i < 9 ? 'passed' : 'failed', log: '' });
    }
    const a = alerts(f.venue.engine).filter((x) => x.kind === 'unusual_win_rate');
    assert.equal(a.length, 1);
    assert.deepEqual(a[0]!.accounts, ['alice']);
    assert.equal(a[0]!.evidence.hits, 9);
    assert.deepEqual(kinds(f, { winRateMinScored: 11 }).filter((k) => k === 'unusual_win_rate'), []);
  });

  it('alerts are deterministic and carry stable ids', () => {
    const f = seedExchange();
    must(f.venue, { type: 'createAccount', id: 'x1', name: 'x', kind: 'human', role: 'trader', org: 'Fund', keyHash: null, startingCash: 100_000 });
    must(f.venue, { type: 'createAccount', id: 'x2', name: 'x', kind: 'human', role: 'trader', org: 'Fund', keyHash: null, startingCash: 100_000 });
    buy(f.venue, 'x1', f.markets[0]!, 'no', 50, 1);
    buy(f.venue, 'x2', f.markets[0]!, 'yes', 50, 1);
    const a = alerts(f.venue.engine);
    const b = alerts(f.venue.engine);
    assert.deepEqual(a, b);
    assert.equal(a[0]!.id, `wash_trade:${f.markets[0]}:x1+x2`);
  });
});
