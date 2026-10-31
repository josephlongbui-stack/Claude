/**
 * House bots wired for boot: market maker (mm), heuristic agent traders
 * (sim) and LLM traders (llm), chosen by HOUSE_BOTS. All run in-process
 * through the Venue (product spec); the same classes work over HTTP with
 * HttpClient.
 */
import type { Venue } from '../engine/index.js';
import type { BotFactory, BotHandle } from '../server/boot.js';
import type { Config } from '../server/config.js';
import { InProcessClient } from './client.js';
import { LAB_ORGS, LlmEstimator, adapterFor, type Lab } from './llm/adapters.js';
import { MarketMaker } from './marketMaker.js';
import { AgentTrader, HeuristicEstimator } from './simTrader.js';
import { MM_ACCOUNT_ID } from '../server/boot.js';

export { HttpClient, InProcessClient } from './client.js';
export { MarketMaker } from './marketMaker.js';
export { AgentTrader, HeuristicEstimator } from './simTrader.js';
export * from './llm/adapters.js';

function ensureTraderAccount(venue: Venue, id: string, name: string, org: string, cash: number): void {
  if (venue.engine.account(id)) return;
  const r = venue.apply({ type: 'createAccount', id, name, kind: 'agent', role: 'trader', org, keyHash: null, startingCash: cash });
  if (!r.ok) throw new Error(`cannot create ${id}: ${r.error}`);
}

/** Sequential bundle: several bots that tick one after another under one name. */
function bundle(name: string, bots: { tick(): Promise<void> }[]): BotHandle {
  return {
    name,
    async tick() {
      for (const b of bots) await b.tick();
    },
  };
}

export const marketMakerFactory: BotFactory = ({ venue, config, log }) => {
  if (!config.houseBots.has('mm')) return null;
  const mm = new MarketMaker(new InProcessClient(venue, MM_ACCOUNT_ID), { log });
  return { name: 'mm', tick: () => mm.tick() };
};

export const simTraderFactory: BotFactory = ({ venue, config, log }) => {
  if (!config.houseBots.has('sim') || config.simTraders === 0) return null;
  const traders: AgentTrader[] = [];
  for (let i = 1; i <= config.simTraders; i++) {
    const id = `sim-${i}`;
    ensureTraderAccount(venue, id, `House trader ${i}`, 'Killer Queen Sim', config.startingCashCents);
    traders.push(new AgentTrader(id, new InProcessClient(venue, id), new HeuristicEstimator(id), { log }));
  }
  return bundle('sim', traders);
};

export const llmTraderFactory: BotFactory = ({ venue, config, log }) => {
  if (!config.houseBots.has('llm')) return null;
  const traders: AgentTrader[] = [];
  for (const lab of ['anthropic', 'openai', 'gemini'] as Lab[]) {
    const cfg = config.llm[lab];
    if (!cfg) continue;
    if (!cfg.model) {
      log(`llm trader ${lab}: key set but ${lab.toUpperCase()}_MODEL is not; trader off`);
      continue;
    }
    const id = `llm-${lab}`;
    ensureTraderAccount(venue, id, `${LAB_ORGS[lab]} model trader`, LAB_ORGS[lab], config.startingCashCents);
    const estimator = new LlmEstimator(adapterFor(lab, cfg.apiKey, cfg.model), { log });
    traders.push(new AgentTrader(id, new InProcessClient(venue, id), estimator, { log }));
  }
  if (traders.length === 0) return null;
  return bundle('llm', traders);
};

export function houseBotFactories(): BotFactory[] {
  return [marketMakerFactory, simTraderFactory, llmTraderFactory];
}

export function enabledBots(config: Config): string[] {
  const out: string[] = [];
  if (config.houseBots.has('mm')) out.push('mm');
  if (config.houseBots.has('sim') && config.simTraders > 0) out.push('sim');
  if (config.houseBots.has('llm')) for (const lab of ['anthropic', 'openai', 'gemini'] as Lab[]) if (config.llm[lab]?.model) out.push(`llm:${lab}`);
  return out;
}
