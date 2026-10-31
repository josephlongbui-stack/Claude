import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useTitle, type Ctx } from '../main.js';
import { AgentRow, Button, Countdown, EmptyState, FetchError, OddsRail, PageHead, Panel, PanelBody, PanelHead, SectionHead, SettlementPanel, Skeleton, StatusPill, Table, count, railMarkers, taskStatus, type MarketSummary } from '../ui/index.js';
import { when } from '../ui/PacketView.js';

interface View {
  task: any;
  markets: MarketSummary[];
  recommendation: { executorId: string; chance: number } | null;
}

const repoName = (r: string) => r.replace(/^(https?:\/\/)?github\.com\//, '');

export function Task({ ctx, id }: { ctx: Ctx; id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const seenUnresolved = useRef(false);
  const [animateSettle, setAnimateSettle] = useState(false);
  const load = () =>
    api<View>('GET', `/api/tasks/${encodeURIComponent(id)}`)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((e) => setError(e.status === 404 ? 'not_found' : e));
  useEffect(() => {
    void load();
  }, [id, ctx.tick]);
  useEffect(() => {
    // A new task id starts fresh: no animation for a task that was settled before we arrived.
    seenUnresolved.current = false;
    setAnimateSettle(false);
  }, [id]);
  useTitle(view ? view.task.title : null);
  useEffect(() => {
    if (!view) return;
    if (view.task.status !== 'resolved') seenUnresolved.current = true;
    else if (seenUnresolved.current) {
      setAnimateSettle(true);
      seenUnresolved.current = false;
    }
  }, [view?.task.status]);

  if (error === 'not_found') return <EmptyState page title="There is no task at this address" hint="It may have been removed, or the link is wrong." action={{ href: '#/', label: 'Go to the Arena' }} />;
  if (error) return <FetchError error={error} retry={() => void load()} />;
  if (!view)
    return (
      <>
        <Skeleton shape="text" rows={2} />
        <Panel>
          <Skeleton shape="table" rows={3} />
        </Panel>
      </>
    );
  const t = view.task;
  const now = Date.now();
  const st = taskStatus(t, now);
  const isCustomer = !!ctx.me && (ctx.me.id === t.customer || ctx.me.role === 'admin');
  const chosen = t.chosenAgent ? view.markets.find((m) => m.executorId === t.chosenAgent) : null;
  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      const v = await api<View>('POST', path, body);
      setView(v);
      ctx.toast(done);
    } catch (e: any) {
      ctx.toast(e.error ?? 'That did not work.', true);
    } finally {
      setBusy(false);
    }
  };
  const baselineWords = t.baseline ? `Baseline failing ${t.baseline.results.filter((r: string) => r === 'failed').length} of ${t.baseline.results.length}` : t.status === 'pending' ? 'Baseline check running' : 'No baseline check';
  const aside =
    t.status === 'open' ? (
      <>
        <Countdown closesAt={t.closesAt} label="Closes in" size="m" />
        {isCustomer && (
          <Button disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/close`, undefined, 'Trading closed. Pick an agent to run.')} data-testid="close-trading">
            Close trading now
          </Button>
        )}
      </>
    ) : (
      <span class="task-when">
        <StatusPill status={st} />
        <span class="ink-3 t-dense">{t.status === 'resolved' ? `Settled ${when(t.resolvedAt)}` : t.status === 'pending' ? `Submitted ${when(t.createdAt)}` : t.closedAt ? `Closed ${when(t.closedAt)}` : ''}</span>
      </span>
    );
  return (
    <>
      <span class="sr-only" data-testid="task-status">
        {t.status}
      </span>
      <PageHead title={t.title} aside={aside}>
        <div class="task-meta">
          <span class="mono">{repoName(t.repo)}</span>
          <span class="mono">{t.commit}</span>
          <span class="mono">{t.testCommand}</span>
          <span>{baselineWords}</span>
          {t.visibility === 'private' && <StatusPill status="private" />}
        </div>
      </PageHead>

      {view.markets.some((m) => m.status !== 'pending' && m.status !== 'cancelled') && <OddsRail markers={railMarkers(view.markets, t.chosenAgent)} />}

      {t.status === 'pending' && (
        <Panel class="task-note">
          <PanelBody>
            <p data-testid="baseline-pending">
              The runner is checking that <span class="mono">{t.testCommand}</span> fails three times at {t.commit} with no agent. Trading opens when it does.
            </p>
          </PanelBody>
        </Panel>
      )}
      {t.status === 'rejected' && (
        <Panel class="task-note" testId="rejected">
          <PanelHead title="Rejected at the baseline check" />
          <PanelBody>
            <p>{t.rejectedReason === 'trivial' ? 'The tests already pass at the pinned commit, so there is nothing to predict.' : 'The tests gave mixed results at the pinned commit, so a pass would not mean anything.'}</p>
            {t.baseline?.log && <pre class="prompt task-log">{t.baseline.log}</pre>}
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <Table
          caption="Candidate agents"
          testId="candidates"
          columns={[
            { key: 'agent', label: 'Agent' },
            { key: 'chance', label: t.status === 'open' ? 'Chance' : t.status === 'resolved' || t.status === 'skipped' ? 'Settled at' : 'Closed at', align: 'right' },
            ...(t.status === 'open' ? [{ key: 'bidask', label: 'Bid / ask', align: 'right' as const, hideSm: true }] : []),
            { key: 'volume', label: 'Volume', align: 'right', hideSm: true },
            { key: 'traders', label: 'Traders', align: 'right', hideSm: true },
            { key: 'record', label: 'Record on this version', hideSm: true },
            ...(t.status === 'open' ? [{ key: 'quick', label: '', sr: 'Trade' }] : []),
          ]}
        >
          {view.markets.map((m) => (
            <AgentRow
              key={m.marketId}
              m={m}
              chosen={t.chosenAgent === m.executorId}
              chanceSize="l"
              columns={t.status === 'open' ? ['agent', 'chance', 'bidask', 'volume', 'traders', 'record', 'quick'] : ['agent', 'chance', 'volume', 'traders', 'record']}
              detail={`${m.executor.chosen === 0 ? 'No runs yet on this version' : `Passed ${m.executor.passed} of ${m.executor.chosen} on this version`}, ${count(m.quote.volume)} traded${m.status === 'open' && m.quote.yesBid !== null && m.quote.yesAsk !== null ? `, bid ${m.quote.yesBid}¢ ask ${m.quote.yesAsk}¢` : ''}`}
            />
          ))}
        </Table>
      </Panel>

      {isCustomer && t.status === 'closed' && (
        <Panel class="task-decide" testId="decide">
          <PanelHead title="Pick the agent to run" aside="Markets for the others settle at their closing price" />
          <PanelBody class="decide-body">
            {view.markets.map((m) => (
              <Button key={m.executorId} variant="primary" size={40} disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: m.executorId }, `${m.executor.name} is running.`)} data-testid={`decide-${m.executorId}`}>
                Run {m.executor.name} ({m.closingPrice}¢)
              </Button>
            ))}
            <Button size={40} disabled={busy} onClick={() => act(`/api/tasks/${encodeURIComponent(id)}/decide`, { executorId: null }, 'Skipped. Every market settled at its closing price.')} data-testid="decide-skip">
              Skip the run
            </Button>
          </PanelBody>
        </Panel>
      )}
      {!isCustomer && t.status === 'closed' && (
        <Panel class="task-note">
          <PanelBody>Trading has closed. The customer is choosing which agent to run; markets for the others settle at their closing price.</PanelBody>
        </Panel>
      )}
      {t.status === 'running' && chosen && (
        <Panel class="task-note">
          <PanelBody>
            <StatusPill status="running" /> {chosen.executor.name} is running in the sandbox. Its market settles on the signed test result; the others settled at their closing price.
          </PanelBody>
        </Panel>
      )}
      {t.status === 'skipped' && (
        <Panel class="task-note">
          <PanelBody>The customer skipped the run. Every market settled at its closing price.</PanelBody>
        </Panel>
      )}
      {t.status === 'resolved' && chosen && (
        <>
          <SectionHead title="Result" aside={t.runLogSha256 ? 'Signed by the runner' : undefined} />
          <SettlementPanel outcome={t.outcome === 'infra_error' ? 'infra_error' : t.passed ? 'passed' : 'failed'} agentName={chosen.executor.name} log={t.runLog} settledAt={t.resolvedAt} closingPrice={chosen.closingPrice} lines={14} animate={animateSettle} onDone={() => void ctx.refreshMe()} />
          {t.corrections?.length > 0 && (
            <Panel class="task-note" testId="corrections">
              <PanelBody>
                <b>Settlement corrected</b> {t.corrections.map((c: any) => `${when(c.at)}: ${c.from} became ${c.to} (${c.reason})`).join('; ')}.
              </PanelBody>
            </Panel>
          )}
        </>
      )}

      <SectionHead title="Prompt" aside="What every trader and the runner see" />
      <pre class="prompt task-prompt">{t.prompt}</pre>
      <p class="t-dense ink-3 task-protected">Protected paths: {t.protectedPaths?.length ? t.protectedPaths.join(', ') : 'the test files and test configuration, restored from the pinned commit before the tests run'}.</p>
    </>
  );
}
