/** Print the state hash of a journal file by replaying it into a fresh engine: `tsx scripts/state-hash.ts --db path/to.db` */
import { stateHash } from '../src/engine/index.js';
import { openVenue } from '../src/server/journal.js';

const i = process.argv.indexOf('--db');
const db = i >= 0 ? process.argv[i + 1] : process.env.DB_PATH ?? 'data/killer-queen.db';
if (!db) {
  console.error('usage: state-hash --db <journal.db>');
  process.exit(2);
}
const { venue, journal, replayed } = openVenue(db);
console.log(JSON.stringify({ db, applied: replayed, hash: stateHash(venue.engine.state) }));
journal.close();
