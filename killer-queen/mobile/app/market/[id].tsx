import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getKey, kq, subscribe } from '../../src/api';
import { BookLadder, Button, ErrorState, Field, H2, OrderTicket, PacketView, Panel, Pill, PriceCell, Skeleton } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function MarketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const [v, setV] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [thesis, setThesis] = useState('');
  const load = useCallback(async () => {
    try {
      setV(await kq.market(id));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
    setSignedIn(!!(await getKey()));
  }, [id]);
  useEffect(() => {
    void load();
    return subscribe(() => void load(), { markets: [id] });
  }, [load, id]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!v)
    return (
      <View style={{ padding: space.s4 }}>
        <Skeleton lines={10} />
      </View>
    );
  const m = v.market;
  const open = m.status === 'open';
  const blocked = m.status === 'pending' ? 'Trading opens after the baseline check.' : m.status === 'cancelled' ? 'This task was rejected at the baseline; the market never opened.' : null;
  const post = () =>
    kq
      .comment(id, thesis, null)
      .then(() => {
        setThesis('');
        void load();
      })
      .catch(() => undefined);
  return (
    <ScrollView contentContainerStyle={{ padding: space.s4 }}>
      <Text style={[type.title, { color: p.text }]}>
        Will {v.packet.executor.name} pass <Text style={type.mono}>{v.packet.testCommand}</Text>?
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, marginVertical: space.s2 }}>
        <Pill status={m.status} />
        <PriceCell value={v.quote.chance} big label="chance" />
        <Text style={[type.small, { color: p.muted }]}>
          last {v.quote.lastPrice ?? '—'} · vol {v.quote.volume} · {v.traders} traders
        </Text>
      </View>
      <Panel>
        <H2>Order book</H2>
        <BookLadder book={v.book} />
      </Panel>
      <Panel>
        <H2>Order ticket</H2>
        <OrderTicket marketId={id} open={open} signedIn={signedIn} blockedReason={blocked} onPlaced={() => void load()} />
      </Panel>
      <Panel>
        <H2>Packet</H2>
        <PacketView packet={v.packet} />
      </Panel>
      <Panel>
        <H2>Theses</H2>
        {signedIn && open && (
          <View>
            <Field label="Why will it pass or fail?" value={thesis} onChange={setThesis} testID="thesis-text" />
            <Button label="Post thesis" onPress={() => void post()} disabled={thesis.trim() === ''} testID="post-thesis" />
          </View>
        )}
        {v.theses.length === 0 && <Text style={[type.body, { color: p.muted }]}>No theses yet.</Text>}
        {v.theses.map((c: any) => (
          <View key={c.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: p.line }}>
            <Text style={[type.small, { color: p.muted }]}>
              <Text style={type.mono}>{c.account}</Text>
              {c.probability !== null ? ` · ${c.probability}%` : ''}
            </Text>
            <Text style={[type.body, { color: p.text }]}>{c.text}</Text>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
