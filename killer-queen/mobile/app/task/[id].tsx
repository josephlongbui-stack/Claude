import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { getKey, kq, subscribe, when } from '../../src/api';
import { AgentRow, Button, Countdown, EmptyState, FetchError, OddsRail, PageTitle, Panel, PanelBody, PanelHead, Screen, SectionHead, SettlementPanel, Skeleton, StatusPill, railMarkers, taskStatus, useToast, words, type MarketSummary } from '../../src/ui/components';
import { radius, space, type, usePalette } from '../../src/ui/tokens';

const repoName = (r: string) => r.replace(/^(https?:\/\/)?github\.com\//, '');

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const router = useRouter();
  const [view, setView] = useState<{ task: any; markets: MarketSummary[]; recommendation: any } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [me, setMe] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const seenUnresolved = useRef(false);
  const [animate, setAnimate] = useState(false);
  const [toast, show] = useToast();
  const load = useCallback(async () => {
    try {
      const v = await kq.task(id);
      setView(v);
      setError(null);
      if (v.task.status !== 'resolved') seenUnresolved.current = true;
      else if (seenUnresolved.current) {
        setAnimate(true);
        seenUnresolved.current = false;
      }
    } catch (e) {
      setError(e);
    }
    if (await getKey()) setMe((await kq.me().catch(() => ({ account: null }))).account);
  }, [id]);
  useEffect(() => {
    seenUnresolved.current = false;
    setAnimate(false);
    void load();
    return subscribe(() => void load(), { tasks: [id] });
  }, [load, id]);
  if (error) return (error as any)?.status === 404 ? <EmptyState title="There is no task at this address" hint="It may have been removed, or the link is wrong." action={{ label: 'Go to the Arena', onPress: () => router.push('/') }} /> : <FetchError error={error} retry={() => void load()} />;
  if (!view)
    return (
      <Screen>
        <Skeleton rows={2} />
        <Panel><View style={{ padding: space.s4 }}><Skeleton shape="table" rows={3} /></View></Panel>
      </Screen>
    );
  const t = view.task;
  const st = taskStatus(t);
  const isCustomer = !!me && (me.id === t.customer || me.role === 'admin');
  const chosen = t.chosenAgent ? view.markets.find((m) => m.executorId === t.chosenAgent) : null;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      show(done);
      await load();
    } catch (e) {
      show(words(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const close = () => act(() => kq.closeTask(id), 'Trading closed. Pick an agent to run.');
  const decide = (executorId: string | null, name?: string) => act(() => kq.decide(id, executorId), executorId ? `${name} is running.` : 'Skipped. Every market settled at its closing price.');
  const baseline = t.baseline ? `Baseline failing ${t.baseline.results.filter((r: string) => r === 'failed').length} of ${t.baseline.results.length}` : t.status === 'pending' ? 'Baseline check running' : 'No baseline check';
  const note = (text: string, pill?: any) => (
    <Panel>
      <PanelBody>
        {pill}
        <Text style={[type.ui, { color: p.ink }]}>{text}</Text>
      </PanelBody>
    </Panel>
  );
  return (
    <Screen bottom={toast}>
      <Stack.Screen options={{ title: t.title }} />
      <PageTitle title={t.title} />
      <View style={{ gap: space.s1 }}>
        <Text style={[type.mono, { color: p.ink }]}>{repoName(t.repo)}  {t.commit}</Text>
        <Text style={[type.mono, { color: p.ink }]}>{t.testCommand}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, flexWrap: 'wrap' }}>
          <Text style={[type.dense, { color: p.ink2 }]}>{baseline}</Text>
          {t.status === 'open' ? <Countdown closesAt={t.closesAt} label="Closes in" big /> : <StatusPill status={st} />}
        </View>
        {t.status !== 'open' && <Text style={[type.dense, { color: p.ink3 }]}>{t.status === 'resolved' ? `Settled ${when(t.resolvedAt)}` : t.closedAt ? `Closed ${when(t.closedAt)}` : `Submitted ${when(t.createdAt)}`}</Text>}
      </View>
      {isCustomer && t.status === 'open' && <Button label="Close trading now" onPress={close} disabled={busy} testID="close-trading" />}
      {view.markets.some((m) => m.status !== 'pending' && m.status !== 'cancelled') && <OddsRail markers={railMarkers(view.markets, t.chosenAgent)} />}
      {t.status === 'pending' && note(`The runner is checking that ${t.testCommand} fails three times at ${t.commit} with no agent. Trading opens when it does.`)}
      {t.status === 'rejected' && (
        <Panel testID="rejected">
          <PanelHead title="Rejected at the baseline check" />
          <PanelBody>
            <Text style={[type.ui, { color: p.ink }]}>{t.rejectedReason === 'trivial' ? 'The tests already pass at the pinned commit, so there is nothing to predict.' : 'The tests gave mixed results at the pinned commit, so a pass would not mean anything.'}</Text>
          </PanelBody>
        </Panel>
      )}
      <Panel testID="candidates">
        <View style={{ paddingHorizontal: space.s4 }}>
          {view.markets.map((m, i) => (
            <AgentRow key={m.marketId} m={m} chosen={t.chosenAgent === m.executorId} last={i === view.markets.length - 1} onPress={() => router.push(`/market/${encodeURIComponent(m.marketId)}`)} onQuick={t.status === 'open' ? (side) => router.push(`/market/${encodeURIComponent(m.marketId)}?side=${side}`) : undefined} />
          ))}
        </View>
      </Panel>
      {isCustomer && t.status === 'closed' && (
        <Panel testID="decide">
          <PanelHead title="Pick the agent to run" />
          <PanelBody>
            <Text style={[type.dense, { color: p.ink2 }]}>Markets for the others settle at their closing price.</Text>
            {view.markets.map((m) => (
              <Button key={m.executorId} label={`Run ${m.executor.name} (${m.closingPrice}¢)`} variant="primary" onPress={() => decide(m.executorId, m.executor.name)} disabled={busy} block testID={`decide-${m.executorId}`} />
            ))}
            <Button label="Skip the run" onPress={() => decide(null)} disabled={busy} block testID="decide-skip" />
          </PanelBody>
        </Panel>
      )}
      {!isCustomer && t.status === 'closed' && note('Trading has closed. The customer is choosing which agent to run; markets for the others settle at their closing price.')}
      {t.status === 'running' && chosen && note(`${chosen.executor.name} is running in the sandbox. Its market settles on the signed test result; the others settled at their closing price.`, <StatusPill status="running" />)}
      {t.status === 'skipped' && note('The customer skipped the run. Every market settled at its closing price.')}
      {t.status === 'resolved' && chosen && (
        <>
          <SectionHead title="Result" />
          <SettlementPanel outcome={t.outcome === 'infra_error' ? 'infra_error' : t.passed ? 'passed' : 'failed'} agentName={chosen.executor.name} log={t.runLog} settledAt={t.resolvedAt} closingPrice={chosen.closingPrice} lines={12} animate={animate} />
        </>
      )}
      <SectionHead title="Prompt" />
      <View style={{ backgroundColor: p.surfaceSunken, borderRadius: radius.control, padding: space.s3 }}>
        <Text style={[type.mono, { color: p.ink }]}>{t.prompt}</Text>
      </View>
      <Text style={[type.caption, { color: p.ink3 }]}>Protected paths: {t.protectedPaths?.length ? t.protectedPaths.join(', ') : 'the test files and test configuration, restored from the pinned commit before the tests run'}.</Text>
    </Screen>
  );
}
