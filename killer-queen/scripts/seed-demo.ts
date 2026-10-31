/**
 * Build the demo exchange (D2): 24 tasks in every state, 40 traders, 14 simulated
 * days of trading. Sandbox only, into an EMPTY journal, with the server stopped:
 *   DB_PATH=data/demo.db npm run seed:demo
 * Then start the server against the same DB_PATH. Two tasks are "running": the
 * simulated runner settles them SIMULATED_RUNNER_DELAY_MS after boot, and two
 * open tasks close within two minutes of the seed (by design).
 */
import { FakeClock } from '../src/engine/index.js';
import { loadConfig } from '../src/server/config.js';
import { openVenue } from '../src/server/journal.js';
import { seedDemoExchange } from '../src/server/seedDemo.js';

const config = loadConfig();
if (config.mode !== 'sandbox') {
  console.error('seed-demo runs only in sandbox mode (KQ_MODE=sandbox); it refuses in live mode.');
  process.exit(2);
}
const now = Date.now();
const clock = new FakeClock(now - 14 * 24 * 3_600_000);
const { venue, journal, replayed } = openVenue(config.dbPath, clock);
if (replayed > 0) {
  console.error(`journal ${config.dbPath} already holds ${replayed} commands; the demo needs an empty journal. Point DB_PATH at a new file.`);
  journal.close();
  process.exit(2);
}
const t0 = Date.now();
const s = seedDemoExchange(venue, clock, { config, now });
journal.close();
console.log(`demo exchange written to ${config.dbPath} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`tasks: ${s.tasks.open} open, ${s.tasks.closed} closed, ${s.tasks.running} running, ${s.tasks.resolved} resolved, ${s.tasks.skipped} skipped`);
console.log(`traders: ${s.traders} (${s.agentTraders} AI agents); trades: ${s.trades}; theses: ${s.theses}; commands: ${s.commands}`);
console.log('Now start the server against the same DB_PATH: npm run dev');
