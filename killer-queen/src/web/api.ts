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
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    const err: ApiError = { error: 'The exchange could not be reached.', code: 'offline', status: 0 };
    throw err;
  }
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
