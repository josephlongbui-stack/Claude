import { useEffect, useState } from 'preact/hooks';
import { api, countdown, when } from '../api.js';
import { AgentRow, Card, ErrorState, Pill, Skeleton } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Task({ ctx, id }: { ctx: Ctx; id: string }) {
  const [view, setView] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api('GET', `/api/tasks/${encodeURIComponent(id)}`)
      .then((v) => {
        setView(v);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  useEffect(() => {
    void load();
  }, [id, ctx.tick]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!view)
    return (
      <div class="card card-body">
        <Skeleton lines={6} />
      </div>
    );
  const t = view.task;
  const isCustomer = ctx.me && ctx.me.id === t.customer;
  const act = async (path: string, body?: unknown, msg?: string) => {
    setBusy(true);
    try {
      const v = await api('POST', path, body);
      setView(v);
      if (msg) ctx.toast(msg);
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    } finally {
      setBusy(false);
    }
  };
  const baseline = t.baseline ? `failing ${t.baseline.results.filter((r: string) => r === 'failed').length}/${t.baseline.results.length} before any agent` : t.status === 'pending' ? 'running now' : 'not required';
  const timing = t.status === 'pending' ? 'Trading opens after the baseline check' : t.status === 'rejected' ? 'Trading never opened' : t.status === 'open' ? `Trading closes in ${countdown(t.closesAt, Date.now())}` : `Trading closed ${when(t.closedAt)}`;
  const rec = view.recommendation ? view.markets.find((m: any) => m.executorId === view.recommendation.executorId) : null;
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div class="grow">
          <div class="row wrap" style="margin-bottom:8px">
            <Pill status={t.status} />
            {t.visibility === 'private' && <Pill status="private">private</Pill>}
            <span class="sr-only" data-testid="task-status">
              {t.status}
            </span>
          </div>
          <h1>{t.title}</h1>
          <p class="sub num">{timing}</p>
        </div>
        {isCustomer && t.status === 'open' && (
          <button disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/close`, undefined, 'Trading closed. Pick an agent to run.')} data-testid="close-trading">
            Close trading now
          </button>
        )}
      </div>
      <div class="split">
        <div class="stack" style="gap:16px">
          <Card title="Candidate agents" sub={rec ? <>Market favours <b>{rec.executor.name}</b> at {view.recommendation.chance}¢{t.status !== 'open' ? ' at close' : ''}</> : 'Markets open after the baseline check'} flush>
            {view.markets.map((m: any) => (
              <AgentRow m={m} chosen={t.chosenAgent === m.executorId} onOpen={() => (location.hash = `#/market/${encodeURIComponent(m.marketId)}`)} />
            ))}
            <div class="sr-only" data-testid="candidates">
              {view.markets.length} candidates
            </div>
          </Card>
          {t.corrections?.length > 0 && (
            <div class="callout warn" data-testid="corrections">
              Settlement corrected {t.corrections.length}×: {t.corrections.map((c: any) => `${c.from} → ${c.to} (${c.reason})`).join('; ')}
            </div>
          )}
          <Card title="Task packet" sub="What every trader and the runner see">
            <div class="stack">
              <div class="prompt">{t.prompt}</div>
              <dl class="kv">
                <dt>Repository</dt>
                <dd>
                  <span class="chip">
                    {t.repo} @ {t.commit}
                  </span>
                </dd>
                <dt>Test command</dt>
                <dd>
                  <span class="chip">{t.testCommand}</span>
                </dd>
                <dt>Protected paths</dt>
                <dd class="muted">{t.protectedPaths?.length ? t.protectedPaths.join(', ') : 'default test files and config'}</dd>
                <dt>Baseline</dt>
                <dd>{baseline}</dd>
                <dt>Auto-decide</dt>
                <dd>{t.autoDecide ? `yes, runs the favourite if it reaches ${t.minimumChance}¢` : 'no, the customer decides'}</dd>
              </dl>
            </div>
          </Card>
        </div>
        <div class="side stack" style="gap:16px">
          {t.status === 'resolved' && (
            <Card title="Result" testId="settlement">
              <div class="stack">
                <div class={`callout ${t.passed === null ? 'warn' : t.passed ? 'yes' : 'no'}`} style="font-weight:600">
                  {t.outcome === 'infra_error' ? 'Infrastructure error · settled at the closing price' : t.passed ? `${t.chosenAgent} passed · Yes paid 100¢` : `${t.chosenAgent} failed · No paid 100¢`}
                </div>
                <div>
                  <h3 style="margin-bottom:6px">Run log</h3>
                  <div class="log" data-testid="run-log">
                    {t.runLog}
                  </div>
                  {t.runLogSha256 && <p class="help code">sha256 {t.runLogSha256}</p>}
                </div>
              </div>
            </Card>
          )}
          {t.status === 'skipped' && (
            <Card title="Result">
              <div class="callout">Skipped by the customer. Every market settled at its closing price.</div>
            </Card>
          )}
          {t.status === 'rejected' && (
            <Card title="Rejected at the baseline" testId="rejected">
              <div class="stack">
                <div class="callout no">{t.rejectedReason === 'trivial' ? 'The tests already pass at the pinned commit.' : 'The tests are flaky at the pinned commit.'}</div>
                <div class="log">{t.baseline?.log}</div>
              </div>
            </Card>
          )}
          {t.status === 'pending' && (
            <Card title="Baseline check">
              <div class="callout warn" data-testid="baseline-pending">
                The runner is confirming the test command fails three times at {t.commit} before trading opens.
              </div>
            </Card>
          )}
          {t.status === 'running' && (
            <Card title="Running">
              <div class="callout warn">
                The runner is executing <b>{t.chosenAgent}</b> at {t.commit}. The market settles on its signed result.
              </div>
            </Card>
          )}
          {isCustomer && t.status === 'closed' && (
            <Card title="Decide" sub="Pick the agent to run, or hand the task to a human">
              <div class="stack">
                {view.markets.map((m: any) => (
                  <button class="primary block" disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: m.executorId }, `Running ${m.executorId}.`)} data-testid={`decide-${m.executorId}`}>
                    Run {m.executor.name} · {m.closingPrice}¢
                  </button>
                ))}
                <button class="ghost block" disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: null }, 'Skipped. Markets settled at their closing prices.')} data-testid="decide-skip">
                  Skip the run
                </button>
                <p class="help">Unchosen markets settle at their closing price; the chosen one settles on the test result.</p>
              </div>
            </Card>
          )}
          {!isCustomer && t.status === 'closed' && (
            <Card title="Waiting for the customer">
              <div class="callout">Trading has closed. The customer picks an agent to run, or skips.</div>
            </Card>
          )}
          <Card title="How it settles">
            <ol class="stack muted" style="margin:0;padding-left:18px;gap:6px;font-size:13.5px">
              <li>Markets open once three agent-free test runs fail at the pinned commit.</li>
              <li>Traders buy Yes or No per candidate until the window closes.</li>
              <li>The customer picks one agent; the others settle at their closing price.</li>
              <li>The runner executes the pick in a sandbox and signs the result: Yes pays 100¢ on a pass.</li>
            </ol>
            <p class="help">The customer never trades its own task. Anyone from an agent's maker cannot trade that agent.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
