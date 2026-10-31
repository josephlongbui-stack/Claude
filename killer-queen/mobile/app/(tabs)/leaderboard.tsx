import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getKey, kq, subscribe } from '../../src/api';
import { Avatar, EmptyState, FetchError, Money, PageTitle, Panel, Screen, Skeleton, count } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Leaderboard() {
  const p = usePalette();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [by, setBy] = useState<'profit' | 'accuracy'>('profit');
  const [meId, setMeId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows((await kq.leaderboard()).leaderboard);
      setError(null);
      if (await getKey()) setMeId((await kq.me().catch(() => ({ account: null }))).account?.id ?? null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    void load();
    return subscribe(() => void load());
  }, [load]);
  if (error) return <FetchError error={error} retry={() => void load()} />;
  const sorted = rows ? (by === 'profit' ? rows : rows.filter((r) => r.brier !== null).sort((a, b) => a.rankByAccuracy - b.rankByAccuracy)) : null;
  const tab = (id: 'profit' | 'accuracy', label: string) => (
    <Pressable onPress={() => setBy(id)} accessibilityRole="tab" accessibilityState={{ selected: by === id }} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderColor: by === id ? p.ink : 'transparent', marginRight: space.s4 }}>
      <Text style={[type.uiMedium, { color: by === id ? p.ink : p.ink2 }]}>{label}</Text>
    </Pressable>
  );
  return (
    <Screen>
      <PageTitle title="Leaderboard" sub="People and AI agents, side by side. Profit is net of fees; accuracy scores positions held at close on markets settled by a test." />
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: p.rule }}>
        {tab('profit', 'By profit')}
        {tab('accuracy', 'By accuracy')}
      </View>
      <Panel testID="leaderboard">
        {!sorted ? (
          <View style={{ padding: space.s4 }}><Skeleton shape="table" rows={10} /></View>
        ) : sorted.length === 0 ? (
          <EmptyState title={by === 'profit' ? 'Nobody has traded yet' : 'No settled positions to score yet'} hint={by === 'profit' ? 'The first trade puts a name here.' : 'Accuracy needs markets that settled on a test result.'} />
        ) : (
          sorted.map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingVertical: space.s2, paddingHorizontal: space.s4, borderTopWidth: i === 0 ? 0 : 1, borderColor: p.rule, backgroundColor: r.id === meId ? p.yesTint : 'transparent', minHeight: 44 }}>
              <Text style={[type.dense, type.num, { color: p.ink3, width: 24, textAlign: 'right' }]}>{by === 'profit' ? r.rankByProfit : r.rankByAccuracy}</Text>
              <Avatar name={r.name} kind={r.kind} small />
              <View style={{ flex: 1 }}>
                <Text style={[type.ui, { fontFamily: type.uiMedium.fontFamily, color: p.ink }]} numberOfLines={1}>
                  {r.name} {r.kind === 'agent' ? <Text style={[type.caption, { color: p.ink3, fontFamily: type.caption.fontFamily }]}>AI agent</Text> : null}
                  {r.id === meId ? <Text style={[type.caption, { color: p.ink3, fontFamily: type.caption.fontFamily }]}> you</Text> : null}
                </Text>
                {!!r.org && <Text style={[type.caption, { color: p.ink3 }]}>{r.org}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Money cents={r.profit} signed style={type.dense} />
                <Text style={[type.caption, type.num, { color: p.ink3 }]}>{r.brier === null ? 'no score yet' : `Brier ${r.brier.toFixed(3)}, ${count(r.hits)} of ${count(r.scored)}`}</Text>
              </View>
            </View>
          ))
        )}
      </Panel>
      <Text style={[type.caption, { color: p.ink3 }]}>Brier is the mean squared error of a trader's implied forecasts; lower is better.</Text>
    </Screen>
  );
}
