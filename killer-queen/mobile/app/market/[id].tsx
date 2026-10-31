import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getKey, kq, subscribe } from '../../src/api';
import { BookLadder, Button, ChangeCell, Countdown, EmptyState, FetchError, Field, Money, OrderTicket, PacketView, Panel, PanelBody, PanelHead, PriceCell, PriceChart, Screen, SettlementPanel, Skeleton, StickyBar, ThesisList, TicketSheet, marketStatus, useToast, words } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function MarketScreen() {
  const { id, side } = useLocalSearchParams<{ id: string; side?: 'yes' | 'no' }>();
  const p = usePalette();
  const router = useRouter();
  const [v, setV] = useState<any | null>(null);
  const [task, setTask] = useState<any | null>(null);
  const [pf, setPf] = useState<any | null>(null);
  const [me, setMe] = useState<any | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'theses' | 'trades'>('theses');
  const [sheet, setSheet] = useState<null | 'yes' | 'no'>(side ?? null);
  const [thesis, setThesis] = useState('');
  const [prob, setProb] = useState('');
  const seenUnsettled = useRef(false);
  const [animate, setAnimate] = useState(false);
  const [toast, show] = useToast();
  const load = useCallback(async () => {
    try {
      const x = await kq.market(id);
      setV(x);
      setError(null);
      if (x.market.status !== 'settled') seenUnsettled.current = true;
      else if (seenUnsettled.current) {
        setAnimate(true);
        seenUnsettled.current = false;
      }
      kq.task(x.market.taskId).then(setTask).catch(() => undefined);
    } catch (e) {
      setError(e);
    }
    if (await getKey()) {
      const m = (await kq.me().catch(() => ({ account: null }))).account;
      setMe(m);
      if (m) kq.portfolio().then(setPf).catch(() => setPf(null));
    } else {
      setMe(null);
      setPf(null);
    }
  }, [id]);
  useEffect(() => {
    seenUnsettled.current = false;
    setAnimate(false);
    void load();
    return subscribe(() => void load(), { markets: [id] });
  }, [load, id]);
  if (error) return (error as any)?.status === 404 ? <EmptyState title="There is no market at this address" hint="It may have been removed, or the link is wrong." action={{ label: 'Go to the Arena', onPress: () => router.push('/') }} /> : <FetchError error={error} retry={() => void load()} />;
  if (!v)
    return (
      <Screen>
        <Skeleton shape="market" rows={5} />
      </Screen>
    );
  const m = v.market;
  const pk = v.packet;
  const open = m.status === 'open';
  const name = pk.executor.name;
  const st = marketStatus(m);
  const pos = pf?.positions?.find((x: any) => x.market === id) ?? null;
  const closed = pf?.history?.find((x: any) => x.market === id) ?? null;
  const myOrders = pf?.openOrders?.filter((o: any) => o.market === id) ?? [];
  const blocked = !me ? null : me.role !== 'trader' ? `${me.role === 'customer' ? 'Customers' : 'Staff accounts'} cannot trade. Create a trader account to buy and sell.` : task && task.task.customer === me.id ? 'You submitted this task, so you cannot trade its markets.' : me.org && me.org === pk.executor.org ? `You are at ${me.org}, which makes ${name}, so you cannot trade this market.` : null;
  const onTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed' || m.outcome === 'infra_error');
  const heroTone = m.status === 'settled' && m.outcome === 'passed' ? 'yes' : m.status === 'settled' && m.outcome === 'failed' ? 'no' : undefined;
  const heroLine = open ? null : m.status === 'pending' ? 'Trading opens after the baseline check.' : m.status === 'cancelled' ? 'The task was rejected at the baseline check; this market never opened.' : m.status === 'running' ? `Closed at ${m.closingPrice}¢. ${name} is running now; the market settles on the result.` : m.status === 'closed' ? `Closed at ${m.closingPrice}¢, waiting for the customer to pick an agent.` : m.outcome === 'passed' ? `${name} passed. Yes paid 100¢, No paid 0¢.` : m.outcome === 'failed' ? `${name} failed. No paid 100¢, Yes paid 0¢.` : m.outcome === 'infra_error' ? `No result. An infrastructure error stopped the run; settled at the closing price of ${m.settlementPrice}¢.` : `Settled at ${m.settlementPrice}¢, the closing price: the customer ran a different agent.`;
  const quote = { yesBid: v.quote.yesBid, yesAsk: v.quote.yesAsk, noBid: v.quote.noBid, noAsk: v.quote.noAsk };
  const post = async () => {
    const pr = prob.trim() === '' ? null : Math.floor(Number(prob));
    try {
      await kq.comment(id, thesis.trim(), pr);
      setThesis('');
      setProb('');
      show('Thesis posted.');
      await load();
    } catch (e) {
      show(words(e), 'error');
    }
  };
  const cancel = async (orderId: string) => {
    try {
      await kq.cancelOrder(orderId);
      show('Order cancelled; the lock is back in your cash.');
      await load();
    } catch (e) {
      show(words(e), 'error');
    }
  };
  const ticket = (compact: boolean) => <OrderTicket marketId={id} executorName={name} status={m.status} quote={quote} signedIn={!!me} cash={me?.cash} blockedReason={blocked} initialSide={compact ? (sheet ?? undefined) : (side ?? undefined)} onSignIn={() => router.push('/profile')} onPlaced={(summary) => { show(summary); setSheet(null); void load(); }} />;
  return (
    <>
      <Stack.Screen options={{ title: `${name} on ${pk.title}` }} />
      <Screen bottom={<>{open && <StickyBar yesAsk={v.quote.yesAsk} noAsk={v.quote.noAsk} onPick={(s) => setSheet(s)} />}{toast}</>}>
        <Pressable onPress={() => router.push(`/task/${encodeURIComponent(m.taskId)}`)} accessibilityRole="link">
          <Text style={[type.dense, { color: p.ink2 }]}>{pk.title}</Text>
        </Pressable>
        <View style={{ gap: space.s2 }}>
          <PriceCell cents={m.status === 'pending' || m.status === 'cancelled' ? null : v.quote.chance} size="xl" side={heroTone} label="chance" />
          {open ? (
            <Text style={[type.body, { color: p.ink2 }]} testID="chance">
              <Text style={{ color: p.ink, fontFamily: type.uiMedium.fontFamily }}>{v.quote.chance}% chance</Text> {name} passes <ChangeCell delta={v.quote.change} />{v.quote.change ? ' today' : ''}
            </Text>
          ) : (
            <Text style={[type.body, { color: p.ink2 }]} testID="chance">{heroLine}</Text>
          )}
          {open && <Countdown closesAt={pk.closesAt} label="Closes in" />}
        </View>
        <PriceChart points={v.priceHistory} />
        {onTests && task && task.task.chosenAgent === m.executorId && <SettlementPanel outcome={m.outcome} agentName={name} log={task.task.runLog} settledAt={task.task.resolvedAt} closingPrice={m.closingPrice} animate={animate} position={closed && (closed.closed.yes > 0 || closed.closed.no > 0) ? { side: closed.closed.yes > 0 ? 'yes' : 'no', quantity: closed.closed.yes > 0 ? closed.closed.yes : closed.closed.no, payout: closed.payout } : null} />}
        {!open && !onTests && pos === null && !closed && !me && (
          <Panel><PanelBody>{ticket(false)}</PanelBody></Panel>
        )}
        {(pos?.side || closed || myOrders.length > 0) && (
          <Panel testID="position">
            <PanelHead title={closed ? 'Your result' : 'Your position'} />
            <PanelBody>
              {closed && (
                <View style={{ gap: space.s1 }}>
                  {[['Held at close', closed.closed.yes > 0 ? `${closed.closed.yes} Yes` : closed.closed.no > 0 ? `${closed.closed.no} No` : 'nothing'], ['Paid out', <Money cents={closed.payout} />], ['Realized', <Money cents={closed.realized} signed />]].map(([k, val]) => (
                    <View key={String(k)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[type.dense, { color: p.ink2 }]}>{k as string}</Text>
                      {typeof val === 'string' ? <Text style={[type.dense, type.num, { color: p.ink }]}>{val}</Text> : val}
                    </View>
                  ))}
                </View>
              )}
              {pos?.side && (
                <Text style={[type.ui, type.num, { color: p.ink }]}>
                  <Text style={{ color: pos.side === 'yes' ? p.yes : p.no, fontFamily: type.uiMedium.fontFamily }}>{pos.quantity} {pos.side === 'yes' ? 'Yes' : 'No'}</Text> at an average of {pos.avgCost}¢, mark {pos.mark}¢, <Money cents={pos.unrealized} signed /> unrealized
                </Text>
              )}
              {myOrders.map((o: any) => (
                <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                  <Text style={[type.dense, type.num, { color: p.ink, flex: 1 }]}>
                    <Text style={{ color: o.side === 'yes' ? p.yes : p.no }}>{o.side === 'yes' ? 'Yes' : 'No'}</Text> {o.quantity - o.filled} left at {o.price}¢
                  </Text>
                  <Button label="Cancel" variant="quiet" onPress={() => cancel(o.id)} compact />
                </View>
              ))}
            </PanelBody>
          </Panel>
        )}
        <Panel>
          <BookLadder book={v.book} status={m.status} />
        </Panel>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: p.rule }} accessibilityRole="tablist">
          {(['theses', 'trades'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={{ minHeight: 44, justifyContent: 'center', marginRight: space.s4, borderBottomWidth: 2, borderColor: tab === t ? p.ink : 'transparent' }}>
              <Text style={[type.uiMedium, { color: tab === t ? p.ink : p.ink2 }]}>
                {t === 'theses' ? 'Theses' : 'Trades'} <Text style={{ color: p.ink3 }}>{t === 'theses' ? v.theses.length : v.trades.length}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'theses' ? (
          <View style={{ gap: space.s3 }}>
            {me && open && !blocked && (
              <View style={{ gap: space.s3 }}>
                <Field label="Your thesis" value={thesis} onChange={setThesis} placeholder="Why will it pass or fail?" help="Theses are public and stay with the market." testID="thesis-text" />
                <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'flex-end' }}>
                  <View style={{ width: 120 }}>
                    <Field label="Stated probability" value={prob} onChange={setProb} keyboard="numeric" suffix="%" placeholder="optional" />
                  </View>
                  <Button label="Post thesis" variant="primary" onPress={post} disabled={thesis.trim() === ''} testID="post-thesis" />
                </View>
              </View>
            )}
            <ThesisList theses={v.theses} onReport={me ? (cid) => kq.reportThesis(id, cid, 'reported from the app').then(() => show('Reported. An operator will look at it.')).catch(() => undefined) : undefined} />
          </View>
        ) : v.trades.length === 0 ? (
          <Text style={[type.ui, { color: p.ink2 }]}>No trades yet.</Text>
        ) : (
          <Panel>
            {v.trades.slice(0, 20).map((f: any, i: number) => (
              <View key={f.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.s4, paddingVertical: space.s2, borderTopWidth: i === 0 ? 0 : 1, borderColor: p.rule }}>
                <Text style={[type.dense, { color: f.takerSide === 'yes' ? p.yes : p.no }]}>{f.takerSide === 'yes' ? 'Bought Yes' : 'Bought No'}</Text>
                <Text style={[type.dense, type.num, { color: p.ink }]}>{f.quantity} at {f.yesPrice}¢</Text>
              </View>
            ))}
          </Panel>
        )}
        <PacketView packet={pk} status={st} closedLabel={m.status === 'settled' ? 'Settled' : open || m.status === 'pending' ? 'Trading closes' : 'Trading closed'} />
      </Screen>
      <TicketSheet visible={sheet !== null} onClose={() => setSheet(null)} title={name}>
        {ticket(true)}
      </TicketSheet>
    </>
  );
}
