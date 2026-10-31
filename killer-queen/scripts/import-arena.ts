/**
 * Import public arena tasks from GitHub.
 *   npm run import:arena -- --repos owner/repo[,owner/repo] [--limit 30] [--verify none|fake|docker] [--apply]
 * Dry run by default: prints candidates as JSON. --apply writes tasks into the journal
 * (run with the server STOPPED) as the `arena-importer` customer. GITHUB_TOKEN raises the rate limit.
 */
import { DockerDriver } from '../runner/src/dockerDriver.js';
import { FakeDriver } from '../runner/src/fakeDriver.js';
import { GitHub, applyCandidates, findCandidates, verifyCandidate, type Candidate } from '../src/importer/arena.js';
import { loadConfig } from '../src/server/config.js';
import { openVenue } from '../src/server/journal.js';
import { DEFAULT_EXECUTORS, ensureExecutors } from '../src/server/seed.js';

const args = process.argv.slice(2);
const flag = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : dflt;
};
const repos = (flag('repos', '') ?? '').split(',').map((r) => r.trim()).filter(Boolean);
if (repos.length === 0) {
  console.error('usage: import-arena --repos owner/repo[,owner/repo] [--limit 30] [--verify none|fake|docker] [--apply]');
  process.exit(2);
}
const limit = Number(flag('limit', '30'));
const verify = flag('verify', 'none');
const apply = args.includes('--apply');
const gh = new GitHub({ token: process.env.GITHUB_TOKEN, log: (m) => console.error(m) });

const candidates: Candidate[] = [];
for (const repo of repos) {
  console.error(`scanning ${repo} (rate limit remaining: ${gh.rateRemaining})`);
  try {
    candidates.push(...(await findCandidates(repo, gh, { limit, log: (m) => console.error(`  ${m}`) })));
  } catch (e) {
    console.error(`  stopped: ${(e as Error).message}`);
    break;
  }
}
let kept = candidates;
if (verify !== 'none') {
  const driver = verify === 'fake' ? new FakeDriver(() => ({ testExitCodes: [1, 0] })) : new DockerDriver({ image: process.env.RUNNER_IMAGE ?? 'kq-runner:latest', proxyImage: process.env.RUNNER_PROXY_IMAGE ?? 'kq-egress-proxy:latest', registries: ['github.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'proxy.golang.org'] });
  kept = [];
  for (const c of candidates) {
    const v = await verifyCandidate(c, driver);
    console.error(`  verify ${c.source}: ${v.note}`);
    if (v.keep) kept.push(c);
  }
}
if (!apply) {
  console.log(JSON.stringify({ dryRun: true, candidates: kept }, null, 2));
  console.error(`${kept.length} candidate(s); re-run with --apply to create tasks (server stopped)`);
  process.exit(0);
}
const config = loadConfig();
const { venue, journal } = openVenue(config.dbPath);
ensureExecutors(venue);
if (!venue.engine.account('arena-importer')) {
  const r = venue.apply({ type: 'createAccount', id: 'arena-importer', name: 'Public arena', kind: 'system', role: 'customer', org: 'Killer Queen Arena', keyHash: null, startingCash: 0 });
  if (!r.ok) throw new Error(r.error);
}
const result = applyCandidates(venue, kept, { customerId: 'arena-importer', candidateAgents: DEFAULT_EXECUTORS.map((e) => e.id), requireBaseline: config.baselineCheck });
journal.close();
console.log(JSON.stringify({ created: result.created, skipped: result.skipped }, null, 2));
