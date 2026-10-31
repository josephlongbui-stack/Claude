import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeDriver } from '../../runner/src/fakeDriver.js';
import { GitHub, applyCandidates, findCandidates, isTestFile, linkedIssueNumbers, testCommandFor, verifyCandidate } from '../../src/importer/arena.js';
import { makeVenue, must } from '../helpers/fixtures.js';

const pr = (n: number, body: string | null, merged = true) => ({ number: n, title: `PR ${n}`, body, merged_at: merged ? '2026-10-01T00:00:00Z' : null, base: { sha: `base${n}` }, merge_commit_sha: merged ? `merge${n}` : null, html_url: `https://github.com/ex/repo/pull/${n}` });
const fixtures: Record<string, unknown> = {
  '/repos/ex/repo/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=1': [
    pr(10, 'Fixes #1 by validating quantity'), // good: tests + src, closed issue
    pr(11, 'Closes #2'), // only tests changed
    pr(12, 'refactor, no issue'), // no linked issue
    pr(13, 'resolves #3'), // linked thing is a PR, not an issue
    pr(14, 'fix #4', false), // not merged
    pr(15, 'Fixed #5'), // go
  ],
  '/repos/ex/repo/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=2': [],
  '/repos/ex/repo/pulls/10/files?per_page=100': [{ filename: 'src/cart.py', status: 'modified' }, { filename: 'tests/test_cart.py', status: 'modified' }],
  '/repos/ex/repo/pulls/11/files?per_page=100': [{ filename: 'tests/test_x.py', status: 'added' }],
  '/repos/ex/repo/pulls/13/files?per_page=100': [{ filename: 'src/a.py', status: 'modified' }, { filename: 'tests/test_a.py', status: 'modified' }],
  '/repos/ex/repo/pulls/15/files?per_page=100': [{ filename: 'internal/reports/csv.go', status: 'modified' }, { filename: 'internal/reports/csv_test.go', status: 'added' }],
  '/repos/ex/repo/issues/1': { number: 1, title: 'Cart accepts negative quantity', body: 'POST /cart/items accepts -3', state: 'closed', html_url: 'https://github.com/ex/repo/issues/1' },
  '/repos/ex/repo/issues/2': { number: 2, title: 'x', body: '', state: 'closed', html_url: 'https://github.com/ex/repo/issues/2' },
  '/repos/ex/repo/issues/3': { number: 3, title: 'a pr', body: '', state: 'closed', html_url: 'https://github.com/ex/repo/pull/3', pull_request: {} },
  '/repos/ex/repo/issues/5': { number: 5, title: 'CSV export wrong quoting', body: 'Commas in names break the CSV', state: 'closed', html_url: 'https://github.com/ex/repo/issues/5' },
};

function fakeGitHub(remaining = 100) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url).replace('https://api.github.com', '');
    calls.push(u);
    const body = fixtures[u];
    if (body === undefined) return new Response('{"message":"Not Found"}', { status: 404, headers: { 'x-ratelimit-remaining': String(remaining) } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'x-ratelimit-remaining': String(remaining) } });
  }) as unknown as typeof fetch;
  return { gh: new GitHub({ fetchImpl, minRemaining: 5 }), calls };
}

describe('arena importer', () => {
  it('recognises test files, linked issues and test stacks', () => {
    assert.equal(isTestFile('tests/test_cart.py'), true);
    assert.equal(isTestFile('src/cart.test.ts'), true);
    assert.equal(isTestFile('internal/x_test.go'), true);
    assert.equal(isTestFile('src/cart.py'), false);
    assert.deepEqual(linkedIssueNumbers('Fixes #12, closes org/repo#7 and resolves: #9'), [12, 7, 9]);
    assert.deepEqual(linkedIssueNumbers('see #4'), []);
    assert.deepEqual(testCommandFor(['tests/test_cart.py']), { command: 'python -m pytest -q tests/test_cart.py', language: 'python' });
    assert.deepEqual(testCommandFor(['internal/reports/csv_test.go']), { command: 'go test ./internal/reports', language: 'go' });
    assert.deepEqual(testCommandFor(['src/a.test.ts']), { command: 'npm test -- src/a.test.ts', language: 'javascript' });
    assert.equal(testCommandFor(['x.rb']), null);
  });

  it('finds candidates: merged PRs with a closed linked issue that changed tests and code', async () => {
    const { gh, calls } = fakeGitHub();
    const log: string[] = [];
    const cands = await findCandidates('ex/repo', gh, { log: (m) => log.push(m) });
    assert.deepEqual(cands.map((c) => c.prNumber), [10, 15]);
    const c = cands[0]!;
    assert.equal(c.source, 'https://github.com/ex/repo/issues/1');
    assert.equal(c.baseCommit, 'base10');
    assert.equal(c.mergeCommit, 'merge10');
    assert.deepEqual(c.testFiles, ['tests/test_cart.py']);
    assert.equal(c.testCommand, 'python -m pytest -q tests/test_cart.py');
    assert.match(c.prompt, /Cart accepts negative quantity/);
    assert.match(c.prompt, /without editing them/);
    assert.ok(log.some((l) => /#11: 1 test files, 0 other files, skip/.test(l)));
    assert.ok(log.some((l) => /#12: no linked issue/.test(l)));
    assert.ok(log.some((l) => /#13: linked #3 is not a closed issue/.test(l)));
    assert.ok(!calls.some((u) => u.includes('/pulls/14/')), 'unmerged PR never fetched');
  });

  it('stops before exhausting the GitHub rate limit', async () => {
    const { gh } = fakeGitHub(3);
    await assert.rejects(() => findCandidates('ex/repo', gh), /rate limit/);
  });

  it('verification keeps only candidates that fail at the base commit and pass with the fix', async () => {
    const { gh } = fakeGitHub();
    const [c] = await findCandidates('ex/repo', gh, { limit: 1 });
    const good = new FakeDriver(() => ({ testExitCodes: [1, 0] }));
    const v1 = await verifyCandidate(c!, new FakeDriver((spec) => ({ testExitCodes: [spec.commit === 'base10' ? 1 : 0] })));
    assert.equal(v1.keep, true);
    const v2 = await verifyCandidate(c!, new FakeDriver(() => ({ testExitCodes: [0] })));
    assert.equal(v2.keep, false);
    assert.match(v2.note, /already pass/);
    const v3 = await verifyCandidate(c!, new FakeDriver(() => ({ testExitCodes: [1, 1] })));
    assert.equal(v3.keep, false);
    assert.match(v3.note, /still fail/);
    assert.equal(good.created.length, 0);
  });

  it('applying creates pending tasks once per source with the tests as protected paths', async () => {
    const { gh } = fakeGitHub();
    const cands = await findCandidates('ex/repo', gh);
    const { venue } = makeVenue();
    must(venue, { type: 'createAccount', id: 'arena-importer', name: 'Arena', kind: 'system', role: 'customer', org: 'Killer Queen Arena', keyHash: null, startingCash: 0 });
    must(venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '1' });
    const a = applyCandidates(venue, cands, { customerId: 'arena-importer', candidateAgents: ['codex'] });
    assert.equal(a.created.length, 2);
    const t = venue.engine.task(a.created[0]!)!;
    assert.equal(t.status, 'pending');
    assert.equal(t.source, 'https://github.com/ex/repo/issues/1');
    assert.deepEqual(t.protectedPaths, ['tests/test_cart.py']);
    assert.equal(t.commit, 'base10');
    const b = applyCandidates(venue, cands, { customerId: 'arena-importer', candidateAgents: ['codex'] });
    assert.deepEqual(b.created, []);
    assert.equal(b.skipped.length, 2);
    // the engine itself refuses a duplicate source
    const r = venue.apply({ type: 'createTask', customer: 'arena-importer', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'x', candidateAgents: ['codex'], source: 'https://github.com/ex/repo/issues/1' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'duplicate_source');
  });
});
