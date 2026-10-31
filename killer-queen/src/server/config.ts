import { z } from 'zod';

const BOT_NAMES = ['mm', 'sim', 'llm'] as const;
export type BotName = (typeof BOT_NAMES)[number];

const envSchema = z.object({
  KQ_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  RUNNER: z.enum(['simulated', 'external']).optional(),
  RUNNER_SECRET: z.string().default(''),
  DB_PATH: z.string().min(1).default('data/killer-queen.db'),
  STARTING_CASH_CENTS: z.coerce.number().int().nonnegative().default(100_000),
  HOUSE_BOTS: z.string().default('mm,sim,llm'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  ADMIN_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  TRADING_WINDOW_MS: z.coerce.number().int().positive().default(600_000),
  BOT_TICK_MS: z.coerce.number().int().positive().default(2_000),
  SIMULATED_RUNNER_DELAY_MS: z.coerce.number().int().nonnegative().default(1_500),
  MM_CASH_CENTS: z.coerce.number().int().nonnegative().default(100_000_000),
  SIM_TRADERS: z.coerce.number().int().min(0).max(20).default(3),
  LOG_LEVEL: z.enum(['silent', 'info', 'debug']).default('info'),
  RATE_LIMIT_ORDERS_PER_MIN: z.coerce.number().int().nonnegative().default(30),
  RATE_LIMIT_TASKS_PER_MIN: z.coerce.number().int().nonnegative().default(5),
  RATE_LIMIT_WRITES_PER_MIN: z.coerce.number().int().nonnegative().default(60),
  RATE_LIMIT_READS_PER_MIN: z.coerce.number().int().nonnegative().default(120),
  RATE_LIMIT_ANON_PER_MIN: z.coerce.number().int().nonnegative().default(300),
  BASELINE_CHECK: z
    .string()
    .default('true')
    .transform((v) => !['false', '0', 'no', 'off'].includes(v.trim().toLowerCase())),
});

export interface Config {
  mode: 'sandbox' | 'live';
  runner: 'simulated' | 'external';
  runnerSecret: string;
  dbPath: string;
  startingCashCents: number;
  houseBots: Set<BotName>;
  llm: {
    anthropic: { apiKey: string; model: string | undefined } | null;
    openai: { apiKey: string; model: string | undefined } | null;
    gemini: { apiKey: string; model: string | undefined } | null;
  };
  adminKey: string | null;
  port: number;
  tradingWindowMs: number;
  botTickMs: number;
  simulatedRunnerDelayMs: number;
  mmCashCents: number;
  simTraders: number;
  logLevel: 'silent' | 'info' | 'debug';
  /** Per API key (orders, tasks, writes, reads) and per IP for unauthenticated calls; 0 disables. */
  rateLimits: { orders: number; tasks: number; writes: number; reads: number; anon: number };
  /** D2: new tasks wait for a 3-run baseline before their markets open. */
  baselineCheck: boolean;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`bad configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  const runner = e.RUNNER ?? (e.KQ_MODE === 'live' ? 'external' : 'simulated');
  if (e.KQ_MODE === 'live' && runner === 'simulated') {
    throw new ConfigError('KQ_MODE=live refuses to start with RUNNER=simulated');
  }
  if (e.KQ_MODE === 'live' && e.RUNNER_SECRET.length < 16) {
    throw new ConfigError('KQ_MODE=live needs RUNNER_SECRET of at least 16 characters');
  }
  const houseBots = new Set<BotName>();
  for (const raw of e.HOUSE_BOTS.split(',')) {
    const name = raw.trim();
    if (name === '') continue;
    if (!(BOT_NAMES as readonly string[]).includes(name)) throw new ConfigError(`unknown house bot "${name}" in HOUSE_BOTS`);
    houseBots.add(name as BotName);
  }
  return {
    mode: e.KQ_MODE,
    runner,
    runnerSecret: e.RUNNER_SECRET,
    dbPath: e.DB_PATH,
    startingCashCents: e.STARTING_CASH_CENTS,
    houseBots,
    llm: {
      anthropic: e.ANTHROPIC_API_KEY ? { apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL } : null,
      openai: e.OPENAI_API_KEY ? { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL } : null,
      gemini: e.GEMINI_API_KEY ? { apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL } : null,
    },
    adminKey: e.ADMIN_KEY && e.ADMIN_KEY.length > 0 ? e.ADMIN_KEY : null,
    port: e.PORT,
    tradingWindowMs: e.TRADING_WINDOW_MS,
    botTickMs: e.BOT_TICK_MS,
    simulatedRunnerDelayMs: e.SIMULATED_RUNNER_DELAY_MS,
    mmCashCents: e.MM_CASH_CENTS,
    simTraders: e.SIM_TRADERS,
    logLevel: e.LOG_LEVEL,
    baselineCheck: e.BASELINE_CHECK,
    rateLimits: { orders: e.RATE_LIMIT_ORDERS_PER_MIN, tasks: e.RATE_LIMIT_TASKS_PER_MIN, writes: e.RATE_LIMIT_WRITES_PER_MIN, reads: e.RATE_LIMIT_READS_PER_MIN, anon: e.RATE_LIMIT_ANON_PER_MIN },
  };
}
