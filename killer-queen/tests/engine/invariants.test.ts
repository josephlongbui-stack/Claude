import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Engine, Venue, FakeClock, type Command, type CommandInput } from '../../src/engine/index.js';
import { MemoryJournal, must, rng, seedExchange } from '../helpers/fixtures.js';
import { assertInvariants, stateHash } from '../helpers/invariants.js';

const SEED = Number(process.env.KQ_SEED ?? 20261031);
const ORDERS = Number(process.env.KQ_RANDOM_ORDERS ?? 1500);
const TRADERS = ['alice', 'bob', 'carol', 'botty', 'mm'];

/** Run ORDERS random placeOrder/cancelOrder commands; invariants after every step. */
function randomRun(seed: number, finish: 'pass' | 'fail' | 'skip' | 'infra' | 'none') {
  const f = seedExchange();
  const rand = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const openOrders: string[] = [];
  let placed = 0;
  let filled = 0;
  let rejected = 0;
  for (let i = 0; i < ORDERS; i++) {
    f.clock.advance(1 + Math.floor(rand() * 50));
    let cmd: CommandInput;
    if (openOrders.length > 0 && rand() < 0.15) {
      const id = pick(openOrders);
      const o = f.venue.engine.order(id)!;
      cmd = { type: 'cancelOrder', account: o.account, orderId: id };
    } else {
      const market = pick(f.markets);
      const r = rand();
      cmd = {
        type: 'placeOrder',
        account: pick(TRADERS),
        market,
        side: rand() < 0.5 ? 'yes' : 'no',
        action: rand() < 0.8 ? 'buy' : 'sell',
        orderType: r < 0.1 ? 'market' : 'limit',
        price: 1 + Math.floor(rand() * 99),
        quantity: 1 + Math.floor(rand() * 40),
        tif: rand() < 0.2 ? 'ioc' : 'gtc',
      };
    }
    // Hashing the whole state is the expensive part (~5 ms), so the
    // rejection-is-free check samples every 10th step; invariants run every step.
    const before = i % 10 === 0 ? stateHash(f.venue.engine) : null;
    const res = f.venue.apply(cmd);
    if (!res.ok) {
      rejected += 1;
      if (before !== null) assert.equal(stateHash(f.venue.engine), before, `seed ${seed} step ${i}: rejected ${cmd.type} (${res.code}) changed state`);
    } else if (cmd.type === 'placeOrder' && res.ok) {
      placed += 1;
      const d = res.data as { order: { id: string; status: string }; fills: unknown[] };
      filled += d.fills.length;
      if (d.order.status === 'open') openOrders.push(d.order.id);
    }
    // prune closed orders
    for (let k = openOrders.length - 1; k >= 0; k--) {
      if (f.venue.engine.order(openOrders[k]!)!.status !== 'open') openOrders.splice(k, 1);
    }
    try {
      assertInvariants(f.venue.engine, `seed ${seed} step ${i} ${cmd.type}`);
    } catch (e) {
      console.error(`invariant failure at seed=${seed} step=${i} cmd=${JSON.stringify(cmd)}`);
      throw e;
    }
  }
  if (finish !== 'none') {
    must(f.venue, { type: 'closeTask', taskId: f.taskId });
    if (finish === 'skip') {
      must(f.venue, { type: 'decide', taskId: f.taskId, executorId: null });
    } else {
      must(f.venue, { type: 'decide', taskId: f.taskId, executorId: 'claude-code' });
      must(f.venue, { type: 'settle', taskId: f.taskId, outcome: finish === 'pass' ? 'passed' : finish === 'fail' ? 'failed' : 'infra_error', log: 'sim' });
    }
    for (const m of f.venue.engine.state.markets.values()) {
      assert.equal(m.escrow, 0, `escrow not empty after ${finish}`);
      assert.equal(m.status, 'settled');
    }
    for (const a of f.venue.engine.state.accounts.values()) assert.equal(a.locked, 0);
  }
  return { f, placed, filled, rejected };
}

describe(`money conservation over ${ORDERS} random orders (seed ${SEED})`, () => {
  it('holds after every step and after close + decide + settle (pass)', () => {
    const { placed, filled } = randomRun(SEED, 'pass');
    assert.ok(placed > ORDERS / 2, `only ${placed} orders placed`);
    assert.ok(filled > 50, `only ${filled} fills`);
  });
  it('holds with a failed result', () => {
    randomRun(SEED + 1, 'fail');
  });
  it('holds with a skipped task', () => {
    randomRun(SEED + 2, 'skip');
  });
  it('holds with an infra_error result', () => {
    randomRun(SEED + 3, 'infra');
  });
});

describe('determinism', () => {
  it('replaying the recorded commands into a fresh engine rebuilds the identical state hash', () => {
    const { f } = randomRun(SEED + 4, 'pass');
    const live = stateHash(f.venue.engine);
    const fresh = new Venue({ engine: new Engine(), clock: new FakeClock(0), journal: new MemoryJournal() });
    for (const c of f.log as Command[]) fresh.replay(c);
    assert.equal(stateHash(fresh.engine), live);
    assert.equal(fresh.engine.state.applied, f.venue.engine.state.applied);
  });
});
