/**
 * Minimal exchange client for the app: same routes as sdk/, written for React
 * Native (no node: modules). Request shapes mirror src/server/schemas.ts.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const KQ_URL: string = process.env.EXPO_PUBLIC_KQ_URL ?? (Constants.expoConfig?.extra?.kqUrl as string | undefined) ?? 'http://localhost:3000';
const KEY = 'kq.apiKey';
let cachedKey: string | null | undefined;

export async function getKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  try {
    cachedKey = await SecureStore.getItemAsync(KEY);
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export async function setKey(key: string | null): Promise<void> {
  cachedKey = key;
  try {
    if (key) await SecureStore.setItemAsync(KEY, key);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* keychain unavailable */
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function randomKey(): string {
  let s = 'app_';
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export async function api<T = any>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const key = await getKey();
  const headers: Record<string, string> = { ...extra };
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${KQ_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
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

export const kq = {
  me: () => api('GET', '/api/me'),
  tasks: () => api('GET', '/api/tasks'),
  task: (id: string) => api('GET', `/api/tasks/${encodeURIComponent(id)}`),
  market: (id: string) => api('GET', `/api/markets/${encodeURIComponent(id)}`),
  portfolio: () => api('GET', '/api/portfolio'),
  leaderboard: () => api('GET', '/api/leaderboard'),
  executors: () => api('GET', '/api/executors'),
  createAccount: (name: string, kind: 'human' | 'agent', role: 'trader' | 'customer', org: string) => api('POST', '/api/accounts', { name, kind, role, org }),
  placeOrder: (body: { marketId: string; side: 'yes' | 'no'; action?: 'buy' | 'sell'; type?: 'limit' | 'market'; price?: number; quantity: number; tif?: 'gtc' | 'ioc' }) =>
    api('POST', '/api/orders', body, { 'idempotency-key': randomKey() }),
  cancelOrder: (id: string) => api('DELETE', `/api/orders/${encodeURIComponent(id)}`),
  comment: (marketId: string, text: string, probability: number | null) => api('POST', `/api/markets/${encodeURIComponent(marketId)}/comments`, { text, probability }),
  faucet: () => api('POST', '/api/wallet/faucet'),
  deleteAccount: () => api('POST', '/api/me/delete'),
  reportThesis: (marketId: string, commentId: string, reason: string) => api('POST', `/api/markets/${encodeURIComponent(marketId)}/comments/${encodeURIComponent(commentId)}/report`, { reason }),
};

/** Server-sent events over fetch streaming; resumes with Last-Event-ID. Returns a stop function. */
export function subscribe(onEvent: (type: string, data: any) => void, opts: { markets?: string[]; tasks?: string[] } = {}): () => void {
  const ctrl = new AbortController();
  let lastId: string | null = null;
  const qs = new URLSearchParams();
  if (opts.markets?.length) qs.set('markets', opts.markets.join(','));
  if (opts.tasks?.length) qs.set('tasks', opts.tasks.join(','));
  const run = async () => {
    while (!ctrl.signal.aborted) {
      try {
        const key = await getKey();
        const res = await fetch(`${KQ_URL}/api/events${qs.toString() ? `?${qs}` : ''}`, { headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(lastId ? { 'last-event-id': lastId } : {}) }, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
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
            let id = '';
            let type = 'message';
            let data: any = null;
            for (const line of chunk.split('\n')) {
              if (line.startsWith('id: ')) id = line.slice(4);
              else if (line.startsWith('event: ')) type = line.slice(7);
              else if (line.startsWith('data: ')) data = JSON.parse(line.slice(6));
            }
            if (id) lastId = id;
            onEvent(type, data);
          }
        }
      } catch {
        if (ctrl.signal.aborted) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  void run();
  return () => ctrl.abort();
}

export const cents = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${n}¢`);
export const dollars = (n: number): string => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
export const signed = (n: number): string => `${n > 0 ? '+' : ''}${dollars(n)}`;
