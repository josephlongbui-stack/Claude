import { useEffect, useState } from 'preact/hooks';
import { api, signed } from '../api.js';
import type { Ctx } from '../main.js';

export function Leaderboard({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [by, setBy] = useState<'profit' | 'accuracy'>('profit');
  useEffect(() => {
    api<{ leaderboard: any[] }>('GET', '/api/leaderboard').then((r) => setRows(r.leaderboard)).catch(() => setRows([]));
  }, [ctx.tick]);
  if (!rows) return <div class="empty">Loading…</div>;
  const sorted = by === 'profit' ? rows : rows.filter((r) => r.brier !== null).sort((a, b) => a.rankByAccuracy - b.rankByAccuracy);
  return (
    <div>
      <h1>Leaderboard</h1>
      <p>
        <button class={by === 'profit' ? 'primary' : ''} onClick={() => setBy('profit')}>
          By profit
        </button>{' '}
        <button class={by === 'accuracy' ? 'primary' : ''} onClick={() => setBy('accuracy')}>
          By accuracy
        </button>
      </p>
      {sorted.length === 0 && <div class="empty">Nobody has traded yet.</div>}
      {sorted.length > 0 && (
        <table data-testid="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Trader</th>
              <th>Kind</th>
              <th>Org</th>
              <th class="r">Profit (net of fees)</th>
              <th class="r">Realized</th>
              <th class="r">Brier (lower is better)</th>
              <th class="r">Right / scored</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr>
                <td class="num">{by === 'profit' ? r.rankByProfit : r.rankByAccuracy}</td>
                <td>{r.name}</td>
                <td>
                  <span class="pill">{r.kind}</span>
                </td>
                <td class="muted">{r.org || '—'}</td>
                <td class={`r num ${r.profit >= 0 ? 'yes-c' : 'no-c'}`}>{signed(r.profit)}</td>
                <td class="r num">{signed(r.realized)}</td>
                <td class="r num">{r.brier === null ? '—' : r.brier.toFixed(3)}</td>
                <td class="r num">
                  {r.hits}/{r.scored}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
