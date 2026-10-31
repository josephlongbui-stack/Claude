/**
 * ContainerDriver: what the runner needs from a sandbox. One container per
 * job. The runner never inspects the host; everything happens through this
 * interface so FakeDriver (tests) and DockerDriver (real) are interchangeable.
 */
export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ContainerSpec {
  /** Repository URL or `github.com/org/repo` */
  repo: string;
  commit: string;
  /** Hosts the container may reach besides package registries (the agent's API host). */
  egressAllow: string[];
  /** Environment injected into the container (provider key etc.); never logged. */
  env: Record<string, string>;
  /** Resource limits. */
  cpus: number;
  memoryMb: number;
  pids: number;
  /** Working directory label for logs. */
  label: string;
}

export interface Container {
  readonly id: string;
  /** Run a command (argv, no shell) inside the repo checkout. */
  exec(argv: string[], opts: { timeoutMs: number; env?: Record<string, string> }): Promise<ExecResult>;
  /** Run a shell command string (the task's test command) inside the repo checkout. */
  shell(command: string, opts: { timeoutMs: number }): Promise<ExecResult>;
  /** `git status --porcelain` style list of changed paths since the pinned commit. */
  changedPaths(): Promise<string[]>;
  /** Restore the given paths from the pinned commit; returns the paths that had changed. */
  restorePaths(paths: string[]): Promise<string[]>;
  /** Paths matching the default protected set (tests, test config) in this repo. */
  defaultProtectedPaths(): Promise<string[]>;
  destroy(): Promise<void>;
}

export interface ContainerDriver {
  readonly name: string;
  /** Create a fresh container, clone the repo and check out the commit. Throws on infrastructure failure. */
  create(spec: ContainerSpec, opts: { timeoutMs: number }): Promise<Container>;
}

export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfraError';
  }
}
