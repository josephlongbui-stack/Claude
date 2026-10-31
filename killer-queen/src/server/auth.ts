import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { constantTimeEqual, sha256, type Account, type Venue } from '../engine/index.js';
import { HttpError } from './errors.js';

export interface AuthedRequest extends Request {
  account?: Account;
  rawBody?: Buffer;
}

export function newApiKey(): { raw: string; hash: string } {
  const raw = `kq_${randomBytes(24).toString('hex')}`;
  return { raw, hash: sha256(raw) };
}

export function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]!.trim() : null;
}

/** Find the account whose key hash matches, comparing every keyed account in constant time. */
export function findAccountByKey(venue: Venue, token: string): Account | undefined {
  const hash = sha256(token);
  let found: Account | undefined;
  for (const a of venue.engine.state.accounts.values()) {
    if (a.keyHash === null) continue;
    if (constantTimeEqual(hash, a.keyHash)) found = a; // no early exit
  }
  return found;
}

/** Resolve the caller's account from `Authorization: Bearer <api key>` by SHA-256 lookup. */
export function requireAccount(venue: Venue) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = bearer(req);
    if (!token) return next(new HttpError(401, 'unauthorized', 'missing Authorization: Bearer <api key>'));
    const account = findAccountByKey(venue, token);
    if (!account) return next(new HttpError(401, 'unauthorized', 'unknown api key'));
    req.account = account;
    next();
  };
}

/** Attach the account when a valid key is present; anonymous otherwise (for public reads with private-task gating). */
export function optionalAccount(venue: Venue) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = bearer(req);
    if (token) {
      const account = findAccountByKey(venue, token);
      if (account) req.account = account;
    }
    next();
  };
}

export function requireRole(...roles: Account['role'][]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.account) return next(new HttpError(401, 'unauthorized', 'not signed in'));
    if (!roles.includes(req.account.role)) return next(new HttpError(403, 'forbidden_role', `this needs a ${roles.join(' or ')} account`));
    next();
  };
}

export function requireSecret(secret: string, what: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = bearer(req);
    if (!secret || !token || !constantTimeEqual(token, secret)) return next(new HttpError(401, 'unauthorized', `bad ${what} secret`));
    next();
  };
}

export function requireAdminKey(adminKey: string | null) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const given = req.headers['x-admin-key'];
    if (!adminKey || typeof given !== 'string' || !constantTimeEqual(given, adminKey)) return next(new HttpError(401, 'unauthorized', 'bad admin key'));
    next();
  };
}
