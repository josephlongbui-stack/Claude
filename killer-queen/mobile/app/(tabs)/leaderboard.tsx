import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { kq, signed, subscribe } from '../../src/api';
import { Button, EmptyState, ErrorState, Pill, Skeleton } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Leaderboard() {
  const p = usePalette();
  const [rows, setRows] = useState<any[] | null>(null);
  const [by, setBy] = useState<'profit' | 'accuracy'>('profit');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows((await kq.leaderboard()).leaderboard);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    return subscribe((t) => {
      if (t === 'task') void load();
    });
  }, [load]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!rows)
    return (
      <View style={{ padding: space.s4 }}>
        <Skeleton lines={8} />
      </View>
    );
  const sorted = by === 'profit' ? rows : rows.filter((r) => r.brier !== null).sort((a, b) => a.rankByAccuracy - b.rankByAccuracy);
  return (
    <FlatList
      data={sorted}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: space.s4 }}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', gap: space.s2, marginBottom: space.s3 }}>
          <View style={{ flex: 1 }}>
            <Button label="By profit" kind={by === 'profit' ? 'primary' : 'ghost'} onPress={() => setBy('profit')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="By accuracy" kind={by === 'accuracy' ? 'primary' : 'ghost'} onPress={() => setBy('accuracy')} />
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState title="Nobody has traded yet." />}
      renderItem={({ item: r }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }} accessibilityLabel={`rank ${by === 'profit' ? r.rankByProfit : r.rankByAccuracy}, ${r.name}, ${r.kind}, profit ${signed(r.profit)}`}>
          <Text style={[type.num, type.body, { color: p.muted, width: 28 }]}>{by === 'profit' ? r.rankByProfit : r.rankByAccuracy}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: p.text }]}>{r.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Pill status={r.kind} />
              <Text style={[type.small, { color: p.muted }]}>{r.org || '—'}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.num, type.body, { color: r.profit >= 0 ? p.yes : p.no }]}>{signed(r.profit)}</Text>
            <Text style={[type.num, type.small, { color: p.muted }]}>{r.brier === null ? 'no score' : `Brier ${r.brier.toFixed(3)} · ${r.hits}/${r.scored}`}</Text>
          </View>
        </View>
      )}
    />
  );
}
