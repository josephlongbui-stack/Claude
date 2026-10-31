/**
 * Consistent journal backup with SQLite's VACUUM INTO (safe while the server runs in WAL mode).
 *   tsx scripts/backup-journal.ts [--db data/killer-queen.db] [--out backups/]
 * Then uploads with BACKUP_UPLOAD_CMD if set, e.g. `aws s3 cp {file} s3://my-bucket/kq/` or `rclone copy {file} remote:kq/`.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
};
const db = arg('db', process.env.DB_PATH ?? 'data/killer-queen.db');
const outDir = arg('out', process.env.BACKUP_DIR ?? 'backups');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(outDir, `killer-queen-${stamp}.db`);
const src = new DatabaseSync(db, { readOnly: true });
src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
src.close();
const check = new DatabaseSync(file, { readOnly: true });
const row = check.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(seq), 0) AS seq FROM commands').get() as { n: number; seq: number };
check.close();
console.log(JSON.stringify({ file, bytes: statSync(file).size, commands: Number(row.n), lastSeq: Number(row.seq) }));
const upload = process.env.BACKUP_UPLOAD_CMD;
if (upload) {
  const cmd = upload.replace('{file}', JSON.stringify(file));
  console.log(`uploading: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}
