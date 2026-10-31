import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine, FakeClock, marketView, taskView } from '../../src/engine/index.js';
import { loadConfig } from '../../src/server/config.js';
import { hasDemoData, seedDemoExchange } from '../../src/server/seedDemo.js';
import { makeVenue } from '../helpers/fixtures.js';
import { assertInvariants, stateHash } from '../helpers/invariants.js';

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const config = loadConfig({ KQ_MODE: 'sandbox', RUNNER_SECRET: 'test-secret-0123456789abcdef', HOUSE_BOTS: 'mm,sim', DB_PATH: ':memory:' });

test('demo seed: every state is present, invariants hold throughout, and the journal replays to the same hash', () => {
  const clock = new FakeClock(NOW - 14 * 86_400_000);
  const { venue, journal } = makeVenue(clock);
  let n = 0;
  venue.onApplied(() => {
    n += 1;
    if (n % 40 === 0) assertInvariants(venue.engine, `demo command ${n}`);
  });
  const s = seedDemoExchange(venue, clock, { config, now: NOW });
  assertInvariants(venue.engine, 'demo seed end');
  assert.deepEqual(s.tasks, { open: 6, closed: 3, running: 2, resolved: 11, skipped: 2 });
  assert.equal(s.traders, 40);
  assert.ok(s.agentTraders >= 13, 'a third of the traders are agents');
  assert.ok(s.trades > 400, `enough trades: ${s.trades}`);
  assert.ok(s.theses > 60, `enough theses: ${s.theses}`);
  assert.ok(hasDemoData(venue.engine));

  const e = venue.engine;
  const open = [...e.state.tasks.values()].filter((t) => t.status === 'open');
  const soon = open.filter((t) => t.closesAt - NOW < 2 * 60_000);
  assert.equal(soon.length, 2, 'two open tasks close within two minutes');
  let shaped = 0;
  for (const t of e.state.tasks.values()) {
    const v = taskView(e, t.id);
    for (const m of v.markets) {
      const mv = marketView(e, m.marketId);
      if (mv.priceHistory.length >= 8) shaped += 1;
      if (m.status === 'open') {
        const spread = mv.quote.yesAsk! - mv.quote.yesBid!;
        assert.ok(spread >= 1 && spread <= 6, `${m.marketId} spread ${spread}`);
      }
    }
  }
  assert.ok(shaped >= 40, `markets with a price history: ${shaped}`);
  const resolved = [...e.state.tasks.values()].filter((t) => t.status === 'resolved');
  assert.ok(resolved.some((t) => t.passed === true) && resolved.some((t) => t.passed === false) && resolved.some((t) => t.outcome === 'infra_error'));
  const outcomes = [...e.state.markets.values()].filter((m) => m.outcome === 'unchosen');
  assert.ok(outcomes.length >= 10, 'unchosen markets settled at their closing price');

  const replay = new Engine();
  for (const c of journal.commands) {
    const r = replay.apply(c);
    assert.ok(r.ok, `replay rejected ${c.type}: ${r.ok ? '' : r.error}`);
  }
  assert.equal(stateHash(replay), stateHash(e));
});

test('demo seed refuses live mode and a non-empty exchange', () => {
  const live = loadConfig({ KQ_MODE: 'live', RUNNER: 'external', RUNNER_SECRET: 'test-secret-0123456789abcdef', DB_PATH: ':memory:', ADMIN_KEY: 'admin-key-0123456789abcdef' });
  const clock = new FakeClock(NOW);
  const { venue } = makeVenue(clock);
  assert.throws(() => seedDemoExchange(venue, clock, { config: live, now: NOW }), /sandbox/);
});
