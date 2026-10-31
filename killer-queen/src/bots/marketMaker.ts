/**
 * House market maker (product spec): starts from its own estimate of the
 * chance, moves 40% of the way toward each new trade price, quotes 4¢ either
 * side of that value, 30 contracts per side, shifts quotes 1¢ for every 60
 * contracts of inventory, and stops adding to a side at 1,200 contracts.
 */
import { clampPrice, type AgentMarket } from '../engine/index.js';
import type { ExchangeClient } from './client.js';

export interface MarketMakerOptions {
  halfSpread: number;
  size: number;
  skewPerContracts: number;
  inventoryCap: number;
  drift: number;
  log?: (msg: string) => void;
}

export const DEFAULT_MM_OPTIONS: MarketMakerOptions = { halfSpread: 4, size: 30, skewPerContracts: 60, inventoryCap: 1200, drift: 0.4 };

interface MarketMemory {
  fair: number;
  lastFillId: string | null;
}

export class MarketMaker {
  readonly name = 'mm';
  private readonly memory = new Map<string, MarketMemory>();
  private readonly opts: MarketMakerOptions;

  constructor(
    private readonly client: ExchangeClient,
    opts: Partial<MarketMakerOptions> = {},
  ) {
    this.opts = { ...DEFAULT_MM_OPTIONS, ...opts };
  }

  /** Current fair value estimate for a market, in cents (fractional). */
  fairValue(marketId: string): number | undefined {
    return this.memory.get(marketId)?.fair;
  }

  /** Initial estimate: the executor's historical pass rate, else 50 (v0). */
  static initialFair(m: AgentMarket): number {
    const { chosen, passed } = m.packet.executor;
    return chosen > 0 ? Math.round((100 * passed) / chosen) : 50;
  }

  async tick(): Promise<void> {
    const markets = await this.client.openMarkets();
    const seen = new Set<string>();
    for (const m of markets) {
      seen.add(m.packet.marketId);
      if (!m.canTrade) continue;
      await this.quote(m);
    }
    for (const id of [...this.memory.keys()]) if (!seen.has(id)) this.memory.delete(id);
  }

  private async quote(m: AgentMarket): Promise<void> {
    const id = m.packet.marketId;
    let mem = this.memory.get(id);
    if (!mem) {
      mem = { fair: MarketMaker.initialFair(m), lastFillId: null };
      this.memory.set(id, mem);
    }
    // Move 40% toward every trade since the last tick, in order.
    const trades = await this.client.trades(id);
    let start = 0;
    if (mem.lastFillId) {
      const idx = trades.findIndex((f) => f.id === mem!.lastFillId);
      start = idx >= 0 ? idx + 1 : 0;
    }
    for (let i = start; i < trades.length; i++) {
      mem.fair += this.opts.drift * (trades[i]!.yesPrice - mem.fair);
    }
    if (trades.length) mem.lastFillId = trades[trades.length - 1]!.id;

    const inventory = (m.position?.yes ?? 0) - (m.position?.no ?? 0); // net Yes
    const skew = Math.trunc(inventory / this.opts.skewPerContracts);
    const center = Math.round(mem.fair) - skew;
    const yesBid = clampPrice(center - this.opts.halfSpread);
    const noBid = clampPrice(100 - (center + this.opts.halfSpread)); // Yes ask seen from the No side
    const wantYes = inventory < this.opts.inventoryCap;
    const wantNo = -inventory < this.opts.inventoryCap;

    await this.ensureQuote(m, 'yes', wantYes ? yesBid : null);
    await this.ensureQuote(m, 'no', wantNo ? noBid : null);
  }

  /** Keep exactly one resting order on `side` at `price` (or none), cancelling anything else. */
  private async ensureQuote(m: AgentMarket, side: 'yes' | 'no', price: number | null): Promise<void> {
    const mine = m.openOrders.filter((o) => o.side === side);
    let keep = false;
    for (const o of mine) {
      const remaining = o.quantity - o.filled;
      if (price !== null && o.price === price && remaining >= Math.ceil(this.opts.size / 2) && !keep) {
        keep = true;
        continue;
      }
      const r = await this.client.cancelOrder(o.id);
      if (!r.ok && r.code !== 'order_not_open') this.opts.log?.(`mm cancel ${o.id}: ${r.code}`);
    }
    if (price === null || keep) return;
    const r = await this.client.placeOrder({ marketId: m.packet.marketId, side, price, quantity: this.opts.size, tif: 'gtc' });
    if (!r.ok) this.opts.log?.(`mm quote ${m.packet.marketId} ${side}@${price}: ${r.code} ${r.error}`);
  }
}
