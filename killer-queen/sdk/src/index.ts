/**
 * Killer Queen SDK: one method per route, request types taken from the
 * server's zod schemas (src/server/schemas.ts) and response types from the
 * engine's views, so the client cannot drift from the server. Retries reuse
 * the same Idempotency-Key, so a retried order never places twice.
 */
import { randomBytes } from 'node:crypto';
import type { AgentMarket, LeaderboardRow, MarketView, Portfolio, PublicAccount, Stats, TaskView, ExecutorRecord, Fill, Order } from '../../src/engine/index.js';
import type { AccountInput, CommentInput, DecideInput, OrderInput, TaskInput } from '../../src/server/schemas.js';

export type { AccountInput, CommentInput, DecideInput, OrderInput, TaskInput };
export type { AgentMarket, LeaderboardRow, MarketView, Portfolio, PublicAccount, Stats, TaskView, ExecutorRecord, Fill, Order };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Retries on network errors, 429 and 5xx (default 3) with exponential backoff from `backoffMs` (default 250). */
  retries?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PlaceOrderResult {
  order: Order;
  fills: Fill[];
  replayed?: boolean;
}

export interface StreamEvent {
  id: string;
  type: string;
  data: any;
}

export class KillerQueenClient {
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  apiKey: string | undefined;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retries = opts.retries ?? 3;
    this.backoffMs = opts.backoffMs ?? 250;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.apiKey = opts.apiKey;
  }

  private async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          headers: {
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt > this.retries) throw e;
        await this.sleep(this.backoffMs * 2 ** (attempt - 1));
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt <= this.retries) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        await this.sleep(Math.max(retryAfter * 1000, this.backoffMs * 2 ** (attempt - 1)));
        continue;
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: text, code: 'bad_response' };
      }
      if (!res.ok) throw new ApiError(res.status, json?.code ?? `http_${res.status}`, json?.error ?? res.statusText);
      return json as T;
    }
  }

  /** Sandbox only. Stores the returned key on the client. */
  async createAccount(input: AccountInput): Promise<{ account: PublicAccount; apiKey: string }> {
    const r = await this.call<{ account: PublicAccount; apiKey: string }>('POST', '/api/accounts', input);
    this.apiKey = r.apiKey;
    return r;
  }
  me(): Promise<{ account: PublicAccount }> {
    return this.call('GET', '/api/me');
  }
  portfolio(): Promise<Portfolio> {
    return this.call('GET', '/api/portfolio');
  }
  faucet(): Promise<{ account: PublicAccount; added: number }> {
    return this.call('POST', '/api/wallet/faucet');
  }
  tasks(): Promise<{ tasks: TaskView[] }> {
    return this.call('GET', '/api/tasks');
  }
  task(id: string): Promise<TaskView> {
    return this.call('GET', `/api/tasks/${encodeURIComponent(id)}`);
  }
  market(id: string): Promise<MarketView> {
    return this.call('GET', `/api/markets/${encodeURIComponent(id)}`);
  }
  agentMarkets(): Promise<{ markets: AgentMarket[] }> {
    return this.call('GET', '/api/agent/markets');
  }
  executors(): Promise<{ executors: ExecutorRecord[] }> {
    return this.call('GET', '/api/executors');
  }
  leaderboard(): Promise<{ leaderboard: LeaderboardRow[] }> {
    return this.call('GET', '/api/leaderboard');
  }
  stats(): Promise<Stats> {
    return this.call('GET', '/api/stats');
  }
  /** One Idempotency-Key per call, reused across retries: a retry never places two orders. */
  placeOrder(input: OrderInput, opts: { idempotencyKey?: string } = {}): Promise<PlaceOrderResult> {
    const key = opts.idempotencyKey ?? `sdk_${randomBytes(12).toString('hex')}`;
    return this.call('POST', '/api/orders', input, { 'idempotency-key': key });
  }
  cancelOrder(orderId: string): Promise<{ order: Order; refunded: number }> {
    return this.call('DELETE', `/api/orders/${encodeURIComponent(orderId)}`);
  }
  comment(marketId: string, input: CommentInput): Promise<{ comment: unknown }> {
    return this.call('POST', `/api/markets/${encodeURIComponent(marketId)}/comments`, input);
  }
  createTask(input: TaskInput): Promise<TaskView> {
    return this.call('POST', '/api/tasks', input);
  }
  closeTask(id: string): Promise<TaskView> {
    return this.call('POST', `/api/tasks/${encodeURIComponent(id)}/close`);
  }
  decide(id: string, input: DecideInput): Promise<TaskView> {
    return this.call('POST', `/api/tasks/${encodeURIComponent(id)}/decide`, input);
  }

  /** Subscribe to the live event stream; resumes with Last-Event-ID after a drop. Returns a stop function. */
  events(onEvent: (e: StreamEvent) => void, opts: { markets?: string[]; tasks?: string[]; onError?: (e: unknown) => void } = {}): () => void {
    const ctrl = new AbortController();
    let lastId: string | null = null;
    const qs = new URLSearchParams();
    if (opts.markets?.length) qs.set('markets', opts.markets.join(','));
    if (opts.tasks?.length) qs.set('tasks', opts.tasks.join(','));
    const run = async () => {
      while (!ctrl.signal.aborted) {
        try {
          const res = await this.fetchImpl(`${this.opts.baseUrl}/api/events${qs.size ? `?${qs}` : ''}`, { headers: lastId ? { 'last-event-id': lastId } : {}, signal: ctrl.signal });
          if (!res.ok || !res.body) throw new Error(`events: HTTP ${res.status}`);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i);
              buf = buf.slice(i + 2);
              if (chunk.startsWith(':') || chunk.startsWith('retry:')) continue;
              const e: StreamEvent = { id: '', type: 'message', data: null };
              for (const line of chunk.split('\n')) {
                if (line.startsWith('id: ')) e.id = line.slice(4);
                else if (line.startsWith('event: ')) e.type = line.slice(7);
                else if (line.startsWith('data: ')) e.data = JSON.parse(line.slice(6));
              }
              if (e.id) lastId = e.id;
              onEvent(e);
            }
          }
        } catch (err) {
          if (ctrl.signal.aborted) return;
          opts.onError?.(err);
          await this.sleep(1000);
        }
      }
    };
    void run();
    return () => ctrl.abort();
  }
}
