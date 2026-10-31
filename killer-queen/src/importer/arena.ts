/**
 * Arena importer (prompt 2.5): turn merged pull requests that fixed a closed
 * issue and touched tests into public arena tasks at the PR's base commit.
 * Public GitHub data only; dry run by default; idempotent on the issue URL.
 */
import type { ContainerDriver } from '../../runner/src/driver.js';
import type { Venue } from '../engine/index.js';

export interface Candidate {
  source: string; // issue html url
  repo: string; // github.com/owner/repo
  owner: string;
  name: string;
  issueNumber: number;
  prNumber: number;
  title: string;
  prompt: string;
  baseCommit: string;
  mergeCommit: string;
  testFiles: string[];
  changedFiles: string[];
  testCommand: string;
  language: string;
}

export interface GitHubOptions {
  fetchImpl?: typeof fetch;
  token?: string;
  /** Max merged PRs to inspect per repo. */
  limit?: number;
  log?: (msg: string) => void;
  /** Stop when the remaining rate limit drops below this. */
  minRemaining?: number;
}

const TEST_PATTERNS = [/(^|\/)(tests?|__tests__|spec|specs)\//i, /\.(test|spec)\.[cm]?[jt]sx?$/, /_test\.(go|py|rs)$/, /(^|\/)test_[^/]+\.py$/, /(^|\/)[^/]+_test\.py$/, /(^|\/)conftest\.py$/];

export function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((re) => re.test(path));
}

export function linkedIssueNumbers(prBody: string | null | undefined): number[] {
  const out = new Set<number>();
  for (const m of (prBody ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi)) out.add(Number(m[1]));
  return [...out];
}

/** A test command limited to the changed test files, by language; null when the stack is not recognised. */
export function testCommandFor(testFiles: string[]): { command: string; language: string } | null {
  const py = testFiles.filter((f) => f.endsWith('.py'));
  const js = testFiles.filter((f) => /\.[cm]?[jt]sx?$/.test(f));
  const go = testFiles.filter((f) => f.endsWith('_test.go'));
  const rs = testFiles.filter((f) => f.endsWith('.rs'));
  if (py.length && py.length >= js.length) return { command: `python -m pytest -q ${py.map(q).join(' ')}`, language: 'python' };
  if (go.length) {
    const dirs = [...new Set(go.map((f) => './' + (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.')))];
    return { command: `go test ${dirs.map(q).join(' ')}`, language: 'go' };
  }
  if (js.length) return { command: `npm test -- ${js.map(q).join(' ')}`, language: 'javascript' };
  if (rs.length) return { command: 'cargo test', language: 'rust' };
  return null;
}

function q(s: string): string {
  return /^[\w./@-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export class GitHub {
  private remaining = Infinity;
  constructor(private readonly opts: GitHubOptions = {}) {}

  get rateRemaining(): number {
    return this.remaining;
  }

  async get<T>(path: string): Promise<T> {
    if (this.remaining < (this.opts.minRemaining ?? 20)) throw new Error(`GitHub rate limit nearly exhausted (${this.remaining} left); stopping`);
    const f = this.opts.fetchImpl ?? fetch;
    const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'killer-queen-importer' };
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
    const res = await f(`https://api.github.com${path}`, { headers });
    const rem = res.headers.get('x-ratelimit-remaining');
    if (rem !== null) this.remaining = Number(rem);
    if (res.status === 403 || res.status === 429) {
      const retry = res.headers.get('retry-after');
      throw new Error(`GitHub refused ${path} (${res.status}${retry ? `, retry after ${retry}s` : ''}); stopping`);
    }
    if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

interface PR {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  base: { sha: string };
  merge_commit_sha: string | null;
  html_url: string;
}
interface PRFile {
  filename: string;
  status: string;
}
interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  pull_request?: unknown;
}

/** Candidates from one `owner/repo`: merged PRs that changed tests and non-tests and closed an issue. */
export async function findCandidates(repoFull: string, gh: GitHub, opts: { limit?: number; log?: (m: string) => void } = {}): Promise<Candidate[]> {
  const [owner, name] = repoFull.split('/');
  if (!owner || !name) throw new Error(`repo must be owner/name, got ${repoFull}`);
  const log = opts.log ?? (() => undefined);
  const limit = opts.limit ?? 30;
  const out: Candidate[] = [];
  let page = 1;
  let seen = 0;
  while (seen < limit) {
    const prs = await gh.get<PR[]>(`/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=${page}`);
    if (prs.length === 0) break;
    for (const pr of prs) {
      if (seen >= limit) break;
      if (!pr.merged_at || !pr.merge_commit_sha) continue;
      seen += 1;
      const issues = linkedIssueNumbers(pr.body);
      if (issues.length === 0) {
        log(`#${pr.number}: no linked issue, skip`);
        continue;
      }
      const files = await gh.get<PRFile[]>(`/repos/${owner}/${name}/pulls/${pr.number}/files?per_page=100`);
      const testFiles = files.filter((f) => isTestFile(f.filename) && f.status !== 'removed').map((f) => f.filename);
      const nonTest = files.filter((f) => !isTestFile(f.filename)).map((f) => f.filename);
      if (testFiles.length === 0 || nonTest.length === 0) {
        log(`#${pr.number}: ${testFiles.length} test files, ${nonTest.length} other files, skip`);
        continue;
      }
      const tc = testCommandFor(testFiles);
      if (!tc) {
        log(`#${pr.number}: unsupported test stack (${testFiles.join(', ')}), skip`);
        continue;
      }
      const issue = await gh.get<Issue>(`/repos/${owner}/${name}/issues/${issues[0]}`);
      if (issue.pull_request || issue.state !== 'closed') {
        log(`#${pr.number}: linked #${issues[0]} is not a closed issue, skip`);
        continue;
      }
      out.push({
        source: issue.html_url,
        repo: `github.com/${owner}/${name}`,
        owner,
        name,
        issueNumber: issue.number,
        prNumber: pr.number,
        title: issue.title.trim().slice(0, 200),
        prompt: `${issue.title.trim()}\n\n${(issue.body ?? '').trim()}\n\nMake the tests in ${testFiles.join(', ')} pass without editing them.`.slice(0, 20_000),
        baseCommit: pr.base.sha,
        mergeCommit: pr.merge_commit_sha,
        testFiles,
        changedFiles: files.map((f) => f.filename),
        testCommand: tc.command,
        language: tc.language,
      });
      log(`#${pr.number}: candidate (${tc.language}, ${testFiles.length} test files)`);
    }
    page += 1;
  }
  return out;
}

export interface VerifyResult {
  candidate: Candidate;
  failsBefore: boolean | null;
  passesAfter: boolean | null;
  keep: boolean;
  note: string;
}

/** Run the test command at the base commit (must fail) and at the merge commit (must pass) through a sandbox driver. */
export async function verifyCandidate(c: Candidate, driver: ContainerDriver, opts: { timeoutMs?: number } = {}): Promise<VerifyResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const runAt = async (commit: string): Promise<boolean | null> => {
    const container = await driver.create({ repo: c.repo, commit, egressAllow: [], env: {}, cpus: 2, memoryMb: 4096, pids: 512, label: `verify:${c.source}@${commit}` }, { timeoutMs });
    try {
      const r = await container.shell(c.testCommand, { timeoutMs });
      return r.timedOut ? null : r.exitCode === 0;
    } finally {
      await container.destroy();
    }
  };
  const before = await runAt(c.baseCommit);
  if (before !== false) return { candidate: c, failsBefore: before, passesAfter: null, keep: false, note: before === null ? 'tests timed out at the base commit' : 'tests already pass at the base commit' };
  const after = await runAt(c.mergeCommit);
  if (after !== true) return { candidate: c, failsBefore: false, passesAfter: after, keep: false, note: after === null ? 'tests timed out at the merge commit' : 'tests still fail with the fix applied' };
  return { candidate: c, failsBefore: false, passesAfter: true, keep: true, note: 'fails before, passes after' };
}

export interface ApplyOptions {
  customerId: string;
  candidateAgents: string[];
  tradingWindowMs?: number;
  requireBaseline?: boolean;
}

/** Create tasks for candidates not yet imported (by source URL). Returns created ids and skipped sources. */
export function applyCandidates(venue: Venue, candidates: Candidate[], opts: ApplyOptions): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  const existing = new Set([...venue.engine.state.tasks.values()].map((t) => t.source).filter((x): x is string => x !== null));
  for (const c of candidates) {
    if (existing.has(c.source)) {
      skipped.push(c.source);
      continue;
    }
    const r = venue.apply({
      type: 'createTask',
      customer: opts.customerId,
      title: c.title,
      prompt: c.prompt,
      repo: c.repo,
      commit: c.baseCommit,
      testCommand: c.testCommand,
      candidateAgents: opts.candidateAgents,
      protectedPaths: c.testFiles,
      tradingWindowMs: opts.tradingWindowMs ?? 30 * 60_000,
      autoDecide: true,
      requireBaseline: opts.requireBaseline ?? true,
      source: c.source,
    });
    if (!r.ok) throw new Error(`createTask for ${c.source}: ${r.code} ${r.error}`);
    created.push(r.data.task.id);
    existing.add(c.source);
  }
  return { created, skipped };
}
