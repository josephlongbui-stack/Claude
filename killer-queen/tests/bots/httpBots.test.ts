import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentTrader, HeuristicEstimator, HttpClient, MarketMaker } from '../../src/bots/index.js';
import { houseBotFactories } from '../../src/bots/index.js';
import { assertInvariants } from '../helpers/invariants.js';
import { TASK, seedExecutors, startTestServer } from '../helpers/server.js';

describe('bots over HTTP', () => {
  it('a market maker and agent traders trade through the public API without breaking the books', async () => {
    const s = await startTestServer({ env: { HOUSE_BOTS: '' } });
    try {
      seedExecutors(s);
      const cust = await s.signup('HTTP customer', 'customer');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code'] } });
      const taskId = created.body.task.id;
      // an outside market maker needs the market_maker role; only the house has that, so this one is a plain trader bot
      const mmAcct = await s.signup('Outside MM', 'trader', 'agent', 'Quant Shop');
      const mm = new MarketMaker(await HttpClient.connect(s.url, mmAcct.apiKey), { size: 20 });
      const traders: AgentTrader[] = [];
      for (let i = 0; i < 3; i++) {
        const a = await s.signup(`HTTP trader ${i}`, 'trader', 'agent', 'Indie');
        traders.push(new AgentTrader(`http-${i}`, await HttpClient.connect(s.url, a.apiKey), new HeuristicEstimator(`http-${i}`)));
      }
      for (let round = 0; round < 4; round++) {
        await mm.tick();
        for (const t of traders) await t.tick();
        assertInvariants(s.booted.venue.engine, `round ${round}`);
      }
      const codex = (await s.api('GET', `/api/markets/${taskId}:codex`)).body;
      assert.ok(codex.quote.yesBid !== null && codex.quote.yesAsk !== null, 'book is two-sided');
      assert.ok(codex.theses.length >= 3, 'traders posted theses over HTTP');
      assert.ok(s.booted.venue.engine.state.orders.size > 5);
      const lb = (await s.api('GET', '/api/leaderboard')).body.leaderboard;
      assert.ok(lb.length >= 4);
    } finally {
      await s.stop();
    }
  });

  it('boot wires mm and sim bots in-process; a fresh task is two-sided after one tick', async () => {
    const s = await startTestServer({ env: { HOUSE_BOTS: 'mm,sim', SIM_TRADERS: '2' }, bots: houseBotFactories() });
    try {
      seedExecutors(s);
      assert.deepEqual(s.booted.bots.map((b) => b.name), ['mm', 'sim']);
      assert.ok(s.booted.venue.engine.account('sim-1') && s.booted.venue.engine.account('sim-2'));
      assert.equal(s.booted.venue.engine.account('sim-1')!.org, 'Killer Queen Sim');
      const cust = await s.signup('Boot customer', 'customer');
      const created = await s.api('POST', '/api/tasks', { token: cust.apiKey, body: { ...TASK, candidateAgents: ['codex', 'claude-code', 'gemini-cli'] } });
      const taskId = created.body.task.id;
      await s.booted.tick();
      for (const exec of ['codex', 'claude-code', 'gemini-cli']) {
        const m = (await s.api('GET', `/api/markets/${taskId}:${exec}`)).body;
        assert.ok(m.quote.yesBid !== null && m.quote.yesAsk !== null, `${exec} two-sided`);
        assert.ok(m.theses.length >= 2, `${exec} has theses`);
      }
      await s.booted.tick();
      assertInvariants(s.booted.venue.engine, 'after boot ticks');
    } finally {
      await s.stop();
    }
  });
});
