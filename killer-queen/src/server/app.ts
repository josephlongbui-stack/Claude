/**
 * Express app: every route from the product spec's HTTP API table. Handlers
 * validate with zod, authenticate, and call the Venue; they never touch
 * engine state directly.
 */
import express, { type NextFunction, type Request, type Response, type Express } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  agentMarkets,
  alerts,
  allTasks,
  constantTimeEqual,
  executorRecords,
  hmacSha256,
  leaderboard,
  marketView,
  portfolio,
  publicAccount,
  publicTask,
  sha256,
  stateHash,
  stats,
  taskView,
  type Clock,
  type EngineResult,
  type RunOutcome,
  type Venue,
} from '../engine/index.js';
import { newApiKey, optionalAccount, requireAccount, requireAdminKey, requireRole, requireSecret, type AuthedRequest } from './auth.js';
import type { Config } from './config.js';
import { HttpError, errorHandler, statusForCode } from './errors.js';
import { accountBody, adminAccountBody, adminReviewBody, adminSettleBody, adminTradingBody, commentBody, decideBody, orderBody, resultBody, taskBody } from './schemas.js';
import { RateLimiter, rateLimit } from './rateLimit.js';
import type { EventHub } from './events.js';

export const RESULT_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export interface AppDeps {
  venue: Venue;
  config: Config;
  clock: Clock;
  /** Live event stream (GET /api/events); optional so bare apps still work. */
  events?: EventHub;
  /** Directory with the built web app (index.html); served when present. */
  publicDir?: string;
}

type Handler = (req: AuthedRequest, res: Response) => unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req as AuthedRequest, res)).catch(next);
};

/** Unwrap an engine result or throw the matching HttpError. */
function unwrap<T extends EngineResult>(r: T): Extract<T, { ok: true }>['data'] {
  if (!r.ok) throw new HttpError(statusForCode(r.code), r.code, r.error);
  return (r as Extract<T, { ok: true }>).data;
}

export function createApp(deps: AppDeps): Express {
  const { venue, config, clock } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  const verify = (req: Request, _res: Response, buf: Buffer) => {
    (req as AuthedRequest).rawBody = buf;
  };
  // Runner logs may be large; everything else is small.
  app.use('/api/runner/results', express.json({ limit: '6mb', verify }));
  app.use(express.json({ limit: '64kb', verify }));
  const auth = requireAccount(venue);
  const limiter = new RateLimiter(clock);
  const rl = config.rateLimits;
  const limitOrders = rateLimit(limiter, 'orders', rl.orders);
  const limitTasks = rateLimit(limiter, 'tasks', rl.tasks);
  const limitWrites = rateLimit(limiter, 'writes', rl.writes);
  const limitReads = rateLimit(limiter, 'reads', rl.reads);
  const limitAnon = rateLimit(limiter, 'anon', rl.anon);
  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, mode: config.mode, runner: config.runner, applied: venue.engine.state.applied, halted: venue.isHalted, trading: venue.engine.state.trading });
  });

  /* ---- accounts ---- */
  api.post(
    '/accounts',
    limitAnon,
    wrap((req, res) => {
      if (config.mode === 'live') throw new HttpError(403, 'forbidden', 'open sign-up is off in live mode; accounts are provisioned by an admin');
      const body = accountBody.parse(req.body);
      const key = newApiKey();
      const startingCash = body.role === 'trader' ? config.startingCashCents : 0;
      const device = req.headers['x-device-id'];
      const { account } = unwrap(
        venue.apply({
          type: 'createAccount',
          name: body.name,
          kind: body.kind,
          role: body.role,
          org: body.org,
          keyHash: key.hash,
          startingCash,
          emailHash: body.email ? sha256(body.email.toLowerCase()) : null,
          deviceHash: typeof device === 'string' && device.trim() ? sha256(device.trim()) : null,
        }),
      );
      res.status(201).json({ account: publicAccount(account), apiKey: key.raw });
    }),
  );
  api.get('/me', auth, limitReads, wrap((req, res) => res.json({ account: publicAccount(req.account!) })));
  api.get('/portfolio', auth, limitReads, wrap((req, res) => res.json(portfolio(venue.engine, req.account!.id))));
  api.post(
    '/wallet/faucet',
    auth,
    limitWrites,
    wrap((req, res) => {
      if (config.mode === 'live') throw new HttpError(404, 'not_found', 'no faucet in live mode');
      const { account } = unwrap(venue.apply({ type: 'deposit', account: req.account!.id, amount: config.startingCashCents, reason: 'faucet' }));
      res.json({ account: publicAccount(account), added: config.startingCashCents });
    }),
  );

  /* ---- tasks and markets ---- */
  const viewer = optionalAccount(venue);
  api.get('/tasks', viewer, limitAnon, wrap((req, res) => res.json({ tasks: allTasks(venue.engine, req.account ?? null) })));
  api.get(
    '/tasks/:id',
    viewer,
    limitAnon,
    wrap((req, res) => {
      const task = venue.engine.task(req.params.id!);
      if (!task || !venue.engine.canSeeTask(req.account ?? null, task)) throw new HttpError(404, 'task_not_found', `no task ${req.params.id}`);
      res.json(taskView(venue.engine, req.params.id!));
    }),
  );
  api.get(
    '/markets/:id',
    viewer,
    limitAnon,
    wrap((req, res) => {
      const market = venue.engine.market(req.params.id!);
      if (!market || !venue.engine.canSeeTask(req.account ?? null, venue.engine.task(market.taskId)!)) throw new HttpError(404, 'market_not_found', `no market ${req.params.id}`);
      res.json(marketView(venue.engine, req.params.id!));
    }),
  );
  api.get('/agent/markets', auth, limitReads, wrap((req, res) => res.json({ markets: agentMarkets(venue.engine, req.account!.id) })));
  api.get('/executors', limitAnon, (_req, res) => res.json({ executors: executorRecords(venue.engine) }));
  api.get('/leaderboard', limitAnon, (_req, res) => res.json({ leaderboard: leaderboard(venue.engine) }));
  api.get('/stats', limitAnon, (_req, res) => res.json(stats(venue.engine)));

  api.post(
    '/tasks',
    auth,
    requireRole('customer', 'admin'),
    limitTasks,
    wrap((req, res) => {
      const body = taskBody.parse(req.body);
      if (config.mode === 'live' && ((body.forceOutcome !== undefined && body.forceOutcome !== null) || (body.forceBaseline !== undefined && body.forceBaseline !== null))) {
        throw new HttpError(400, 'validation', 'forceOutcome and forceBaseline are sandbox-only');
      }
      const { task } = unwrap(
        venue.apply({
          type: 'createTask',
          customer: req.account!.id,
          title: body.title,
          prompt: body.prompt,
          repo: body.repo,
          commit: body.commit,
          testCommand: body.testCommand,
          candidateAgents: body.candidateAgents,
          tradingWindowMs: body.tradingWindowMs ?? config.tradingWindowMs,
          autoDecide: body.autoDecide,
          minimumChance: body.minimumChance,
          protectedPaths: body.protectedPaths,
          forceOutcome: body.forceOutcome ?? null,
          forceBaseline: body.forceBaseline ?? null,
          requireBaseline: config.baselineCheck,
          visibility: body.visibility,
        }),
      );
      res.status(201).json(taskView(venue.engine, task.id));
    }),
  );
  api.post(
    '/tasks/:id/close',
    auth,
    limitWrites,
    wrap((req, res) => {
      unwrap(venue.apply({ type: 'closeTask', taskId: req.params.id!, by: req.account!.id }));
      res.json(taskView(venue.engine, req.params.id!));
    }),
  );
  api.post(
    '/tasks/:id/decide',
    auth,
    limitWrites,
    wrap((req, res) => {
      const body = decideBody.parse(req.body ?? {});
      unwrap(venue.apply({ type: 'decide', taskId: req.params.id!, executorId: body.executorId, by: req.account!.id }));
      res.json(taskView(venue.engine, req.params.id!));
    }),
  );

  /* ---- trading ---- */
  api.post(
    '/orders',
    auth,
    limitOrders,
    wrap((req, res) => {
      const body = orderBody.parse(req.body);
      // Idempotency-Key (D27): a retry with the same key returns the original order instead of placing another.
      const idem = req.headers['idempotency-key'];
      const clientKey = typeof idem === 'string' && idem.trim() !== '' ? idem.trim() : undefined;
      if (clientKey !== undefined && clientKey.length > 128) throw new HttpError(400, 'validation', 'Idempotency-Key must be at most 128 characters');
      const replay = (order: { id: string }) => {
        const fills = venue.engine.state.fills.filter((f) => f.takerOrder === order.id);
        res.status(200).json({ order: venue.engine.order(order.id), fills, replayed: true });
      };
      if (clientKey !== undefined) {
        const existing = venue.engine.orderByClientKey(req.account!.id, clientKey);
        if (existing) return replay(existing);
      }
      const r = venue.apply({
        type: 'placeOrder',
        account: req.account!.id,
        market: body.marketId,
        side: body.side,
        action: body.action,
        orderType: body.type,
        price: body.price,
        quantity: body.quantity,
        tif: body.tif,
        clientKey,
      });
      if (!r.ok && r.code === 'duplicate_client_key' && clientKey !== undefined) {
        const existing = venue.engine.orderByClientKey(req.account!.id, clientKey);
        if (existing) return replay(existing);
      }
      res.status(201).json(unwrap(r));
    }),
  );
  api.delete(
    '/orders/:id',
    auth,
    limitWrites,
    wrap((req, res) => {
      const data = unwrap(venue.apply({ type: 'cancelOrder', account: req.account!.id, orderId: req.params.id! }));
      res.json(data);
    }),
  );
  api.post(
    '/markets/:id/comments',
    auth,
    limitWrites,
    wrap((req, res) => {
      const body = commentBody.parse(req.body);
      const data = unwrap(venue.apply({ type: 'comment', account: req.account!.id, market: req.params.id!, text: body.text, probability: body.probability ?? null }));
      res.status(201).json(data);
    }),
  );

  /* ---- runner protocol ---- */
  api.get(
    '/runner/jobs',
    requireSecret(config.runnerSecret, 'runner'),
    wrap((_req, res) => {
      const jobs: unknown[] = [];
      for (const t of venue.engine.state.tasks.values()) {
        if (t.status === 'pending') {
          jobs.push({ kind: 'baseline', taskId: t.id, repo: t.repo, commit: t.commit, testCommand: t.testCommand, protectedPaths: t.protectedPaths, createdAt: t.createdAt });
          continue;
        }
        if (t.status !== 'running' || !t.chosenAgent) continue;
        const executor = venue.engine.state.executors.get(t.chosenAgent)!;
        jobs.push({
          kind: 'run',
          taskId: t.id,
          executorId: t.chosenAgent,
          executor: { ...executor, version: t.candidateVersions[t.chosenAgent] ?? executor.version },
          prompt: t.prompt,
          repo: t.repo,
          commit: t.commit,
          testCommand: t.testCommand,
          protectedPaths: t.protectedPaths,
          decidedAt: t.decidedAt,
        });
      }
      res.json({ jobs });
    }),
  );
  api.post(
    '/runner/results',
    wrap((req, res) => {
      const header = req.headers['x-kq-signature'];
      const raw = req.rawBody ?? Buffer.alloc(0);
      if (!config.runnerSecret || typeof header !== 'string' || !header.startsWith('sha256=')) {
        throw new HttpError(401, 'bad_signature', 'missing x-kq-signature: sha256=<hmac>');
      }
      const expected = hmacSha256(config.runnerSecret, raw);
      if (!constantTimeEqual(header.slice('sha256='.length), expected)) throw new HttpError(401, 'bad_signature', 'signature does not match');
      const body = resultBody.parse(req.body);
      if (config.mode === 'live' && (body.runId === undefined || body.timestamp === undefined)) {
        throw new HttpError(400, 'validation', 'runId and timestamp are required in live mode (D9)');
      }
      if (body.timestamp !== undefined && Math.abs(clock.now() - body.timestamp) > RESULT_TIMESTAMP_WINDOW_MS) {
        throw new HttpError(401, 'stale_result', 'timestamp is outside the 5-minute window');
      }
      if (body.logSha256 !== undefined && body.logSha256 !== sha256(body.log)) {
        throw new HttpError(400, 'log_hash_mismatch', 'logSha256 does not match the log');
      }
      if (body.kind === 'baseline') {
        const data = unwrap(venue.apply({ type: 'baseline', taskId: body.taskId, results: body.results!, log: body.log, runId: body.runId ?? null }));
        res.json({ task: publicTask(data.task), opened: data.opened, rejectedReason: data.rejectedReason });
        return;
      }
      const outcome: RunOutcome = body.outcome ?? (body.passed ? 'passed' : 'failed');
      const data = unwrap(venue.apply({ type: 'settle', taskId: body.taskId, outcome, log: body.log, runId: body.runId ?? null }));
      res.json({ task: publicTask(data.task), market: data.market });
    }),
  );

  /* ---- admin (sandbox hand-settle) ---- */
  api.post(
    '/admin/tasks/:id/settle',
    requireAdminKey(config.adminKey),
    wrap((req, res) => {
      if (config.mode !== 'sandbox') throw new HttpError(403, 'forbidden', 'hand settlement is sandbox-only');
      const body = adminSettleBody.parse(req.body);
      const data = unwrap(venue.apply({ type: 'settle', taskId: req.params.id!, outcome: body.outcome, log: body.log, runId: null }));
      res.json({ task: publicTask(data.task), market: data.market });
    }),
  );

  /* ---- live events (SSE) ---- */
  api.get(
    '/events',
    viewer,
    limitAnon,
    wrap((req, res) => {
      if (!deps.events) throw new HttpError(404, 'not_found', 'event stream is off');
      const account = req.account ?? null;
      const canSeeTask = (taskId: string) => {
        const t = venue.engine.task(taskId);
        return !t || venue.engine.canSeeTask(account, t);
      };
      const lastId = (typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined) ?? (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : null);
      const filter: { markets?: Set<string>; tasks?: Set<string>; canSeeTask?: (id: string) => boolean } = {};
      if (typeof req.query.markets === 'string' && req.query.markets) filter.markets = new Set(req.query.markets.split(',').filter(Boolean).slice(0, 100));
      if (typeof req.query.tasks === 'string' && req.query.tasks) filter.tasks = new Set(req.query.tasks.split(',').filter(Boolean).slice(0, 100));
      deps.events.attach(res, lastId ?? null, { ...filter, canSeeTask });
    }),
  );

  /* ---- admin: surveillance queue, account review, provisioning ---- */
  api.get('/admin/alerts', requireAdminKey(config.adminKey), (_req, res) => res.json({ alerts: alerts(venue.engine) }));
  api.post(
    '/admin/accounts/:id/review',
    requireAdminKey(config.adminKey),
    wrap((req, res) => {
      const body = adminReviewBody.parse(req.body);
      const { account } = unwrap(venue.apply({ type: 'reviewAccount', account: req.params.id!, flagged: body.flagged, vetted: body.vetted, personId: body.personId, reason: body.reason, by: null }));
      res.json({ account: publicAccount(account) });
    }),
  );
  api.post(
    '/admin/accounts',
    requireAdminKey(config.adminKey),
    wrap((req, res) => {
      const body = adminAccountBody.parse(req.body);
      const key = newApiKey();
      const startingCash = body.role === 'trader' && config.mode === 'sandbox' ? config.startingCashCents : 0;
      const { account } = unwrap(
        venue.apply({ type: 'createAccount', name: body.name, kind: body.kind, role: body.role, org: body.org, keyHash: key.hash, startingCash, personId: body.personId, vetted: body.vetted, emailHash: body.email ? sha256(body.email.toLowerCase()) : null }),
      );
      res.status(201).json({ account: publicAccount(account), apiKey: key.raw });
    }),
  );
  api.get('/admin/trading', requireAdminKey(config.adminKey), (_req, res) => res.json({ trading: venue.engine.state.trading }));
  api.get('/admin/state-hash', requireAdminKey(config.adminKey), (_req, res) => res.json({ hash: stateHash(venue.engine.state), applied: venue.engine.state.applied }));
  api.post(
    '/admin/trading',
    requireAdminKey(config.adminKey),
    wrap((req, res) => {
      const body = adminTradingBody.parse(req.body);
      unwrap(venue.apply({ type: 'pauseTrading', paused: body.paused, reason: body.reason, by: null }));
      res.json({ trading: venue.engine.state.trading });
    }),
  );

  api.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'no such route')));
  app.use('/api', api);

  const publicDir = deps.publicDir ?? resolve(process.cwd(), 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: 'index.html' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
