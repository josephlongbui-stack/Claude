/** Wire types shared with the exchange (docs/RUNNER_PROTOCOL.md). Kept standalone so the runner has no dependency on src/. */

export interface BaselineJob {
  kind: 'baseline';
  taskId: string;
  repo: string;
  commit: string;
  testCommand: string;
  protectedPaths: string[];
  createdAt: number;
}

export interface RunJob {
  kind: 'run';
  taskId: string;
  executorId: string;
  executor: { id: string; name: string; org: string; version: string };
  prompt: string;
  repo: string;
  commit: string;
  testCommand: string;
  protectedPaths: string[];
  decidedAt: number | null;
}

export type Job = BaselineJob | RunJob;

export type RunOutcome = 'passed' | 'failed' | 'infra_error';
export type BaselineRun = 'passed' | 'failed';

export interface RunResultBody {
  kind: 'run';
  taskId: string;
  runId: string;
  outcome: RunOutcome;
  log: string;
  logSha256: string;
  timestamp: number;
}

export interface BaselineResultBody {
  kind: 'baseline';
  taskId: string;
  runId: string;
  results: BaselineRun[];
  log: string;
  logSha256: string;
  timestamp: number;
}

export type ResultBody = RunResultBody | BaselineResultBody;
/** What the runner hands to the client; the client adds logSha256 and timestamp. */
export type ResultInput = (Omit<RunResultBody, 'logSha256' | 'timestamp'> | Omit<BaselineResultBody, 'logSha256' | 'timestamp'>) & { timestamp?: number };

export interface AgentTemplate {
  version: string;
  install?: string;
  command: string[];
  apiHost: string;
  keyEnv: string;
  sources?: string[];
  verify?: boolean;
}

export interface RunnerLimits {
  wallClockMs: number;
  testTimeoutMs: number;
  prepareTimeoutMs: number;
  infraRetries: number;
  tokenBudget: number;
}

export const DEFAULT_LIMITS: RunnerLimits = {
  wallClockMs: 30 * 60_000,
  testTimeoutMs: 10 * 60_000,
  prepareTimeoutMs: 5 * 60_000,
  infraRetries: 2,
  tokenBudget: 2_000_000,
};
