import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, hmacSha256 } from '../../src/engine/index.js';
import { boot, type BootOptions, type Booted } from '../../src/server/boot.js';
import { loadConfig, type Config } from '../../src/server/config.js';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

export interface TestServer {
  booted: Booted;
  url: string;
  clock: FakeClock;
  config: Config;
  dir: string;
  api<T = any>(method: string, path: string, opts?: { body?: unknown; token?: string; headers?: Record<string, string>; raw?: string }): Promise<ApiResponse<T>>;
  signup(name: string, role: 'trader' | 'customer', kind?: 'human' | 'agent', org?: string): Promise<{ id: string; apiKey: string }>;
  signedResult(body: object, secret?: string): Promise<ApiResponse>;
  stop(): Promise<void>;
}

export const RUNNER_SECRET = 'test-runner-secret-0123456789';

export async function startTestServer(opts: { env?: Record<string, string>; dir?: string; dbName?: string; clock?: FakeClock; bots?: BootOptions['bots']; githubFetch?: typeof fetch } = {}): Promise<TestServer> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'kq-http-'));
  const clock = opts.clock ?? new FakeClock();
  const config = loadConfig({
    KQ_MODE: 'sandbox',
    RUNNER: 'simulated',
    RUNNER_SECRET,
    DB_PATH: join(dir, opts.dbName ?? 'kq.db'),
    HOUSE_BOTS: 'mm',
    ADMIN_KEY: 'admin-key-for-tests',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_ORDERS_PER_MIN: '0',
    RATE_LIMIT_TASKS_PER_MIN: '0',
    RATE_LIMIT_WRITES_PER_MIN: '0',
    RATE_LIMIT_READS_PER_MIN: '0',
    RATE_LIMIT_ANON_PER_MIN: '0',
    BASELINE_CHECK: 'false',
    ...opts.env,
  });
  const booted = await boot({ config, clock, listen: 0, timers: false, publicDir: join(dir, 'no-public'), bots: opts.bots ?? [], seedExecutors: false, githubFetch: opts.githubFetch });
  const url = booted.url!;
  const api: TestServer['api'] = async (method, path, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    let payload: string | undefined;
    if (o.raw !== undefined) {
      payload = o.raw;
      headers['content-type'] = 'application/json';
    } else if (o.body !== undefined) {
      payload = JSON.stringify(o.body);
      headers['content-type'] = 'application/json';
    }
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    const res = await fetch(url + path, { method, headers, body: payload });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status, body: body as any };
  };
  const signup: TestServer['signup'] = async (name, role, kind = 'human', org = '') => {
    const r = await api('POST', '/api/accounts', { body: { name, role, kind, org } });
    if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
    return { id: r.body.account.id, apiKey: r.body.apiKey };
  };
  const signedResult: TestServer['signedResult'] = (body, secret = RUNNER_SECRET) => {
    const raw = JSON.stringify(body);
    return api('POST', '/api/runner/results', { raw, headers: { 'x-kq-signature': `sha256=${hmacSha256(secret, raw)}` } });
  };
  return {
    booted,
    url,
    clock,
    config,
    dir,
    api,
    signup,
    signedResult,
    stop: async () => {
      await booted.stop();
      if (!opts.dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Seed the executors (no HTTP route for that by design) and return their ids. */
export function seedExecutors(server: TestServer): string[] {
  const v = server.booted.venue;
  for (const e of [
    { id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2.1.0' },
    { id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' },
    { id: 'gemini-cli', name: 'Gemini CLI', org: 'Google', version: '0.14.0' },
  ]) {
    const r = v.apply({ type: 'upsertExecutor', ...e });
    if (!r.ok) throw new Error(r.error);
  }
  return ['claude-code', 'codex', 'gemini-cli'];
}

export const TASK = {
  title: 'Reject negative quantities in the cart API',
  prompt: 'POST /cart/items accepts quantity -3 ... add tests for 0, -1 and non-integers.',
  repo: 'github.com/example-org/shop-api',
  commit: '58b0ce4',
  testCommand: 'pytest tests/api/test_cart.py',
};
