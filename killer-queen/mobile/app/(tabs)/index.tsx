import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { kq, subscribe } from '../../src/api';
import { Button, EmptyState, ErrorState, Pill, PriceCell, Skeleton } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

type Filter = 'all' | 'open' | 'done';

export default function Markets() {
  const p = usePalette();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await kq.tasks();
      setTasks(r.tasks);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const stop = subscribe(() => void load());
    return stop;
  }, [load]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!tasks)
    return (
      <View style={{ padding: space.s4 }}>
        <Skeleton lines={8} />
      </View>
    );
  const shown = tasks.filter((t) => (filter === 'all' ? true : filter === 'open' ? ['pending', 'open', 'closed', 'running'].includes(t.task.status) : ['resolved', 'skipped', 'rejected'].includes(t.task.status)));
  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  return (
    <FlatList
      data={shown}
      keyExtractor={(t) => t.task.id}
      contentContainerStyle={{ padding: space.s4 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.muted} />}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', gap: space.s2, marginBottom: space.s3 }} accessibilityRole="tablist">
          {(['all', 'open', 'done'] as Filter[]).map((f) => (
            <View key={f} style={{ flex: 1 }}>
              <Button label={f} kind={filter === f ? 'primary' : 'ghost'} onPress={() => setFilter(f)} testID={`filter-${f}`} />
            </View>
          ))}
        </View>
      }
      ListEmptyComponent={<EmptyState title={tasks.length === 0 ? 'No tasks yet.' : `No ${filter} tasks.`} hint={tasks.length === 0 ? 'Submit one from the web app or run npm run seed on the exchange.' : undefined} />}
      renderItem={({ item: t, index }) => (
        <Pressable onPress={() => router.push(`/task/${encodeURIComponent(t.task.id)}`)} accessibilityRole="button" accessibilityLabel={`${t.task.title}, ${t.task.status}`} testID={`task-row-${index}`} style={{ backgroundColor: p.panel, borderColor: p.line, borderWidth: 1, borderRadius: 6, padding: space.s3, marginBottom: space.s2 }}>
          <Text style={[type.body, { color: p.text, fontWeight: '600' }]}>{t.task.title}</Text>
          <Text style={[type.mono, { color: p.muted }]}>
            {t.task.repo} @ {t.task.commit}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, marginTop: space.s1 }}>
            <Pill status={t.task.status} />
            {t.recommendation && (
              <Text style={[type.small, { color: p.muted }]}>
                market picks <Text style={type.mono}>{t.recommendation.executorId}</Text> at {t.recommendation.chance}¢
              </Text>
            )}
          </View>
          {t.markets.map((m: any) => (
            <View key={m.marketId} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s1 }}>
              <Text style={[type.mono, { color: p.text }]}>{m.executorId}</Text>
              <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'center' }}>
                {m.outcome && <Pill status={m.status} label={m.outcome} />}
                <PriceCell value={m.status === 'pending' || m.status === 'cancelled' ? null : m.status === 'settled' ? m.settlementPrice : m.quote.chance} label={`${m.executorId} chance`} />
              </View>
            </View>
          ))}
        </Pressable>
      )}
    />
  );
}
