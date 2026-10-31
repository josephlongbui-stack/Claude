import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { kq, subscribe } from '../../src/api';
import { AgentRow, ErrorState, H2, Panel, Pill, Skeleton } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const router = useRouter();
  const [view, setView] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setView(await kq.task(id));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
    return subscribe(() => void load(), { tasks: [id] });
  }, [load, id]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!view)
    return (
      <View style={{ padding: space.s4 }}>
        <Skeleton lines={8} />
      </View>
    );
  const t = view.task;
  const baseline = t.baseline ? `failing ${t.baseline.results.filter((r: string) => r === 'failed').length}/${t.baseline.results.length}` : t.status === 'pending' ? 'running' : 'not run';
  return (
    <ScrollView contentContainerStyle={{ padding: space.s4 }}>
      <Text style={[type.title, { color: p.text }]}>{t.title}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: space.s2 }}>
        <Pill status={t.status} />
        {t.visibility === 'private' && <Pill status="pending" label="private" />}
      </View>
      <Panel>
        <H2>Packet</H2>
        <Text style={[type.mono, { color: p.text }]} selectable>
          {t.prompt}
        </Text>
        <Text style={[type.mono, { color: p.muted, marginTop: space.s2 }]}>
          {t.repo} @ {t.commit}
        </Text>
        <Text style={[type.mono, { color: p.muted }]}>$ {t.testCommand}</Text>
        <Text style={[type.small, { color: p.muted, marginTop: space.s1 }]}>baseline {baseline}</Text>
      </Panel>
      <Panel>
        <H2>Candidates</H2>
        {view.markets.map((m: any, i: number) => (
          <AgentRow key={m.marketId} m={m} chosen={t.chosenAgent === m.executorId} onPress={() => router.push(`/market/${encodeURIComponent(m.marketId)}`)} testID={`market-row-${i}`} />
        ))}
        {view.recommendation && (
          <Text style={[type.small, { color: p.muted, marginTop: space.s2 }]}>
            Market recommendation: <Text style={type.mono}>{view.recommendation.executorId}</Text> at {view.recommendation.chance}¢
          </Text>
        )}
      </Panel>
      <Panel testID={t.status === 'resolved' ? 'settlement' : undefined}>
        <H2>Outcome</H2>
        {t.status === 'pending' && <Text style={[type.body, { color: p.warn }]}>Baseline check running: trading opens once three agent-free test runs fail.</Text>}
        {t.status === 'open' && <Text style={[type.body, { color: p.muted }]}>Trading open. The customer decides on the web app when trading closes.</Text>}
        {t.status === 'closed' && <Text style={[type.body, { color: p.muted }]}>Trading closed; waiting for the customer to decide.</Text>}
        {t.status === 'running' && (
          <Text style={[type.body, { color: p.warn }]}>
            Runner is executing <Text style={type.mono}>{t.chosenAgent}</Text>…
          </Text>
        )}
        {t.status === 'resolved' && (
          <>
            <Text style={[type.body, { color: t.passed === null ? p.warn : t.passed ? p.yes : p.no, fontWeight: '700' }]}>
              {t.outcome === 'infra_error' ? 'Infrastructure error: settled at the closing price' : t.passed ? 'Tests passed · Yes paid 100¢' : 'Tests failed · No paid 100¢'}
            </Text>
            <Text style={[type.mono, { color: p.muted, marginTop: space.s2 }]} selectable>
              {t.runLog}
            </Text>
          </>
        )}
        {t.status === 'skipped' && <Text style={[type.body, { color: p.muted }]}>Skipped: every market settled at its closing price.</Text>}
        {t.status === 'rejected' && <Text style={[type.body, { color: p.no }]}>Rejected at the baseline: {t.rejectedReason}.</Text>}
      </Panel>
    </ScrollView>
  );
}
