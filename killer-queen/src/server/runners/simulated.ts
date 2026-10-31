/**
 * Simulated runner for the sandbox: settles a decided task in-process with a
 * deterministic outcome (D20). Never runs in live mode. Never trades.
 */
import { sha256, type Clock, type Venue } from '../../engine/index.js';

export interface SimulatedRunnerOptions {
  delayMs: number;
  /** Schedule function; tests pass one that records instead of timing. */
  schedule?: (fn: () => void, ms: number) => unknown;
  log?: (msg: string) => void;
}

export function simulatedOutcome(taskId: string, executorId: string, forceOutcome: 'pass' | 'fail' | null): 'passed' | 'failed' {
  if (forceOutcome === 'pass') return 'passed';
  if (forceOutcome === 'fail') return 'failed';
  const digest = sha256(`${taskId}:${executorId}`);
  const nibble = parseInt(digest[digest.length - 1]!, 16);
  return nibble % 2 === 0 ? 'passed' : 'failed';
}

export function simulatedBaseline(forceBaseline: 'trivial' | 'flaky' | null): ('passed' | 'failed')[] {
  if (forceBaseline === 'trivial') return ['passed', 'passed', 'passed'];
  if (forceBaseline === 'flaky') return ['failed', 'passed', 'failed'];
  return ['failed', 'failed', 'failed'];
}

export class SimulatedRunner {
  /** keyed `run:<taskId>` or `baseline:<taskId>` */
  private readonly pending = new Map<string, () => void>();
  private unsubscribe: (() => void) | null = null;
  private runs = 0;

  constructor(
    private readonly venue: Venue,
    private readonly clock: Clock,
    private readonly opts: SimulatedRunnerOptions,
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    // Tasks already waiting when we start (after a restart) still need a result.
    for (const t of this.venue.engine.state.tasks.values()) {
      if (t.status === 'running') this.enqueue('run', t.id);
      if (t.status === 'pending') this.enqueue('baseline', t.id);
    }
    this.unsubscribe = this.venue.onApplied((cmd, result) => {
      if (!result.ok) return;
      if (cmd.type === 'decide' && cmd.executorId !== null) this.enqueue('run', cmd.taskId);
      if (cmd.type === 'createTask' && (result.data as { task: { status: string; id: string } }).task.status === 'pending') {
        this.enqueue('baseline', (result.data as { task: { id: string } }).task.id);
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending.clear();
  }

  /** Jobs queued but not yet reported, as `run:<taskId>` / `baseline:<taskId>`. */
  get queued(): string[] {
    return [...this.pending.keys()];
  }

  /** Run every queued job now (tests). */
  flush(): number {
    let n = 0;
    for (const [taskId, run] of [...this.pending]) {
      this.pending.delete(taskId);
      run();
      n += 1;
    }
    return n;
  }

  private enqueue(kind: 'run' | 'baseline', taskId: string): void {
    const key = `${kind}:${taskId}`;
    if (this.pending.has(key)) return;
    const run = () => (kind === 'run' ? this.run(taskId) : this.baseline(taskId));
    this.pending.set(key, run);
    const schedule = this.opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    schedule(() => {
      if (this.pending.get(key) === run) {
        this.pending.delete(key);
        run();
      }
    }, this.opts.delayMs);
  }

  private baseline(taskId: string): void {
    const task = this.venue.engine.task(taskId);
    if (!task || task.status !== 'pending') return;
    const results = simulatedBaseline(task.forceBaseline);
    this.runs += 1;
    const log = [
      `[simulated runner] baseline ${new Date(this.clock.now()).toISOString()}`,
      `repo ${task.repo} @ ${task.commit}`,
      ...results.map((r, i) => `run ${i + 1}: $ ${task.testCommand} → ${r === 'failed' ? 'exit 1' : 'exit 0'}`),
      'note: no code was run; this is the sandbox simulation (D20)',
    ].join('\n');
    const r = this.venue.apply({ type: 'baseline', taskId: task.id, results, log, runId: `sim-base-${task.id}-${this.runs}` });
    if (!r.ok) this.opts.log?.(`simulated runner: baseline ${task.id} rejected: ${r.code} ${r.error}`);
    else this.opts.log?.(`simulated runner: baseline ${task.id} ${r.data.opened ? 'opened markets' : `rejected (${r.data.rejectedReason})`}`);
  }

  private run(taskId: string): void {
    const task = this.venue.engine.task(taskId);
    if (!task || task.status !== 'running' || !task.chosenAgent) return;
    const outcome = simulatedOutcome(task.id, task.chosenAgent, task.forceOutcome);
    this.runs += 1;
    const runId = `sim-${task.id}-${this.runs}`;
    const started = new Date(this.clock.now()).toISOString();
    const log = [
      `[simulated runner] ${started}`,
      `task ${task.id} · executor ${task.chosenAgent} (${task.candidateVersions[task.chosenAgent] ?? '?'})`,
      `repo ${task.repo} @ ${task.commit}`,
      `$ ${task.testCommand}`,
      outcome === 'passed' ? 'tests passed (exit 0)' : 'tests failed (exit 1)',
      'note: no code was run; this is the sandbox simulation (D20)',
    ].join('\n');
    const r = this.venue.apply({ type: 'settle', taskId: task.id, outcome, log, runId });
    if (!r.ok) this.opts.log?.(`simulated runner: settle ${task.id} rejected: ${r.code} ${r.error}`);
    else this.opts.log?.(`simulated runner: ${task.id} ${outcome}`);
  }
}
