/**
 * GitHub app (5.3): a customer installs the app on a repo and submits a task
 * from an issue or pull-request comment (`/kq task`); the exchange posts the
 * odds back as a check run and settles the check when the run finishes.
 * The GitHub identity never trades: this module creates tasks, closes and
 * decides them for the installing org's customer account, nothing else.
 */
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import type { Request, Response, Router } from 'express';
import { taskView, type Clock, type Venue } from '../engine/index.js';
import type { AuthedRequest } from './auth.js';
import { HttpError } from './errors.js';

export interface GitHubAppConfig {
  appId: string;
  privateKey: string; // PEM
  webhookSecret: string;
  /** installation id → customer account id */
  installations: Record<string, string>;
  defaultTestCommand: string;
  defaultAgents: string[];
  /** Public URL of the exchange, for links in comments and check runs. */
  publicUrl: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/* ---------------- app authentication ---------------- */

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** RS256 JWT for the app (iss = app id, valid 9 minutes, issued 60 s in the past for clock skew). */
export function appJwt(appId: string, privateKeyPem: string, nowMs: number): string {
  const now = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const sig = b64url(signer.sign(privateKeyPem.replace(/\\n/g, '\n')));
  return `${header}.${payload}.${sig}`;
}

export class GitHubAppClient {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(
    private readonly cfg: Pick<GitHubAppConfig, 'appId' | 'privateKey' | 'apiBase' | 'fetchImpl'>,
    private readonly clock: Clock,
  ) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.apiBase = cfg.apiBase ?? 'https://api.github.com';
  }

  async installationToken(installationId: string): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt - this.clock.now() > 60_000) return cached.token;
    const res = await this.fetchImpl(`${this.apiBase}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { authorization: `Bearer ${appJwt(this.cfg.appId, this.cfg.privateKey, this.clock.now())}`, accept: 'application/vnd.github+json', 'user-agent': 'killer-queen-app' },
    });
    if (!res.ok) throw new Error(`installation token: HTTP ${res.status}`);
    const body = (await res.json()) as { token: string; expires_at: string };
    this.tokens.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) });
    return body.token;
  }

  async request<T>(installationId: string, method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.installationToken(installationId);
    const res = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'killer-queen-app', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

/* ---------------- webhook handling ---------------- */

export function verifyWebhookSignature(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export interface KqCommand {
  verb: 'task' | 'decide' | 'help';
  args: string[];
  options: Record<string, string>;
}

/** Parse `/kq task --test "pytest tests/" --agents codex,claude-code --minutes 15` or `/kq decide codex|skip`. */
export function parseKqCommand(body: string | null | undefined): KqCommand | null {
  const line = (body ?? '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('/kq'));
  if (!line) return null;
  const tokens = line.slice(3).trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const unq = (t: string) => t.replace(/^["']|["']$/g, '');
  const verb = unq(tokens[0] ?? 'help');
  if (verb !== 'task' && verb !== 'decide' && verb !== 'help') return { verb: 'help', args: [], options: {} };
  const args: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.startsWith('--')) {
      options[t.slice(2)] = unq(tokens[i + 1] ?? '');
      i += 1;
    } else args.push(unq(t));
  }
  return { verb, args, options };
}

interface WebhookIssueComment {
  action: string;
  installation?: { id: number };
  repository: { full_name: string; html_url: string; default_branch: string; owner: { login: string }; name: string };
  issue: { number: number; title: string; body: string | null; html_url: string; pull_request?: { url: string } };
  comment: { id: number; body: string; html_url: string; user: { login: string; type: string } };
}

export interface WebhookOutcome {
  status: 'ignored' | 'created' | 'decided' | 'refused' | 'error';
  reason: string;
  taskId?: string;
}

interface CheckRef {
  installationId: string;
  owner: string;
  repo: string;
  checkRunId: number;
}

export class GitHubIntegration {
  readonly client: GitHubAppClient;
  private readonly deliveries = new Set<string>();
  /** taskId → check run to update as the task progresses (in memory; a restart stops updates for older tasks). */
  private readonly checks = new Map<string, CheckRef>();
  private readonly log: (msg: string) => void;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly cfg: GitHubAppConfig,
    private readonly venue: Venue,
    private readonly clock: Clock,
  ) {
    this.client = new GitHubAppClient(cfg, clock);
    this.log = cfg.log ?? (() => undefined);
  }

  /** Post odds back when a GitHub-created task closes, decides or settles. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.venue.onApplied((cmd, result) => {
      if (!result.ok) return;
      if (cmd.type !== 'closeTask' && cmd.type !== 'decide' && cmd.type !== 'settle' && cmd.type !== 'baseline') return;
      const ref = this.checks.get(cmd.taskId);
      if (!ref) return;
      void this.updateCheck(cmd.taskId, ref).catch((e) => this.log(`check run update failed: ${(e as Error).message}`));
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private customerFor(installationId: number | undefined): string | null {
    if (installationId === undefined) return null;
    const id = this.cfg.installations[String(installationId)];
    if (!id) return null;
    const acct = this.venue.engine.account(id);
    return acct && (acct.role === 'customer' || acct.role === 'admin') ? id : null;
  }

  async handle(event: string, deliveryId: string, payload: unknown): Promise<WebhookOutcome> {
    if (this.deliveries.has(deliveryId)) return { status: 'ignored', reason: 'duplicate delivery' };
    this.deliveries.add(deliveryId);
    if (this.deliveries.size > 10_000) this.deliveries.delete(this.deliveries.values().next().value!);
    if (event === 'ping') return { status: 'ignored', reason: 'ping' };
    if (event !== 'issue_comment') return { status: 'ignored', reason: `event ${event} not handled` };
    const p = payload as WebhookIssueComment;
    if (p.action !== 'created') return { status: 'ignored', reason: `comment ${p.action}` };
    if (p.comment.user.type === 'Bot') return { status: 'ignored', reason: 'bot comment' };
    const cmd = parseKqCommand(p.comment.body);
    if (!cmd) return { status: 'ignored', reason: 'no /kq command' };
    const customer = this.customerFor(p.installation?.id);
    if (!customer) return { status: 'refused', reason: 'installation is not mapped to a customer account' };
    const installationId = String(p.installation!.id);
    try {
      if (cmd.verb === 'task') return await this.createTask(installationId, customer, p, cmd);
      if (cmd.verb === 'decide') return await this.decide(installationId, customer, p, cmd);
      await this.comment(installationId, p, 'Commands: `/kq task [--test "<command>"] [--agents a,b] [--minutes N] [--private]`, `/kq decide <agent|skip>`.');
      return { status: 'ignored', reason: 'help' };
    } catch (e) {
      this.log(`webhook error: ${(e as Error).message}`);
      return { status: 'error', reason: (e as Error).message };
    }
  }

  private source(p: WebhookIssueComment): string {
    return p.issue.html_url;
  }

  private async createTask(installationId: string, customer: string, p: WebhookIssueComment, cmd: KqCommand): Promise<WebhookOutcome> {
    const { owner, name } = p.repository;
    const existing = [...this.venue.engine.state.tasks.values()].find((t) => t.source === this.source(p));
    if (existing) return { status: 'refused', reason: `task ${existing.id} already exists for this issue`, taskId: existing.id };
    let commit: string;
    let isPr = false;
    if (p.issue.pull_request) {
      isPr = true;
      const pr = await this.client.request<{ head: { sha: string } }>(installationId, 'GET', `/repos/${owner.login}/${name}/pulls/${p.issue.number}`);
      commit = pr.head.sha;
    } else {
      const c = await this.client.request<{ sha: string }>(installationId, 'GET', `/repos/${owner.login}/${name}/commits/${encodeURIComponent(p.repository.default_branch)}`);
      commit = c.sha;
    }
    const testCommand = cmd.options['test'] || this.cfg.defaultTestCommand;
    const candidateAgents = (cmd.options['agents'] ? cmd.options['agents'].split(',').map((a) => a.trim()).filter(Boolean) : this.cfg.defaultAgents).filter((a) => this.venue.engine.state.executors.has(a));
    const minutes = Number(cmd.options['minutes'] ?? 10);
    const r = this.venue.apply({
      type: 'createTask',
      customer,
      title: `${p.repository.full_name}#${p.issue.number}: ${p.issue.title}`.slice(0, 200),
      prompt: `${p.issue.title}\n\n${p.issue.body ?? ''}`.trim().slice(0, 20_000),
      repo: `github.com/${p.repository.full_name}`,
      commit,
      testCommand,
      candidateAgents,
      tradingWindowMs: Math.max(1, Math.min(60 * 24, minutes || 10)) * 60_000,
      autoDecide: false,
      requireBaseline: true,
      source: this.source(p),
      visibility: 'private' in cmd.options ? 'private' : 'public',
    });
    if (!r.ok) {
      await this.comment(installationId, p, `Killer Queen could not open markets: ${r.error} (\`${r.code}\`).`);
      return { status: 'refused', reason: `${r.code}: ${r.error}` };
    }
    const taskId = r.data.task.id;
    const url = `${this.cfg.publicUrl}/#/task/${encodeURIComponent(taskId)}`;
    if (isPr) {
      const check = await this.client.request<{ id: number }>(installationId, 'POST', `/repos/${owner.login}/${name}/check-runs`, {
        name: 'Killer Queen odds',
        head_sha: commit,
        status: 'in_progress',
        details_url: url,
        output: { title: 'Markets opening', summary: `Baseline check running; trading opens for ${minutes} minutes on ${candidateAgents.join(', ')}.` },
      });
      this.checks.set(taskId, { installationId, owner: owner.login, repo: name, checkRunId: check.id });
    }
    await this.comment(installationId, p, `Killer Queen opened markets for this ${isPr ? 'pull request' : 'issue'} at \`${commit.slice(0, 7)}\`: ${url}\nCandidates: ${candidateAgents.map((a) => `\`${a}\``).join(', ')} · test: \`${testCommand}\` · trading ${minutes} min.\nWhen trading closes, comment \`/kq decide <agent>\` or \`/kq decide skip\`.`);
    return { status: 'created', reason: 'task opened', taskId };
  }

  private async decide(installationId: string, customer: string, p: WebhookIssueComment, cmd: KqCommand): Promise<WebhookOutcome> {
    const task = [...this.venue.engine.state.tasks.values()].find((t) => t.source === this.source(p));
    if (!task) return { status: 'refused', reason: 'no task for this issue' };
    if (task.customer !== customer) return { status: 'refused', reason: 'this installation did not submit the task' };
    const choice = cmd.args[0];
    if (!choice) return { status: 'refused', reason: 'usage: /kq decide <agent|skip>' };
    if (task.status === 'open') {
      const c = this.venue.apply({ type: 'closeTask', taskId: task.id, by: customer });
      if (!c.ok) return { status: 'refused', reason: `${c.code}: ${c.error}` };
    }
    const d = this.venue.apply({ type: 'decide', taskId: task.id, executorId: choice === 'skip' ? null : choice, by: customer });
    if (!d.ok) {
      await this.comment(installationId, p, `Killer Queen could not decide: ${d.error} (\`${d.code}\`).`);
      return { status: 'refused', reason: `${d.code}: ${d.error}`, taskId: task.id };
    }
    const view = taskView(this.venue.engine, task.id);
    const odds = view.markets.map((m) => `\`${m.executorId}\` ${m.closingPrice ?? m.quote.chance}¢`).join(' · ');
    await this.comment(installationId, p, choice === 'skip' ? `Skipped: all markets settled at their closing prices (${odds}).` : `Running \`${choice}\`. Closing odds: ${odds}. Other markets settled at their closing prices.`);
    return { status: 'decided', reason: choice, taskId: task.id };
  }

  private async comment(installationId: string, p: WebhookIssueComment, body: string): Promise<void> {
    await this.client.request(installationId, 'POST', `/repos/${p.repository.owner.login}/${p.repository.name}/issues/${p.issue.number}/comments`, { body });
  }

  private async updateCheck(taskId: string, ref: CheckRef): Promise<void> {
    const view = taskView(this.venue.engine, taskId);
    const t = view.task;
    const odds = view.markets.map((m) => `${m.executorId}: ${m.status === 'settled' ? m.settlementPrice : (m.closingPrice ?? m.quote.chance)}¢${m.outcome ? ` (${m.outcome})` : ''}`).join('\n');
    let body: Record<string, unknown>;
    if (t.status === 'resolved') {
      body = { status: 'completed', conclusion: t.passed === null ? 'neutral' : t.passed ? 'success' : 'failure', output: { title: t.passed === null ? 'Infrastructure error' : t.passed ? `${t.chosenAgent} passed` : `${t.chosenAgent} failed`, summary: odds } };
    } else if (t.status === 'skipped' || t.status === 'rejected') {
      body = { status: 'completed', conclusion: 'neutral', output: { title: t.status === 'skipped' ? 'Skipped: handed to a human' : `Rejected: ${t.rejectedReason}`, summary: odds } };
    } else {
      body = { status: 'in_progress', output: { title: t.status === 'running' ? `Running ${t.chosenAgent}` : t.status === 'closed' ? 'Trading closed: decide' : 'Trading open', summary: odds } };
    }
    await this.client.request(ref.installationId, 'PATCH', `/repos/${ref.owner}/${ref.repo}/check-runs/${ref.checkRunId}`, body);
    if (t.status === 'resolved' || t.status === 'skipped' || t.status === 'rejected') this.checks.delete(taskId);
  }
}

/** Mount POST /github/webhook on an API router. */
export function mountGitHubWebhook(api: Router, integration: GitHubIntegration, secret: string): void {
  api.post('/github/webhook', (req: Request, res: Response, next) => {
    const raw = (req as AuthedRequest).rawBody ?? Buffer.alloc(0);
    const sig = req.headers['x-hub-signature-256'];
    if (!verifyWebhookSignature(secret, raw, typeof sig === 'string' ? sig : undefined)) return next(new HttpError(401, 'bad_signature', 'x-hub-signature-256 does not match'));
    const event = typeof req.headers['x-github-event'] === 'string' ? req.headers['x-github-event'] : 'unknown';
    const delivery = typeof req.headers['x-github-delivery'] === 'string' ? req.headers['x-github-delivery'] : `${Date.now()}-${Math.random()}`;
    integration
      .handle(event, delivery, req.body)
      .then((outcome) => res.status(outcome.status === 'error' ? 500 : 202).json(outcome))
      .catch(next);
  });
}
