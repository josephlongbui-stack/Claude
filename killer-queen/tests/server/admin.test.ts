import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('admin: alerts queue, review, provisioning', () => {
  it('alerts need the admin key and show evidence; review flags and clears; provisioning ties a key to a person', async () => {
    const s = await startTestServer();
    try {
      seedExecutors(s);
      assert.equal((await s.api('GET', '/api/admin/alerts')).status, 401);
      const H = { 'x-admin-key': 'admin-key-for-tests' };
      const cust = await s.signup('Admin customer', 'customer');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex'] } });
      const m = `${created.body.task.id}:codex`;
      const a = await s.api('POST', '/api/accounts', { body: { name: 'Twin A', kind: 'human', role: 'trader', email: 'Twins@example.com' } });
      const b = await s.api('POST', '/api/accounts', { body: { name: 'Twin B', kind: 'human', role: 'trader', email: 'twins@example.com' } });
      assert.equal('emailHash' in a.body.account, false, 'hashes never returned');
      await s.api('POST', '/api/orders', { token: a.body.apiKey, body: { marketId: m, side: 'no', price: 50, quantity: 4 } });
      await s.api('POST', '/api/orders', { token: b.body.apiKey, body: { marketId: m, side: 'yes', price: 50, quantity: 4 } });
      const alerts = await s.api('GET', '/api/admin/alerts', { headers: H });
      assert.equal(alerts.status, 200);
      const wash = alerts.body.alerts.find((x: any) => x.kind === 'wash_trade');
      assert.ok(wash, JSON.stringify(alerts.body));
      assert.equal(wash.evidence.link, 'same email');
      assert.deepEqual(wash.accounts.sort(), [a.body.account.id, b.body.account.id].sort());

      const flagged = await s.api('POST', `/api/admin/accounts/${a.body.account.id}/review`, { headers: H, body: { flagged: true, reason: wash.id } });
      assert.equal(flagged.body.account.flagged, true);
      assert.equal((await s.api('GET', '/api/leaderboard')).body.leaderboard.some((r: any) => r.id === a.body.account.id), false);
      assert.equal((await s.api('POST', '/api/wallet/faucet', { token: a.body.apiKey })).status, 409);
      const cleared = await s.api('POST', `/api/admin/accounts/${a.body.account.id}/review`, { headers: H, body: { flagged: false } });
      assert.equal(cleared.body.account.flagged, false);
      assert.equal((await s.api('POST', `/api/admin/accounts/${a.body.account.id}/review`, { headers: H, body: {} })).status, 400);

      // per-email cap over HTTP: 3 accounts per email
      const c = await s.api('POST', '/api/accounts', { body: { name: 'Twin C', kind: 'human', role: 'trader', email: 'twins@example.com' } });
      assert.equal(c.status, 201);
      const d = await s.api('POST', '/api/accounts', { body: { name: 'Twin D', kind: 'human', role: 'trader', email: 'twins@example.com' } });
      assert.equal(d.status, 409);
      assert.equal(d.body.code, 'too_many_accounts');
      // device cap: 5 per device id header
      for (let i = 0; i < 5; i++) assert.equal((await s.api('POST', '/api/accounts', { headers: { 'x-device-id': 'phone-1' }, body: { name: `Dev ${i}`, kind: 'human', role: 'trader' } })).status, 201);
      assert.equal((await s.api('POST', '/api/accounts', { headers: { 'x-device-id': 'phone-1' }, body: { name: 'Dev 6', kind: 'human', role: 'trader' } })).status, 409);

      // provisioning: agent key tied to a verified person; faucet shared across that person
      const p1 = await s.api('POST', '/api/admin/accounts', { headers: H, body: { name: 'Verified bot', kind: 'agent', role: 'trader', personId: 'person-42', vetted: true } });
      assert.equal(p1.status, 201);
      assert.equal(p1.body.account.personId, 'person-42');
      const p2 = await s.api('POST', '/api/admin/accounts', { headers: H, body: { name: 'Verified human', kind: 'human', role: 'trader', personId: 'person-42' } });
      assert.equal((await s.api('POST', '/api/wallet/faucet', { token: p1.body.apiKey })).status, 200);
      assert.equal((await s.api('POST', '/api/wallet/faucet', { token: p2.body.apiKey })).status, 409);
      assert.equal((await s.api('POST', '/api/admin/accounts', { body: { name: 'x', kind: 'agent', role: 'trader', personId: 'p' } })).status, 401);
    } finally {
      await s.stop();
    }
  });

  it('live mode: accounts only through admin provisioning with a person', async () => {
    const s = await startTestServer({ env: { KQ_MODE: 'live', RUNNER: 'external' } });
    try {
      assert.equal((await s.api('POST', '/api/accounts', { body: { name: 'x', kind: 'agent', role: 'trader' } })).status, 403);
      const r = await s.api('POST', '/api/admin/accounts', { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { name: 'Bot', kind: 'agent', role: 'trader', personId: 'kyc-1' } });
      assert.equal(r.status, 201);
      assert.equal(r.body.account.cash, 0, 'no play money in live mode');
      assert.equal((await s.api('POST', '/api/admin/accounts', { headers: { 'x-admin-key': 'admin-key-for-tests' }, body: { name: 'Bot2', kind: 'agent', role: 'trader' } })).status, 400, 'personId required');
    } finally {
      await s.stop();
    }
  });
});
