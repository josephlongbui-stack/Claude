/**
 * Express app: every route from the product spec's HTTP API table. Handlers
 * validate with zod, authenticate, and call the Venue; they never touch
 * engine state directly.
 */
import express, { type NextFunction, type Request, type Response, type Express } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  agentMarkets,
  allTasks,
  constantTimeEqual,
  executorRecords,
  hmacSha256,
  leaderboard,
  marketView,
  portfolio,
  publicAccount,
  publicTask,
  stats,
  taskView,
  type Clock,
  type EngineResult,
  type RunOutcome,
  type Venue,
} from '../engine/index.js';
import { newApiKey, requireAccount, requireAdminKey, requireRole, requireSecret, type AuthedRequest } from './auth.js';
import type { Config } from './config.js';
import { HttpError, errorHandler, statusForCode } from './errors.js';

export const RESULT_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export interface AppDeps {
  venue: Venue;
  config: Config;
  clock: Clock;
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

const accountBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['human', 'agent']),
    role: z.enum(['trader', 'customer']),
    org: z.string().trim().max(80).default(''),
  })
  .strict();

const orderBody = z
  .object({
    marketId: z.string().min(1),
    side: z.enum(['yes', 'no']),
    action: z.enum(['buy', 'sell']).default('buy'),
    type: z.enum(['limit', 'market']).default('limit'),
    price: z.number().int().min(1).max(99).optional(),
    quantity: z.number().int().min(1),
    tif: z.enum(['gtc', 'ioc']).optional(),
  })
  .strict()
  .refine((o) => o.type === 'market' || o.price !== undefined, { message: 'price is required for limit orders', path: ['price'] });

const commentBody = z
  .object({
    text: z.string().trim().min(1).max(4000),
    probability: z.number().int().min(1).max(99).nullable().optional(),
  })
  .strict();

const taskBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    prompt: z.string().min(1).max(20_000),
    repo: z.string().trim().min(1).max(300),
    commit: z.string().trim().min(1).max(64),
    testCommand: z.string().trim().min(1).max(500),
    candidateAgents: z.array(z.string().min(1)).min(1).max(10),
    tradingWindowMs: z.number().int().min(1_000).max(7 * 24 * 3_600_000).optional(),
    autoDecide: z.boolean().optional(),
    minimumChance: z.number().int().min(1).max(99).optional(),
    protectedPaths: z.array(z.string().min(1)).max(50).optional(),
    forceOutcome: z.enum(['pass', 'fail']).nullable().optional(),
  })
  .strict();

const decideBody = z.object({ executorId: z.string().min(1).nullable() }).strict();

const resultBody = z
  .object({
    taskId: z.string().min(1),
    passed: z.boolean().optional(),
    outcome: z.enum(['passed', 'failed', 'infra_error']).optional(),
    log: z.string().max(5_000_000).default(''),
    runId: z.string().min(1).max(200).optional(),
    timestamp: z.number().int().optional(),
  })
  .strict()
  .refine((b) => b.passed !== undefined || b.outcome !== undefined, { message: 'passed or outcome is required', path: ['outcome'] });

export function createApp(deps: AppDeps): Express {
  const { venue, config, clock } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(
    express.json({
      limit: '6mb',
      verify: (req, _res, buf) => {
        (req as AuthedRequest).rawBody = buf;
      },
    }),
  );
  const auth = requireAccount(venue);
  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, mode: config.mode, runner: config.runner, applied: venue.engine.state.applied, halted: venue.isHalted });
  });

  /* ---- accounts ---- */
  api.post(
    '/accounts',
    wrap((req, res) => {
      if (config.mode === 'live') throw new HttpError(403, 'forbidden', 'open sign-up is off in live mode; accounts are provisioned by an admin');
      const body = accountBody.parse(req.body);
      const key = newApiKey();
      const startingCash = body.role === 'trader' ? config.startingCashCents : 0;
      const { account } = unwrap(venue.apply({ type: 'createAccount', name: body.name, kind: body.kind, role: body.role, org: body.org, keyHash: key.hash, startingCash }));
      res.status(201).json({ account: publicAccount(account), apiKey: key.raw });
    }),
  );
  api.get('/me', auth, wrap((req, res) => res.json({ account: publicAccount(req.account!) })));
  api.get('/portfolio', auth, wrap((req, res) => res.json(portfolio(venue.engine, req.account!.id))));
  api.post(
    '/wallet/faucet',
    auth,
    wrap((req, res) => {
      if (config.mode === 'live') throw new HttpError(404, 'not_found', 'no faucet in live mode');
      const { account } = unwrap(venue.apply({ type: 'deposit', account: req.account!.id, amount: config.startingCashCents, reason: 'faucet' }));
      res.json({ account: publicAccount(account), added: config.startingCashCents });
    }),
  );

  /* ---- tasks and markets ---- */
  api.get('/tasks', (_req, res) => res.json({ tasks: allTasks(venue.engine) }));
  api.get(
    '/tasks/:id',
    wrap((req, res) => {
      if (!venue.engine.task(req.params.id!)) throw new HttpError(404, 'task_not_found', `no task ${req.params.id}`);
      res.json(taskView(venue.engine, req.params.id!));
    }),
  );
  api.get(
    '/markets/:id',
    wrap((req, res) => {
      if (!venue.engine.market(req.params.id!)) throw new HttpError(404, 'market_not_found', `no market ${req.params.id}`);
      res.json(marketView(venue.engine, req.params.id!));
    }),
  );
  api.get('/agent/markets', auth, wrap((req, res) => res.json({ markets: agentMarkets(venue.engine, req.account!.id) })));
  api.get('/executors', (_req, res) => res.json({ executors: executorRecords(venue.engine) }));
  api.get('/leaderboard', (_req, res) => res.json({ leaderboard: leaderboard(venue.engine) }));
  api.get('/stats', (_req, res) => res.json(stats(venue.engine)));

  api.post(
    '/tasks',
    auth,
    requireRole('customer', 'admin'),
    wrap((req, res) => {
      const body = taskBody.parse(req.body);
      if (body.forceOutcome !== undefined && body.forceOutcome !== null && config.mode === 'live') {
        throw new HttpError(400, 'validation', 'forceOutcome is sandbox-only');
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
        }),
      );
      res.status(201).json(taskView(venue.engine, task.id));
    }),
  );
  api.post(
    '/tasks/:id/close',
    auth,
    wrap((req, res) => {
      unwrap(venue.apply({ type: 'closeTask', taskId: req.params.id!, by: req.account!.id }));
      res.json(taskView(venue.engine, req.params.id!));
    }),
  );
  api.post(
    '/tasks/:id/decide',
    auth,
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
    wrap((req, res) => {
      const body = orderBody.parse(req.body);
      const data = unwrap(
        venue.apply({
          type: 'placeOrder',
          account: req.account!.id,
          market: body.marketId,
          side: body.side,
          action: body.action,
          orderType: body.type,
          price: body.price,
          quantity: body.quantity,
          tif: body.tif,
        }),
      );
      res.status(201).json(data);
    }),
  );
  api.delete(
    '/orders/:id',
    auth,
    wrap((req, res) => {
      const data = unwrap(venue.apply({ type: 'cancelOrder', account: req.account!.id, orderId: req.params.id! }));
      res.json(data);
    }),
  );
  api.post(
    '/markets/:id/comments',
    auth,
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
      const jobs = [];
      for (const t of venue.engine.state.tasks.values()) {
        if (t.status !== 'running' || !t.chosenAgent) continue;
        const executor = venue.engine.state.executors.get(t.chosenAgent)!;
        jobs.push({
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
      const body = z.object({ outcome: z.enum(['passed', 'failed', 'infra_error']), log: z.string().max(100_000).default('settled by admin') }).strict().parse(req.body);
      const data = unwrap(venue.apply({ type: 'settle', taskId: req.params.id!, outcome: body.outcome, log: body.log, runId: null }));
      res.json({ task: publicTask(data.task), market: data.market });
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
