import { useEffect, useState } from 'preact/hooks';
import { api, countdown, when } from '../api.js';
import type { Ctx } from '../main.js';

export function Task({ ctx, id }: { ctx: Ctx; id: string }) {
  const [view, setView] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('GET', `/api/tasks/${encodeURIComponent(id)}`)
      .then((v) => {
        setView(v);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  }, [id, ctx.tick]);
  if (err) return <div class="empty no-c">{err}</div>;
  if (!view) return <div class="empty">Loading…</div>;
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
  return (
    <div>
      <h1>
        {t.title} <span class={`pill ${t.status}`} data-testid="task-status">{t.status}</span>
      </h1>
      <div class="grid cols-3">
        <div class="panel">
          <h2>Packet</h2>
          <div class="mono">{t.prompt}</div>
          <table style="margin-top:8px">
            <tr>
              <th>Repo</th>
              <td class="mono">
                {t.repo} @ {t.commit}
              </td>
            </tr>
            <tr>
              <th>Test command</th>
              <td class="mono">{t.testCommand}</td>
            </tr>
            <tr>
              <th>Baseline</th>
              <td>{t.baseline ? `failing ${t.baseline.results.filter((r: string) => r === 'failed').length}/${t.baseline.results.length}` : t.status === 'pending' ? 'running (3 agent-free test runs must fail)' : 'not run'}</td>
            </tr>
            <tr>
              <th>Trading</th>
              <td class="num">{t.status === 'pending' ? 'opens after the baseline' : t.status === 'rejected' ? 'never opened' : t.status === 'open' ? `closes in ${countdown(t.closesAt, Date.now())}` : `closed ${when(t.closedAt)}`}</td>
            </tr>
            <tr>
              <th>Auto-decide</th>
              <td>{t.autoDecide ? `yes, needs ≥ ${t.minimumChance}¢` : 'no'}</td>
            </tr>
          </table>
        </div>
        <div class="panel">
          <h2>Candidates</h2>
          <table data-testid="candidates">
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
                <tr class="click" onClick={() => (location.hash = `#/market/${encodeURIComponent(m.marketId)}`)} data-testid={`market-row-${m.executorId}`}>
                  <td>
                    <a href={`#/market/${encodeURIComponent(m.marketId)}`} class="mono">
                      {m.executorId}
                    </a>
                    <div class="muted">
                      {m.executor.org} · v{m.executor.version} · {m.executor.passed}/{m.executor.chosen} passed
                    </div>
                    {m.outcome && <span class={`pill ${m.status}`}>{m.outcome}</span>}
                    {t.chosenAgent === m.executorId && <span class="pill running">chosen</span>}
                  </td>
                  <td class="r num chance">{m.status === 'pending' || m.status === 'cancelled' ? '—' : `${m.status === 'settled' ? m.settlementPrice : m.status === 'open' ? m.quote.chance : m.closingPrice}¢`}</td>
                  <td class="r num">
                    {m.quote.yesBid ?? '–'}/{m.quote.yesAsk ?? '–'}
                  </td>
                  <td class="r num">{m.quote.volume}</td>
                  <td class="r num">{m.traders}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.recommendation && (
            <p>
              Market recommendation: <b class="mono">{view.recommendation.executorId}</b> at <span class="num">{view.recommendation.chance}¢</span>
            </p>
          )}
        </div>
        <div class="panel">
          <h2>Decision</h2>
          {t.status === 'pending' && <p class="warn-c" data-testid="baseline-pending">Baseline check running: the runner confirms the test command fails at {t.commit} three times before trading opens.</p>}
          {t.status === 'rejected' && (
            <div data-testid="rejected">
              <p class="no-c" style="font-size:16px;font-weight:700">Rejected: {t.rejectedReason === 'trivial' ? 'the tests already pass at the pinned commit' : 'the tests are flaky at the pinned commit'}</p>
              <h2>Baseline log</h2>
              <div class="mono" style="max-height:300px;overflow:auto">{t.baseline?.log}</div>
            </div>
          )}
          {!isCustomer && <p class="muted">Only the customer ({t.customer}) can close trading and decide. The customer never trades its own task.</p>}
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
          {t.status === 'running' && <p class="warn-c">Runner is executing {t.chosenAgent} at {t.commit}…</p>}
          {t.status === 'resolved' && (
            <div data-testid="settlement">
              <p class={t.passed === null ? 'warn-c' : t.passed ? 'yes-c' : 'no-c'} style="font-size:16px;font-weight:700">
                {t.outcome === 'infra_error' ? 'Infrastructure error: settled at the closing price' : t.passed ? 'Tests passed · Yes paid 100¢' : 'Tests failed · No paid 100¢'}
              </p>
              <h2>Run log</h2>
              <div class="mono" style="max-height:300px;overflow:auto" data-testid="run-log">
                {t.runLog}
              </div>
            </div>
          )}
          {t.status === 'skipped' && <p class="muted">Skipped: every market settled at its closing price.</p>}
        </div>
      </div>
    </div>
  );
}
