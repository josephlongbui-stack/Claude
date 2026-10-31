/**
 * Scripted in-memory sandbox for tests and the laptop. A script decides what
 * the agent and the tests do per job; nothing is executed.
 */
import { InfraError, type Container, type ContainerDriver, type ContainerSpec, type ExecResult } from './driver.js';

export interface FakeScript {
  /** Exit codes for successive test-command runs (baseline runs, then the post-agent run). */
  testExitCodes?: number[];
  /** What the agent run does. */
  agent?: { exitCode?: number; stdout?: string; stderr?: string; timedOut?: boolean; editsProtected?: string[]; durationMs?: number };
  /** Throw an InfraError on create() this many times before succeeding. */
  createFailures?: number;
  /** Simulate a test-command timeout on these run indexes. */
  testTimeouts?: number[];
  defaultProtectedPaths?: string[];
}

export class FakeDriver implements ContainerDriver {
  readonly name = 'fake';
  readonly created: ContainerSpec[] = [];
  readonly destroyed: string[] = [];
  private n = 0;

  constructor(private readonly scriptFor: (spec: ContainerSpec) => FakeScript) {}

  async create(spec: ContainerSpec): Promise<Container> {
    const script = this.scriptFor(spec);
    const failures = script.createFailures ?? 0;
    const seen = this.created.filter((c) => c.label === spec.label).length;
    this.created.push(spec);
    if (seen < failures) throw new InfraError(`fake: container failed to start (attempt ${seen + 1})`);
    const id = `fake-${++this.n}`;
    let testRuns = 0;
    const changed = new Set<string>();
    const container: Container = {
      id,
      exec: async (argv, opts) => {
        const a = script.agent ?? {};
        for (const p of a.editsProtected ?? []) changed.add(p);
        changed.add('src/app.ts');
        const stdout = `${a.stdout ?? `[fake agent] ran ${argv[0]} with ${argv.length - 1} args`}\nkey=${opts.env?.[Object.keys(opts.env ?? {})[0] ?? ''] ?? ''}`;
        return { exitCode: a.timedOut ? null : (a.exitCode ?? 0), stdout, stderr: a.stderr ?? '', timedOut: a.timedOut ?? false, durationMs: a.durationMs ?? 1234 };
      },
      shell: async (command, opts): Promise<ExecResult> => {
        const i = testRuns++;
        const timedOut = (script.testTimeouts ?? []).includes(i);
        const code = timedOut ? null : (script.testExitCodes?.[i] ?? 1);
        return { exitCode: code, stdout: `$ ${command}\n${code === 0 ? 'ok' : 'FAIL'}`, stderr: '', timedOut, durationMs: timedOut ? opts.timeoutMs : 42 };
      },
      changedPaths: async () => [...changed].sort(),
      restorePaths: async (paths) => {
        // Same matching as DockerDriver: a trailing slash protects a whole directory.
        const restored = [...changed].filter((c) => paths.some((p) => (p.endsWith('/') ? c.startsWith(p) : c === p))).sort();
        for (const p of restored) changed.delete(p);
        return restored;
      },
      defaultProtectedPaths: async () => script.defaultProtectedPaths ?? ['tests/', 'package.json'],
      destroy: async () => {
        this.destroyed.push(id);
      },
    };
    return container;
  }
}
