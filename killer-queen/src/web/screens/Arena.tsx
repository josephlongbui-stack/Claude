import { useEffect, useState } from 'preact/hooks';
import { api, countdown } from '../api.js';
import type { Ctx } from '../main.js';

export function Arena({ ctx }: { ctx: Ctx }) {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ tasks: any[] }>('GET', '/api/tasks')
      .then((r) => {
        setTasks(r.tasks);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  }, [ctx.tick]);
  if (err) return <div class="empty no-c">Could not load tasks: {err}</div>;
  if (!tasks) return <div class="empty">Loading…</div>;
  if (tasks.length === 0)
    return (
      <div class="empty">
        No tasks yet. <a href="#/submit">Submit one</a> as a customer, or run <span class="mono">npm run seed</span>.
      </div>
    );
  const now = Date.now();
  return (
    <div>
      <h1>Arena</h1>
      <table data-testid="arena-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Closes</th>
            <th>Candidates · chance (Yes price)</th>
            <th class="r">Volume</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr class="click" onClick={() => (location.hash = `#/task/${encodeURIComponent(t.task.id)}`)} data-testid={`task-row-${t.task.id}`}>
              <td>
                <a href={`#/task/${encodeURIComponent(t.task.id)}`}>{t.task.title}</a>
                <div class="muted mono">{t.task.repo} @ {t.task.commit}</div>
              </td>
              <td>
                <span class={`pill ${t.task.status}`}>{t.task.status}</span>
              </td>
              <td class="num">{t.task.status === 'open' ? countdown(t.task.closesAt, now) : '—'}</td>
              <td>
                {t.markets.map((m: any) => (
                  <div>
                    <span class="mono">{m.executorId}</span> <b class="num">{m.status === 'pending' || m.status === 'cancelled' ? '—' : `${m.status === 'settled' ? m.settlementPrice : m.quote.chance}¢`}</b>{' '}
                    <span class="muted num">
                      {m.quote.yesBid ?? '–'}/{m.quote.yesAsk ?? '–'}
                    </span>
                    {m.outcome && <span class="pill">{m.outcome}</span>}
                  </div>
                ))}
              </td>
              <td class="r num">{t.markets.reduce((a: number, m: any) => a + m.quote.volume, 0)}</td>
              <td>
                {t.recommendation ? (
                  <>
                    <span class="mono">{t.recommendation.executorId}</span> <span class="num">{t.recommendation.chance}¢</span>
                  </>
                ) : (
                  '—'
                )}
                {t.task.chosenAgent && (
                  <div class="muted">
                    chosen: <span class="mono">{t.task.chosenAgent}</span>
                    {t.task.passed !== null && <span class={t.task.passed ? 'yes-c' : 'no-c'}> · {t.task.passed ? 'passed' : 'failed'}</span>}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
