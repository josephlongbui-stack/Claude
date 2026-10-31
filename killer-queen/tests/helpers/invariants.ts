/**
 * Every rule in docs/INVARIANTS.md that can be checked from state alone.
 * Throws with a precise message on the first violation.
 */
import assert from 'node:assert/strict';
import { CONTRACT_VALUE, type Engine, type EngineState, stateHash as hashState } from '../../src/engine/index.js';

export function assertInvariants(engine: Engine, label = ''): void {
  const s = engine.state;
  const tag = label ? ` [${label}]` : '';

  // 1. Conservation
  let cashAndLocked = 0;
  let deposited = 0;
  for (const a of s.accounts.values()) {
    assert.ok(Number.isSafeInteger(a.cash) && a.cash >= 0, `cash of ${a.id} is ${a.cash}${tag}`);
    assert.ok(Number.isSafeInteger(a.locked) && a.locked >= 0, `locked of ${a.id} is ${a.locked}${tag}`);
    assert.ok(Number.isSafeInteger(a.deposited) && a.deposited >= 0, `deposited of ${a.id} is ${a.deposited}${tag}`);
    cashAndLocked += a.cash + a.locked;
    deposited += a.deposited;
  }
  let escrow = 0;
  for (const m of s.markets.values()) {
    assert.ok(Number.isSafeInteger(m.escrow) && m.escrow >= 0, `escrow of ${m.id} is ${m.escrow}${tag}`);
    escrow += m.escrow;
  }
  assert.equal(deposited, s.totals.deposited, `deposited total mismatch${tag}`);
  assert.equal(cashAndLocked + escrow, deposited, `conservation: cash+locked ${cashAndLocked} + escrow ${escrow} != deposits ${deposited}${tag}`);

  // 2 + 7. Escrow = 100 × open interest = 100 × ΣYes = 100 × ΣNo; 5. settled markets are empty
  const yesByMarket = new Map<string, number>();
  const noByMarket = new Map<string, number>();
  for (const p of s.positions.values()) {
    // 3. Net positions
    assert.ok(!(p.yes > 0 && p.no > 0), `position ${p.account}@${p.market} holds Yes ${p.yes} and No ${p.no}${tag}`);
    assert.ok(p.yes >= 0 && p.no >= 0 && p.yesCost >= 0 && p.noCost >= 0, `negative position fields ${p.account}@${p.market}${tag}`);
    if (p.yes === 0) assert.equal(p.yesCost, 0, `yesCost without Yes ${p.account}@${p.market}${tag}`);
    if (p.no === 0) assert.equal(p.noCost, 0, `noCost without No ${p.account}@${p.market}${tag}`);
    yesByMarket.set(p.market, (yesByMarket.get(p.market) ?? 0) + p.yes);
    noByMarket.set(p.market, (noByMarket.get(p.market) ?? 0) + p.no);
  }
  for (const m of s.markets.values()) {
    assert.equal(m.escrow, CONTRACT_VALUE * m.openInterest, `escrow != 100×OI on ${m.id}${tag}`);
    assert.equal(yesByMarket.get(m.id) ?? 0, m.openInterest, `ΣYes != OI on ${m.id}${tag}`);
    assert.equal(noByMarket.get(m.id) ?? 0, m.openInterest, `ΣNo != OI on ${m.id}${tag}`);
    if (m.status === 'settled') {
      assert.equal(m.escrow, 0, `settled market ${m.id} still holds escrow${tag}`);
      assert.ok(m.settlementPrice !== null && m.outcome !== null, `settled market ${m.id} lacks price/outcome${tag}`);
    }
    const book = engine.book(m.id);
    if (m.status !== 'open') assert.equal(book.yes.length + book.no.length, 0, `non-open market ${m.id} has resting orders${tag}`);
    for (const side of ['yes', 'no'] as const) {
      const list = book[side];
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!;
        const b = list[i]!;
        assert.ok(a.price > b.price || (a.price === b.price && a.seq < b.seq), `book ${m.id}/${side} out of order${tag}`);
      }
      for (const o of list) assert.equal(o.status, 'open', `book ${m.id}/${side} holds non-open order ${o.id}${tag}`);
    }
  }

  // 4. Locks
  const lockedByAccount = new Map<string, number>();
  const openInBooks = new Set<string>();
  for (const m of s.markets.values()) {
    const book = engine.book(m.id);
    for (const o of [...book.yes, ...book.no]) openInBooks.add(o.id);
  }
  for (const o of s.orders.values()) {
    assert.ok(Number.isSafeInteger(o.lockedRemaining) && o.lockedRemaining >= 0, `lockedRemaining of ${o.id} is ${o.lockedRemaining}${tag}`);
    if (o.status === 'open') {
      const expected = (o.quantity - o.filled) * (o.price + o.feeRate);
      assert.equal(o.lockedRemaining, expected, `order ${o.id} locks ${o.lockedRemaining}, expected ${expected}${tag}`);
      assert.ok(openInBooks.has(o.id), `open order ${o.id} missing from its book${tag}`);
      lockedByAccount.set(o.account, (lockedByAccount.get(o.account) ?? 0) + o.lockedRemaining);
    } else {
      assert.equal(o.lockedRemaining, 0, `${o.status} order ${o.id} still locks ${o.lockedRemaining}${tag}`);
      assert.ok(!openInBooks.has(o.id), `${o.status} order ${o.id} still in a book${tag}`);
    }
  }
  for (const a of s.accounts.values()) {
    assert.equal(a.locked, lockedByAccount.get(a.id) ?? 0, `locked of ${a.id} != sum of its open orders${tag}`);
  }
}

export function stateHash(engine: Engine): string {
  return hashState(engine.state);
}

export function totals(s: EngineState): { cashAndLocked: number; escrow: number; deposited: number } {
  let cashAndLocked = 0;
  let escrow = 0;
  for (const a of s.accounts.values()) cashAndLocked += a.cash + a.locked;
  for (const m of s.markets.values()) escrow += m.escrow;
  return { cashAndLocked, escrow, deposited: s.totals.deposited };
}
