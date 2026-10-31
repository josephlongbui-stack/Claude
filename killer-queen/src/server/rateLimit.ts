/**
 * In-process token buckets per key (D28). `limit` tokens per minute refill
 * continuously; a request takes one token. 0 disables a bucket. Time comes
 * from the injected clock so tests can drive it.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Clock } from '../engine/index.js';
import type { AuthedRequest } from './auth.js';
import { HttpError } from './errors.js';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastPrune = 0;

  constructor(private readonly clock: Clock) {}

  /** Returns null when allowed, or the seconds to wait when not. */
  take(key: string, perMinute: number): number | null {
    if (perMinute <= 0) return null;
    const now = this.clock.now();
    this.prune(now);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: perMinute, updatedAt: now };
      this.buckets.set(key, b);
    }
    const refill = ((now - b.updatedAt) * perMinute) / 60_000;
    b.tokens = Math.min(perMinute, b.tokens + Math.max(0, refill));
    b.updatedAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return null;
    }
    return Math.max(1, Math.ceil(((1 - b.tokens) * 60_000) / perMinute / 1000));
  }

  private prune(now: number): void {
    if (now - this.lastPrune < 60_000) return;
    this.lastPrune = now;
    for (const [k, b] of this.buckets) if (now - b.updatedAt > 10 * 60_000) this.buckets.delete(k);
  }
}

/** Middleware: one token from `<bucket>:<account id>` (after auth) or `<bucket>:ip:<address>` before it. */
export function rateLimit(limiter: RateLimiter, bucket: string, perMinute: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const account = (req as AuthedRequest).account;
    const key = account ? `${bucket}:${account.id}` : `${bucket}:ip:${req.ip ?? 'unknown'}`;
    const wait = limiter.take(key, perMinute);
    if (wait === null) return next();
    res.setHeader('Retry-After', String(wait));
    next(new HttpError(429, 'rate_limited', `rate limited: ${perMinute} ${bucket} per minute; retry in ${wait}s`));
  };
}
