import assert from 'node:assert/strict';
import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { appJwt, parseKqCommand, verifyWebhookSignature } from '../../src/server/github.js';
import { seedExecutors, startTestServer } from '../helpers/server.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/github/${name}.json`, import.meta.url), 'utf8'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const SECRET = 'gh-webhook-secret';

/** A fake GitHub API: records every call, serves the PR head sha, returns ids. */
function fakeGitHub() {
  const calls: { method: string; path: string; body: any; auth: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url).replace('https://api.github.com', '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: u, body, auth: headers.authorization ?? '' });
    if (u.startsWith('/app/installations/')) return new Response(JSON.stringify({ token: 'ghs_test_token', expires_at: new Date(Date.now() + 3_600_000).toISOString() }), { status: 201 });
    if (u === '/repos/example-org/shop-api/pulls/77') return new Response(JSON.stringify({ head: { sha: 'feedfacefeedfacefeedfacefeedfacefeedface' } }), { status: 200 });
    if (u === '/repos/example-org/shop-api/commits/main') return new Response(JSON.stringify({ sha: 'main000main000main000main000main000main0' }), { status: 200 });
    if (u === '/repos/example-org/shop-api/check-runs') return new Response(JSON.stringify({ id: 555 }), { status: 201 });
    if (u.startsWith('/repos/example-org/shop-api/check-runs/555')) return new Response(JSON.stringify({ id: 555 }), { status: 200 });
    if (u.endsWith('/comments')) return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    return new Response('{"message":"Not Found"}', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function boot(installations: Record<string, string>) {
  const gh = fakeGitHub();
  const s = await startTestServer({ env: { RUNNER: 'external', BASELINE_CHECK: 'true', PUBLIC_URL: 'https://kq.example', GITHUB_APP_ID: '7', GITHUB_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'), GITHUB_WEBHOOK_SECRET: SECRET, GITHUB_INSTALLATIONS: JSON.stringify(installations) }, githubFetch: gh.fetchImpl });
  seedExecutors(s);
  const deliver = async (event: string, payload: unknown, opts: { secret?: string; delivery?: string } = {}) => {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${createHmac('sha256', opts.secret ?? SECRET).update(raw).digest('hex')}`;
    return s.api('POST', '/api/github/webhook', { raw, headers: { 'x-hub-signature-256': sig, 'x-github-event': event, 'x-github-delivery': opts.delivery ?? `d-${Math.random()}` } });
  };
  return { s, gh, deliver };
}

describe('GitHub app (5.3)', () => {
  it('signs an RS256 app JWT with iss = app id and a short expiry', () => {
    const jwt = appJwt('7', PEM, 1_700_000_000_000);
    const [h, p, sig] = jwt.split('.') as [string, string, string];
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.equal(payload.iss, '7');
    assert.equal(payload.exp - payload.iat, 600);
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${p}`);
    assert.equal(v.verify(publicKey, Buffer.from(sig, 'base64url')), true);
  });

  it('verifies webhook signatures in constant time and parses /kq commands', () => {
    const raw = Buffer.from('{"a":1}');
    const good = `sha256=${createHmac('sha256', 's').update(raw).digest('hex')}`;
    assert.equal(verifyWebhookSignature('s', raw, good), true);
    assert.equal(verifyWebhookSignature('s', raw, good.replace(/.$/, '0')), false);
    assert.equal(verifyWebhookSignature('s', raw, undefined), false);
    assert.equal(verifyWebhookSignature('s', raw, 'sha1=abc'), false);
    assert.deepEqual(parseKqCommand('please\n/kq task --test "pytest tests/" --agents codex --private'), { verb: 'task', args: [], options: { test: 'pytest tests/', agents: 'codex', private: '' } });
    assert.deepEqual(parseKqCommand('/kq decide skip'), { verb: 'decide', args: ['skip'], options: {} });
    assert.equal(parseKqCommand('no command here'), null);
    assert.equal(parseKqCommand('/kq dance')!.verb, 'help');
  });

  it('a /kq task comment on a PR opens markets for the installing customer at the PR head and posts a check run; /kq decide closes and decides; the GitHub identity never trades', async () => {
    const { s, gh, deliver } = await boot({});
    try {
      const cust = await s.signup('Installing customer', 'customer', 'human', 'Example Org');
      (s.booted.config.github!.installations as Record<string, string>)['41234'] = cust.id; // map the installation (normally GITHUB_INSTALLATIONS)
      const bad = await deliver('issue_comment', fixture('issue_comment.pr-task'), { secret: 'wrong' });
      assert.equal(bad.status, 401);
      assert.equal(bad.body.code, 'bad_signature');
      assert.equal(s.booted.venue.engine.state.tasks.size, 0);
      const ping = await deliver('ping', { zen: 'x' });
      assert.equal(ping.status, 202);
      assert.equal(ping.body.status, 'ignored');

      const created = await deliver('issue_comment', fixture('issue_comment.pr-task'), { delivery: 'd-1' });
      assert.equal(created.status, 202, JSON.stringify(created.body));
      assert.equal(created.body.status, 'created');
      const taskId = created.body.taskId;
      const t = s.booted.venue.engine.task(taskId)!;
      assert.equal(t.customer, cust.id);
      assert.equal(t.commit, 'feedfacefeedfacefeedfacefeedfacefeedface');
      assert.equal(t.testCommand, 'pytest tests/api/test_cart.py');
      assert.deepEqual(t.candidateAgents, ['codex', 'claude-code']);
      assert.equal(t.tradingWindowMs, 5 * 60_000);
      assert.equal(t.source, 'https://github.com/example-org/shop-api/pull/77');
      assert.equal(t.status, 'pending');
      const checkCreate = gh.calls.find((c) => c.method === 'POST' && c.path === '/repos/example-org/shop-api/check-runs')!;
      assert.equal(checkCreate.body.head_sha, t.commit);
      assert.equal(checkCreate.body.status, 'in_progress');
      assert.match(checkCreate.body.details_url, /https:\/\/kq\.example\/#\/task\//);
      assert.equal(checkCreate.auth, 'Bearer ghs_test_token');
      const tokenCall = gh.calls.find((c) => c.path.startsWith('/app/installations/41234/access_tokens'))!;
      assert.match(tokenCall.auth, /^Bearer ey/);
      const reply = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues/77/comments'))!;
      assert.match(reply.body.body, /opened markets/);
      // duplicate delivery and a second /kq task on the same PR are refused
      assert.equal((await deliver('issue_comment', fixture('issue_comment.pr-task'), { delivery: 'd-1' })).body.reason, 'duplicate delivery');
      assert.equal((await deliver('issue_comment', fixture('issue_comment.pr-task'))).body.status, 'refused');
      assert.equal(s.booted.venue.engine.state.tasks.size, 1);

      // baseline → open; the check run is updated on each task event
      const { hmacSha256 } = await import('../../src/engine/index.js');
      const raw = JSON.stringify({ kind: 'baseline', taskId, results: ['failed', 'failed', 'failed'], log: 'red' });
      await s.api('POST', '/api/runner/results', { raw, headers: { 'x-kq-signature': `sha256=${hmacSha256('test-runner-secret-0123456789', raw)}` } });
      await new Promise((r) => setTimeout(r, 50));
      const patches = () => gh.calls.filter((c) => c.method === 'PATCH' && c.path === '/repos/example-org/shop-api/check-runs/555');
      assert.ok(patches().length >= 1);
      assert.equal(patches()[0]!.body.output.title, 'Trading open');

      // a /kq decide from a different installation is refused
      const other = JSON.parse(JSON.stringify(fixture('issue_comment.decide')));
      other.installation.id = 999;
      (s.booted.config.github!.installations as Record<string, string>)['999'] = (await s.signup('Other customer', 'customer')).id;
      const refused = await deliver('issue_comment', other);
      assert.equal(refused.body.status, 'refused');
      assert.match(refused.body.reason, /did not submit/);
      assert.equal(s.booted.venue.engine.task(taskId)!.status, 'open');

      const decided = await deliver('issue_comment', fixture('issue_comment.decide'));
      assert.equal(decided.body.status, 'decided', JSON.stringify(decided.body));
      const after = s.booted.venue.engine.task(taskId)!;
      assert.equal(after.status, 'running');
      assert.equal(after.chosenAgent, 'codex');
      await new Promise((r) => setTimeout(r, 50));
      assert.match(patches()[patches().length - 1]!.body.output.title, /Running codex/);
      // settle → check completes with a conclusion
      const raw2 = JSON.stringify({ kind: 'run', taskId, passed: true, log: 'green' });
      await s.api('POST', '/api/runner/results', { raw: raw2, headers: { 'x-kq-signature': `sha256=${hmacSha256('test-runner-secret-0123456789', raw2)}` } });
      await new Promise((r) => setTimeout(r, 50));
      const last = patches()[patches().length - 1]!;
      assert.equal(last.body.status, 'completed');
      assert.equal(last.body.conclusion, 'success');
      // no trading from the GitHub identity: no orders exist, and the customer account cannot trade anyway
      assert.equal(s.booted.venue.engine.state.orders.size, 0);
      assert.equal(gh.calls.some((c) => c.path.includes('/api/orders')), false);
    } finally {
      await s.stop();
    }
  });

  it('an issue (not a PR) task uses the default branch head, honours --private, and an unmapped installation is refused', async () => {
    const { s, gh, deliver } = await boot({});
    try {
      const refused = await deliver('issue_comment', fixture('issue_comment.issue-task'));
      assert.equal(refused.body.status, 'refused');
      assert.match(refused.body.reason, /not mapped/);
      const cust = await s.signup('Issue customer', 'customer');
      (s.booted.config.github!.installations as Record<string, string>)['41234'] = cust.id;
      const created = await deliver('issue_comment', fixture('issue_comment.issue-task'));
      assert.equal(created.body.status, 'created', JSON.stringify(created.body));
      const t = s.booted.venue.engine.task(created.body.taskId)!;
      assert.equal(t.commit, 'main000main000main000main000main000main0');
      assert.equal(t.visibility, 'private');
      assert.equal(t.testCommand, 'npm test');
      assert.deepEqual(t.candidateAgents, ['claude-code', 'codex', 'gemini-cli']);
      assert.equal(gh.calls.some((c) => c.path === '/repos/example-org/shop-api/check-runs'), false, 'no check run without a PR');
      assert.equal((await s.api('GET', `/api/tasks/${t.id}`)).status, 404, 'private task hidden from the public');
    } finally {
      await s.stop();
    }
  });

  it('the webhook route is absent when the app is not configured', async () => {
    const s = await startTestServer();
    try {
      assert.equal((await s.api('POST', '/api/github/webhook', { body: {} })).status, 404);
    } finally {
      await s.stop();
    }
  });
});
