import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { ApiError, kq } from '../api';
import { radius, space, type, usePalette } from './tokens';

export function PlayMoney() {
  const p = usePalette();
  return (
    <Text style={[type.small, { color: p.muted }]} accessibilityLabel="Play money, no cash value">
      Play money · no cash value
    </Text>
  );
}

export function Pill({ status, label }: { status: string; label?: string }) {
  const p = usePalette();
  const color = ['open', 'passed'].includes(status) ? p.yes : ['pending', 'running'].includes(status) ? p.warn : ['rejected', 'cancelled', 'failed'].includes(status) ? p.no : ['closed', 'settled', 'resolved'].includes(status) ? p.accent : p.muted;
  return (
    <View style={{ borderColor: color, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1, alignSelf: 'flex-start' }} accessibilityLabel={`status ${label ?? status}`}>
      <Text style={[type.small, { color }]}>{label ?? status}</Text>
    </View>
  );
}

export function PriceCell({ value, side, big, label }: { value: number | null | undefined; side?: 'yes' | 'no'; big?: boolean; label?: string }) {
  const p = usePalette();
  const text = value === null || value === undefined ? '—' : `${value}¢`;
  return (
    <Text style={[type.num, big ? type.big : type.body, { color: side === 'yes' ? p.yes : side === 'no' ? p.no : p.text }]} accessibilityLabel={`${label ?? 'price'} ${text}`}>
      {text}
    </Text>
  );
}

export function Panel({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const p = usePalette();
  return (
    <View style={[{ backgroundColor: p.panel, borderColor: p.line, borderWidth: 1, borderRadius: radius.r2, padding: space.s3, marginBottom: space.s3 }, style]} testID={testID}>
      {children}
    </View>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={[type.label, { color: p.muted, marginBottom: space.s2 }]}>{children}</Text>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  const p = usePalette();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }), Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true })]));
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Animated.View key={i} style={{ height: 14, marginVertical: 6, borderRadius: radius.r1, backgroundColor: p.panel2, opacity, width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const p = usePalette();
  return (
    <View style={{ padding: space.s4, borderWidth: 1, borderStyle: 'dashed', borderColor: p.line, borderRadius: radius.r2, alignItems: 'center' }} accessibilityRole="text">
      <Text style={[type.body, { color: p.muted }]}>{title}</Text>
      {hint && <Text style={[type.small, { color: p.muted }]}>{hint}</Text>}
    </View>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const p = usePalette();
  return (
    <View style={{ padding: space.s4, borderWidth: 1, borderColor: p.no, borderRadius: radius.r2, alignItems: 'center' }} accessibilityRole="alert">
      <Text style={[type.body, { color: p.no }]}>Error: {message}</Text>
      {retry && <Button label="Try again" onPress={retry} />}
    </View>
  );
}

export function Button({ label, onPress, kind, disabled, testID }: { label: string; onPress: () => void; kind?: 'primary' | 'yes' | 'no' | 'ghost'; disabled?: boolean; testID?: string }) {
  const p = usePalette();
  const bg = kind === 'primary' ? p.accent : kind === 'yes' ? p.yesBg : kind === 'no' ? p.noBg : p.panel2;
  const fg = kind === 'primary' ? p.accentText : kind === 'yes' ? p.yes : kind === 'no' ? p.no : p.text;
  const border = kind === 'yes' ? p.yes : kind === 'no' ? p.no : kind === 'primary' ? p.accent : p.line;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} testID={testID} style={({ pressed }) => ({ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: radius.r1, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.8 : 1, marginVertical: space.s1 })}>
      <Text style={[type.body, { color: fg, fontWeight: kind === 'primary' ? '600' : '400', textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChange, keyboard, placeholder, testID }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'default' | 'numeric'; placeholder?: string; testID?: string }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: space.s2, flex: 1 }}>
      <Text style={[type.label, { color: p.muted, marginBottom: 3 }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard ?? 'default'} placeholder={placeholder} placeholderTextColor={p.muted} accessibilityLabel={label} testID={testID} style={{ backgroundColor: p.bg, color: p.text, borderColor: p.line, borderWidth: 1, borderRadius: radius.r1, padding: 10, minHeight: 44, ...type.body }} />
    </View>
  );
}

export interface Level {
  price: number;
  quantity: number;
  orders: number;
}

export function BookLadder({ book }: { book: { yes: Level[]; no: Level[] } }) {
  const p = usePalette();
  const maxQ = Math.max(1, ...book.yes.map((l) => l.quantity), ...book.no.map((l) => l.quantity));
  const thin = book.yes.length + book.no.length > 0 && book.yes.length + book.no.length < 3;
  const side = (levels: Level[], kind: 'yes' | 'no') => (
    <View style={{ flex: 1 }} accessibilityLabel={`${kind === 'yes' ? 'Yes' : 'No'} bids`}>
      <Text style={[type.label, { color: kind === 'yes' ? p.yes : p.no, marginBottom: 4 }]}>{kind === 'yes' ? 'Yes bids' : 'No bids (= Yes asks)'}</Text>
      {levels.length === 0 && <Text style={[type.small, { color: p.muted }]}>no bids</Text>}
      {levels.map((l) => (
        <View key={l.price} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.line }} accessibilityLabel={`${kind} ${l.price} cents, ${l.quantity} contracts`}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, [kind === 'yes' ? 'right' : 'left']: 0, width: `${(100 * l.quantity) / maxQ}%`, backgroundColor: kind === 'yes' ? p.yesBg : p.noBg }} />
          <Text style={[type.num, type.body, { color: p.text }]}>
            {l.price}¢{kind === 'no' ? ` (ask ${100 - l.price})` : ''}
          </Text>
          <Text style={[type.num, type.body, { color: p.text }]}>{l.quantity}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View>
      {thin && <Text style={[type.small, { color: p.warn, marginBottom: 4 }]}>Thin book: few resting orders; prices can move a lot on one trade.</Text>}
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        {side(book.yes, 'yes')}
        {side(book.no, 'no')}
      </View>
    </View>
  );
}

export function PacketView({ packet }: { packet: any }) {
  const p = usePalette();
  const row = (k: string, v: string) => (
    <View key={k} style={{ flexDirection: 'row', gap: space.s3, marginBottom: 4 }}>
      <Text style={[type.label, { color: p.muted, width: 92 }]}>{k}</Text>
      <Text style={[type.mono, { color: p.text, flex: 1 }]} selectable>
        {v}
      </Text>
    </View>
  );
  return (
    <View testID="packet">
      <Text style={[type.mono, { color: p.text, marginBottom: space.s2 }]} selectable>
        {packet.prompt}
      </Text>
      {row('Repo', `${packet.repo} @ ${packet.commit}`)}
      {row('Test', packet.testCommand)}
      {row('Executor', `${packet.executor.id} · ${packet.executor.org} · v${packet.executor.version} · ${packet.executor.passed}/${packet.executor.chosen}`)}
      {row('Baseline', packet.baseline)}
    </View>
  );
}

export function AgentRow({ m, chosen, onPress, testID }: { m: any; chosen?: boolean; onPress?: () => void; testID?: string }) {
  const p = usePalette();
  const chance = m.status === 'pending' || m.status === 'cancelled' ? null : m.status === 'settled' ? m.settlementPrice : m.status === 'open' ? m.quote.chance : m.closingPrice;
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${m.executorId}, chance ${chance ?? 'unknown'} cents`} testID={testID} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.s2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.line }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.mono, { color: p.accent }]}>{m.executorId}</Text>
        <Text style={[type.small, { color: p.muted }]}>
          {m.executor.org} · v{m.executor.version} · {m.executor.passed}/{m.executor.chosen} passed
        </Text>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
          {m.outcome && <Pill status={m.status} label={m.outcome} />}
          {chosen && <Pill status="running" label="chosen" />}
        </View>
      </View>
      <PriceCell value={chance} big label="chance" />
    </Pressable>
  );
}

export function OrderTicket({ marketId, open, signedIn, blockedReason, onPlaced }: { marketId: string; open: boolean; signedIn: boolean; blockedReason?: string | null; onPlaced?: (summary: string) => void }) {
  const p = usePalette();
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [market, setMarket] = useState(false);
  const [price, setPrice] = useState('50');
  const [qty, setQty] = useState('10');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!signedIn) return <Text style={[type.body, { color: p.muted }]}>Sign in on the Profile tab to trade.</Text>;
  if (!open || blockedReason) return <Text style={[type.body, { color: p.muted }]}>{blockedReason ?? 'Trading is closed.'}</Text>;
  const effPrice = market ? 99 : Number(price) || 0;
  const q = Number(qty) || 0;
  const place = async () => {
    setBusy(true);
    try {
      const body: Parameters<typeof kq.placeOrder>[0] = { marketId, side, quantity: q, type: market ? 'market' : 'limit' };
      if (!market) body.price = Number(price);
      const r = await kq.placeOrder(body);
      const filled = r.fills.reduce((a: number, f: any) => a + f.quantity, 0);
      const summary = `${side}: ${filled} filled${r.order.status === 'open' ? `, ${r.order.quantity - r.order.filled} resting` : ''}`;
      setResult(summary);
      if (filled > 0) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPlaced?.(summary);
    } catch (e) {
      setResult(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View testID="ticket" accessibilityLabel="Order ticket">
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <View style={{ flex: 1 }}>
          <Button label="Yes" kind={side === 'yes' ? 'yes' : 'ghost'} onPress={() => setSide('yes')} testID="side-yes" />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="No" kind={side === 'no' ? 'no' : 'ghost'} onPress={() => setSide('no')} testID="side-no" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <View style={{ flex: 1 }}>
          <Button label={market ? 'Market (IOC at 99¢)' : 'Limit'} kind="ghost" onPress={() => setMarket(!market)} testID="type-market" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        {!market && <Field label="Price (¢)" value={price} onChange={setPrice} keyboard="numeric" testID="price" />}
        <Field label="Quantity" value={qty} onChange={setQty} keyboard="numeric" testID="quantity" />
      </View>
      <Text style={[type.small, { color: p.muted, marginBottom: 4 }]}>
        Locks {effPrice + 1}¢ × {q} = <Text style={type.num}>${(((effPrice + 1) * q) / 100).toFixed(2)}</Text> (price + 1¢ taker fee)
      </Text>
      <Button label={`Buy ${side.toUpperCase()}`} kind="primary" onPress={place} disabled={busy || q < 1} testID="place-order" />
      {result && (
        <Text style={[type.body, { color: p.text, marginTop: 4 }]} testID="order-result" accessibilityLiveRegion="polite">
          {result}
        </Text>
      )}
      <PlayMoney />
    </View>
  );
}
