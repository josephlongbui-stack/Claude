import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentTrader, HeuristicEstimator, InProcessClient, MarketMaker } from '../../src/bots/index.js';
import { sizeFor } from '../../src/bots/simTrader.js';
import { packet, quote } from '../../src/engine/index.js';
import { must, seedExchange } from '../helpers/fixtures.js';
import { assertInvariants } from '../helpers/invariants.js';

function fixed(p: number) {
  return { estimate: async () => ({ probability: p, rationale: `fixed at ${p}` }) };
}

describe('house agent traders', () => {
  it('reads the packet once and posts a thesis with its probability', async () => {
    const f = seedExchange();
    let reads = 0;
    const est = { estimate: async () => ((reads += 1), { probability: 61, rationale: 'cart tests are narrow' }) };
    const t = new AgentTrader('botty', new InProcessClient(f.venue, 'botty'), est);
    await t.tick();
    await t.tick();
    assert.equal(reads, 2); // one per market
    const comments = f.venue.engine.state.comments.filter((c) => c.account === 'botty');
    assert.equal(comments.length, 2);
    assert.equal(comments[0]!.probability, 61);
    assert.equal(comments[0]!.text, 'cart tests are narrow');
  });

  it('buys when fair value beats the best quote by 4¢ or more, sized by the edge; otherwise rests 3¢ either side', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick(); // ask 54, bid 46
    const taker = new AgentTrader('botty', new InProcessClient(f.venue, 'botty'), fixed(60));
    await taker.tick();
    const pos = f.venue.engine.position(m, 'botty')!;
    // edge 6¢ → multiplier 1.5 → budget floor(100000 × 0.025 × 1.5) = 3750 → qty floor(3750 / 55) = 68,
    // sent IOC at the ask: 30 fill against the market maker, the rest cancels.
    const order = [...f.venue.engine.state.orders.values()].find((o) => o.account === 'botty')!;
    assert.equal(order.quantity, 68);
    assert.equal(order.tif, 'ioc');
    assert.equal(order.status, 'cancelled');
    assert.equal(pos.yes, 30);
    assert.equal(sizeFor(100_000, 6, 54), 68);
    assert.equal(sizeFor(100_000, 4, 54), 45);
    assert.equal(sizeFor(100_000, 40, 54), 181); // capped at 4×
    assert.equal(taker.actionsOn(m), 1);

    const rester = new AgentTrader('carol', new InProcessClient(f.venue, 'carol'), fixed(52));
    await rester.tick(); // 52 vs ask 54: no edge → rest yes 49 / no 45
    const mine = [...f.venue.engine.state.orders.values()].filter((o) => o.account === 'carol' && o.market === m && o.status === 'open');
    assert.deepEqual(mine.map((o) => [o.side, o.price]).sort(), [['no', 45], ['yes', 49]]);
    await rester.tick(); // already resting: no new orders, no new action
    assert.equal(rester.actionsOn(m), 1);
    assertInvariants(f.venue.engine);
  });

  it('acts at most 3 times per market', async () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'), { size: 5 });
    const t = new AgentTrader('botty', new InProcessClient(f.venue, 'botty'), fixed(80));
    for (let i = 0; i < 6; i++) {
      await mm.tick(); // keeps re-quoting after each lift, so the edge persists
      await t.tick();
    }
    assert.equal(t.actionsOn(m), 3);
    const orders = [...f.venue.engine.state.orders.values()].filter((o) => o.account === 'botty' && o.market === m);
    assert.equal(orders.length, 3);
  });

  it('respects conflicts: a trader from the executor org never orders on that market', async () => {
    const f = seedExchange();
    const t = new AgentTrader('anthropic-staffer', new InProcessClient(f.venue, 'anthropic-staffer'), fixed(90));
    const mm = new MarketMaker(new InProcessClient(f.venue, 'mm'));
    await mm.tick();
    await t.tick();
    const claude = f.markets[0]!;
    assert.equal([...f.venue.engine.state.orders.values()].some((o) => o.account === 'anthropic-staffer' && o.market === claude), false);
    assert.equal(f.venue.engine.state.comments.some((c) => c.account === 'anthropic-staffer' && c.market === claude), false);
    assert.ok([...f.venue.engine.state.orders.values()].some((o) => o.account === 'anthropic-staffer' && o.market === f.markets[1]));
  });

  it('skips a market when the estimator returns null or throws, without crashing', async () => {
    const f = seedExchange();
    const nulls = new AgentTrader('alice', new InProcessClient(f.venue, 'alice'), { estimate: async () => null });
    const throws = new AgentTrader('bob', new InProcessClient(f.venue, 'bob'), {
      estimate: async () => {
        throw new Error('boom');
      },
    });
    await nulls.tick();
    await throws.tick();
    assert.equal(f.venue.engine.state.orders.size, 0);
    assert.equal(f.venue.engine.state.comments.length, 0);
  });

  it('heuristic estimator is deterministic and stays within 1–99', async () => {
    const f = seedExchange();
    const p = packet(f.venue.engine, f.markets[1]!);
    const a = await new HeuristicEstimator('sim-1').estimate(p);
    const b = await new HeuristicEstimator('sim-1').estimate(p);
    const c = await new HeuristicEstimator('sim-2').estimate(p);
    assert.deepEqual(a, b);
    assert.ok(a.probability >= 1 && a.probability <= 99);
    assert.ok(c.probability >= 1 && c.probability <= 99);
    assert.match(a.rationale, /I put it at \d+%/);
    assert.equal(quote(f.venue.engine, f.markets[1]!).chance, 50);
  });
});
