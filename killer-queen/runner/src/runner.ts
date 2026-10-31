/**
 * The runner loop: poll jobs, execute each through the ContainerDriver, post a
 * signed result. Baseline jobs run the test command three times with no agent
 * (D2). Run jobs execute the agent, restore protected paths (D1), then run the
 * tests once. Limits per D5; infrastructure retries per D6.
 */
import { randomBytes } from 'node:crypto';
import { InfraError, type Container, type ContainerDriver, type ContainerSpec } from './driver.js';
import type { ExchangeClient } from './exchange.js';
import { redact } from './redact.js';
import { DEFAULT_LIMITS, type AgentTemplate, type BaselineJob, type BaselineRun, type Job, type RunJob, type RunOutcome, type RunnerLimits } from './types.js';

export interface RunnerOptions {
  agents: Record<string, AgentTemplate>;
  /** Provider keys by env name (e.g. ANTHROPIC_API_KEY) — ideally per-run, spend-capped keys. */
  providerKeys: Record<string, string>;
  limits?: Partial<RunnerLimits>;
  cpus?: number;
  memoryMb?: number;
  pids?: number;
  log?: (msg: string) => void;
  now?: () => number;
}

export interface JobReport {
  job: Job;
  runId: string;
  posted: { status: number; body: unknown } | null;
  outcome?: RunOutcome;
  results?: BaselineRun[];
  attempts: number;
  log: string;
}

export function renderCommand(template: AgentTemplate, prompt: string): string[] {
  return template.command.map((part) => (part === '{prompt}' ? prompt : part));
}

export class Runner {
  private readonly limits: RunnerLimits;
  private readonly inFlight = new Set<string>();
  readonly reports: JobReport[] = [];

  constructor(
    private readonly exchange: ExchangeClient,
    private readonly driver: ContainerDriver,
    private readonly opts: RunnerOptions,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
  }

  /** One poll: fetch jobs and process every job not already in flight, sequentially. */
  async poll(): Promise<JobReport[]> {
    const jobs = await this.exchange.jobs();
    const done: JobReport[] = [];
    for (const job of jobs) {
      const key = `${job.kind}:${job.taskId}`;
      if (this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      try {
        const report = await this.process(job);
        this.reports.push(report);
        done.push(report);
      } finally {
        this.inFlight.delete(key);
      }
    }
    return done;
  }

  async process(job: Job): Promise<JobReport> {
    const runId = `${job.kind === 'run' ? 'run' : 'base'}_${randomBytes(8).toString('hex')}`;
    const lines: string[] = [];
    const log = (m: string) => {
      lines.push(m);
      this.opts.log?.(`[${job.taskId}] ${m}`);
    };
    let attempts = 0;
    for (;;) {
      attempts += 1;
      try {
        const r = job.kind === 'run' ? await this.runJob(job, log) : await this.baselineJob(job, log);
        const secrets = Object.values(this.opts.providerKeys);
        const text = redact(lines.join('\n'), secrets);
        const posted = job.kind === 'run'
          ? await this.exchange.postResult({ kind: 'run', taskId: job.taskId, runId, outcome: r as RunOutcome, log: text, timestamp: this.opts.now?.() })
          : await this.exchange.postResult({ kind: 'baseline', taskId: job.taskId, runId, results: r as BaselineRun[], log: text, timestamp: this.opts.now?.() });
        return { job, runId, posted, attempts, log: text, ...(job.kind === 'run' ? { outcome: r as RunOutcome } : { results: r as BaselineRun[] }) };
      } catch (e) {
        if (!(e instanceof InfraError)) throw e;
        log(`infrastructure failure (attempt ${attempts}/${this.limits.infraRetries + 1}): ${e.message}`);
        if (attempts > this.limits.infraRetries) {
          const text = redact(lines.join('\n'), Object.values(this.opts.providerKeys));
          if (job.kind === 'run') {
            const posted = await this.exchange.postResult({ kind: 'run', taskId: job.taskId, runId, outcome: 'infra_error', log: text, timestamp: this.opts.now?.() });
            return { job, runId, posted, outcome: 'infra_error', attempts, log: text };
          }
          // A baseline that cannot run leaves the task pending for a later attempt; nothing is posted.
          return { job, runId, posted: null, attempts, log: text };
        }
      }
    }
  }

  private spec(job: Job, egress: string[], env: Record<string, string>): ContainerSpec {
    return { repo: job.repo, commit: job.commit, egressAllow: egress, env, cpus: this.opts.cpus ?? 2, memoryMb: this.opts.memoryMb ?? 4096, pids: this.opts.pids ?? 512, label: `${job.kind}:${job.taskId}` };
  }

  private async baselineJob(job: BaselineJob, log: (m: string) => void): Promise<BaselineRun[]> {
    log(`baseline: ${job.repo} @ ${job.commit}`);
    const container = await this.driver.create(this.spec(job, [], {}), { timeoutMs: this.limits.prepareTimeoutMs });
    try {
      const results: BaselineRun[] = [];
      for (let i = 1; i <= 3; i++) {
        const r = await container.shell(job.testCommand, { timeoutMs: this.limits.testTimeoutMs });
        const passed = r.exitCode === 0 && !r.timedOut;
        results.push(passed ? 'passed' : 'failed');
        log(`run ${i}: $ ${job.testCommand} → ${r.timedOut ? 'timeout' : `exit ${r.exitCode}`} (${r.durationMs} ms)`);
        log(tail(r.stdout + (r.stderr ? `\n${r.stderr}` : ''), 40));
      }
      log(`baseline: ${results.filter((x) => x === 'failed').length}/3 failing`);
      return results;
    } finally {
      await container.destroy();
    }
  }

  private async runJob(job: RunJob, log: (m: string) => void): Promise<RunOutcome> {
    const template = this.opts.agents[job.executorId];
    if (!template) throw new InfraError(`no command template for executor ${job.executorId}`);
    if (template.version !== job.executor.version) {
      log(`warning: task froze ${job.executorId} ${job.executor.version} but this runner has ${template.version} installed`);
    }
    const key = this.opts.providerKeys[template.keyEnv];
    if (!key) throw new InfraError(`no provider key in ${template.keyEnv} for ${job.executorId}`);
    log(`run: ${job.executorId} ${template.version} on ${job.repo} @ ${job.commit}`);
    const container = await this.driver.create(this.spec(job, [template.apiHost], { [template.keyEnv]: key }), { timeoutMs: this.limits.prepareTimeoutMs });
    let c: Container | null = container;
    try {
      const argv = renderCommand(template, job.prompt);
      log(`$ ${argv[0]} … (${argv.length - 1} args; prompt ${job.prompt.length} chars)`);
      const agent = await container.exec(argv, { timeoutMs: this.limits.wallClockMs, env: { [template.keyEnv]: key } });
      log(`agent exit ${agent.timedOut ? 'timeout' : agent.exitCode} after ${agent.durationMs} ms`);
      log(tail(agent.stdout + (agent.stderr ? `\n${agent.stderr}` : ''), 200));
      if (agent.timedOut) {
        log(`agent exceeded the wall-clock limit (${this.limits.wallClockMs} ms): failed (D5)`);
        return 'failed';
      }
      const protectedPaths = job.protectedPaths.length ? job.protectedPaths : await container.defaultProtectedPaths();
      const restored = await container.restorePaths(protectedPaths);
      log(`protected paths restored: ${restored.length ? restored.join(', ') : 'none changed'} (of ${protectedPaths.length} protected)`);
      const changed = await container.changedPaths();
      log(`changed files: ${changed.length ? changed.join(', ') : 'none'}`);
      const tests = await container.shell(job.testCommand, { timeoutMs: this.limits.testTimeoutMs });
      log(`$ ${job.testCommand} → ${tests.timedOut ? 'timeout' : `exit ${tests.exitCode}`} (${tests.durationMs} ms)`);
      log(tail(tests.stdout + (tests.stderr ? `\n${tests.stderr}` : ''), 200));
      return tests.exitCode === 0 && !tests.timedOut ? 'passed' : 'failed';
    } finally {
      await c?.destroy();
      c = null;
    }
  }
}

function tail(text: string, lines: number): string {
  const all = text.split('\n');
  return all.length <= lines ? text : `…(${all.length - lines} lines)\n${all.slice(-lines).join('\n')}`;
}
