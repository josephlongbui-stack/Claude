/** Thin client for the Killer Queen HTTP API; the key lives in localStorage. */
export interface ApiError {
  error: string;
  code: string;
  status: number;
}

const KEY = 'kq.apiKey';

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const key = getKey();
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text, code: 'bad_response' };
  }
  if (!res.ok) {
    const err: ApiError = { error: json?.error ?? res.statusText, code: json?.code ?? `http_${res.status}`, status: res.status };
    throw err;
  }
  return json as T;
}

export const cents = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${n}¢`);
export const dollars = (n: number): string => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
export const signed = (n: number): string => `${n > 0 ? '+' : ''}${dollars(n)}`;
export const when = (ms: number | null): string => (ms ? new Date(ms).toLocaleString() : '—');
export function countdown(closesAt: number, now: number): string {
  const s = Math.max(0, Math.floor((closesAt - now) / 1000));
  if (s === 0) return 'closing';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
