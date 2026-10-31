import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getKey, kq, subscribe } from '../../src/api';
import { Button, EmptyState, FetchError, Money, PageTitle, Panel, Screen, SectionHead, Skeleton, StatusPill, count, dollars, useToast, words } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Portfolio() {
  const p = usePalette();
  const router = useRouter();
  const [pf, setPf] = useState<any | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [titles, setTitles] = useState<Record<string, { title: string; agent: string }>>({});
  const [toast, show] = useToast();
  const load = useCallback(async () => {
    const key = await getKey();
    setSignedIn(!!key);
    if (!key) return;
    try {
      const [p2, t] = await Promise.all([kq.portfolio(), kq.tasks().catch(() => ({ tasks: [] }))]);
      setPf(p2);
      const map: Record<string, { title: string; agent: string }> = {};
      for (const e of t.tasks) for (const m of e.markets) map[m.marketId] = { title: e.task.title, agent: `${m.executor.name} ${m.executor.version}` };
      setTitles(map);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    void load();
    return subscribe(() => void load());
  }, [load]);
  if (signedIn === false) return <EmptyState title="Sign in to see your portfolio" hint="New traders start with $1,000 in play money." action={{ label: 'Sign in', onPress: () => router.push('/profile') }} />;
  if (error) return <FetchError error={error} retry={() => void load()} />;
  if (!pf)
    return (
      <Screen>
        <PageTitle title="Portfolio" />
        <Skeleton shape="table" rows={6} />
      </Screen>
    );
  const cancel = async (id: string) => {
    try {
      await kq.cancelOrder(id);
      show('Order cancelled; the lock is back in your cash.');
      await load();
    } catch (e) {
      show(words(e), 'error');
    }
  };
  const openValue = pf.positions.reduce((a: number, x: any) => a + x.quantity * (x.side === 'yes' ? x.mark : 100 - x.mark), 0);
  const stat = (k: string, v: React.ReactNode) => (
    <View key={k} style={{ minWidth: '45%', gap: 2 }}>
      <Text style={[type.dense, { color: p.ink2 }]}>{k}</Text>
      {typeof v === 'string' ? <Text style={[type.numM, { color: p.ink }]}>{v}</Text> : v}
    </View>
  );
  const rowStyle = { paddingVertical: space.s3, paddingHorizontal: space.s4, borderTopWidth: 1, borderColor: p.rule, gap: 2 } as const;
  return (
    <Screen bottom={toast}>
      <PageTitle title="Portfolio" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, paddingBottom: space.s3, borderBottomWidth: 1, borderColor: p.rule }} testID="balances">
        {stat('Cash', dollars(pf.cash))}
        {stat('Locked in orders', dollars(pf.locked))}
        {stat('Open positions', dollars(openValue))}
        {stat('Total P&L', <Money cents={pf.pnl.total} signed style={type.numM} />)}
        <Text style={[type.caption, { color: p.ink3, width: '100%' }]}>Play money. No cash value.</Text>
      </View>
      <SectionHead title="Positions" aside={pf.positions.length ? `${pf.positions.length} open` : undefined} />
      <Panel testID="positions">
        {pf.positions.length === 0 ? (
          <EmptyState title="No positions yet" hint="Pick an agent in the Arena to make your first trade." action={{ label: 'Go to the Arena', onPress: () => router.push('/') }} />
        ) : (
          pf.positions.map((x: any, i: number) => (
            <Pressable key={x.market} onPress={() => router.push(`/market/${encodeURIComponent(x.market)}`)} accessibilityRole="link" style={[rowStyle, { borderTopWidth: i === 0 ? 0 : 1 }]}>
              <Text style={[type.ui, { fontFamily: type.uiMedium.fontFamily, color: p.ink }]}>{x.title}</Text>
              <Text style={[type.dense, { color: p.ink3 }]}>{titles[x.market]?.agent ?? x.executorId}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={[type.dense, type.num, { color: p.ink }]}>
                  <Text style={{ color: x.side === 'yes' ? p.yes : p.no, fontFamily: type.uiMedium.fontFamily }}>{count(x.quantity)} {x.side === 'yes' ? 'Yes' : 'No'}</Text> at {x.avgCost}¢, mark {x.mark}¢
                </Text>
                <Money cents={x.unrealized} signed style={type.dense} />
              </View>
            </Pressable>
          ))
        )}
      </Panel>
      <SectionHead title="Open orders" aside={pf.openOrders.length ? `${pf.openOrders.length} resting` : undefined} />
      <Panel testID="open-orders">
        {pf.openOrders.length === 0 ? (
          <EmptyState title="No resting orders" hint="Limit orders that do not fill at once wait here until they fill or you cancel them." />
        ) : (
          pf.openOrders.map((o: any, i: number) => (
            <View key={o.id} style={[rowStyle, { borderTopWidth: i === 0 ? 0 : 1, flexDirection: 'row', alignItems: 'center', gap: space.s3 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.ui, { fontFamily: type.uiMedium.fontFamily, color: p.ink }]}>{titles[o.market]?.title ?? o.market}</Text>
                <Text style={[type.dense, type.num, { color: p.ink2 }]}>
                  <Text style={{ color: o.side === 'yes' ? p.yes : p.no }}>{o.side === 'yes' ? 'Yes' : 'No'}</Text> {count(o.quantity - o.filled)} left at {o.price}¢
                </Text>
              </View>
              <Button label="Cancel" variant="quiet" onPress={() => cancel(o.id)} compact />
            </View>
          ))
        )}
      </Panel>
      <SectionHead title="Settled" aside={pf.history.length ? `${pf.history.length} ${pf.history.length === 1 ? 'market' : 'markets'}` : undefined} />
      <Panel testID="history">
        {pf.history.length === 0 ? (
          <EmptyState title="Nothing has settled yet" hint="Markets settle when the chosen agent finishes its run, or at the closing price when it is not chosen." />
        ) : (
          pf.history.map((h: any, i: number) => (
            <Pressable key={h.market} onPress={() => router.push(`/market/${encodeURIComponent(h.market)}`)} accessibilityRole="link" style={[rowStyle, { borderTopWidth: i === 0 ? 0 : 1 }]}>
              <Text style={[type.ui, { fontFamily: type.uiMedium.fontFamily, color: p.ink }]}>{h.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <StatusPill status={h.closed.outcome === 'passed' || h.closed.outcome === 'failed' ? h.closed.outcome : h.closed.outcome === 'infra_error' ? 'infra_error' : 'settled'} label={h.closed.outcome === 'passed' || h.closed.outcome === 'failed' ? undefined : `Settled at ${h.closed.settlementPrice}¢`} />
                <Text style={[type.dense, type.num, { color: p.ink2 }]}>
                  {h.closed.yes > 0 ? `${count(h.closed.yes)} Yes` : h.closed.no > 0 ? `${count(h.closed.no)} No` : '—'}, paid {dollars(h.payout)} <Money cents={h.realized} signed style={type.dense} />
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Panel>
    </Screen>
  );
}
