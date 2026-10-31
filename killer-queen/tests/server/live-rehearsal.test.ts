/**
 * Real-money rehearsal: the exchange in live mode (play money off, open
 * sign-up off, simulated runner refused, provisioned accounts only, signed
 * results with runId + timestamp) driven end to end through the public API
 * and the real runner service. Deposits stand in for payments; identity
 * verification is the admin-set personId. Nothing here moves real money.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExchangeClient } from '../../runner/src/exchange.js';
import { FakeDriver } from '../../runner/src/fakeDriver.js';
import { Runner } from '../../runner/src/runner.js';
import type { AgentTemplate } from '../../runner/src/types.js';
import { stateHash } from '../../src/engine/index.js';
import { boot } from '../../src/server/boot.js';
import { ConfigError, loadConfig } from '../../src/server/config.js';
import { openVenue } from '../../src/server/journal.js';
import { ensureExecutors } from '../../src/server/seed.js';
import { houseBotFactories } from '../../src/bots/index.js';
import { assertInvariants } from '../helpers/invariants.js';
import { RUNNER_SECRET, TASK, startTestServer } from '../helpers/server.js';

const ADMIN = { 'x-admin-key': 'admin-key-for-tests' };
const agents: Record<string, AgentTemplate> = {
  codex: { version: '0.48.0', command: ['codex', 'exec', '--sandbox', 'workspace-write', '{prompt}'], apiHost: 'api.openai.com', keyEnv: 'OPENAI_API_KEY' },
  'claude-code': { version: '2.1.0', command: ['claude', '-p', '{prompt}'], apiHost: 'api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY' },
};

describe('live-mode rehearsal (real-money configuration, no real money)', () => {
  it('refuses the sandbox conveniences', async () => {
    assert.throws(() => loadConfig({ KQ_MODE: 'live', RUNNER: 'simulated', RUNNER_SECRET: 'x'.repeat(32) }), ConfigError);
    const config = loadConfig({ KQ_MODE: 'live', RUNNER_SECRET: 'x'.repeat(32), DB_PATH: ':memory:', LOG_LEVEL: 'silent' });
    (config as { runner: string }).runner = 'simulated';
    await assert.rejects(() => boot({ config, listen: false, timers: false }), ConfigError);
  });

  it('provisioned accounts trade a task from baseline to a signed settlement and a signed correction; money is conserved throughout', async () => {
    const s = await startTestServer({ env: { KQ_MODE: 'live', RUNNER: 'external', BASELINE_CHECK: 'true', HOUSE_BOTS: 'mm', LOG_FORMAT: 'json' }, bots: houseBotFactories() });
    try {
      // Live mode: no open sign-up, no faucet, no executors seeded by boot (the operator registers them).
      assert.equal((await s.api('POST', '/api/accounts', { body: { name: 'walk-in', kind: 'human', role: 'trader' } })).status, 403);
      assert.equal(s.booted.venue.engine.state.executors.size, 0);
      ensureExecutors(s.booted.venue);
      const provision = async (name: string, role: 'trader' | 'customer', personId: string, org = '') => {
        const r = await s.api('POST', '/api/admin/accounts', { headers: ADMIN, body: { name, kind: 'human', role, personId, org } });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.account.cash, 0, 'no play money in live mode');
        return { id: r.body.account.id as string, key: r.body.apiKey as string };
      };
      const cust = await provision('Live customer', 'customer', 'kyc-cust', 'Example Org');
      const alice = await provision('Live Alice', 'trader', 'kyc-alice');
      const bob = await provision('Live Bob', 'trader', 'kyc-bob');
      assert.equal((await s.api('POST', '/api/wallet/faucet', { token: alice.key })).status, 404, 'faucet is gone');
      // Deposits stand in for real payments: an admin command, journaled like everything else.
      for (const t of [alice, bob]) {
        const r = s.booted.venue.apply({ type: 'deposit', account: t.id, amount: 50_000, reason: 'admin' });
        assert.equal(r.ok, true);
      }
      const deposited = s.booted.venue.engine.state.totals.deposited;
      assert.equal(deposited, 50_000 * 2 + s.booted.config.mmCashCents);

      // Sandbox-only knobs are rejected in live mode.
      const forced = await s.api('POST', '/api/tasks', { token: cust.key, body: { ...TASK, candidateAgents: ['codex'], forceOutcome: 'pass' } });
      assert.equal(forced.status, 400);
      const created = await s.api('POST', '/api/tasks', { token: cust.key, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const taskId = created.body.task.id;
      const codex = `${taskId}:codex`;
      assert.equal(created.body.task.status, 'pending', 'baseline required before trading');

      // Results must be signed and carry runId + timestamp in live mode.
      assert.equal((await s.signedResult({ kind: 'baseline', taskId, results: ['failed', 'failed', 'failed'], log: 'x' })).status, 400);
      const runner = new Runner(new ExchangeClient(s.url, RUNNER_SECRET), new FakeDriver((spec) => (spec.label.startsWith('baseline') ? { testExitCodes: [1, 1, 1] } : { testExitCodes: [0] })), { agents, providerKeys: { OPENAI_API_KEY: 'sk-proj-' + 'x'.repeat(32) }, now: () => s.clock.now() });
      const [baseline] = await runner.poll();
      assert.equal(baseline!.posted!.status, 200, JSON.stringify(baseline!.posted));
      assert.equal((await s.api('GET', `/api/tasks/${taskId}`)).body.task.status, 'open');

      await s.booted.tick(); // the house market maker quotes
      const q = (await s.api('GET', `/api/markets/${codex}`)).body.quote;
      assert.ok(q.yesBid !== null && q.yesAsk !== null, 'two-sided from the first minute');
      const buy = await s.api('POST', '/api/orders', { token: alice.key, body: { marketId: codex, side: 'yes', type: 'limit', price: q.yesAsk, quantity: 20, tif: 'ioc' } });
      assert.equal(buy.status, 201);
      assert.equal(buy.body.fills.length, 1);
      const sell = await s.api('POST', '/api/orders', { token: bob.key, body: { marketId: codex, side: 'no', type: 'limit', price: 100 - q.yesBid, quantity: 15, tif: 'ioc' } });
      assert.equal(sell.status, 201);
      assertInvariants(s.booted.venue.engine, 'live trading');
      assert.equal(s.booted.venue.engine.state.totals.deposited, deposited, 'nothing minted while trading');

      await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.key });
      await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.key, body: { executorId: 'codex' } });
      const [run] = await runner.poll();
      assert.equal(run!.job.kind, 'run');
      assert.equal(run!.outcome, 'passed');
      assert.equal(run!.posted!.status, 200, JSON.stringify(run!.posted));
      const resolved = (await s.api('GET', `/api/tasks/${taskId}`)).body.task;
      assert.equal(resolved.status, 'resolved');
      assert.equal(resolved.passed, true);
      const alicePf = (await s.api('GET', '/api/portfolio', { token: alice.key })).body;
      assert.equal(alicePf.positions.length, 0);
      assert.equal(alicePf.history[0].payout, 20 * 100);
      assertInvariants(s.booted.venue.engine, 'after live settlement');

      // A signed correction (the runner's re-run says it failed after all) reverses and re-settles.
      const corr = await new ExchangeClient(s.url, RUNNER_SECRET).postResult({ kind: 'correction', taskId, runId: 'live-corr-1', outcome: 'failed', log: 're-run: failed', reason: 'rehearsal correction', timestamp: s.clock.now() } as never);
      assert.equal(corr.status, 200, JSON.stringify(corr.body));
      const aliceAfter = (await s.api('GET', '/api/portfolio', { token: alice.key })).body;
      assert.equal(aliceAfter.history[0].payout, 0);
      assertInvariants(s.booted.venue.engine, 'after live correction');
      assert.equal(s.booted.venue.engine.state.totals.deposited, deposited, 'corrections mint nothing');

      // Surveillance and admin visibility work in live mode; the journal replays to the same hash.
      assert.equal((await s.api('GET', '/api/admin/alerts', { headers: ADMIN })).status, 200);
      const live = (await s.api('GET', '/api/admin/state-hash', { headers: ADMIN })).body;
      const replayed = openVenue(s.booted.config.dbPath);
      assert.equal(stateHash(replayed.venue.engine.state), live.hash);
      replayed.journal.close();
    } finally {
      await s.stop();
    }
  });
});
