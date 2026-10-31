import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';
import { EmptyState, FetchError, PageHead, Panel, SectionHead, Skeleton, Table, Td, Tr, count } from '../ui/index.js';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

export function Agents({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [error, setError] = useState<any | null>(null);
  const load = () =>
    Promise.all([api<{ executors: any[] }>('GET', '/api/executors'), api('GET', '/api/stats').catch(() => null)])
      .then(([r, s]) => {
        setRows(r.executors);
        setStats(s);
        setError(null);
      })
      .catch((e) => setError(e));
  useEffect(() => {
    void load();
  }, [ctx.tick]);
  if (error) return <FetchError error={error} retry={() => void load()} />;
  return (
    <>
      <PageHead title="Agents" sub="Each coding agent's record, per version, from markets settled on a real test run. Runs that ended in an infrastructure error do not count." />
      <Panel testId="executors">
        {!rows ? (
          <Skeleton shape="table" rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="No agents registered" hint="The operator registers agents; tasks can only name registered ones." />
        ) : (
          <Table caption="Agent records per version" columns={[{ key: 'a', label: 'Agent', width: 'task' }, { key: 'v', label: 'Version' }, { key: 'r', label: 'Runs', align: 'right' }, { key: 'p', label: 'Passed', align: 'right', hideXs: true }, { key: 'x', label: 'Pass rate', align: 'right' }]}>
            {rows.map((e) => {
              const versions = Object.entries(e.byVersion as Record<string, { chosen: number; passed: number }>).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
              const lines = versions.length ? versions : [[e.version, { chosen: 0, passed: 0 }] as [string, { chosen: number; passed: number }]];
              return lines.map(([v, r], i) => (
                <Tr key={`${e.id}-${v}`} class={i === 0 ? 'group' : ''}>
                  {i === 0 ? (
                    <Td rowSpan={lines.length} class="task-cell">
                      <span class="agent-title">{e.name}</span>
                      <div class="ink-3 t-dense">
                        {e.org}, current version {e.version}
                      </div>
                      <div class="t-dense agent-total">
                        {e.chosen === 0 ? 'No runs yet' : `Passed ${count(e.passed)} of ${count(e.chosen)} overall`}
                      </div>
                    </Td>
                  ) : null}
                  <Td class="mono">{v}</Td>
                  <Td align="right">{count(r.chosen)}</Td>
                  <Td align="right" hideXs>
                    {count(r.passed)}
                  </Td>
                  <Td align="right">{r.chosen ? pct(r.passed / r.chosen) : <span class="ink-3">—</span>}</Td>
                </Tr>
              ));
            })}
          </Table>
        )}
      </Panel>
      {stats && (
        <>
          <SectionHead title="How the exchange is doing" aside="Gate metrics from the product spec" />
          <div class="summary" data-testid="stats"><dl class="summary-list">
            <div>
              <dt>Settled on a test</dt>
              <dd>{count(stats.markets.settledOnTests)}</dd>
            </div>
            <div>
              <dt>Price accuracy (Brier)</dt>
              <dd>{stats.priceBrier === null ? '—' : stats.priceBrier.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Agents' base rate (Brier)</dt>
              <dd>{stats.baseRateBrier === null ? '—' : stats.baseRateBrier.toFixed(3)}</dd>
            </div>
            <div>
              <dt>70–80¢ markets that passed</dt>
              <dd>{stats.calibration70to80.passRate === null ? '—' : pct(stats.calibration70to80.passRate)}</dd>
            </div>
            <div>
              <dt>Median traders a market</dt>
              <dd>{stats.medianTradersPerMarket ?? '—'}</dd>
            </div>
            <div>
              <dt>Median spread at close</dt>
              <dd>{stats.medianSpreadAtClose === null ? '—' : `${stats.medianSpreadAtClose}¢`}</dd>
            </div>
          </dl>
          </div>
          <p class="t-caption ink-3 foot-note">Lower Brier is better. The v0 gate is closing prices at least 10% more accurate than the agents' historical pass rates over 500 settled runs; markets closing at 70–80¢ should pass 70–80% of the time.</p>
        </>
      )}
    </>
  );
}
