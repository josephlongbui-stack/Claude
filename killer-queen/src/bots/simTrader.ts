/**
 * House agent trader (product spec): reads the packet once, posts its
 * probability and reasoning as a thesis, then buys when its fair value beats
 * the best quote by 4¢ or more (sized at 2.5% of cash scaled by the edge),
 * otherwise rests bids 3¢ either side of its fair value, and trades at most
 * 3 times per market. Fair value comes from an Estimator: a deterministic
 * heuristic here, an LLM in src/bots/llm.
 */
import { clampPrice, sha256, type AgentMarket, type Packet } from '../engine/index.js';
import type { ExchangeClient } from './client.js';

export interface Estimate {
  probability: number; // 1–99
  rationale: string;
}

export interface Estimator {
  estimate(packet: Packet): Promise<Estimate | null>;
}

export interface TraderOptions {
  edge: number; // cents
  sizeFraction: number; // of cash, at edge cents
  restOffset: number; // cents either side of fair
  maxActions: number; // per market
  restFraction: number; // of cash per resting side
  log?: (msg: string) => void;
}

export const DEFAULT_TRADER_OPTIONS: TraderOptions = { edge: 4, sizeFraction: 0.025, restOffset: 3, maxActions: 3, restFraction: 0.01 };

interface MarketMemory {
  estimate: Estimate | null;
  commented: boolean;
  actions: number;
  skipped: boolean;
}

/** Position size in contracts: 2.5% of cash at a 4¢ edge, scaled linearly by the edge, capped at 4× (D-bots). */
export function sizeFor(cash: number, edge: number, price: number, opts: TraderOptions = DEFAULT_TRADER_OPTIONS): number {
  const multiplier = Math.min(4, edge / opts.edge);
  const budget = Math.floor(cash * opts.sizeFraction * multiplier);
  return Math.max(0, Math.floor(budget / (price + 1)));
}

export class AgentTrader {
  private readonly memory = new Map<string, MarketMemory>();
  private readonly opts: TraderOptions;

  constructor(
    readonly name: string,
    private readonly client: ExchangeClient,
    private readonly estimator: Estimator,
    opts: Partial<TraderOptions> = {},
  ) {
    this.opts = { ...DEFAULT_TRADER_OPTIONS, ...opts };
  }

  actionsOn(marketId: string): number {
    return this.memory.get(marketId)?.actions ?? 0;
  }

  async tick(): Promise<void> {
    const markets = await this.client.openMarkets();
    const live = new Set<string>();
    for (const m of markets) {
      live.add(m.packet.marketId);
      if (!m.canTrade) continue;
      await this.act(m);
    }
    for (const id of [...this.memory.keys()]) if (!live.has(id)) this.memory.delete(id);
  }

  private async act(m: AgentMarket): Promise<void> {
    const id = m.packet.marketId;
    let mem = this.memory.get(id);
    if (!mem) {
      mem = { estimate: null, commented: false, actions: 0, skipped: false };
      this.memory.set(id, mem);
      try {
        mem.estimate = await this.estimator.estimate(m.packet); // the packet is read once
      } catch (e) {
        this.opts.log?.(`${this.name}: estimate failed on ${id}: ${(e as Error).message}`);
        mem.estimate = null;
      }
      if (!mem.estimate) mem.skipped = true;
    }
    if (mem.skipped || !mem.estimate) return;
    if (!mem.commented) {
      mem.commented = true;
      const r = await this.client.comment(id, mem.estimate.rationale, mem.estimate.probability);
      if (!r.ok) this.opts.log?.(`${this.name}: comment on ${id}: ${r.code}`);
    }
    if (mem.actions >= this.opts.maxActions) return;
    const fair = mem.estimate.probability;
    const cash = await this.client.cash();
    const yesAsk = m.quote.yesAsk;
    const noAsk = m.quote.noAsk;
    const yesEdge = yesAsk === null ? 0 : fair - yesAsk;
    const noEdge = noAsk === null ? 0 : 100 - fair - noAsk;
    if (yesAsk !== null && yesEdge >= this.opts.edge && yesEdge >= noEdge) {
      const qty = sizeFor(cash, yesEdge, yesAsk, this.opts);
      if (qty > 0) {
        mem.actions += 1;
        await this.order(id, 'yes', yesAsk, qty, 'ioc');
      }
      return;
    }
    if (noAsk !== null && noEdge >= this.opts.edge) {
      const qty = sizeFor(cash, noEdge, noAsk, this.opts);
      if (qty > 0) {
        mem.actions += 1;
        await this.order(id, 'no', noAsk, qty, 'ioc');
      }
      return;
    }
    if (m.openOrders.length > 0) return; // already resting
    const yesBid = clampPrice(fair - this.opts.restOffset);
    const noBid = clampPrice(100 - fair - this.opts.restOffset);
    const budget = Math.floor(cash * this.opts.restFraction);
    const yesQty = Math.floor(budget / (yesBid + 1));
    const noQty = Math.floor(budget / (noBid + 1));
    if (yesQty < 1 && noQty < 1) return;
    mem.actions += 1;
    if (yesQty >= 1) await this.order(id, 'yes', yesBid, yesQty, 'gtc');
    if (noQty >= 1) await this.order(id, 'no', noBid, noQty, 'gtc');
  }

  private async order(marketId: string, side: 'yes' | 'no', price: number, quantity: number, tif: 'gtc' | 'ioc'): Promise<void> {
    const r = await this.client.placeOrder({ marketId, side, price, quantity, tif });
    if (!r.ok) this.opts.log?.(`${this.name}: order ${side}@${price}×${quantity} on ${marketId}: ${r.code} ${r.error}`);
  }
}

/** Cheap, deterministic fair value from packet signals. Different seeds give different traders. */
export class HeuristicEstimator implements Estimator {
  constructor(private readonly seed: string) {}

  async estimate(packet: Packet): Promise<Estimate> {
    const reasons: string[] = [];
    let p: number;
    const { chosen, passed } = packet.executor;
    if (chosen >= 3) {
      p = Math.round((100 * passed) / chosen);
      reasons.push(`${packet.executor.name} passed ${passed} of ${chosen} runs`);
    } else {
      p = 55;
      reasons.push(`${packet.executor.name} has little track record, start near even`);
    }
    const promptLen = packet.prompt.length;
    if (promptLen > 1500) {
      p -= 15;
      reasons.push('long prompt reads like a multi-step change');
    } else if (promptLen < 200) {
      p += 5;
      reasons.push('short, specific prompt');
    }
    const tc = packet.testCommand;
    if (/\b(pytest|jest|vitest|go test|cargo test|npm test|node --test)\b/.test(tc)) {
      p += 3;
      reasons.push('standard test runner');
    }
    if (/\S+\.(py|ts|js|go|rs)\b/.test(tc) || /::|-k |--grep|-t /.test(tc)) {
      p += 5;
      reasons.push('tests are narrowed to specific files');
    }
    if (/\b(flaky|intermittent|race|timing)\b/i.test(packet.prompt)) {
      p -= 10;
      reasons.push('mentions flakiness or timing');
    }
    const jitter = (parseInt(sha256(`${this.seed}:${packet.marketId}`).slice(0, 4), 16) % 11) - 5;
    p += jitter;
    p = clampPrice(p);
    return { probability: p, rationale: `${reasons.join('; ')}. I put it at ${p}%.` };
  }
}
