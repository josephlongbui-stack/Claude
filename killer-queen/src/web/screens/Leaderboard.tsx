import { useEffect, useState } from 'preact/hooks';
import { api, signed } from '../api.js';
import { Card, EmptyState, Pill, Segmented, Skeleton } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Leaderboard({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [by, setBy] = useState<'profit' | 'accuracy'>('profit');
  useEffect(() => {
    api<{ leaderboard: any[] }>('GET', '/api/leaderboard').then((r) => setRows(r.leaderboard)).catch(() => setRows([]));
  }, [ctx.tick]);
  if (!rows)
    return (
      <div class="card card-body">
        <Skeleton lines={8} />
      </div>
    );
  const sorted = by === 'profit' ? rows : rows.filter((r) => r.brier !== null).sort((a, b) => a.rankByAccuracy - b.rankByAccuracy);
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p class="sub">Humans and agents side by side. Profit is net of fees; accuracy scores settled positions.</p>
        </div>
        <Segmented value={by} label="Rank by" onChange={setBy} options={[{ value: 'profit', label: 'By profit' }, { value: 'accuracy', label: 'By accuracy' }]} />
      </div>
      {sorted.length === 0 && <EmptyState title={by === 'profit' ? 'Nobody has traded yet' : 'No settled positions to score yet'} hint="Accuracy needs markets that settled on a test result." />}
      {sorted.length > 0 && (
        <Card flush>
          <div class="table-wrap">
            <table data-testid="leaderboard">
              <thead>
                <tr>
                  <th style="width:48px">#</th>
                  <th>Trader</th>
                  <th>Org</th>
                  <th class="r">Profit</th>
                  <th class="r">Realized</th>
                  <th class="r">Brier</th>
                  <th class="r">Right</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr>
                    <td class="num muted">{by === 'profit' ? r.rankByProfit : r.rankByAccuracy}</td>
                    <td>
                      <div class="row">
                        <span style="font-weight:500">{r.name}</span>
                        <Pill status="kind">{r.kind}</Pill>
                      </div>
                    </td>
                    <td class="muted">{r.org || '—'}</td>
                    <td class={`r num ${r.profit >= 0 ? 'yes-c' : 'no-c'}`} style="font-weight:600">
                      {signed(r.profit)}
                    </td>
                    <td class="r num">{signed(r.realized)}</td>
                    <td class="r num" title="Mean squared error of the implied forecast; lower is better">
                      {r.brier === null ? '—' : r.brier.toFixed(3)}
                    </td>
                    <td class="r num">
                      {r.hits}/{r.scored}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
