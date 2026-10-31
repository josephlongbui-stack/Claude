import { useEffect, useState } from 'preact/hooks';
import { api, countdown } from '../api.js';
import { ChanceBar, EmptyState, ErrorState, Pill, PriceCell, Segmented, Skeleton, Stat, chanceOf } from '../components/index.js';
import type { Ctx } from '../main.js';

type Filter = 'all' | 'open' | 'done';
const OPEN = ['pending', 'open', 'closed', 'running'];

export function Arena({ ctx }: { ctx: Ctx }) {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const load = () =>
    Promise.all([api<{ tasks: any[] }>('GET', '/api/tasks'), api('GET', '/api/stats').catch(() => null)])
      .then(([r, s]) => {
        setTasks(r.tasks);
        setStats(s);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  useEffect(() => {
    void load();
  }, [ctx.tick]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!tasks)
    return (
      <div class="grid grid-2">
        {[0, 1, 2, 3].map(() => (
          <div class="card card-body">
            <Skeleton lines={5} />
          </div>
        ))}
      </div>
    );
  const now = Date.now();
  const shown = tasks.filter((t) => (filter === 'all' ? true : filter === 'open' ? OPEN.includes(t.task.status) : !OPEN.includes(t.task.status)));
  const openCount = tasks.filter((t) => OPEN.includes(t.task.status)).length;
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Markets</h1>
          <p class="sub">Will this coding agent pass the task's tests? Trade Yes or No before the run.</p>
        </div>
        <Segmented value={filter} label="Filter tasks" onChange={setFilter} options={[{ value: 'open', label: `Live · ${openCount}` }, { value: 'done', label: `Settled · ${tasks.length - openCount}` }, { value: 'all', label: 'All' }]} />
      </div>
      {stats && (
        <div class="grid grid-4">
          <Stat label="Open markets" value={stats.markets.open} />
          <Stat label="Contracts traded" value={stats.volume.toLocaleString()} />
          <Stat label="Settled on a test result" value={stats.markets.settledOnTests} hint={stats.priceBrier !== null ? `price Brier ${stats.priceBrier.toFixed(3)}` : 'no results yet'} />
          <Stat label="Median spread at close" value={stats.medianSpreadAtClose === null ? '—' : `${stats.medianSpreadAtClose}¢`} hint="target 6¢ or less" />
        </div>
      )}
      {tasks.length === 0 && <EmptyState title="No tasks yet" hint="Submit one as a customer, or run npm run seed on the exchange." action={{ href: '#/submit', label: 'Submit a task' }} />}
      {tasks.length > 0 && shown.length === 0 && <EmptyState title={filter === 'open' ? 'Nothing live right now' : 'Nothing settled yet'} hint={filter === 'open' ? 'Every task has settled. Submit a new one to open markets.' : 'Markets settle when the chosen agent finishes its run.'} action={filter === 'open' ? { href: '#/submit', label: 'Submit a task' } : undefined} />}
      {shown.length > 0 && (
        <div class="grid grid-2" data-testid="arena-table">
          {shown.map((t) => (
            <article class="card task-card" onClick={() => (location.hash = `#/task/${encodeURIComponent(t.task.id)}`)} data-testid={`task-row-${t.task.id}`}>
              <div class="row between" style="align-items:flex-start">
                <div class="grow">
                  <div class="title">{t.task.title}</div>
                  <div class="row wrap" style="margin-top:6px">
                    <span class="chip ellipsis" style="max-width:100%">
                      {t.task.repo} @ {t.task.commit}
                    </span>
                    <Pill status={t.task.status} />
                    {t.task.visibility === 'private' && <Pill status="private">private</Pill>}
                  </div>
                </div>
                <div class="num muted" style="font-size:12.5px;white-space:nowrap">
                  {t.task.status === 'open' ? `closes in ${countdown(t.task.closesAt, now)}` : t.task.status === 'pending' ? 'baseline running' : t.task.status === 'running' ? 'agent running' : ''}
                </div>
              </div>
              <div>
                {t.markets.map((m: any) => {
                  const chance = chanceOf(m);
                  const onTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed');
                  return (
                    <div class="cand">
                      <div class="grow">
                        <div class="row between">
                          <span class="name">{m.executor.name ?? m.executorId}</span>
                          <span class="muted num" style="font-size:12px">
                            {m.outcome ? m.outcome : m.quote.yesBid !== null || m.quote.yesAsk !== null ? `${m.quote.yesBid ?? '–'} · ${m.quote.yesAsk ?? '–'}` : 'no quotes'}
                          </span>
                        </div>
                        <div class="bar">
                          <ChanceBar value={chance} muted={m.status !== 'open'} />
                        </div>
                      </div>
                      <div style="text-align:right">
                        <PriceCell value={chance} size="md" side={onTests ? (m.outcome === 'passed' ? 'yes' : 'no') : undefined} label={`${m.executorId} chance`} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div class="foot">
                <span>
                  {t.recommendation ? (
                    <>
                      Market favours <b style="color:var(--text)">{t.markets.find((m: any) => m.executorId === t.recommendation.executorId)?.executor.name ?? t.recommendation.executorId}</b>
                      {t.task.chosenAgent && (
                        <>
                          {' '}· ran <b style="color:var(--text)">{t.task.chosenAgent}</b>
                          {t.task.passed !== null && <span class={t.task.passed ? 'yes-c' : 'no-c'}> · {t.task.passed ? 'passed' : 'failed'}</span>}
                        </>
                      )}
                    </>
                  ) : (
                    'Markets open after the baseline check'
                  )}
                </span>
                <span class="num">{t.markets.reduce((a: number, m: any) => a + m.quote.volume, 0).toLocaleString()} contracts</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
