import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { FakeClock, stateHash } from '../../src/engine/index.js';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('restart and scheduler', () => {
  it('state survives a server restart: positions, books and portfolios match', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kq-restart-'));
    const clock = new FakeClock();
    try {
      const s1 = await startTestServer({ dir, clock });
      seedExecutors(s1);
      const cust = await s1.signup('Restart customer', 'customer');
      const alice = await s1.signup('Alice', 'trader');
      const bob = await s1.signup('Bob', 'trader');
      const created = await s1.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
      const taskId = created.body.task.id;
      const codex = `${taskId}:codex`;
      await s1.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 45, quantity: 10 } });
      await s1.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: codex, side: 'yes', price: 55, quantity: 6 } });
      await s1.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: codex, side: 'yes', price: 50, quantity: 3 } });
      const before = {
        hash: stateHash(s1.booted.venue.engine.state),
        portfolio: (await s1.api('GET', '/api/portfolio', { token: alice.apiKey })).body,
        market: (await s1.api('GET', `/api/markets/${codex}`)).body,
      };
      await s1.stop();

      const s2 = await startTestServer({ dir, clock });
      try {
        assert.equal(stateHash(s2.booted.venue.engine.state), before.hash);
        assert.deepEqual((await s2.api('GET', '/api/portfolio', { token: alice.apiKey })).body, before.portfolio);
        assert.deepEqual((await s2.api('GET', `/api/markets/${codex}`)).body, before.market);
        // and the venue keeps working after the restart
        const r = await s2.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: codex, side: 'no', price: 50, quantity: 3 } });
        assert.equal(r.status, 201);
        assert.equal(r.body.fills.length, 1);
      } finally {
        await s2.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auto-close fires when the window ends; auto-decide picks the highest chance or skips below the minimum', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      const cust = await s.signup('Auto customer', 'customer');
      const alice = await s.signup('Alice', 'trader');
      const bob = await s.signup('Bob', 'trader');
      const mk = async (minimumChance: number) => {
        const r = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'], tradingWindowMs: 60_000, autoDecide: true, minimumChance } });
        return r.body.task.id as string;
      };
      const runT = await mk(60);
      const skipT = await mk(90);
      for (const t of [runT, skipT]) {
        await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${t}:claude-code`, side: 'yes', price: 70, quantity: 5 } });
        await s.api('POST', '/api/orders', { token: bob.apiKey, body: { marketId: `${t}:claude-code`, side: 'no', price: 26, quantity: 5 } }); // mid 72
        await s.api('POST', '/api/orders', { token: alice.apiKey, body: { marketId: `${t}:codex`, side: 'yes', price: 40, quantity: 5 } });
      }
      assert.deepEqual(await s.booted.tick(), { closed: [], decided: [] });
      s.clock.advance(59_999);
      assert.deepEqual(await s.booted.tick(), { closed: [], decided: [] });
      s.clock.advance(1);
      const t = await s.booted.tick();
      assert.deepEqual(t.closed.sort(), [runT, skipT].sort());
      assert.deepEqual(t.decided.sort(), [runT, skipT].sort());
      const run = (await s.api('GET', `/api/tasks/${runT}`)).body;
      assert.equal(run.task.status, 'running');
      assert.equal(run.task.chosenAgent, 'claude-code');
      const skip = (await s.api('GET', `/api/tasks/${skipT}`)).body;
      assert.equal(skip.task.status, 'skipped');
      // the simulated runner picked up the running task
      assert.deepEqual(s.booted.runner!.queued, [`run:${runT}`]);
      s.booted.runner!.flush();
      assert.equal((await s.api('GET', `/api/tasks/${runT}`)).body.task.status, 'resolved');
    } finally {
      await s.stop();
    }
  });
});
