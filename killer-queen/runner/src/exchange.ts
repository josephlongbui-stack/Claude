/** HTTP client for the exchange's runner routes: poll jobs, post signed results. */
import { createHash, createHmac } from 'node:crypto';
import type { Job, ResultBody, ResultInput } from './types.js';

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export class ExchangeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async jobs(): Promise<Job[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/runner/jobs`, { headers: { authorization: `Bearer ${this.secret}` } });
    if (!res.ok) throw new Error(`jobs: HTTP ${res.status}`);
    const body = (await res.json()) as { jobs: Job[] };
    return body.jobs;
  }

  /** Signs the exact bytes it sends. Returns the status and parsed body; never throws on 4xx. */
  async postResult(result: ResultInput): Promise<{ status: number; body: unknown }> {
    const body: ResultBody = { ...result, logSha256: sha256(result.log), timestamp: result.timestamp ?? Date.now() } as ResultBody;
    const raw = JSON.stringify(body);
    const sig = createHmac('sha256', this.secret).update(raw).digest('hex');
    const res = await this.fetchImpl(`${this.baseUrl}/api/runner/results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kq-signature': `sha256=${sig}` },
      body: raw,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, body: parsed };
  }
}
