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
        assert.deepEqual(s.booted.runner!.queued, [taskId]);
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
