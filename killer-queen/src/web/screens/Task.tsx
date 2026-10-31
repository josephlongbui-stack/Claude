import { useEffect, useState } from 'preact/hooks';
import { api, countdown, when } from '../api.js';
import { AgentRow, ErrorState, Pill, Skeleton } from '../components/index.js';
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
      <div class="panel">
        <Skeleton lines={5} />
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
  const baseline = t.baseline ? `failing ${t.baseline.results.filter((r: string) => r === 'failed').length}/${t.baseline.results.length}` : t.status === 'pending' ? 'running (3 agent-free test runs must fail)' : 'not run';
  const trading = t.status === 'pending' ? 'opens after the baseline' : t.status === 'rejected' ? 'never opened' : t.status === 'open' ? `closes in ${countdown(t.closesAt, Date.now())}` : `closed ${when(t.closedAt)}`;
  return (
    <div>
      <h1>
        {t.title} <Pill status={t.status} /> {t.visibility === 'private' && <Pill status="pending">private</Pill>}
        <span class="sr-only" data-testid="task-status">
          {t.status}
        </span>
      </h1>
      <div class="grid cols-3">
        <div class="panel packet">
          <h2>Packet</h2>
          <div class="mono">{t.prompt}</div>
          <dl>
            <dt>Repo</dt>
            <dd class="mono">
              {t.repo} @ {t.commit}
            </dd>
            <dt>Test command</dt>
            <dd class="mono">{t.testCommand}</dd>
            <dt>Protected</dt>
            <dd class="mono">{t.protectedPaths?.length ? t.protectedPaths.join(', ') : 'default test paths'}</dd>
            <dt>Baseline</dt>
            <dd>{baseline}</dd>
            <dt>Trading</dt>
            <dd class="num">{trading}</dd>
            <dt>Auto-decide</dt>
            <dd>{t.autoDecide ? `yes, needs ≥ ${t.minimumChance}¢` : 'no'}</dd>
          </dl>
        </div>
        <div class="panel">
          <h2>Candidates</h2>
          <div class="scroll-x">
            <table data-testid="candidates" aria-label="Candidate agents">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th class="r">Chance</th>
                  <th class="r">Bid/Ask</th>
                  <th class="r">Vol</th>
                  <th class="r">Traders</th>
                </tr>
              </thead>
              <tbody>
                {view.markets.map((m: any) => (
                  <AgentRow m={m} chosen={t.chosenAgent === m.executorId} onOpen={() => (location.hash = `#/market/${encodeURIComponent(m.marketId)}`)} />
                ))}
              </tbody>
            </table>
          </div>
          {view.recommendation && (
            <p>
              Market recommendation: <b class="mono">{view.recommendation.executorId}</b> at <span class="num">{view.recommendation.chance}¢</span>
            </p>
          )}
        </div>
        <div class="panel">
          <h2>Decision</h2>
          {t.status === 'pending' && (
            <p class="warn-c" data-testid="baseline-pending">
              Baseline check running: the runner confirms the test command fails at {t.commit} three times before trading opens.
            </p>
          )}
          {t.status === 'rejected' && (
            <div data-testid="rejected">
              <p class="no-c" style="font-size:16px;font-weight:700">Rejected: {t.rejectedReason === 'trivial' ? 'the tests already pass at the pinned commit' : 'the tests are flaky at the pinned commit'}</p>
              <h2>Baseline log</h2>
              <div class="mono" style="max-height:300px;overflow:auto">
                {t.baseline?.log}
              </div>
            </div>
          )}
          {!isCustomer && t.status !== 'rejected' && <p class="muted">Only the customer ({t.customer}) can close trading and decide. The customer never trades its own task.</p>}
          {isCustomer && t.status === 'open' && (
            <p>
              <button disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/close`, undefined, 'Trading closed.')} data-testid="close-trading">
                Close trading now
              </button>
            </p>
          )}
          {isCustomer && t.status === 'closed' && (
            <div>
              <p>Pick the agent to run, or skip and hand the task to a human. Unchosen markets settle at their closing price.</p>
              {view.markets.map((m: any) => (
                <p>
                  <button class="primary" disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: m.executorId }, `Running ${m.executorId}.`)} data-testid={`decide-${m.executorId}`}>
                    Run {m.executorId} ({m.closingPrice}¢)
                  </button>
                </p>
              ))}
              <p>
                <button disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: null }, 'Skipped.')} data-testid="decide-skip">
                  Skip the run
                </button>
              </p>
            </div>
          )}
          {t.status === 'running' && (
            <p class="warn-c">
              Runner is executing <span class="mono">{t.chosenAgent}</span> at {t.commit}…
            </p>
          )}
          {t.status === 'resolved' && (
            <div data-testid="settlement">
              <p class={t.passed === null ? 'warn-c' : t.passed ? 'yes-c' : 'no-c'} style="font-size:16px;font-weight:700">
                {t.outcome === 'infra_error' ? 'Infrastructure error: settled at the closing price' : t.passed ? 'Tests passed · Yes paid 100¢' : 'Tests failed · No paid 100¢'}
              </p>
              <h2>Run log</h2>
              <div class="mono" style="max-height:300px;overflow:auto" data-testid="run-log">
                {t.runLog}
              </div>
              {t.runLogSha256 && <p class="muted mono">sha256 {t.runLogSha256}</p>}
            </div>
          )}
          {t.status === 'skipped' && <p class="muted">Skipped: every market settled at its closing price.</p>}
        </div>
      </div>
    </div>
  );
}
