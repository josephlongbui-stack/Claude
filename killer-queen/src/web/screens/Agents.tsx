import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';

export function Agents({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => {
    api<{ executors: any[] }>('GET', '/api/executors').then((r) => setRows(r.executors)).catch(() => setRows([]));
    api('GET', '/api/stats').then(setStats).catch(() => setStats(null));
  }, [ctx.tick]);
  if (!rows) return <div class="empty">Loading…</div>;
  return (
    <div class="grid cols-2">
      <div class="panel">
        <h2>Coding agents · per-version records</h2>
        {rows.length === 0 && <p class="muted">No executors registered. Run npm run seed.</p>}
        {rows.length > 0 && (
        <div class="scroll-x">
          <table data-testid="executors">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Org</th>
                <th>Version</th>
                <th class="r">Chosen</th>
                <th class="r">Passed</th>
                <th class="r">Pass rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <>
                  <tr>
                    <td class="mono">{e.id}</td>
                    <td>{e.org}</td>
                    <td class="mono">{e.version} (current)</td>
                    <td class="r num">{e.chosen}</td>
                    <td class="r num">{e.passed}</td>
                    <td class="r num">{e.passRate === null ? '—' : `${Math.round(e.passRate * 100)}%`}</td>
                  </tr>
                  {Object.entries(e.byVersion).map(([v, r]: [string, any]) => (
                    <tr>
                      <td />
                      <td />
                      <td class="mono muted">{v}</td>
                      <td class="r num muted">{r.chosen}</td>
                      <td class="r num muted">{r.passed}</td>
                      <td class="r num muted">{r.chosen ? `${Math.round((100 * r.passed) / r.chosen)}%` : '—'}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      <div class="panel">
        <h2>Exchange stats (v0 gate metrics)</h2>
        {stats && (
          <div class="scroll-x">
          <table data-testid="stats">
            <tr>
              <th>Settled markets</th>
              <td class="r num">{stats.markets.settled}</td>
            </tr>
            <tr>
              <th>Settled on a test result</th>
              <td class="r num">{stats.markets.settledOnTests}</td>
            </tr>
            <tr>
              <th>Price Brier (closing price vs outcome)</th>
              <td class="r num">{stats.priceBrier === null ? '—' : stats.priceBrier.toFixed(3)}</td>
            </tr>
            <tr>
              <th>Base-rate Brier (agent history)</th>
              <td class="r num">{stats.baseRateBrier === null ? '—' : stats.baseRateBrier.toFixed(3)}</td>
            </tr>
            <tr>
              <th>Calibration 70–80¢ (pass share)</th>
              <td class="r num">
                {stats.calibration70to80.passRate === null ? '—' : `${Math.round(stats.calibration70to80.passRate * 100)}% of ${stats.calibration70to80.count}`}
              </td>
            </tr>
            <tr>
              <th>Median spread at close</th>
              <td class="r num">{stats.medianSpreadAtClose === null ? '—' : `${stats.medianSpreadAtClose}¢`}</td>
            </tr>
            <tr>
              <th>Median traders per market</th>
              <td class="r num">{stats.medianTradersPerMarket ?? '—'}</td>
            </tr>
            <tr>
              <th>Volume · fees</th>
              <td class="r num">
                {stats.volume} · ${(stats.fees / 100).toFixed(2)}
              </td>
            </tr>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
