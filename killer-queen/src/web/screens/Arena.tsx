import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';
import { AgentRow, Button, Countdown, EmptyState, FetchError, PageHead, Panel, Skeleton, StatusPill, Table, Tabs, Td, TitleCell, chanceOf, count, taskStatus, type MarketSummary } from '../ui/index.js';
import { when } from '../ui/PacketView.js';

type Filter = 'soon' | 'traded' | 'new' | 'progress' | 'settled';

interface Entry {
  task: { id: string; title: string; repo: string; commit: string; status: string; closesAt: number; openedAt: number | null; createdAt: number; resolvedAt: number | null; closedAt: number | null; visibility: string; chosenAgent: string | null; passed: boolean | null; outcome: string | null };
  markets: MarketSummary[];
  recommendation: { executorId: string; chance: number } | null;
}

const OPEN = (e: Entry) => e.task.status === 'open';
const PROGRESS = (e: Entry) => e.task.status === 'closed' || e.task.status === 'running' || e.task.status === 'pending';
const DONE = (e: Entry) => e.task.status === 'resolved' || e.task.status === 'skipped' || e.task.status === 'rejected';
const volume = (e: Entry) => e.markets.reduce((a, m) => a + m.quote.volume, 0);
const repoName = (r: string) => r.replace(/^(https?:\/\/)?github\.com\//, '');

export function Arena({ ctx }: { ctx: Ctx }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<any | null>(null);
  const [filter, setFilter] = useState<Filter>('soon');
  const load = () =>
    api<{ tasks: Entry[] }>('GET', '/api/tasks')
      .then((r) => {
        setEntries(r.tasks);
        setError(null);
      })
      .catch((e) => setError(e));
  useEffect(() => {
    void load();
  }, [ctx.tick]);

  const intro = !ctx.me && (
    <div class="arena-intro" data-testid="intro">
      <p>Humans and AI agents trade Yes or No on whether a coding agent will pass a task's tests, before anyone runs it. The price is the chance.</p>
      <Button variant="primary" size={40} href="#/signin" data-testid="start-trading">
        Start trading with $1,000 in play money
      </Button>
    </div>
  );

  if (error) return <FetchError error={error} retry={() => void load()} />;
  if (!entries)
    return (
      <>
        {intro}
        <PageHead title="Arena" sub="Will the agent pass the task's tests? Trade before the run." />
        <Panel>
          <Skeleton shape="table" rows={8} />
        </Panel>
      </>
    );

  const open = entries.filter(OPEN);
  const progress = entries.filter(PROGRESS);
  const done = entries.filter(DONE);
  const lists: Record<Filter, Entry[]> = {
    soon: [...open].sort((a, b) => a.task.closesAt - b.task.closesAt),
    traded: [...open].sort((a, b) => volume(b) - volume(a)),
    new: [...open].sort((a, b) => (b.task.openedAt ?? b.task.createdAt) - (a.task.openedAt ?? a.task.createdAt)),
    progress: [...progress].sort((a, b) => (b.task.closedAt ?? b.task.createdAt) - (a.task.closedAt ?? a.task.createdAt)),
    settled: [...done].sort((a, b) => (b.task.resolvedAt ?? b.task.closedAt ?? b.task.createdAt) - (a.task.resolvedAt ?? a.task.closedAt ?? a.task.createdAt)),
  };
  const shown = lists[filter];
  const settledTab = filter === 'settled';
  const now = Date.now();
  const emptyWords: Record<Filter, [string, string]> = {
    soon: ['No markets are open', 'Markets open when a customer submits a task and the baseline check passes.'],
    traded: ['No markets are open', 'Markets open when a customer submits a task and the baseline check passes.'],
    new: ['No markets are open', 'Markets open when a customer submits a task and the baseline check passes.'],
    progress: ['Nothing in progress', 'Tasks appear here while trading is closed and a decision or a run is pending.'],
    settled: ['Nothing has settled yet', 'Markets settle when the chosen agent finishes its run.'],
  };
  return (
    <>
      {intro}
      <PageHead
        title="Arena"
        sub="Will the agent pass the task's tests? Trade before the run."
        aside={
          <Tabs
            label="Filter tasks"
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'soon', label: 'Closing soon', count: open.length },
              { id: 'traded', label: 'Most traded' },
              { id: 'new', label: 'New' },
              { id: 'progress', label: 'In progress', count: progress.length },
              { id: 'settled', label: 'Settled', count: done.length },
            ]}
          />
        }
      />
      {shown.length === 0 ? (
        <Panel>
          <EmptyState title={emptyWords[filter][0]} hint={emptyWords[filter][1]} action={ctx.me && (ctx.me.role === 'customer' || ctx.me.role === 'admin') ? { href: '#/submit', label: 'Submit a task' } : undefined} />
        </Panel>
      ) : (
        <Panel>
          <Table
            caption={`${shown.length} tasks, one row per candidate agent`}
            class="arena-table"
            testId="arena-table"
            columns={[
              { key: 'task', label: 'Task', width: 'task' },
              { key: 'agent', label: 'Agent' },
              { key: 'chance', label: settledTab ? 'Settled at' : 'Chance', align: 'right' },
              { key: 'change', label: 'Change', align: 'right' },
              { key: 'volume', label: 'Volume', align: 'right', hideSm: true },
              { key: 'closes', label: settledTab ? 'Result' : filter === 'progress' ? 'Status' : 'Closes', hideSm: true },
              { key: 'quick', label: '', sr: 'Trade' },
            ]}
          >
            {shown.map((e) => {
              const n = e.markets.length;
              const st = taskStatus(e.task, now);
              const trail = (
                <Td rowSpan={n} class="closes-cell">
                  {e.task.status === 'open' ? (
                    <Countdown closesAt={e.task.closesAt} />
                  ) : e.task.status === 'resolved' || e.task.status === 'skipped' || e.task.status === 'rejected' ? (
                    <span class="closes-result">
                      <StatusPill status={st} />
                      <span class="ink-3 t-caption">{when(e.task.resolvedAt ?? e.task.closedAt)}</span>
                    </span>
                  ) : (
                    <StatusPill status={st}>{e.task.status === 'closed' ? 'Awaiting decision' : undefined}</StatusPill>
                  )}
                </Td>
              );
              return e.markets.map((m, i) => (
                <AgentRow
                  key={m.marketId}
                  m={m}
                  group={i === 0}
                  chosen={e.task.chosenAgent === m.executorId}
                  columns={['agent', 'chance', 'change', 'volume', 'quick']}
                  lead={
                    i === 0 ? (
                      <Td rowSpan={n} class="task-cell">
                        <span class="sr-only" data-testid={`task-row-${e.task.id}`}>
                          {e.task.title}
                        </span>
                        <TitleCell
                          title={e.task.title}
                          href={`#/task/${encodeURIComponent(e.task.id)}`}
                          sub={
                            <span class="mono">
                              {repoName(e.task.repo)} {e.task.commit}
                              {e.task.visibility === 'private' && <StatusPill status="private" />}
                            </span>
                          }
                        />
                        {e.recommendation && n > 1 && e.task.status === 'open' && (
                          <div class="task-fav t-caption ink-3">
                            Market favours {e.markets.find((x) => x.executorId === e.recommendation!.executorId)?.executor.name} at {e.recommendation.chance}¢ with {count(volume(e))} contracts traded
                          </div>
                        )}
                      </Td>
                    ) : undefined
                  }
                  trail={i === 0 ? trail : undefined}
                />
              ));
            })}
          </Table>
        </Panel>
      )}
    </>
  );
}

export { chanceOf };
