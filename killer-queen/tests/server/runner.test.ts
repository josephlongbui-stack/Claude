import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig } from '../../src/server/config.js';
import { boot } from '../../src/server/boot.js';
import { simulatedOutcome } from '../../src/server/runners/simulated.js';
import { assertInvariants } from '../helpers/invariants.js';
import { RUNNER_SECRET, TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('runner protocol', () => {
  it('end to end: customer, humans and an agent trade; the runner settles with a signed result; unchosen settle at close price', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('E2E customer', 'customer', 'human', 'Example Org');
      const alice = await s.signup('Alice', 'trader');
      const bob = await s.signup('Bob', 'trader');
      const agent = await s.signup('Forecaster', 'trader', 'agent', 'Indie Bots');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['claude-code', 'codex'] } });
      const taskId = created.body.task.id;
      const claude = `${taskId}:claude-code`;
      const codex = `${taskId}:codex`;
      // humans trade claude: alice 10 Yes @ 60 vs bob No
      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: claude, side: 'no', price: 40, quantity: 10 } });
      const f = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: claude, side: 'yes', price: 60, quantity: 10 } });
      assert.equal(f.body.fills.length, 1);
      // the agent reads packets and trades codex against bob; leaves a book: agent Yes 32 / bob No 60 → closing mid 36
      const packets = await s.api('GET', '/api/agent/markets', { token: agent.apiKey });
      assert.equal(packets.body.markets.length, 2);
      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 70, quantity: 20 } });
      await s.api('POST', '/api/orders', { token: agent.apiKey, body: { marketId: codex, side: 'yes', price: 30, quantity: 20 } });
      await s.api('POST', '/api/orders', { token: agent.apiKey, body: { marketId: codex, side: 'yes', price: 32, quantity: 5 } });
      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 60, quantity: 5 } });
      await s.api('POST', `/api/markets/${codex}/comments`, { token: agent.apiKey, body: { text: 'pytest on a cart API: codex passes these about a third of the time.', probability: 33 } });

      // no jobs before decide
      const noJobs = await s.api('GET', '/api/runner/jobs', { token: RUNNER_SECRET });
      assert.equal(noJobs.status, 200);
      assert.equal(noJobs.body.jobs.length, 0);
      assert.equal((await s.api('GET', '/api/runner/jobs', { token: 'wrong' })).status, 401);

      await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
      const decided = await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'claude-code' } });
      assert.equal(decided.status, 200);
      assert.equal(decided.body.task.status, 'running');
      const codexView = decided.body.markets.find((m: any) => m.executorId === 'codex');
      assert.equal(codexView.status, 'settled');
      assert.equal(codexView.closingPrice, 36);
      assert.equal(codexView.settlementPrice, 36);
      assert.equal(codexView.outcome, 'unchosen');

      const jobs = await s.api('GET', '/api/runner/jobs', { token: RUNNER_SECRET });
      assert.equal(jobs.body.jobs.length, 1);
      assert.equal(jobs.body.jobs[0].taskId, taskId);
      assert.equal(jobs.body.jobs[0].executorId, 'claude-code');
      assert.equal(jobs.body.jobs[0].testCommand, TASK.testCommand);

      // bad signature: 401 and the market stays running
      const bad = await s.signedResult({ taskId, passed: true, log: 'forged' }, 'not-the-secret');
      assert.equal(bad.status, 401);
      assert.equal(bad.body.code, 'bad_signature');
      const unsigned = await s.api('POST', '/api/runner/results', { body: { taskId, passed: true, log: '' } });
      assert.equal(unsigned.status, 401);
      assert.equal((await s.api('GET', `/api/tasks/${taskId}`)).body.task.status, 'running');

      // stale timestamp: 401; reused runId later: 409
      const stale = await s.signedResult({ taskId, outcome: 'passed', log: 'x', runId: 'run-1', timestamp: s.clock.now() - 6 * 60_000 });
      assert.equal(stale.status, 401);
      assert.equal(stale.body.code, 'stale_result');

      const good = await s.signedResult({ taskId, passed: true, log: 'all 12 tests passed', runId: 'run-1', timestamp: s.clock.now() });
      assert.equal(good.status, 200, JSON.stringify(good.body));
      assert.equal(good.body.task.status, 'resolved');
      assert.equal(good.body.task.passed, true);
      assert.equal(good.body.market.settlementPrice, 100);
      const again = await s.signedResult({ taskId, passed: true, log: 'replay', runId: 'run-1' });
      assert.equal(again.status, 409);

      const pa = await s.api('GET', '/api/portfolio', { token: alice.apiKey });
      assert.equal(pa.body.cash, 100_000 - 600 - 10 + 1000);
      assert.equal(pa.body.history.length, 1);
      const pagent = await s.api('GET', '/api/portfolio', { token: agent.apiKey });
      // agent: 20 Yes at 30 settled at 36 (+120), 5 Yes at 32 cancelled at close; fees 20
      assert.equal(pagent.body.cash, 100_000 - 600 - 20 + 20 * 36);
      const lb = await s.api('GET', '/api/leaderboard');
      assert.ok(lb.body.leaderboard.some((r: any) => r.kind === 'agent') && lb.body.leaderboard.some((r: any) => r.kind === 'human'));
      const st = await s.api('GET', '/api/stats');
      assert.equal(st.body.markets.settledOnTests, 1);
      const market = (await s.api('GET', `/api/markets/${claude}`)).body;
      assert.equal(market.market.outcome, 'passed');
      assert.equal((await s.api('GET', `/api/tasks/${taskId}`)).body.task.runLog, 'all 12 tests passed');
      assertInvariants(s.booted.venue.engine, 'after e2e');
    } finally {
      await s.stop();
    }
  });

  it('live mode refuses to start with the simulated runner, and needs a runner secret', () => {
    assert.throws(() => loadConfig({ KQ_MODE: 'live', RUNNER: 'simulated', RUNNER_SECRET: 'x'.repeat(20) }), ConfigError);
    assert.throws(() => loadConfig({ KQ_MODE: 'live', RUNNER: 'external' }), /RUNNER_SECRET/);
    const live = loadConfig({ KQ_MODE: 'live', RUNNER_SECRET: 'x'.repeat(20), DB_PATH: ':memory:' });
    assert.equal(live.runner, 'external');
    assert.throws(() => loadConfig({ HOUSE_BOTS: 'mm,robot' }), /unknown house bot/);
    assert.equal(loadConfig({}).runner, 'simulated');
  });

  it('boot throws when handed a live + simulated config', async () => {
    const config = loadConfig({ KQ_MODE: 'live', RUNNER_SECRET: 'x'.repeat(20), DB_PATH: ':memory:', LOG_LEVEL: 'silent' });
    (config as { runner: string }).runner = 'simulated';
    await assert.rejects(() => boot({ config, listen: false, timers: false }), ConfigError);
  });

  it('live mode: no open sign-up, no faucet, results need runId and timestamp', async () => {
    const s = await startTestServer({ env: { KQ_MODE: 'live', RUNNER: 'external' } });
    try {
      const r = await s.api('POST', '/api/accounts', { body: { name: 'x', kind: 'human', role: 'trader' } });
      assert.equal(r.status, 403);
      const res = await s.signedResult({ taskId: 'tsk_1', passed: true, log: '' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /runId and timestamp/);
    } finally {
      await s.stop();
    }
  });

  it('simulated runner: deterministic outcome, forceOutcome override, settles after decide', async () => {
    assert.equal(simulatedOutcome('t', 'e', 'pass'), 'passed');
    assert.equal(simulatedOutcome('t', 'e', 'fail'), 'failed');
    const a = simulatedOutcome('tsk_1', 'codex', null);
    assert.equal(simulatedOutcome('tsk_1', 'codex', null), a);
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = await s.signup('Sim customer', 'customer');
      const alice = await s.signup('Sim Alice', 'trader');
      const bob = await s.signup('Sim Bob', 'trader');
      for (const force of ['pass', 'fail'] as const) {
        const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'], forceOutcome: force } });
        assert.equal(created.status, 201);
        const taskId = created.body.task.id;
        const m = `${taskId}:codex`;
        await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: m, side: 'no', price: 50, quantity: 10 } });
        await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'yes', price: 50, quantity: 10 } });
        await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
        await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'codex' } });
        assert.deepEqual(s.booted.runner!.queued, [`run:${taskId}`]);
        assert.equal(s.booted.runner!.flush(), 1);
        const t = await s.api('GET', `/api/tasks/${taskId}`);
        assert.equal(t.body.task.status, 'resolved');
        assert.equal(t.body.task.passed, force === 'pass');
        assert.match(t.body.task.runLog, /simulated runner/);
        assert.equal(t.body.markets[0].settlementPrice, force === 'pass' ? 100 : 0);
      }
      assertInvariants(s.booted.venue.engine, 'after simulated runs');
    } finally {
      await s.stop();
    }
  });
});

describe('baseline over HTTP (D2)', () => {
  it('external runner: baseline job listed, signed 3-fail result opens the markets; trivial and flaky reject; log hash checked', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external', BASELINE_CHECK: 'true' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Baseline customer', 'customer');
      const alice = await s.signup('Baseline Alice', 'trader');
      const mk = async () => (await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } })).body.task.id as string;
      const good = await mk();
      const trivial = await mk();
      const flaky = await mk();
      const pendingView = await s.api('GET', `/api/tasks/${good}`);
      assert.equal(pendingView.body.task.status, 'pending');
      assert.equal(pendingView.body.markets[0].status, 'pending');
      const refused = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${good}:codex`, side: 'yes', price: 50, quantity: 1 } });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, 'market_pending');
      const jobs = await s.api('GET', '/api/runner/jobs', { token: RUNNER_SECRET });
      assert.deepEqual(jobs.body.jobs.map((j: any) => j.kind), ['baseline', 'baseline', 'baseline']);
      assert.equal(jobs.body.jobs[0].testCommand, TASK.testCommand);
      const { sha256 } = await import('../../src/engine/index.js');
      const bad = await s.signedResult({ kind: 'baseline', taskId: good, results: ['failed', 'failed', 'failed'], log: 'red', logSha256: 'a'.repeat(64) });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.code, 'log_hash_mismatch');
      s.clock.advance(4_000);
      const ok = await s.signedResult({ kind: 'baseline', taskId: good, results: ['failed', 'failed', 'failed'], log: 'red', logSha256: sha256('red'), runId: 'base-good', timestamp: s.clock.now() });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.opened, true);
      assert.equal(ok.body.task.status, 'open');
      assert.equal(ok.body.task.closesAt, s.clock.now() + 600_000);
      assert.equal((await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${good}:codex`, side: 'yes', price: 50, quantity: 1 } })).status, 201);
      const t = await s.signedResult({ kind: 'baseline', taskId: trivial, results: ['passed', 'passed', 'passed'], log: 'green' });
      assert.equal(t.body.rejectedReason, 'trivial');
      assert.equal(t.body.task.status, 'rejected');
      const f = await s.signedResult({ kind: 'baseline', taskId: flaky, results: ['passed', 'failed', 'failed'], log: 'flap' });
      assert.equal(f.body.rejectedReason, 'flaky');
      const again = await s.signedResult({ kind: 'baseline', taskId: good, results: ['failed', 'failed', 'failed'], log: 'red' });
      assert.equal(again.status, 409);
      const shape = await s.signedResult({ kind: 'baseline', taskId: good, log: 'red' });
      assert.equal(shape.status, 400);
      assert.equal((await s.api('GET', '/api/runner/jobs', { token: RUNNER_SECRET })).body.jobs.length, 0);
      assert.equal((await s.api('GET', '/api/stats')).body.medianMsToTradable, 4_000);
      assert.equal((await s.api('GET', `/api/markets/${good}:codex`)).body.packet.baseline, 'failing 3/3');
      assertInvariants(s.booted.venue.engine, 'after baselines');
    } finally {
      await s.stop();
    }
  });

  it('simulated runner: baseline opens markets after the delay; forceBaseline makes trivial/flaky rejections', async () => {
    const s = await startTestServer({ env: { BASELINE_CHECK: 'true' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Sim baseline customer', 'customer');
      const mk = async (forceBaseline: 'trivial' | 'flaky' | null) => (await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'], forceBaseline } })).body.task.id as string;
      const good = await mk(null);
      const trivial = await mk('trivial');
      const flaky = await mk('flaky');
      assert.deepEqual(s.booted.runner!.queued.sort(), [`baseline:${flaky}`, `baseline:${good}`, `baseline:${trivial}`].sort());
      assert.equal(s.booted.runner!.flush(), 3);
      assert.equal((await s.api('GET', `/api/tasks/${good}`)).body.task.status, 'open');
      assert.equal((await s.api('GET', `/api/tasks/${trivial}`)).body.task.rejectedReason, 'trivial');
      assert.equal((await s.api('GET', `/api/tasks/${flaky}`)).body.task.rejectedReason, 'flaky');
      assert.equal((await s.api('GET', `/api/tasks/${good}`)).body.task.baseline.results.length, 3);
    } finally {
      await s.stop();
    }
  });
});

describe('a runner-signed correction (D36)', () => {
  it('reverses a wrong result over HTTP, needs a reason, and the sandbox admin route works too', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Corr customer', 'customer');
      const alice = await s.signup('Corr Alice', 'trader');
      const bob = await s.signup('Corr Bob', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const taskId = created.body.task.id;
      const m = `${taskId}:codex`;
      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: m, side: 'no', price: 50, quantity: 10 } });
      await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'yes', price: 50, quantity: 10 } });
      await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
      await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'codex' } });
      assert.equal((await s.signedResult({ taskId, passed: false, log: 'wrong', runId: 'r1', timestamp: s.clock.now() })).status, 200);
      const aliceAfterWrong = (await s.api('GET', '/api/portfolio', { token: alice.apiKey })).body.cash;
      const noReason = await s.signedResult({ kind: 'correction', taskId, outcome: 'passed', log: 'right', runId: 'r2', timestamp: s.clock.now() });
      assert.equal(noReason.status, 400);
      const fixed = await s.signedResult({ kind: 'correction', taskId, outcome: 'passed', log: 'right', runId: 'r2', timestamp: s.clock.now(), reason: 'ran the wrong commit' });
      assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
      assert.equal(fixed.body.task.passed, true);
      assert.equal(fixed.body.reversed.length, 2);
      assert.equal((await s.api('GET', '/api/portfolio', { token: alice.apiKey })).body.cash, aliceAfterWrong + 1000);
      assert.equal((await s.api('GET', `/api/tasks/${taskId}`)).body.task.corrections.length, 1);
      const again = await s.signedResult({ kind: 'correction', taskId, outcome: 'passed', log: 'right', runId: 'r3', timestamp: s.clock.now(), reason: 'dup' });
      assert.equal(again.status, 409);
      assert.equal(again.body.code, 'same_outcome');
      const admin = await s.api('POST', `/api/admin/tasks/${taskId}/correct`, { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { outcome: 'failed', reason: 'and back' } });
      assert.equal(admin.status, 200);
      assert.equal(admin.body.task.passed, false);
      assertInvariants(s.booted.venue.engine, 'after corrections');
    } finally {
      await s.stop();
    }
  });
});
