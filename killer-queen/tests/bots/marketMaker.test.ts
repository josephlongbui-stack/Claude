import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InProcessClient, MarketMaker } from '../../src/bots/index.js';
import { quote } from '../../src/engine/index.js';
import { buy, must, seedExchange } from '../helpers/fixtures.js';
import { assertInvariants } from '../helpers/invariants.js';

describe('house market maker', () => {
  it('quotes both sides of every market 4¢ around fair value, 30 per side, from the start', async () => {
    const f = seedExchange();
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick();
    for (const m of f.markets) {
      const q = quote(f.venue.engine, m);
      assert.equal(q.yesBid, 46);
      assert.equal(q.yesAsk, 54);
      assert.equal(q.noBid, 46);
      const book = f.venue.engine.book(m);
      assert.equal(book.yes.length, 1);
      assert.equal(book.no.length, 1);
      assert.equal(book.yes[0]!.quantity, 30);
      assert.equal(book.no[0]!.quantity, 30);
      assert.equal(book.yes[0]!.feeRate, 0);
      assert.equal(mm.fairValue(m), 50);
    }
    // a second tick leaves the quotes alone (no churn)
    const ids = f.markets.map((m) => f.venue.engine.book(m).yes[0]!.id);
    await mm.tick();
    assert.deepEqual(f.markets.map((m) => f.venue.engine.book(m).yes[0]!.id), ids);
    assertInvariants(f.venue.engine);
  });

  it('starts from the executor pass rate when there is a record', async () => {
    const f = seedExchange();
    // Give codex a record: 3 chosen, 2 passed via earlier tasks.
    for (let i = 0; i < 3; i++) {
      const t = must(f.venue, { type: 'createTask', customer: 'cust', title: `old ${i}`, prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] });
      must(f.venue, { type: 'closeTask', taskId: t.task.id });
      must(f.venue, { type: 'decide', taskId: t.task.id, executorId: 'codex' });
      must(f.venue, { type: 'settle', taskId: t.task.id, outcome: i < 2 ? 'passed' : 'failed', log: '' });
    }
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick();
    assert.equal(mm.fairValue(f.markets[1]!), 67);
    const q = quote(f.venue.engine, f.markets[1]!);
    assert.equal(q.yesBid, 63);
    assert.equal(q.yesAsk, 71);
  });

  it('moves fair value 40% toward each trade and re-quotes', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick(); // fair 50: bid 46 / ask 54
    // Alice lifts the ask: trade at 54. fair → 50 + 0.4 × 4 = 51.6
    buy(f.venue, 'alice', m, 'yes', 54, 10);
    await mm.tick();
    assert.ok(Math.abs(mm.fairValue(m)! - 51.6) < 1e-9);
    // inventory: mm sold 10 Yes (holds 10 No): skew = trunc(-10/60) = 0; center round(51.6)=52 → bid 48 / ask 56
    let q = quote(f.venue.engine, m);
    assert.equal(q.yesBid, 48);
    assert.equal(q.yesAsk, 56);
    // Two more trades in one tick: at 56 then (bob hits bid) 48. 51.6→53.36→51.216
    buy(f.venue, 'alice', m, 'yes', 56, 5);
    buy(f.venue, 'bob', m, 'no', 52, 5);
    await mm.tick();
    assert.ok(Math.abs(mm.fairValue(m)! - 51.216) < 1e-9);
    q = quote(f.venue.engine, m);
    assert.equal(q.yesBid, 47);
    assert.equal(q.yesAsk, 55);
    assertInvariants(f.venue.engine);
  });

  it('inventory skew shifts quotes 1¢ per 60 contracts', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'), { size: 200 });
    await mm.tick(); // bid 46 / ask 54, 200 each
    // Alice buys 130 Yes at the ask: mm now holds 130 No → inventory −130 → skew −2 → center 50 + 2 ... but fair also moved.
    buy(f.venue, 'alice', m, 'yes', 54, 130); // one fill at 54 → fair 51.6
    await mm.tick();
    // center = round(51.6) − trunc(−130/60) = 52 + 2 = 54 → bid 50 / ask 58
    const q = quote(f.venue.engine, m);
    assert.equal(q.yesBid, 50);
    assert.equal(q.yesAsk, 58);
  });

  it('stops adding to a side at the inventory cap', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'), { size: 1300, inventoryCap: 1200 });
    must(f.venue, { type: 'deposit', account: 'alice', amount: 10_000_000, reason: 'admin' });
    await mm.tick();
    buy(f.venue, 'alice', m, 'yes', 54, 1250); // mm now short 1250 Yes = holds 1250 No ≥ cap on the No side
    await mm.tick();
    const book = f.venue.engine.book(m);
    assert.equal(book.no.length, 0, 'no more No bids at the cap');
    assert.equal(book.yes.length, 1, 'still bids Yes to reduce inventory');
    assertInvariants(f.venue.engine);
  });

  it('never quotes on markets it is blocked from, and prunes memory for closed markets', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick();
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    await mm.tick();
    assert.equal(mm.fairValue(m), undefined);
  });
});
