import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Map engine rejection codes to 4xx statuses. Everything stays 4xx with { error, code }. */
export function statusForCode(code: string): number {
  if (code.endsWith('_not_found') || code === 'not_a_candidate') return 404;
  if (code === 'conflict' || code.startsWith('forbidden')) return 403;
  if (code === 'unauthorized' || code === 'bad_signature') return 401;
  if (code === 'duplicate_id' || code === 'duplicate_key' || code.startsWith('task_not_') || code === 'market_closed' || code === 'order_not_open' || code === 'run_id_used' || code === 'faucet_cooldown' || code === 'trading_paused' || code === 'duplicate_client_key') return 409;
  if (code === 'rate_limited') return 429;
  return 400;
}

export function sendError(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message);
  if (err instanceof ZodError) {
    return sendError(res, 400, 'validation', err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (e && e.type === 'entity.parse.failed') return sendError(res, 400, 'bad_json', 'request body is not valid JSON');
  if (e && e.type === 'entity.too.large') return sendError(res, 413, 'too_large', 'request body is too large');
  console.error('unhandled error', err);
  sendError(res, 500, 'internal', 'internal error');
}
