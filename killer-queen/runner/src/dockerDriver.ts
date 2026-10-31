/**
 * Docker-backed sandbox (D1, D3, D5): fresh container per job, non-root,
 * CPU/memory/pids limits, network through a per-job internal network whose
 * only exit is an egress proxy allowlist. Shells out to the docker CLI. Not
 * exercised by the automated tests (no Docker on the build host); see
 * runner/SANDBOX.md for what it does and does not defend against.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { InfraError, type Container, type ContainerDriver, type ContainerSpec, type ExecResult } from './driver.js';

export interface DockerDriverOptions {
  image: string; // e.g. ghcr.io/example/kq-runner:node22-python312
  /** Image that runs an HTTP CONNECT proxy honouring ALLOW_HOSTS (comma separated). */
  proxyImage: string;
  registries: string[]; // always-allowed hosts: registry.npmjs.org, pypi.org, files.pythonhosted.org, proxy.golang.org, ...
  docker?: string; // binary
  log?: (msg: string) => void;
}

function run(bin: string, args: string[], opts: { timeoutMs: number; input?: string; env?: NodeJS.ProcessEnv } = { timeoutMs: 60_000 }): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = execFile(bin, args, { timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024, env: opts.env ?? process.env, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      const timedOut = !!(err && (err as { killed?: boolean }).killed);
      const code = err ? ((err as { code?: number | string }).code as number | undefined) ?? null : 0;
      resolve({ exitCode: timedOut ? null : typeof code === 'number' ? code : code === null ? null : 1, stdout: String(stdout), stderr: String(stderr), timedOut, durationMs: Date.now() - started });
    });
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

export class DockerDriver implements ContainerDriver {
  readonly name = 'docker';
  private readonly docker: string;

  constructor(private readonly opts: DockerDriverOptions) {
    this.docker = opts.docker ?? 'docker';
  }

  async create(spec: ContainerSpec, o: { timeoutMs: number }): Promise<Container> {
    const id = `kq-${randomBytes(6).toString('hex')}`;
    const net = `${id}-net`;
    const d = this.docker;
    const must = async (args: string[], timeoutMs = 60_000) => {
      const r = await run(d, args, { timeoutMs });
      if (r.exitCode !== 0) throw new InfraError(`docker ${args[0]} failed: ${r.stderr.trim().slice(0, 500)}`);
      return r;
    };
    // 1. Internal network: containers on it cannot reach the outside except through the proxy.
    await must(['network', 'create', '--internal', net]);
    // 2. Egress proxy with the allowlist; it is the only container on both the internal network and the default bridge.
    const allow = [...new Set([...this.opts.registries, ...spec.egressAllow])].join(',');
    await must(['run', '-d', '--name', `${id}-proxy`, '--network', net, '--network-alias', 'egress', '-e', `ALLOW_HOSTS=${allow}`, this.opts.proxyImage]);
    await must(['network', 'connect', 'bridge', `${id}-proxy`]);
    // 3. The job container: non-root, limits, no capabilities, read-only root with a writable workspace.
    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(spec.env)) envArgs.push('-e', `${k}=${v}`);
    await must([
      'run', '-d', '--name', id, '--network', net,
      '--user', '1000:1000', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--cpus', String(spec.cpus), '--memory', `${spec.memoryMb}m`, '--pids-limit', String(spec.pids),
      '--read-only', '--tmpfs', '/tmp:rw,size=512m', '--tmpfs', '/home/runner:rw,size=2g',
      '-e', 'HOME=/home/runner', '-e', 'HTTP_PROXY=http://egress:3128', '-e', 'HTTPS_PROXY=http://egress:3128', '-e', 'NO_PROXY=',
      ...envArgs,
      '-w', '/home/runner/repo', this.opts.image, 'sleep', 'infinity',
    ]);
    const exec = async (argv: string[], eo: { timeoutMs: number; env?: Record<string, string> }): Promise<ExecResult> => {
      const extra: string[] = [];
      for (const [k, v] of Object.entries(eo.env ?? {})) extra.push('-e', `${k}=${v}`);
      return run(d, ['exec', ...extra, id, ...argv], { timeoutMs: eo.timeoutMs });
    };
    const shell = (command: string, so: { timeoutMs: number }) => exec(['sh', '-lc', command], so);
    // 4. Clone and check out (through the proxy; GitHub must be in the registries list for clones).
    const repoUrl = /^https?:\/\//.test(spec.repo) ? spec.repo : `https://${spec.repo}`;
    const clone = await exec(['sh', '-lc', `git clone --quiet ${JSON.stringify(repoUrl)} /home/runner/repo && cd /home/runner/repo && git checkout --quiet ${JSON.stringify(spec.commit)}`], { timeoutMs: o.timeoutMs });
    if (clone.exitCode !== 0) {
      await this.cleanup(id, net);
      throw new InfraError(`clone/checkout failed: ${clone.stderr.trim().slice(0, 500)}`);
    }
    const container: Container = {
      id,
      exec,
      shell,
      changedPaths: async () => {
        const r = await shell('git status --porcelain=v1 --untracked-files=all', { timeoutMs: 60_000 });
        return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).trim()).sort();
      },
      restorePaths: async (paths) => {
        if (paths.length === 0) return [];
        const changed = await container.changedPaths();
        const hit = changed.filter((p) => paths.some((pp) => (pp.endsWith('/') ? p.startsWith(pp) : p === pp)));
        for (const p of paths) {
          await shell(`git checkout --quiet -- ${JSON.stringify(p)} 2>/dev/null; git clean -fdq -- ${JSON.stringify(p)} 2>/dev/null; true`, { timeoutMs: 60_000 });
        }
        return hit;
      },
      defaultProtectedPaths: async () => {
        const r = await shell(
          "git ls-files | grep -E '(^|/)(tests?|__tests__|spec|specs)/|(^|/)[^/]*(\\.test\\.|\\.spec\\.|_test\\.)|(^|/)(conftest\\.py|pytest\\.ini|setup\\.cfg|tox\\.ini|jest\\.config\\.[cm]?[jt]s|vitest\\.config\\.[cm]?[jt]s|package\\.json|go\\.mod|Cargo\\.toml)$' | sed -E 's#^((.*/)?(tests?|__tests__|specs?)/).*#\\1#' | sort -u",
          { timeoutMs: 60_000 },
        );
        return r.stdout.split('\n').filter(Boolean);
      },
      destroy: () => this.cleanup(id, net),
    };
    return container;
  }

  private async cleanup(id: string, net: string): Promise<void> {
    const d = this.docker;
    await run(d, ['rm', '-f', id], { timeoutMs: 60_000 });
    await run(d, ['rm', '-f', `${id}-proxy`], { timeoutMs: 60_000 });
    await run(d, ['network', 'rm', net], { timeoutMs: 60_000 });
  }
}
