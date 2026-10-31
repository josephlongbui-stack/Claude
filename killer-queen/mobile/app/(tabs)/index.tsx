import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { getKey, kq, subscribe } from '../../src/api';
import { AgentRow, Button, Countdown, EmptyState, FetchError, PageTitle, Panel, Skeleton, StatusPill, taskStatus, type MarketSummary } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

type Filter = 'soon' | 'traded' | 'new' | 'progress' | 'settled';
interface Entry {
  task: any;
  markets: MarketSummary[];
  recommendation: { executorId: string; chance: number } | null;
}
const volume = (e: Entry) => e.markets.reduce((a, m) => a + m.quote.volume, 0);
const repoName = (r: string) => r.replace(/^(https?:\/\/)?github\.com\//, '');

export default function Arena() {
  const p = usePalette();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>('soon');
  const [signedIn, setSignedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setEntries((await kq.tasks()).tasks);
      setError(null);
    } catch (e) {
      setError(e);
    }
    setSignedIn(!!(await getKey()));
  }, []);
  useEffect(() => {
    void load();
    return subscribe(() => void load());
  }, [load]);
  if (error) return <FetchError error={error} retry={() => void load()} />;
  const tabs: [Filter, string][] = [['soon', 'Closing soon'], ['traded', 'Most traded'], ['new', 'New'], ['progress', 'In progress'], ['settled', 'Settled']];
  const open = (entries ?? []).filter((e) => e.task.status === 'open');
  const progress = (entries ?? []).filter((e) => ['closed', 'running', 'pending'].includes(e.task.status));
  const done = (entries ?? []).filter((e) => ['resolved', 'skipped', 'rejected'].includes(e.task.status));
  const lists: Record<Filter, Entry[]> = {
    soon: [...open].sort((a, b) => a.task.closesAt - b.task.closesAt),
    traded: [...open].sort((a, b) => volume(b) - volume(a)),
    new: [...open].sort((a, b) => (b.task.openedAt ?? b.task.createdAt) - (a.task.openedAt ?? a.task.createdAt)),
    progress: [...progress].sort((a, b) => (b.task.closedAt ?? b.task.createdAt) - (a.task.closedAt ?? a.task.createdAt)),
    settled: [...done].sort((a, b) => (b.task.resolvedAt ?? b.task.closedAt ?? 0) - (a.task.resolvedAt ?? a.task.closedAt ?? 0)),
  };
  const shown = lists[filter];
  const now = Date.now();
  return (
    <View style={{ flex: 1, backgroundColor: p.canvas }}>
      <ScrollView contentContainerStyle={{ padding: space.s4, paddingBottom: space.s16, gap: space.s4 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!signedIn && (
          <View style={{ gap: space.s3 }} testID="intro">
            <Text style={[type.body, { color: p.ink2 }]}>Humans and AI agents trade Yes or No on whether a coding agent will pass a task's tests, before anyone runs it. The price is the chance.</Text>
            <Button label="Start trading with $1,000 in play money" variant="primary" onPress={() => router.push('/profile')} block testID="start-trading" />
          </View>
        )}
        <PageTitle title="Arena" sub="Will the agent pass the task's tests? Trade before the run." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s4, borderBottomWidth: 1, borderColor: p.rule }} accessibilityRole="tablist">
          {tabs.map(([id, label]) => (
            <Pressable key={id} onPress={() => setFilter(id)} accessibilityRole="tab" accessibilityState={{ selected: filter === id }} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderColor: filter === id ? p.ink : 'transparent' }} testID={`tab-${id}`}>
              <Text style={[type.uiMedium, { color: filter === id ? p.ink : p.ink2 }]}>
                {label}
                {id === 'soon' && entries ? <Text style={{ color: p.ink3 }}> {open.length}</Text> : null}
                {id === 'progress' && entries ? <Text style={{ color: p.ink3 }}> {progress.length}</Text> : null}
                {id === 'settled' && entries ? <Text style={{ color: p.ink3 }}> {done.length}</Text> : null}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {!entries ? (
          <Panel><View style={{ padding: space.s4 }}><Skeleton shape="table" rows={8} /></View></Panel>
        ) : shown.length === 0 ? (
          <Panel><EmptyState title={filter === 'settled' ? 'Nothing has settled yet' : filter === 'progress' ? 'Nothing in progress' : 'No markets are open'} hint={filter === 'settled' ? 'Markets settle when the chosen agent finishes its run.' : filter === 'progress' ? 'Tasks appear here while trading is closed and a decision or a run is pending.' : 'Markets open when a customer submits a task and the baseline check passes.'} /></Panel>
        ) : (
          <Panel testID="arena-table">
            {shown.map((e, gi) => {
              const st = taskStatus(e.task, now);
              return (
                <View key={e.task.id} style={{ paddingHorizontal: space.s4, paddingTop: space.s3, borderTopWidth: gi === 0 ? 0 : 1, borderColor: p.ruleStrong }} testID={`task-row-${e.task.id}`}>
                  <Pressable onPress={() => router.push(`/task/${encodeURIComponent(e.task.id)}`)} accessibilityRole="link" style={{ gap: 2, paddingBottom: space.s2 }}>
                    <Text style={[type.ui, { fontFamily: type.uiMedium.fontFamily, color: p.ink }]}>{e.task.title}</Text>
                    <Text style={[type.mono, { color: p.ink3 }]}>{repoName(e.task.repo)} {e.task.commit}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, marginTop: 2 }}>
                      {e.task.status === 'open' ? <Countdown closesAt={e.task.closesAt} label="Closes in" /> : <StatusPill status={st} label={e.task.status === 'closed' ? 'Awaiting decision' : undefined} />}
                      {e.recommendation && e.task.status === 'open' && e.markets.length > 1 && <Text style={[type.caption, { color: p.ink3 }]}>Favourite {e.markets.find((m) => m.executorId === e.recommendation!.executorId)?.executor.name} at {e.recommendation.chance}¢</Text>}
                    </View>
                  </Pressable>
                  {e.markets.map((m, i) => (
                    <AgentRow key={m.marketId} m={m} chosen={e.task.chosenAgent === m.executorId} last={i === e.markets.length - 1} onPress={() => router.push(`/market/${encodeURIComponent(m.marketId)}`)} onQuick={(side) => router.push(`/market/${encodeURIComponent(m.marketId)}?side=${side}`)} />
                  ))}
                </View>
              );
            })}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
