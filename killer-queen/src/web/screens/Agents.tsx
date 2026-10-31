import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Card, ChanceBar, EmptyState, Skeleton, Stat } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Agents({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => {
    api<{ executors: any[] }>('GET', '/api/executors').then((r) => setRows(r.executors)).catch(() => setRows([]));
    api('GET', '/api/stats').then(setStats).catch(() => setStats(null));
  }, [ctx.tick]);
  if (!rows)
    return (
      <div class="card card-body">
        <Skeleton lines={6} />
      </div>
    );
  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Coding agents</h1>
          <p class="sub">Public, per-version reliability records from settled markets.</p>
        </div>
      </div>
      {rows.length === 0 && <EmptyState title="No agents registered" hint="Run npm run seed on the exchange to register Claude Code, Codex and Gemini CLI." />}
      {rows.length > 0 && (
        <div class="grid grid-3" data-testid="executors">
          {rows.map((e) => (
            <Card title={e.name} sub={`${e.org} · v${e.version}`}>
              <div class="stack">
                <div class="row between" style="align-items:baseline">
                  <span class="price md">{pct(e.passRate)}</span>
                  <span class="muted num">
                    {e.passed} passed of {e.chosen} runs
                  </span>
                </div>
                <ChanceBar value={e.passRate === null ? null : Math.round(e.passRate * 100)} muted={e.chosen === 0} />
                {Object.keys(e.byVersion).length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th class="r">Runs</th>
                        <th class="r">Passed</th>
                        <th class="r">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(e.byVersion).map(([v, r]: [string, any]) => (
                        <tr>
                          <td class="code">{v}</td>
                          <td class="r num">{r.chosen}</td>
                          <td class="r num">{r.passed}</td>
                          <td class="r num">{r.chosen ? `${Math.round((100 * r.passed) / r.chosen)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {stats && (
        <>
          <h2 style="margin-top:8px">Exchange health</h2>
          <div class="grid grid-4" data-testid="stats">
            <Stat label="Settled markets" value={stats.markets.settled} hint={`${stats.markets.settledOnTests} on a test result`} />
            <Stat label="Price accuracy" value={stats.priceBrier === null ? '—' : stats.priceBrier.toFixed(3)} hint={stats.baseRateBrier === null ? 'Brier of closing prices' : `base rate ${stats.baseRateBrier.toFixed(3)} · lower is better`} />
            <Stat label="Calibration 70–80¢" value={stats.calibration70to80.passRate === null ? '—' : pct(stats.calibration70to80.passRate)} hint={`${stats.calibration70to80.count} markets · target 70–80%`} />
            <Stat label="Median traders / market" value={stats.medianTradersPerMarket ?? '—'} hint="target 5 or more" />
          </div>
        </>
      )}
    </div>
  );
}
