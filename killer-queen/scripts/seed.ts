/**
 * Seed the sandbox: executors, a demo customer and three public demo tasks.
 * Run with the server STOPPED (it opens the same journal file):
 *   npm run seed
 * Prints the demo customer's API key once, the first time it is created.
 */
import { loadConfig } from '../src/server/config.js';
import { openVenue } from '../src/server/journal.js';
import { seedDemo } from '../src/server/seed.js';

const config = loadConfig();
if (config.mode !== 'sandbox') {
  console.error('seed is sandbox-only');
  process.exit(2);
}
const { venue, journal } = openVenue(config.dbPath);
const r = seedDemo(venue, { requireBaseline: config.baselineCheck });
journal.close();
console.log(`executors created: ${r.executorsCreated}`);
console.log(`demo customer: ${r.customerId}${r.customerKey ? ` (API key, shown once): ${r.customerKey}` : ' (already existed)'}`);
console.log(`demo tasks opened: ${r.taskIds.length ? r.taskIds.join(', ') : 'none (already open)'}`);
console.log('Now start the server: npm run dev');
