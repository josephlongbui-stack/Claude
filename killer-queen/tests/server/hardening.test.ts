import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { FakeClock } from '../../src/engine/index.js';
import { RateLimiter } from '../../src/server/rateLimit.js';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('API hardening', () => {
  it('token bucket: limit per minute, continuous refill, 0 disables', () => {
    const clock = new FakeClock(0);
    const rl = new RateLimiter(clock);
    for (let i = 0; i < 3; i++) assert.equal(rl.take('k', 3), null);
    assert.equal(rl.take('k', 3), 20); // 3 per minute: the next token is 20 s away
    clock.advance(20_000); // one token back
    assert.equal(rl.take('k', 3), null);
    assert.ok(rl.take('k', 3)! >= 1);
    assert.equal(rl.take('other', 3), null);
    for (let i = 0; i < 100; i++) assert.equal(rl.take('k', 0), null);
  });

  it('orders are rate limited per key with 429 { error, code: rate_limited } and recover with time', async () => {
    const s = await startTestServer({ env: { RATE_LIMIT_ORDERS_PER_MIN: '3' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('RL customer', 'customer');
      const alice = await s.signup('RL Alice', 'trader');
      const bob = await s.signup('RL Bob', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const m = `${created.body.task.id}:codex`;
      const order = (token: string) => s.api('POST', '/api/orders', { token, body: { marketId: m, side: 'yes', price: 10, quantity: 1 } });
      for (let i = 0; i < 3; i++) assert.equal((await order(alice.apiKey)).status, 201);
      const limited = await order(alice.apiKey);
      assert.equal(limited.status, 429);
      assert.deepEqual(Object.keys(limited.body).sort(), ['code', 'error']);
      assert.equal(limited.body.code, 'rate_limited');
      assert.equal((await order(bob.apiKey)).status, 201, 'another key has its own bucket');
      s.clock.advance(60_000);
      assert.equal((await order(alice.apiKey)).status, 201);
      assert.equal(s.booted.venue.engine.state.orders.size, 5);
    } finally {
      await s.stop();
    }
  });

  it('Idempotency-Key: a retry never places two orders, survives a restart, and is per account', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kq-idem-'));
    const clock = new FakeClock();
    try {
      const s = await startTestServer({ dir, clock });
      seedExecutors(s);
      const cust = await s.signup('Idem customer', 'customer');
      const alice = await s.signup('Idem Alice', 'trader');
      const bob = await s.signup('Idem Bob', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const m = `${created.body.task.id}:codex`;
      const body = { marketId: m, side: 'yes', price: 40, quantity: 5 };
      const first = await s.api('POST', '/api/orders', { token: alice.apiKey, body, headers: { 'Idempotency-Key': 'retry-abc' } });
      assert.equal(first.status, 201);
      const again = await s.api('POST', '/api/orders', { token: alice.apiKey, body, headers: { 'idempotency-key': 'retry-abc' } });
      assert.equal(again.status, 200);
      assert.equal(again.body.replayed, true);
      assert.equal(again.body.order.id, first.body.order.id);
      assert.equal(s.booted.venue.engine.state.orders.size, 1);
      // bob may use the same key string
      const bobs = await s.api('POST', '/api/orders', { token: bob.apiKey, body: { ...body, side: 'no' }, headers: { 'Idempotency-Key': 'retry-abc' } });
      assert.equal(bobs.status, 201);
      assert.equal(s.booted.venue.engine.state.orders.size, 2);
      const tooLong = await s.api('POST', '/api/orders', { token: alice.apiKey, body, headers: { 'Idempotency-Key': 'x'.repeat(129) } });
      assert.equal(tooLong.status, 400);
      await s.stop();

      const s2 = await startTestServer({ dir, clock });
      try {
        const after = await s2.api('POST', '/api/orders', { token: alice.apiKey, body, headers: { 'Idempotency-Key': 'retry-abc' } });
        assert.equal(after.status, 200);
        assert.equal(after.body.order.id, first.body.order.id);
        assert.equal(s2.booted.venue.engine.state.orders.size, 2);
      } finally {
        await s2.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('admin pause-trading is a journaled command: orders refused while paused, cancels allowed, state survives restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kq-pause-'));
    const clock = new FakeClock();
    try {
      const s = await startTestServer({ dir, clock });
      seedExecutors(s);
      const cust = await s.signup('Pause customer', 'customer');
      const alice = await s.signup('Pause Alice', 'trader');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const m = `${created.body.task.id}:codex`;
      const resting = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'yes', price: 40, quantity: 5 } });
      assert.equal((await s.api('POST', '/api/admin/trading', { body: { paused: true } })).status, 401);
      const paused = await s.api('POST', '/api/admin/trading', { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { paused: true, reason: 'maintenance' } });
      assert.equal(paused.status, 200);
      assert.equal(paused.body.trading.paused, true);
      const refused = await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'no', price: 40, quantity: 5 } });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, 'trading_paused');
      assert.equal((await s.api('DELETE', `/api/orders/${resting.body.order.id}`, { token: alice.apiKey })).status, 200);
      assert.equal((await s.api('GET', '/api/health')).body.trading.paused, true);
      await s.stop();

      const s2 = await startTestServer({ dir, clock });
      try {
        assert.equal(s2.booted.venue.engine.state.trading.paused, true, 'pause is journaled');
        const resumed = await s2.api('POST', '/api/admin/trading', { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { paused: false } });
        assert.equal(resumed.body.trading.paused, false);
        assert.equal((await s2.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: m, side: 'no', price: 40, quantity: 5 } })).status, 201);
      } finally {
        await s2.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bodies over the limit get 413; runner results allow large logs; errors carry no stack trace', async () => {
    const s = await startTestServer({ env: { RUNNER: 'external' } });
    try {
      const alice = await s.signup('Big Alice', 'trader');
      const big = await s.api('POST', '/api/orders', { token: alice.apiKey, raw: JSON.stringify({ marketId: 'x'.repeat(70_000), side: 'yes', price: 1, quantity: 1 }) });
      assert.equal(big.status, 413);
      assert.equal(big.body.code, 'too_large');
      const log = 'y'.repeat(1_000_000);
      const r = await s.signedResult({ taskId: 'tsk_none', passed: true, log });
      assert.equal(r.status, 404, 'parsed fine, then rejected for the missing task');
      assert.equal(JSON.stringify(r.body).includes('    at '), false);
    } finally {
      await s.stop();
    }
  });
});
