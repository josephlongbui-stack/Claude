/**
 * Random invalid requests to every route must come back 4xx with
 * { error, code } and leave the state hash unchanged. Seeded so a failure
 * reproduces (KQ_SEED, KQ_FUZZ_ROUNDS).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { stateHash } from '../../src/engine/index.js';
import { rng } from '../helpers/fixtures.js';
import { TASK, seedExecutors, startTestServer, type TestServer } from '../helpers/server.js';

const SEED = Number(process.env.KQ_SEED ?? 20261031);
const ROUNDS = Number(process.env.KQ_FUZZ_ROUNDS ?? 6);

let s: TestServer;
let trader: { apiKey: string };
let taskId: string;
let orderId: string;
before(async () => {
  s = await startTestServer({ env: { RUNNER: 'external' } });
  seedExecutors(s);
  const cust = await s.signup('Fuzz customer', 'customer');
  trader = await s.signup('Fuzz trader', 'trader');
  // The resting order belongs to someone else, so the fuzzed token can never legitimately cancel it.
  const owner = await s.signup('Fuzz owner', 'trader');
  const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
  taskId = created.body.task.id;
  const o = await s.api('POST', '/api/orders', { token: owner.apiKey, body: { marketId: `${taskId}:codex`, side: 'yes', price: 30, quantity: 2 } });
  orderId = o.body.order.id;
});
after(() => s.stop());

function junkValue(rand: () => number, depth = 0): unknown {
  const r = rand();
  if (r < 0.12) return Math.floor(rand() * 2000) - 1000;
  if (r < 0.2) return rand() * 1e6 - 5e5;
  if (r < 0.3) return ['', 'yes', 'buy', 'tsk_1:codex', '\u0000', 'x'.repeat(Math.floor(rand() * 300)), '💥', '{"a":1}'][Math.floor(rand() * 8)];
  if (r < 0.36) return rand() < 0.5;
  if (r < 0.42) return null;
  if (r < 0.55 && depth < 3) return Array.from({ length: Math.floor(rand() * 4) }, () => junkValue(rand, depth + 1));
  const obj: Record<string, unknown> = { __fuzz: 1 }; // every schema is strict, so an unknown key is always invalid
  const keys = ['marketId', 'side', 'action', 'type', 'price', 'quantity', 'tif', 'text', 'probability', 'name', 'kind', 'role', 'org', 'title', 'prompt', 'repo', 'commit', 'testCommand', 'candidateAgents', 'executorId', 'taskId', 'passed', 'outcome', 'log', 'runId', 'timestamp', 'paused'];
  for (let i = 0, n = Math.floor(rand() * 6); i < n; i++) obj[keys[Math.floor(rand() * keys.length)]!] = depth < 3 ? junkValue(rand, depth + 1) : 1;
  return obj;
}

function junkRaw(rand: () => number): string {
  const r = rand();
  if (r < 0.3) return JSON.stringify(junkValue(rand));
  if (r < 0.5) return '{"marketId": ' + 'x'.repeat(Math.floor(rand() * 50));
  if (r < 0.7) return 'null';
  if (r < 0.85) return '[]';
  return '"' + 'z'.repeat(Math.floor(rand() * 100)) + '"';
}

describe(`fuzz: random invalid bodies to every route (seed ${SEED}, ${ROUNDS} rounds)`, () => {
  it('every response is 4xx JSON { error, code } (or 200 for reads) and the state hash never changes', async () => {
    const rand = rng(SEED);
    const ids = () => [taskId, `${taskId}:codex`, orderId, 'tsk_none', 'x/../y', '%00', 'a'.repeat(300), String(Math.floor(rand() * 1000))][Math.floor(rand() * 8)]!;
    const before = stateHash(s.booted.venue.engine.state);
    const tokens = [undefined, trader.apiKey, 'kq_' + 'f'.repeat(48), 'Bearer', ''];
    let checked = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const routes: { method: string; path: string; body?: boolean }[] = [
        { method: 'POST', path: '/api/accounts', body: true },
        { method: 'GET', path: '/api/me' },
        { method: 'GET', path: '/api/portfolio' },
        { method: 'GET', path: `/api/tasks?${encodeURIComponent(String(junkValue(rand)))}=1` },
        { method: 'GET', path: `/api/tasks/${encodeURIComponent(ids())}` },
        { method: 'GET', path: `/api/markets/${encodeURIComponent(ids())}` },
        { method: 'GET', path: '/api/agent/markets' },
        { method: 'GET', path: '/api/executors' },
        { method: 'GET', path: '/api/leaderboard' },
        { method: 'GET', path: '/api/stats' },
        { method: 'POST', path: '/api/orders', body: true },
        { method: 'DELETE', path: `/api/orders/${encodeURIComponent(ids())}` },
        { method: 'POST', path: `/api/markets/${encodeURIComponent(ids())}/comments`, body: true },
        { method: 'POST', path: '/api/tasks', body: true },
        { method: 'POST', path: `/api/tasks/${encodeURIComponent(ids())}/close` },
        { method: 'POST', path: `/api/tasks/${encodeURIComponent(ids())}/decide`, body: true },
        { method: 'GET', path: '/api/runner/jobs' },
        { method: 'POST', path: '/api/runner/results', body: true },
        { method: 'POST', path: `/api/admin/tasks/${encodeURIComponent(ids())}/settle`, body: true },
        { method: 'POST', path: '/api/admin/trading', body: true },
        { method: 'PUT', path: '/api/orders', body: true },
        { method: 'GET', path: `/api/${encodeURIComponent(String(junkValue(rand)))}` },
      ];
      for (const route of routes) {
        for (const token of tokens) {
          const raw = route.body ? junkRaw(rand) : undefined;
          const headers: Record<string, string> = {};
          if (rand() < 0.3) headers['x-kq-signature'] = 'sha256=' + 'ab'.repeat(32);
          // header values must be printable ASCII or fetch itself refuses them client-side
          const headerJunk = () => String(junkValue(rand)).replace(/[^\x20-\x7e]/g, '').slice(0, 200) || 'j';
          if (rand() < 0.3) headers['x-admin-key'] = headerJunk();
          if (rand() < 0.3) headers['idempotency-key'] = headerJunk();
          const res = await s.api(route.method, route.path, { token, raw, headers });
          checked += 1;
          const label = `${route.method} ${route.path} token=${token === undefined ? 'none' : token.slice(0, 6)} body=${raw?.slice(0, 40)}`;
          assert.ok(res.status < 500, `${label} → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
          if (res.status >= 400) {
            assert.equal(typeof res.body, 'object', label);
            assert.deepEqual(Object.keys(res.body).sort(), ['code', 'error'], label);
            assert.equal(JSON.stringify(res.body).includes('    at '), false, label);
          } else {
            assert.equal(route.method, 'GET', `${label} succeeded with junk`);
          }
          assert.equal(stateHash(s.booted.venue.engine.state), before, `${label} changed the state`);
        }
      }
    }
    assert.ok(checked > 500);
  });
});
