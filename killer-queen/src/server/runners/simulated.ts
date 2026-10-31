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

export class SimulatedRunner {
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
    // Tasks already running when we start (after a restart) still need a result.
    for (const t of this.venue.engine.state.tasks.values()) if (t.status === 'running') this.enqueue(t.id);
    this.unsubscribe = this.venue.onApplied((cmd, result) => {
      if (cmd.type === 'decide' && result.ok && cmd.executorId !== null) this.enqueue(cmd.taskId);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending.clear();
  }

  /** Tasks queued but not yet settled. */
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

  private enqueue(taskId: string): void {
    if (this.pending.has(taskId)) return;
    const run = () => this.run(taskId);
    this.pending.set(taskId, run);
    const schedule = this.opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    schedule(() => {
      if (this.pending.get(taskId) === run) {
        this.pending.delete(taskId);
        run();
      }
    }, this.opts.delayMs);
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
