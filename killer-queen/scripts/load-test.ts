/**
 * Load test (prompt 6.1) with built-in fetch: boots a production-like exchange
 * in-process (file journal, WAL + synchronous=FULL, no bots, rate limits off)
 * and hammers POST /api/orders with concurrent workers, with and without open
 * event streams. Prints throughput and latency percentiles as JSON.
 *   tsx scripts/load-test.ts [--seconds 8] [--workers 32] [--streams 200] [--traders 50]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const SECONDS = arg('seconds', 8);
const WORKERS = arg('workers', 32);
const STREAMS = arg('streams', 200);
const TRADERS = arg('traders', 50);

// The exchange runs in its own process so the generator's work does not share its event loop.
const dir = mkdtempSync(join(tmpdir(), 'kq-load-'));
const PORT = 3000 + Math.floor(Math.random() * 2000);
const env = { ...process.env, KQ_MODE: 'sandbox', RUNNER: 'external', RUNNER_SECRET: 'x'.repeat(32), DB_PATH: join(dir, 'kq.db'), HOUSE_BOTS: '', LOG_LEVEL: 'silent', BASELINE_CHECK: 'false', RATE_LIMIT_ORDERS_PER_MIN: '0', RATE_LIMIT_WRITES_PER_MIN: '0', RATE_LIMIT_READS_PER_MIN: '0', RATE_LIMIT_ANON_PER_MIN: '0', RATE_LIMIT_TASKS_PER_MIN: '0', STARTING_CASH_CENTS: '100000000', PORT: String(PORT), ADMIN_KEY: 'load-admin' };
const server = spawn(process.execPath, ['--import', 'tsx', resolve(import.meta.dirname, '../src/server/main.ts')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
const url = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${url}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 100));
}
const api = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(url + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json()) as any };
};
const cust = await api('POST', '/api/accounts', { name: 'LT customer', kind: 'human', role: 'customer' });
const task = await api('POST', '/api/tasks', { title: 'load', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex', 'claude-code'] }, cust.body.apiKey);
const markets: string[] = task.body.markets.map((m: any) => m.marketId);
const traders: string[] = [];
for (let i = 0; i < TRADERS; i++) traders.push((await api('POST', '/api/accounts', { name: `LT ${i}`, kind: 'agent', role: 'trader' })).body.apiKey);

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

async function hammer(label: string): Promise<Record<string, unknown>> {
  const latencies: number[] = [];
  let errors = 0;
  let fills = 0;
  const end = Date.now() + SECONDS * 1000;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const worker = async (w: number) => {
    while (Date.now() < end) {
      const token = traders[(w * 7919 + Math.floor(rnd() * 1000)) % traders.length]!;
      const t0 = performance.now();
      try {
        const r = await api('POST', '/api/orders', { marketId: markets[w % markets.length], side: rnd() < 0.5 ? 'yes' : 'no', price: 30 + Math.floor(rnd() * 40), quantity: 1 + Math.floor(rnd() * 5), tif: rnd() < 0.5 ? 'ioc' : 'gtc' }, token);
        if (r.status !== 201) errors += 1;
        else fills += r.body.fills.length;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
  const elapsed = (Date.now() - started) / 1000;
  return { label, requests: latencies.length, errors, fills, reqPerSec: Math.round(latencies.length / elapsed), p50ms: +pct(latencies, 50).toFixed(1), p95ms: +pct(latencies, 95).toFixed(1), p99ms: +pct(latencies, 99).toFixed(1), maxMs: +Math.max(...latencies).toFixed(1) };
}

const results: Record<string, unknown>[] = [];
results.push(await hammer('orders, no streams'));

// Open STREAMS event-stream clients that count events, then hammer again.
const controllers: AbortController[] = [];
let eventsSeen = 0;
for (let i = 0; i < STREAMS; i++) {
  const ctrl = new AbortController();
  controllers.push(ctrl);
  fetch(`${url}/api/events?markets=${encodeURIComponent(markets[i % markets.length]!)}`, { signal: ctrl.signal })
    .then(async (res) => {
      const reader = res.body!.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        eventsSeen += (new TextDecoder().decode(value).match(/^event: /gm) ?? []).length;
      }
    })
    .catch(() => undefined);
}
await new Promise((r) => setTimeout(r, 500));
const withStreams = await hammer(`orders, ${STREAMS} streams`);
await new Promise((r) => setTimeout(r, 300));
withStreams.eventsDelivered = eventsSeen;
results.push(withStreams);
for (const c of controllers) c.abort();

// Reads under load: GET /api/tasks (full view) and GET /api/markets/:id
const readLat: number[] = [];
const readEnd = Date.now() + Math.max(2, SECONDS / 2) * 1000;
await Promise.all(
  Array.from({ length: WORKERS }, async (_, w) => {
    while (Date.now() < readEnd) {
      const t0 = performance.now();
      await api('GET', w % 2 ? '/api/tasks' : `/api/markets/${markets[0]}`);
      readLat.push(performance.now() - t0);
    }
  }),
);
results.push({ label: 'reads (tasks + market views)', requests: readLat.length, reqPerSec: Math.round(readLat.length / Math.max(2, SECONDS / 2)), p50ms: +pct(readLat, 50).toFixed(1), p99ms: +pct(readLat, 99).toFixed(1) });

const health = (await api('GET', '/api/health')).body;
console.log(JSON.stringify({ workers: WORKERS, seconds: SECONDS, traders: TRADERS, journalCommands: health.applied, results }, null, 2));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
rmSync(dir, { recursive: true, force: true });
