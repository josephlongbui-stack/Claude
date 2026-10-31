import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { dollars, getKey, kq, signed, subscribe } from '../../src/api';
import { Button, EmptyState, ErrorState, H2, Panel, Pill, PlayMoney, Skeleton } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Portfolio() {
  const p = usePalette();
  const router = useRouter();
  const [pf, setPf] = useState<any | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const key = await getKey();
    setSignedIn(!!key);
    if (!key) return;
    try {
      setPf(await kq.portfolio());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    return subscribe(() => void load());
  }, [load]);
  if (signedIn === false) return <EmptyState title="Sign in on the Profile tab to see your portfolio." />;
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!pf)
    return (
      <View style={{ padding: space.s4 }}>
        <Skeleton lines={6} />
      </View>
    );
  const row = (k: string, v: string, color?: string) => (
    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={[type.body, { color: p.muted }]}>{k}</Text>
      <Text style={[type.num, type.body, { color: color ?? p.text }]} accessibilityLabel={`${k} ${v}`}>
        {v}
      </Text>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.s4 }}>
      <Panel testID="balances">
        <H2>Balance</H2>
        {row('Cash', dollars(pf.cash))}
        {row('Locked in orders', dollars(pf.locked))}
        {row('Realized P&L', signed(pf.pnl.realized), pf.pnl.realized >= 0 ? p.yes : p.no)}
        {row('Unrealized P&L', signed(pf.pnl.unrealized), pf.pnl.unrealized >= 0 ? p.yes : p.no)}
        {row('Fees paid', dollars(pf.pnl.fees))}
        {row('Total (net of fees)', signed(pf.pnl.total), pf.pnl.total >= 0 ? p.yes : p.no)}
        <PlayMoney />
      </Panel>
      <Panel testID="positions">
        <H2>Positions</H2>
        {pf.positions.length === 0 && <Text style={[type.body, { color: p.muted }]}>No open positions.</Text>}
        {pf.positions.map((x: any) => (
          <Pressable key={x.market} onPress={() => router.push(`/market/${encodeURIComponent(x.market)}`)} accessibilityRole="button" accessibilityLabel={`${x.title}, ${x.quantity} ${x.side}, unrealized ${signed(x.unrealized)}`} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: p.line }}>
            <Text style={[type.body, { color: p.text }]}>{x.title}</Text>
            <Text style={[type.small, { color: p.muted }]}>
              <Text style={type.mono}>{x.executorId}</Text> · <Text style={{ color: x.side === 'yes' ? p.yes : p.no }}>{x.quantity} {x.side}</Text> · avg {x.avgCost}¢ · mark {x.mark}¢ ·{' '}
              <Text style={{ color: x.unrealized >= 0 ? p.yes : p.no }}>{signed(x.unrealized)}</Text>
            </Text>
          </Pressable>
        ))}
      </Panel>
      <Panel>
        <H2>Open orders</H2>
        {pf.openOrders.length === 0 && <Text style={[type.body, { color: p.muted }]}>None.</Text>}
        {pf.openOrders.map((o: any) => (
          <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={[type.small, { color: p.text }]}>
              <Text style={type.mono}>{o.market}</Text> · <Text style={{ color: o.side === 'yes' ? p.yes : p.no }}>{o.side}</Text> {o.price}¢ × {o.quantity - o.filled}
            </Text>
            <Button label="Cancel" kind="ghost" onPress={() => kq.cancelOrder(o.id).then(load).catch(() => undefined)} />
          </View>
        ))}
      </Panel>
      <Panel>
        <H2>Settled history</H2>
        {pf.history.length === 0 && <Text style={[type.body, { color: p.muted }]}>Nothing settled yet.</Text>}
        {pf.history.map((h: any) => (
          <View key={h.market} style={{ paddingVertical: 4, borderBottomWidth: 1, borderColor: p.line }}>
            <Text style={[type.body, { color: p.text }]}>{h.title}</Text>
            <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'center' }}>
              <Pill status={h.closed.outcome} />
              <Text style={[type.small, type.num, { color: p.muted }]}>
                settled {h.closed.settlementPrice}¢ · payout {dollars(h.payout)} · <Text style={{ color: h.realized >= 0 ? p.yes : p.no }}>{signed(h.realized)}</Text>
              </Text>
            </View>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
