import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const CONTRACT_VALUE = 100;
export const MIN_PRICE = 1;
export const MAX_PRICE = 99;

export function isCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export function assertCents(n: unknown, what = 'amount'): number {
  if (!isCents(n)) throw new TypeError(`${what} must be an integer number of cents, got ${String(n)}`);
  return n;
}

export function isPrice(p: unknown): p is number {
  return isCents(p) && p >= MIN_PRICE && p <= MAX_PRICE;
}

export function clampPrice(p: number): number {
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.trunc(p)));
}

/** Mid price rounded half up (D7). */
export function midHalfUp(bid: number, ask: number): number {
  return Math.floor((bid + ask + 1) / 2);
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(secret: string, body: string | Buffer): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function marketId(taskId: string, executorId: string): string {
  return `${taskId}:${executorId}`;
}

export function otherSide(side: 'yes' | 'no'): 'yes' | 'no' {
  return side === 'yes' ? 'no' : 'yes';
}
