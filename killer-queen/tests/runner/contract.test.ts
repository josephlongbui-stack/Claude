/** Contract test: the runner service against a real local exchange (external runner mode, baseline on) with FakeDriver. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExchangeClient } from '../../runner/src/exchange.js';
import { FakeDriver } from '../../runner/src/fakeDriver.js';
import { Runner } from '../../runner/src/runner.js';
import type { AgentTemplate } from '../../runner/src/types.js';
import { assertInvariants } from '../helpers/invariants.js';
import { RUNNER_SECRET, TASK, seedExecutors, startTestServer } from '../helpers/server.js';

const agents: Record<string, AgentTemplate> = {
  codex: { version: '0.48.0', command: ['codex', 'exec', '--sandbox', 'workspace-write', '{prompt}'], apiHost: 'api.openai.com', keyEnv: 'OPENAI_API_KEY' },
  'claude-code': { version: '2.1.0', command: ['claude', '-p', '{prompt}'], apiHost: 'api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY' },
};

describe('runner ↔ exchange contract', () => {
  it('baseline opens the markets, traders trade, decide creates a run job, the signed result settles', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external', BASELINE_CHECK: 'true' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Contract customer', 'customer');
      const alice = await s.signup('Contract Alice', 'trader');
      const bob = await s.signup('Contract Bob', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
      const taskId = created.body.task.id;
      assert.equal(created.body.task.status, 'pending');

      const driver = new FakeDriver((spec) => (spec.label.startsWith('baseline') ? { testExitCodes: [1, 1, 1] } : { testExitCodes: [0], agent: { stdout: 'fixed it' } }));
      const runner = new Runner(new ExchangeClient(s.url, RUNNER_SECRET), driver, { agents, providerKeys: { OPENAI_API_KEY: 'sk-proj-' + 'x'.repeat(32) }, now: () => s.clock.now() });

      const first = await runner.poll();
      assert.equal(first.length, 1);
      assert.equal(first[0]!.job.kind, 'baseline');
      assert.equal(first[0]!.posted!.status, 200, JSON.stringify(first[0]!.posted));
      const opened = await s.api('GET', `/api/tasks/${taskId}`);
      assert.equal(opened.body.task.status, 'open');
      assert.equal(opened.body.markets[0].status, 'open');
      assert.equal((await s.api('GET', `/api/markets/${taskId}:codex`)).body.packet.baseline, 'failing 3/3');

      await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: `${taskId}:codex`, side: 'no', price: 35, quantity: 10 } });
      const fill = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${taskId}:codex`, side: 'yes', price: 70, quantity: 10 } });
      assert.equal(fill.body.fills.length, 1);
      assert.equal((await runner.poll()).length, 0, 'nothing to run while trading');
      await s.api('POST', `/api/tasks/${taskId}/close`, { token: cust.apiKey });
      await s.api('POST', `/api/tasks/${taskId}/decide`, { token: cust.apiKey, body: { executorId: 'codex' } });

      const second = await runner.poll();
      assert.equal(second.length, 1);
      assert.equal(second[0]!.job.kind, 'run');
      assert.equal(second[0]!.outcome, 'passed');
      assert.equal(second[0]!.posted!.status, 200, JSON.stringify(second[0]!.posted));
      const resolved = await s.api('GET', `/api/tasks/${taskId}`);
      assert.equal(resolved.body.task.status, 'resolved');
      assert.equal(resolved.body.task.passed, true);
      assert.match(resolved.body.task.runLog, /protected paths restored/);
      assert.equal(resolved.body.task.runLog.includes('sk-proj-'), false);
      assert.equal((await s.api('GET', '/api/portfolio', { token: alice.apiKey })).body.cash, 100_000 - 10 * 65 - 10 + 1000);
      assert.equal((await runner.poll()).length, 0);
      // a replayed post of the same result is refused by state, so retries are safe
      const again = await new ExchangeClient(s.url, RUNNER_SECRET).postResult({ kind: 'run', taskId, runId: second[0]!.runId, outcome: 'passed', log: 'again', timestamp: s.clock.now() });
      assert.equal(again.status, 409);
      assertInvariants(s.booted.venue.engine, 'after contract run');
      assert.equal(driver.destroyed.length, 2);
    } finally {
      await s.stop();
    }
  });

  it('a flaky baseline rejects the task and the runner moves on', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external', BASELINE_CHECK: 'true' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('Flaky customer', 'customer');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const runner = new Runner(new ExchangeClient(s.url, RUNNER_SECRET), new FakeDriver(() => ({ testExitCodes: [1, 0, 1] })), { agents, providerKeys: {}, now: () => s.clock.now() });
      const [r] = await runner.poll();
      assert.deepEqual(r!.results, ['failed', 'passed', 'failed']);
      const t = await s.api('GET', `/api/tasks/${created.body.task.id}`);
      assert.equal(t.body.task.status, 'rejected');
      assert.equal(t.body.task.rejectedReason, 'flaky');
      assert.equal((await runner.poll()).length, 0);
    } finally {
      await s.stop();
    }
  });
});
