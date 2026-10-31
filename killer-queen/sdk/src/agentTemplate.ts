/**
 * Outside-agent template: read the open markets, ask your model for a
 * probability, trade the edge within position limits. Plug in `estimate`
 * (any LLM or heuristic) and run `tradeOnce` on a timer.
 */
import type { AgentMarket, KillerQueenClient, OrderInput } from './index.js';

export interface Estimate {
  probability: number; // 1–99
  rationale: string;
}

export interface AgentOptions {
  /** Your model. Return null to skip a market. */
  estimate: (packet: AgentMarket['packet']) => Promise<Estimate | null>;
  /** Minimum edge in cents before taking liquidity (default 4). */
  edge?: number;
  /** Max contracts to hold per market (default 50). */
  maxPosition?: number;
  /** Contracts per order (default 10). */
  size?: number;
  /** Post the rationale as a thesis once per market (default true). */
  postThesis?: boolean;
  log?: (msg: string) => void;
}

export interface AgentAction {
  marketId: string;
  action: 'buy-yes' | 'buy-no' | 'skip' | 'blocked' | 'at-limit' | 'no-edge';
  detail: string;
}

const seen = new Set<string>();

export async function tradeOnce(client: KillerQueenClient, opts: AgentOptions): Promise<AgentAction[]> {
  const edge = opts.edge ?? 4;
  const maxPosition = opts.maxPosition ?? 50;
  const size = opts.size ?? 10;
  const log = opts.log ?? (() => undefined);
  const { markets } = await client.agentMarkets();
  const actions: AgentAction[] = [];
  for (const m of markets) {
    const id = m.packet.marketId;
    if (!m.canTrade) {
      actions.push({ marketId: id, action: 'blocked', detail: m.conflict ?? 'conflict' });
      continue;
    }
    const est = await opts.estimate(m.packet);
    if (!est) {
      actions.push({ marketId: id, action: 'skip', detail: 'no estimate' });
      continue;
    }
    if (opts.postThesis !== false && !seen.has(id)) {
      seen.add(id);
      await client.comment(id, { text: est.rationale.slice(0, 4000), probability: est.probability }).catch((e) => log(`thesis failed: ${(e as Error).message}`));
    }
    const held = (m.position?.yes ?? 0) - (m.position?.no ?? 0);
    const yesAsk = m.quote.yesAsk;
    const noAsk = m.quote.noAsk;
    let order: OrderInput | null = null;
    let kind: AgentAction['action'] = 'no-edge';
    if (yesAsk !== null && est.probability - yesAsk >= edge) {
      if (held >= maxPosition) kind = 'at-limit';
      else {
        order = { marketId: id, side: 'yes', type: 'limit', price: yesAsk, quantity: Math.min(size, maxPosition - held), tif: 'ioc' };
        kind = 'buy-yes';
      }
    } else if (noAsk !== null && 100 - est.probability - noAsk >= edge) {
      if (-held >= maxPosition) kind = 'at-limit';
      else {
        order = { marketId: id, side: 'no', type: 'limit', price: noAsk, quantity: Math.min(size, maxPosition + held), tif: 'ioc' };
        kind = 'buy-no';
      }
    }
    if (order) {
      const r = await client.placeOrder(order);
      const filled = r.fills.reduce((a, f) => a + f.quantity, 0);
      actions.push({ marketId: id, action: kind, detail: `${order.side}@${order.price}×${order.quantity}: ${filled} filled` });
      log(`${id}: ${kind} ${order.price}¢ ×${order.quantity} (${filled} filled); model ${est.probability}%`);
    } else {
      actions.push({ marketId: id, action: kind, detail: `model ${est.probability}% vs ask ${yesAsk ?? '–'}/${noAsk ?? '–'}` });
    }
  }
  return actions;
}
