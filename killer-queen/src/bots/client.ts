/**
 * What a house bot needs from the exchange. Two implementations: in-process
 * (calls the Venue directly, as the product spec says house bots do) and
 * HTTP (the same calls through the public API with an API key), so one bot
 * can run either way.
 */
import { agentMarkets, portfolio, type AgentMarket, type Fill, type Order, type Venue } from '../engine/index.js';

export interface OrderRequest {
  marketId: string;
  side: 'yes' | 'no';
  action?: 'buy' | 'sell';
  type?: 'limit' | 'market';
  price?: number;
  quantity: number;
  tif?: 'gtc' | 'ioc';
}

export type ClientResult<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

export interface ExchangeClient {
  readonly accountId: string;
  openMarkets(): Promise<AgentMarket[]>;
  trades(marketId: string): Promise<Fill[]>;
  cash(): Promise<number>;
  placeOrder(req: OrderRequest): Promise<ClientResult<{ order: Order; fills: Fill[] }>>;
  cancelOrder(orderId: string): Promise<ClientResult<{ order: Order }>>;
  comment(marketId: string, text: string, probability: number | null): Promise<ClientResult<unknown>>;
}

export class InProcessClient implements ExchangeClient {
  constructor(
    private readonly venue: Venue,
    readonly accountId: string,
  ) {}

  async openMarkets(): Promise<AgentMarket[]> {
    return agentMarkets(this.venue.engine, this.accountId);
  }

  async trades(marketId: string): Promise<Fill[]> {
    return this.venue.engine.state.fills.filter((f) => f.market === marketId);
  }

  async cash(): Promise<number> {
    return portfolio(this.venue.engine, this.accountId).cash;
  }

  async placeOrder(req: OrderRequest): Promise<ClientResult<{ order: Order; fills: Fill[] }>> {
    const r = this.venue.apply({
      type: 'placeOrder',
      account: this.accountId,
      market: req.marketId,
      side: req.side,
      action: req.action ?? 'buy',
      orderType: req.type ?? 'limit',
      price: req.price,
      quantity: req.quantity,
      tif: req.tif,
    });
    return r.ok ? { ok: true, data: r.data } : r;
  }

  async cancelOrder(orderId: string): Promise<ClientResult<{ order: Order }>> {
    const r = this.venue.apply({ type: 'cancelOrder', account: this.accountId, orderId });
    return r.ok ? { ok: true, data: { order: r.data.order } } : r;
  }

  async comment(marketId: string, text: string, probability: number | null): Promise<ClientResult<unknown>> {
    const r = this.venue.apply({ type: 'comment', account: this.accountId, market: marketId, text, probability });
    return r.ok ? { ok: true, data: r.data } : r;
  }
}

export class HttpClient implements ExchangeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly accountId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Resolve the account id for a key, then build the client. */
  static async connect(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<HttpClient> {
    const res = await fetchImpl(`${baseUrl}/api/me`, { headers: { authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`cannot connect as that key: ${res.status}`);
    const body = (await res.json()) as { account: { id: string } };
    return new HttpClient(baseUrl, apiKey, body.account.id, fetchImpl);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<ClientResult<T>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as T & { error?: string; code?: string };
    if (!res.ok) return { ok: false, code: json.code ?? `http_${res.status}`, error: json.error ?? res.statusText };
    return { ok: true, data: json };
  }

  async openMarkets(): Promise<AgentMarket[]> {
    const r = await this.call<{ markets: AgentMarket[] }>('GET', '/api/agent/markets');
    if (!r.ok) throw new Error(`agent markets: ${r.error}`);
    return r.data.markets;
  }

  async trades(marketId: string): Promise<Fill[]> {
    const r = await this.call<{ trades: Fill[] }>('GET', `/api/markets/${encodeURIComponent(marketId)}`);
    if (!r.ok) throw new Error(`market ${marketId}: ${r.error}`);
    return [...r.data.trades].reverse(); // API returns newest first
  }

  async cash(): Promise<number> {
    const r = await this.call<{ cash: number }>('GET', '/api/portfolio');
    if (!r.ok) throw new Error(`portfolio: ${r.error}`);
    return r.data.cash;
  }

  placeOrder(req: OrderRequest): Promise<ClientResult<{ order: Order; fills: Fill[] }>> {
    return this.call('POST', '/api/orders', {
      marketId: req.marketId,
      side: req.side,
      action: req.action ?? 'buy',
      type: req.type ?? 'limit',
      ...(req.price !== undefined ? { price: req.price } : {}),
      quantity: req.quantity,
      ...(req.tif !== undefined ? { tif: req.tif } : {}),
    });
  }

  cancelOrder(orderId: string): Promise<ClientResult<{ order: Order }>> {
    return this.call('DELETE', `/api/orders/${encodeURIComponent(orderId)}`);
  }

  comment(marketId: string, text: string, probability: number | null): Promise<ClientResult<unknown>> {
    return this.call('POST', `/api/markets/${encodeURIComponent(marketId)}/comments`, { text, probability });
  }
}
