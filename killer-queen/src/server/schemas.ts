/** Request schemas shared by the API and the SDK, so the SDK's types cannot drift from what the server validates. */
import { z } from 'zod';

export const accountBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['human', 'agent']),
    role: z.enum(['trader', 'customer']),
    org: z.string().trim().max(80).default(''),
    /** Optional sign-up email; stored only as a hash and used for the per-email account cap (5.2). */
    email: z.string().trim().email().max(200).optional(),
  })
  .strict();

/** Admin provisioning (live mode): an account tied to a verified person. */
export const adminAccountBody = accountBody
  .extend({ personId: z.string().min(1).max(128), vetted: z.boolean().optional(), kind: z.enum(['human', 'agent', 'system']), role: z.enum(['trader', 'customer', 'admin']) })
  .strict();

export const adminReviewBody = z
  .object({ flagged: z.boolean().optional(), vetted: z.boolean().optional(), personId: z.string().min(1).max(128).nullable().optional(), reason: z.string().max(500).optional() })
  .strict()
  .refine((b) => b.flagged !== undefined || b.vetted !== undefined || b.personId !== undefined, { message: 'set flagged, vetted or personId' });

export const orderBody = z
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

export const commentBody = z
  .object({
    text: z.string().trim().min(1).max(4000),
    probability: z.number().int().min(1).max(99).nullable().optional(),
  })
  .strict();

export const taskBody = z
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
    forceBaseline: z.enum(['trivial', 'flaky']).nullable().optional(),
    visibility: z.enum(['public', 'private']).optional(),
  })
  .strict();

export const decideBody = z.object({ executorId: z.string().min(1).nullable() }).strict();

export const resultBody = z
  .object({
    kind: z.enum(['run', 'baseline', 'correction']).default('run'),
    taskId: z.string().min(1),
    passed: z.boolean().optional(),
    outcome: z.enum(['passed', 'failed', 'infra_error']).optional(),
    results: z.array(z.enum(['passed', 'failed'])).length(3).optional(),
    log: z.string().max(5_000_000).default(''),
    logSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    runId: z.string().min(1).max(200).optional(),
    timestamp: z.number().int().optional(),
    /** Corrections only: why the earlier result was wrong (incident reference). */
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((b) => b.kind === 'baseline' || b.passed !== undefined || b.outcome !== undefined, { message: 'passed or outcome is required', path: ['outcome'] })
  .refine((b) => b.kind !== 'baseline' || b.results !== undefined, { message: 'results is required for a baseline', path: ['results'] })
  .refine((b) => b.kind !== 'correction' || b.reason !== undefined, { message: 'reason is required for a correction', path: ['reason'] });

export const adminCorrectBody = z.object({ outcome: z.enum(['passed', 'failed', 'infra_error']), log: z.string().max(100_000).default('corrected by admin'), reason: z.string().trim().min(1).max(500) }).strict();

export const adminTradingBody = z.object({ paused: z.boolean(), reason: z.string().max(500).optional() }).strict();
export const adminSettleBody = z.object({ outcome: z.enum(['passed', 'failed', 'infra_error']), log: z.string().max(100_000).default('settled by admin') }).strict();

export type AccountInput = z.input<typeof accountBody>;
export type OrderInput = z.input<typeof orderBody>;
export type CommentInput = z.input<typeof commentBody>;
export type TaskInput = z.input<typeof taskBody>;
export type DecideInput = z.input<typeof decideBody>;
export type ResultInput = z.input<typeof resultBody>;
