import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { ExchangeClient, sha256 } from '../src/exchange.js';
import { FakeDriver } from '../src/fakeDriver.js';
import { redact } from '../src/redact.js';
import { Runner, renderCommand } from '../src/runner.js';
import type { AgentTemplate, Job } from '../src/types.js';

const agents: Record<string, AgentTemplate> = {
  codex: { version: '0.48.0', command: ['codex', 'exec', '--sandbox', 'workspace-write', '{prompt}'], apiHost: 'api.openai.com', keyEnv: 'OPENAI_API_KEY' },
};
const runJob: Job = { kind: 'run', taskId: 'tsk_1', executorId: 'codex', executor: { id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' }, prompt: 'fix the cart; "quoted" $(rm -rf /)', repo: 'github.com/example/shop', commit: 'abc', testCommand: 'pytest tests/', protectedPaths: ['tests/'], decidedAt: 1 };
const baseJob: Job = { kind: 'baseline', taskId: 'tsk_2', repo: 'github.com/example/shop', commit: 'abc', testCommand: 'pytest tests/', protectedPaths: [], createdAt: 1 };

/** A fake exchange that records signed posts and verifies the signature like the server does. */
function fakeExchange(secret: string, jobs: Job[]) {
  const posts: { body: any; valid: boolean }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/runner/jobs')) return new Response(JSON.stringify({ jobs }), { status: 200 });
    if (u.endsWith('/api/runner/results')) {
      const raw = String(init?.body);
      const sig = (init?.headers as Record<string, string>)['x-kq-signature'];
      const valid = sig === `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      const body = JSON.parse(raw);
      posts.push({ body, valid });
      jobs.splice(jobs.findIndex((j) => j.taskId === body.taskId), 1);
      return new Response(JSON.stringify({ ok: valid }), { status: valid ? 200 : 401 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { client: new ExchangeClient('http://x', secret, fetchImpl), posts };
}

describe('runner service', () => {
  it('renders the agent command with the prompt as one argument (no shell interpolation)', () => {
    const argv = renderCommand(agents['codex']!, runJob.prompt);
    assert.deepEqual(argv, ['codex', 'exec', '--sandbox', 'workspace-write', runJob.prompt]);
  });

  it('run job: agent, protected paths restored, tests run once, signed result posted with the log hash', async () => {
    const { client, posts } = fakeExchange('s3cret', [structuredClone(runJob)]);
    const driver = new FakeDriver(() => ({ testExitCodes: [0], agent: { stdout: 'did the thing; key was sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ', editsProtected: ['tests/test_cart.py'] } }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, now: () => 1000 });
    const [report] = await runner.poll();
    assert.equal(report!.outcome, 'passed');
    assert.equal(report!.posted!.status, 200);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.valid, true);
    assert.equal(posts[0]!.body.kind, 'run');
    assert.equal(posts[0]!.body.outcome, 'passed');
    assert.equal(posts[0]!.body.logSha256, sha256(posts[0]!.body.log));
    assert.equal(posts[0]!.body.timestamp, 1000);
    assert.match(posts[0]!.body.log, /protected paths restored: tests\/test_cart.py/);
    assert.equal(posts[0]!.body.log.includes('sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ'), false, 'key redacted');
    assert.match(posts[0]!.body.log, /\[REDACTED\]/);
    assert.equal(driver.created[0]!.egressAllow[0], 'api.openai.com');
    assert.deepEqual(Object.keys(driver.created[0]!.env), ['OPENAI_API_KEY']);
    assert.equal(driver.destroyed.length, 1, 'container destroyed');
  });

  it('an agent that edits a test to force a pass still fails: the restore runs before the tests', async () => {
    // The fake test command fails (exit 1) after restore because the "fix" lived in the protected file.
    const { client, posts } = fakeExchange('s', [structuredClone(runJob)]);
    const driver = new FakeDriver(() => ({ testExitCodes: [1], agent: { editsProtected: ['tests/test_cart.py'] } }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const [report] = await runner.poll();
    assert.equal(report!.outcome, 'failed');
    assert.match(posts[0]!.body.log, /protected paths restored: tests\/test_cart.py/);
  });

  it('an agent over its wall-clock limit fails without running the tests', async () => {
    const { client, posts } = fakeExchange('s', [structuredClone(runJob)]);
    const driver = new FakeDriver(() => ({ testExitCodes: [0], agent: { timedOut: true } }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) }, limits: { wallClockMs: 10 } });
    const [report] = await runner.poll();
    assert.equal(report!.outcome, 'failed');
    assert.match(posts[0]!.body.log, /exceeded the wall-clock limit/);
    assert.doesNotMatch(posts[0]!.body.log, /\$ pytest/);
  });

  it('a test timeout is a fail; an infrastructure failure retries twice then posts infra_error', async () => {
    const { client, posts } = fakeExchange('s', [structuredClone(runJob)]);
    const driver = new FakeDriver(() => ({ testTimeouts: [0] }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const [report] = await runner.poll();
    assert.equal(report!.outcome, 'failed');
    assert.match(posts[0]!.body.log, /timeout/);

    const ex2 = fakeExchange('s', [structuredClone(runJob)]);
    const flaky = new FakeDriver(() => ({ createFailures: 5 }));
    const r2 = new Runner(ex2.client, flaky, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const [rep2] = await r2.poll();
    assert.equal(rep2!.outcome, 'infra_error');
    assert.equal(rep2!.attempts, 3);
    assert.equal(ex2.posts[0]!.body.outcome, 'infra_error');
    assert.match(ex2.posts[0]!.body.log, /attempt 3\/3/);
    const ex3 = fakeExchange('s', [structuredClone(runJob)]);
    const recovers = new FakeDriver(() => ({ createFailures: 2, testExitCodes: [0] }));
    const r3 = new Runner(ex3.client, recovers, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const [rep3] = await r3.poll();
    assert.equal(rep3!.outcome, 'passed');
    assert.equal(rep3!.attempts, 3);
  });

  it('missing template or provider key is an infrastructure error, not a crash', async () => {
    const { client, posts } = fakeExchange('s', [structuredClone(runJob)]);
    const runner = new Runner(client, new FakeDriver(() => ({})), { agents, providerKeys: {}, limits: { infraRetries: 0 } });
    const [report] = await runner.poll();
    assert.equal(report!.outcome, 'infra_error');
    assert.match(posts[0]!.body.log, /no provider key/);
  });

  it('baseline job: three agent-free runs; 3 fails opens, any pass is reported as is; no agent key injected', async () => {
    const { client, posts } = fakeExchange('s', [structuredClone(baseJob)]);
    const driver = new FakeDriver(() => ({ testExitCodes: [1, 1, 1] }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const [report] = await runner.poll();
    assert.deepEqual(report!.results, ['failed', 'failed', 'failed']);
    assert.equal(posts[0]!.body.kind, 'baseline');
    assert.deepEqual(posts[0]!.body.results, ['failed', 'failed', 'failed']);
    assert.deepEqual(driver.created[0]!.env, {});
    assert.deepEqual(driver.created[0]!.egressAllow, []);
    const ex2 = fakeExchange('s', [structuredClone(baseJob)]);
    const [rep2] = await new Runner(ex2.client, new FakeDriver(() => ({ testExitCodes: [1, 0, 1] })), { agents, providerKeys: {} }).poll();
    assert.deepEqual(rep2!.results, ['failed', 'passed', 'failed']);
  });

  it('redaction removes injected secrets and key-shaped strings', () => {
    const s = 'token sk-ant-api03-abcdefghijklmnop and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 and Bearer kq_0123456789abcdef0123456789abcdef0123456789abcdef and mine=SECRETVALUE1';
    const out = redact(s, ['SECRETVALUE1']);
    assert.equal(out.includes('sk-ant'), false);
    assert.equal(out.includes('ghp_'), false);
    assert.equal(out.includes('SECRETVALUE1'), false);
    assert.match(out, /Bearer \[REDACTED\]/);
  });

  it('jobs already in flight are not picked up twice', async () => {
    const { client } = fakeExchange('s', [structuredClone(runJob), structuredClone(baseJob)]);
    const driver = new FakeDriver(() => ({ testExitCodes: [0, 1, 1, 1] }));
    const runner = new Runner(client, driver, { agents, providerKeys: { OPENAI_API_KEY: 'k'.repeat(30) } });
    const done = await runner.poll();
    assert.equal(done.length, 2);
    assert.equal((await runner.poll()).length, 0);
  });
});
