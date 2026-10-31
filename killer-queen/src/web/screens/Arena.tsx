import { useEffect, useState } from 'preact/hooks';
import { api, countdown } from '../api.js';
import { EmptyState, ErrorState, Pill, PriceCell, Skeleton } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Arena({ ctx }: { ctx: Ctx }) {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const load = () =>
    api<{ tasks: any[] }>('GET', '/api/tasks')
      .then((r) => {
        setTasks(r.tasks);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  useEffect(() => {
    void load();
  }, [ctx.tick]);
  if (err) return <ErrorState message={`Could not load tasks: ${err}`} retry={() => void load()} />;
  if (!tasks)
    return (
      <div class="panel">
        <Skeleton lines={6} />
      </div>
    );
  if (tasks.length === 0) return <EmptyState title="No tasks yet." hint="Submit one as a customer, or run npm run seed." action={{ href: '#/submit', label: 'Submit a task' }} />;
  const now = Date.now();
  const shown = tasks.filter((t) => (filter === 'all' ? true : filter === 'open' ? ['pending', 'open', 'closed', 'running'].includes(t.task.status) : ['resolved', 'skipped', 'rejected'].includes(t.task.status)));
  return (
    <div>
      <h1>Arena</h1>
      <p role="group" aria-label="Filter tasks">
        {(['all', 'open', 'done'] as const).map((f) => (
          <button class={filter === f ? 'primary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </p>
      {shown.length === 0 && <EmptyState title={`No ${filter} tasks.`} />}
      {shown.length > 0 && (
        <div class="scroll-x">
          <table data-testid="arena-table" aria-label="Tasks">
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
              {shown.map((t) => (
                <tr class="click" onClick={() => (location.hash = `#/task/${encodeURIComponent(t.task.id)}`)} data-testid={`task-row-${t.task.id}`}>
                  <td>
                    <a href={`#/task/${encodeURIComponent(t.task.id)}`}>{t.task.title}</a>
                    <div class="muted mono">
                      {t.task.repo} @ {t.task.commit}
                    </div>
                  </td>
                  <td>
                    <Pill status={t.task.status} />
                  </td>
                  <td class="num">{t.task.status === 'open' ? countdown(t.task.closesAt, now) : t.task.status === 'pending' ? 'after baseline' : '—'}</td>
                  <td>
                    {t.markets.map((m: any) => (
                      <div>
                        <span class="mono">{m.executorId}</span>{' '}
                        <b>
                          <PriceCell value={m.status === 'pending' || m.status === 'cancelled' ? null : m.status === 'settled' ? m.settlementPrice : m.quote.chance} />
                        </b>{' '}
                        <span class="muted num">
                          {m.quote.yesBid ?? '–'}/{m.quote.yesAsk ?? '–'}
                        </span>{' '}
                        {m.outcome && <Pill status={m.status}>{m.outcome}</Pill>}
                      </div>
                    ))}
                  </td>
                  <td class="r num">{t.markets.reduce((a: number, m: any) => a + m.quote.volume, 0)}</td>
                  <td>
                    {t.recommendation ? (
                      <>
                        <span class="mono">{t.recommendation.executorId}</span> <PriceCell value={t.recommendation.chance} />
                      </>
                    ) : (
                      '—'
                    )}
                    {t.task.chosenAgent && (
                      <div class="muted">
                        chosen: <span class="mono">{t.task.chosenAgent}</span>
                        {t.task.passed !== null && (
                          <>
                            {' '}
                            · <Pill status={t.task.passed ? 'passed' : 'failed'} />
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
