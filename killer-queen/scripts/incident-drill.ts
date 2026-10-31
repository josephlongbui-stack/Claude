/**
 * Incident drill (prompt 6.3), on a throwaway copy: a wrong settlement is
 * corrected only with new journaled commands (never by editing rows), then
 * the journal is backed up, restored into a fresh instance, and the state
 * hashes compared. Prints each step and what it found.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateHash } from '../src/engine/index.js';
import { boot } from '../src/server/boot.js';
import { loadConfig } from '../src/server/config.js';
import { openVenue } from '../src/server/journal.js';
import { ensureExecutors } from '../src/server/seed.js';

const dir = mkdtempSync(join(tmpdir(), 'kq-drill-'));
const dbPath = join(dir, 'staging.db');
const steps: { step: string; ms: number; note: string }[] = [];
const t0 = Date.now();
let last = t0;
const log = (step: string, note = '') => {
  const now = Date.now();
  steps.push({ step, ms: now - last, note });
  last = now;
  console.log(`[${String(now - t0).padStart(5)} ms] ${step}${note ? ` — ${note}` : ''}`);
};

const config = loadConfig({ KQ_MODE: 'sandbox', RUNNER: 'external', RUNNER_SECRET: 'x'.repeat(32), DB_PATH: dbPath, HOUSE_BOTS: '', LOG_LEVEL: 'silent', BASELINE_CHECK: 'false', ADMIN_KEY: 'drill-admin', RATE_LIMIT_ORDERS_PER_MIN: '0', RATE_LIMIT_WRITES_PER_MIN: '0' });
const b = await boot({ config, listen: 0, timers: false, publicDir: join(dir, 'none'), bots: [] });
ensureExecutors(b.venue);
const v = b.venue;
const ok = <T extends { ok: boolean }>(r: T): T => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
};
ok(v.apply({ type: 'createAccount', id: 'cust', name: 'Customer', kind: 'human', role: 'customer', org: 'C', keyHash: null, startingCash: 0 }));
ok(v.apply({ type: 'createAccount', id: 'admin', name: 'Admin', kind: 'human', role: 'admin', org: 'KQ', keyHash: null, startingCash: 0 }));
for (const id of ['alice', 'bob', 'carol']) ok(v.apply({ type: 'createAccount', id, name: id, kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000 }));
const task = ok(v.apply({ type: 'createTask', id: 'tsk_drill', customer: 'cust', title: 'Drill task', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] }));
const m = (task as { data: { markets: { id: string }[] } }).data.markets[0]!.id;
ok(v.apply({ type: 'placeOrder', account: 'bob', market: m, side: 'no', action: 'buy', orderType: 'limit', price: 40, quantity: 20 }));
ok(v.apply({ type: 'placeOrder', account: 'alice', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 60, quantity: 20 }));
ok(v.apply({ type: 'placeOrder', account: 'carol', market: m, side: 'yes', action: 'buy', orderType: 'limit', price: 55, quantity: 5 }));
ok(v.apply({ type: 'closeTask', taskId: 'tsk_drill' }));
ok(v.apply({ type: 'decide', taskId: 'tsk_drill', executorId: 'codex', by: 'cust' }));
log('staging exchange ready', `alice 20 Yes @60, bob 20 No @40, carol rests; task running`);

// The wrong result: the runner reported "failed", but the tests had actually passed.
ok(v.apply({ type: 'settle', taskId: 'tsk_drill', outcome: 'failed', log: 'runner said failed (wrong)', runId: 'bad-run' }));
const cash = (id: string) => v.engine.account(id)!.cash;
log('WRONG settlement applied', `bob (No) received 2000¢; alice (Yes) received 0; alice cash ${cash('alice')}, bob cash ${cash('bob')}`);

// 1. Pause trading (journaled) while we work.
ok(v.apply({ type: 'pauseTrading', paused: true, reason: 'incident: tsk_drill settled on a wrong result', by: 'admin' }));
log('trading paused', 'journaled pauseTrading');

// 2. Correct with new commands only. Today the engine has no reversal command, so the
//    only lever is compensation: pay Yes holders what a correct settlement would have paid.
const positions = v.engine.positionsFor(m);
const compensation: { account: string; owed: number }[] = [];
for (const p of positions) {
  const c = p.closed!;
  const shouldHaveReceived = c.yes * 100; // correct result: passed → Yes pays 100
  const received = p.payout;
  if (shouldHaveReceived > received) compensation.push({ account: p.account, owed: shouldHaveReceived - received });
}
for (const c of compensation) ok(v.apply({ type: 'deposit', account: c.account, amount: c.owed, reason: 'admin' }));
log('compensation deposited', compensation.map((c) => `${c.account} +${c.owed}¢`).join(', ') || 'nobody owed');
const before = { cash: [...v.engine.state.accounts.values()].reduce((a, x) => a + x.cash + x.locked, 0), escrow: [...v.engine.state.markets.values()].reduce((a, x) => a + x.escrow, 0), deposited: v.engine.state.totals.deposited };
log('conservation check', `cash+locked ${before.cash} + escrow ${before.escrow} == deposits ${before.deposited}: ${before.cash + before.escrow === before.deposited}`);
const findings: string[] = [];
findings.push('No reversal command exists: bob keeps the 2000¢ a correct settlement would not have paid, and alice is made whole by minting 2000¢ (fine for play money, impossible for real money).');
findings.push(`task.passed still reads ${String(v.engine.task('tsk_drill')!.passed)} and the executor record counts a fail; nothing journaled can fix the record today.`);
findings.push('A correctSettlement command (admin, journaled, reverses payouts and re-settles with the right outcome, requires the runner\'s corrected signed result) is the missing tool; until then document compensations in the incident log.');
ok(v.apply({ type: 'pauseTrading', paused: false, by: 'admin' }));
log('trading resumed');

// 3. Backup and restore, compare hashes.
const liveHash = stateHash(v.engine.state);
const backup = join(dir, 'backup.db');
const src = new DatabaseSync(dbPath, { readOnly: true });
src.exec(`VACUUM INTO '${backup}'`);
src.close();
log('backup taken', backup);
const restored = openVenue(backup);
const restoredHash = stateHash(restored.venue.engine.state);
restored.journal.close();
log('restore replayed', `${restored.replayed} commands; hash ${restoredHash === liveHash ? 'MATCHES' : 'DIFFERS'} live`);
if (restoredHash !== liveHash) findings.push('Restored hash differs from live: investigate before relying on backups.');
await b.stop();
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ totalMs: Date.now() - t0, steps, findings }, null, 2));
