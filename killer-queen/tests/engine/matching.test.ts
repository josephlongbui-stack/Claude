import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { quote } from '../../src/engine/index.js';
import { START_CASH, buy, must, mustReject, seedExchange } from '../helpers/fixtures.js';
import { stateHash } from '../helpers/invariants.js';

describe('matching, locks and fees', () => {
  it('a Yes bid and a No bid summing to 100¢ or more match at the resting price, with fees and locks exact', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    // Alice rests No at 40 (locks 10 × (40 + 1) = 410).
    const a = buy(f.venue, 'alice', m, 'no', 40, 10);
    assert.equal(a.order.status, 'open');
    assert.equal(a.fills.length, 0);
    assert.equal(e.account('alice')!.locked, 410);
    assert.equal(e.account('alice')!.cash, START_CASH - 410);
    // Bob bids Yes at 65 for 10: crosses (65 + 40 ≥ 100). Fill at resting price: Bob pays 60, not 65.
    const b = buy(f.venue, 'bob', m, 'yes', 65, 10);
    assert.equal(b.order.status, 'filled');
    assert.equal(b.fills.length, 1);
    assert.equal(b.fills[0]!.yesPrice, 60);
    assert.equal(b.fills[0]!.quantity, 10);
    assert.equal(b.fills[0]!.takerSide, 'yes');
    assert.equal(b.fills[0]!.fee, 10);
    // Bob: paid 60 × 10 = 600 into escrow + 10 fee; limit lock 660 fully released; refund 50.
    assert.equal(e.account('bob')!.cash, START_CASH - 600 - 10);
    assert.equal(e.account('bob')!.locked, 0);
    // Alice (maker): paid 40 × 10 = 400 into escrow; the 1¢/contract fee lock came back.
    assert.equal(e.account('alice')!.cash, START_CASH - 400);
    assert.equal(e.account('alice')!.locked, 0);
    assert.equal(e.order(a.order.id)!.status, 'filled');
    // House got the taker fee; escrow holds exactly 100 per contract.
    assert.equal(e.account('house')!.cash, 10);
    const market = e.market(m)!;
    assert.equal(market.escrow, 1000);
    assert.equal(market.openInterest, 10);
    assert.equal(market.volume, 10);
    assert.equal(market.lastPrice, 60);
    assert.deepEqual(e.position(m, 'bob'), { market: m, account: 'bob', yes: 10, no: 0, yesCost: 600, noCost: 0, realized: 0, fees: 10, payout: 0, closed: null });
    assert.deepEqual(e.position(m, 'alice'), { market: m, account: 'alice', yes: 0, no: 10, yesCost: 0, noCost: 400, realized: 0, fees: 0, payout: 0, closed: null });
  });

  it('a No taker hitting a resting Yes bid pays 100 minus the resting price', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', m, 'yes', 70, 5); // locks 5 × 71 = 355
    const r = buy(f.venue, 'bob', m, 'no', 45, 5); // crosses: 70 + 45 ≥ 100; Bob pays 30
    assert.equal(r.fills[0]!.yesPrice, 70);
    assert.equal(e.account('bob')!.cash, START_CASH - 5 * 30 - 5);
    assert.equal(e.account('alice')!.cash, START_CASH - 5 * 70);
    assert.equal(e.market(m)!.escrow, 500);
  });

  it('exactly 100 crosses; 99 does not', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    const miss = buy(f.venue, 'bob', m, 'yes', 59, 10);
    assert.equal(miss.fills.length, 0);
    assert.equal(miss.order.status, 'open');
    const hit = buy(f.venue, 'carol', m, 'yes', 60, 10);
    assert.equal(hit.fills.length, 1);
    assert.equal(hit.fills[0]!.yesPrice, 60);
  });

  it('non-crossing orders rest and quotes reflect them; price priority then time', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    buy(f.venue, 'alice', m, 'yes', 55, 10);
    buy(f.venue, 'bob', m, 'yes', 58, 5);
    buy(f.venue, 'carol', m, 'no', 38, 7); // yes ask 62
    const q = quote(f.venue.engine, m);
    assert.equal(q.yesBid, 58);
    assert.equal(q.yesAsk, 62);
    assert.equal(q.noBid, 38);
    assert.equal(q.noAsk, 42);
    assert.equal(q.chance, 60); // mid of 58/62
    assert.equal(q.lastPrice, null);
    const book = f.venue.engine.book(m);
    assert.deepEqual(book.yes.map((o) => [o.account, o.price]), [['bob', 58], ['alice', 55]]);
    // A No taker at 45 (needs yes ≥ 55) sweeps best price first, then the next.
    const r = buy(f.venue, 'botty', m, 'no', 45, 8);
    assert.deepEqual(r.fills.map((x) => [x.yesPrice, x.quantity]), [[58, 5], [55, 3]]);
    assert.equal(f.venue.engine.book(m).yes[0]!.quantity - f.venue.engine.book(m).yes[0]!.filled, 7);
  });

  it('buying the other side nets into cash with the right realized profit', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    buy(f.venue, 'bob', m, 'yes', 60, 10); // bob holds 10 Yes at 60
    assert.equal(e.position(m, 'bob')!.yes, 10);
    // Carol bids Yes at 75. Bob buys No at 30 → crosses, fills at 75: Bob pays 25 each; now 10 Yes + 10 No → nets.
    buy(f.venue, 'carol', m, 'yes', 75, 10);
    const cashBefore = e.account('bob')!.cash;
    const r = buy(f.venue, 'bob', m, 'no', 30, 10);
    assert.equal(r.fills[0]!.yesPrice, 75);
    const pos = e.position(m, 'bob')!;
    assert.equal(pos.yes, 0);
    assert.equal(pos.no, 0);
    assert.equal(pos.yesCost, 0);
    assert.equal(pos.noCost, 0);
    // Bought Yes at 60 and No at 25: 100 − 85 = 15 per pair × 10 = 150 realized.
    assert.equal(pos.realized, 150);
    assert.equal(pos.fees, 20);
    // Cash: −250 paid − 10 fee + 1000 redeemed.
    assert.equal(e.account('bob')!.cash, cashBefore - 250 - 10 + 1000);
    // Escrow: Alice (10 No) and Carol (10 Yes) remain: 10 contracts.
    assert.equal(e.market(m)!.openInterest, 10);
    assert.equal(e.market(m)!.escrow, 1000);
    assert.equal(e.position(m, 'carol')!.yes, 10);
  });

  it('selling Yes at p is buying No at 100 − p, and nets an existing Yes position', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    buy(f.venue, 'bob', m, 'yes', 60, 10);
    buy(f.venue, 'carol', m, 'yes', 70, 10); // carol bids Yes 70: bob can sell to her
    const r = must(f.venue, { type: 'placeOrder', account: 'bob', market: m, side: 'yes', action: 'sell', orderType: 'limit', price: 65, quantity: 10 });
    assert.equal(r.order.side, 'no');
    assert.equal(r.order.price, 35);
    assert.equal(r.fills[0]!.yesPrice, 70); // fills at carol's resting price: bob pays 30 for No
    const pos = e.position(m, 'bob')!;
    assert.equal(pos.yes + pos.no, 0);
    assert.equal(pos.realized, 100); // bought 60, "sold" at 70
  });

  it('market orders are immediate-or-cancel at 99 and never rest', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', m, 'no', 40, 5);
    const r = must(f.venue, { type: 'placeOrder', account: 'bob', market: m, side: 'yes', action: 'buy', orderType: 'market', quantity: 8 });
    assert.equal(r.order.tif, 'ioc');
    assert.equal(r.order.price, 99);
    assert.equal(r.order.filled, 5);
    assert.equal(r.order.status, 'cancelled');
    assert.equal(r.fills[0]!.yesPrice, 60);
    assert.equal(e.book(m).yes.length, 0);
    assert.equal(e.account('bob')!.locked, 0);
    assert.equal(e.account('bob')!.cash, START_CASH - 5 * 60 - 5);
    // market sell with nothing resting: fills nothing, rests nothing
    const r2 = must(f.venue, { type: 'placeOrder', account: 'carol', market: m, side: 'yes', action: 'sell', orderType: 'market', quantity: 3 });
    assert.equal(r2.order.side, 'no');
    assert.equal(r2.fills.length, 0);
    assert.equal(r2.order.status, 'cancelled');
    assert.equal(e.account('carol')!.locked, 0);
  });

  it('immediate-or-cancel limit orders never rest', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const r = buy(f.venue, 'alice', m, 'yes', 50, 10, 'ioc');
    assert.equal(r.order.status, 'cancelled');
    assert.equal(r.order.filled, 0);
    assert.equal(f.venue.engine.book(m).yes.length, 0);
    assert.equal(f.venue.engine.account('alice')!.cash, START_CASH);
    assert.equal(f.venue.engine.account('alice')!.locked, 0);
  });

  it('insufficient funds and bad prices are rejected without side effects', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const base = { type: 'placeOrder' as const, account: 'alice', market: m, side: 'yes' as const, action: 'buy' as const, orderType: 'limit' as const };
    mustReject(f.venue, { ...base, price: 0, quantity: 1 }, 'bad_price');
    mustReject(f.venue, { ...base, price: 100, quantity: 1 }, 'bad_price');
    mustReject(f.venue, { ...base, price: 50.5, quantity: 1 }, 'bad_price');
    mustReject(f.venue, { ...base, price: 50, quantity: 0 }, 'bad_quantity');
    mustReject(f.venue, { ...base, price: 50, quantity: 2.5 }, 'bad_quantity');
    mustReject(f.venue, { ...base, price: 50, quantity: -1 }, 'bad_quantity');
    // 100000 cash: 1961 × 51 = 100011 > 100000
    mustReject(f.venue, { ...base, price: 50, quantity: 1961 }, 'insufficient_funds');
    const ok = buy(f.venue, 'alice', m, 'yes', 50, 1960); // exactly 99960
    assert.equal(ok.order.status, 'open');
    assert.equal(f.venue.engine.account('alice')!.cash, 40);
    mustReject(f.venue, { ...base, price: 1, quantity: 21 }, 'insufficient_funds'); // 21 × 2 = 42 > 40
    mustReject(f.venue, { ...base, market: 'nope:codex', price: 50, quantity: 1 }, 'market_not_found');
    mustReject(f.venue, { ...base, account: 'ghost', price: 50, quantity: 1 }, 'account_not_found');
    mustReject(f.venue, { ...base, side: 'maybe' as never, price: 50, quantity: 1 }, 'bad_side');
  });

  it('no self-trades: own resting orders are skipped, others still match', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    buy(f.venue, 'alice', m, 'no', 45, 10); // alice's own No
    buy(f.venue, 'bob', m, 'no', 40, 10); // bob's No, worse price
    const r = buy(f.venue, 'alice', m, 'yes', 70, 10); // would cross both; must skip her own
    assert.equal(r.fills.length, 1);
    assert.equal(r.fills[0]!.yesPrice, 60);
    assert.equal(e.order(r.fills[0]!.makerOrder)!.account, 'bob');
    assert.equal(e.book(m).no.length, 1);
    assert.equal(e.book(m).no[0]!.account, 'alice');
    const pos = e.position(m, 'alice')!;
    assert.equal(pos.yes, 10);
    assert.equal(pos.no, 0);
  });

  it('house market maker pays no fee and locks only the price', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    const mmCash = e.account('mm')!.cash;
    const r = buy(f.venue, 'mm', m, 'no', 40, 30);
    assert.equal(r.order.feeRate, 0);
    assert.equal(e.account('mm')!.locked, 1200);
    const t = buy(f.venue, 'alice', m, 'yes', 60, 30); // mm as maker
    assert.equal(t.fills[0]!.fee, 30);
    assert.equal(e.account('mm')!.cash, mmCash - 1200);
    const mm2 = buy(f.venue, 'mm', m, 'yes', 70, 10); // mm as taker vs nothing: rests
    assert.equal(mm2.order.status, 'open');
    buy(f.venue, 'bob', m, 'no', 35, 10); // bob takes mm's bid... bob is taker, pays fee
    assert.equal(e.account('house')!.cash, 40);
  });

  it('cancelOrder refunds the remaining lock; only the owner; filled orders cannot be cancelled', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const e = f.venue.engine;
    const o = buy(f.venue, 'alice', m, 'yes', 50, 10);
    buy(f.venue, 'bob', m, 'no', 50, 4); // partial fill of alice
    assert.equal(e.account('alice')!.locked, 6 * 51);
    mustReject(f.venue, { type: 'cancelOrder', account: 'bob', orderId: o.order.id }, 'forbidden');
    const c = must(f.venue, { type: 'cancelOrder', account: 'alice', orderId: o.order.id });
    assert.equal(c.refunded, 306);
    assert.equal(e.account('alice')!.locked, 0);
    assert.equal(e.account('alice')!.cash, START_CASH - 4 * 50 - 0); // maker: no fee
    mustReject(f.venue, { type: 'cancelOrder', account: 'alice', orderId: o.order.id }, 'order_not_open');
    mustReject(f.venue, { type: 'cancelOrder', account: 'alice', orderId: 'o999' }, 'order_not_found');
  });

  it('a rejected order leaves the state hash unchanged', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    const before = stateHash(f.venue.engine);
    const r = f.venue.apply({ type: 'placeOrder', account: 'bob', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 60, quantity: 10_000 });
    assert.equal(r.ok, false);
    assert.equal(stateHash(f.venue.engine), before);
  });
});

describe('conflict rules', () => {
  it("block the agent's maker org, the customer, the customer's org and staff; others trade", () => {
    const f = seedExchange();
    const claude = f.markets[0]!; // tsk_1:claude-code (Anthropic)
    const codex = f.markets[1]!;
    const order = (account: string, market: string) => ({ type: 'placeOrder' as const, account, market, side: 'yes' as const, action: 'buy' as const, orderType: 'limit' as const, price: 50, quantity: 1 });
    mustReject(f.venue, order('anthropic-staffer', claude), 'conflict');
    must(f.venue, order('anthropic-staffer', codex)); // other agent's market is fine
    mustReject(f.venue, order('cust', claude), 'conflict');
    mustReject(f.venue, order('cust', codex), 'conflict');
    mustReject(f.venue, order('colleague', claude), 'conflict'); // same org as customer
    mustReject(f.venue, order('admin', claude), 'conflict');
    mustReject(f.venue, order('house', claude), 'conflict');
    must(f.venue, order('alice', claude));
    must(f.venue, order('botty', claude));
    // comments follow the same rule
    mustReject(f.venue, { type: 'comment', account: 'anthropic-staffer', market: claude, text: 'thesis', probability: 60 }, 'conflict');
    mustReject(f.venue, { type: 'comment', account: 'cust', market: codex, text: 'thesis' }, 'conflict');
    must(f.venue, { type: 'comment', account: 'alice', market: claude, text: 'Looks easy.', probability: 70 });
    assert.equal(f.venue.engine.state.comments.length, 1);
    mustReject(f.venue, { type: 'comment', account: 'alice', market: claude, text: '', probability: 70 }, 'bad_text');
    mustReject(f.venue, { type: 'comment', account: 'alice', market: claude, text: 'x', probability: 0 }, 'bad_probability');
  });

  it('an empty org never conflicts', () => {
    const f = seedExchange();
    must(f.venue, { type: 'upsertExecutor', id: 'oss-agent', name: 'OSS agent', org: '', version: '1.0' });
    const t = must(f.venue, { type: 'createTask', customer: 'cust', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['oss-agent'] });
    const m = t.markets[0]!.id;
    must(f.venue, { type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 50, quantity: 1 });
  });
});
