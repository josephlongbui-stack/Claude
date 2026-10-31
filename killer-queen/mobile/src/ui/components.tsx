/** The design system in React Native primitives: same names, states and words as src/web/ui. */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from 'react-native';
import { ApiError, count, dollars, kq, when } from '../api';
import { layout, priceToX, type RailMarker } from './oddsRailLayout';
import { radius, shadowFloat, size, space, type, usePalette, useReduceMotion } from './tokens';

export type { RailMarker } from './oddsRailLayout';

/* ---------- layout ---------- */

export function Screen({ children, testID, bottom }: { children: React.ReactNode; testID?: string; bottom?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.canvas }} testID={testID}>
      <ScrollView contentContainerStyle={{ padding: space.s4, paddingBottom: space.s16, gap: space.s4 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {bottom}
    </View>
  );
}

export function Panel({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const p = usePalette();
  return (
    <View style={[{ backgroundColor: p.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: p.ruleStrong, borderRadius: radius.panel, overflow: 'hidden' }, style]} testID={testID}>
      {children}
    </View>
  );
}

export function PanelHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.rule }}>
      <Text style={[type.h3, { color: p.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {aside}
    </View>
  );
}

export function PanelBody({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return <View style={{ padding: tight ? space.s3 : space.s4, paddingHorizontal: space.s4, gap: space.s3 }}>{children}</View>;
}

export function PageTitle({ title, sub, aside }: { title: string; sub?: string; aside?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ gap: space.s1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.s3 }}>
        <Text style={[type.h2, { color: p.ink, flex: 1 }]} accessibilityRole="header">
          {title}
        </Text>
        {aside}
      </View>
      {sub && <Text style={[type.ui, { color: p.ink2 }]}>{sub}</Text>}
    </View>
  );
}

export function SectionHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.s2 }}>
      <Text style={[type.h3, { color: p.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {typeof aside === 'string' ? <Text style={[type.dense, { color: p.ink3 }]}>{aside}</Text> : aside}
    </View>
  );
}

/* ---------- primitives ---------- */

export function Button({ label, onPress, variant = 'secondary', solid, disabled, testID, block, compact }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'yes' | 'no'; solid?: boolean; disabled?: boolean; testID?: string; block?: boolean; compact?: boolean }) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.ink : variant === 'yes' ? (solid ? p.yes : p.yesTint) : variant === 'no' ? (solid ? p.no : p.noTint) : variant === 'quiet' ? 'transparent' : p.surface;
  const fg = variant === 'primary' ? p.onInk : variant === 'yes' ? (solid ? p.onInk : p.yes) : variant === 'no' ? (solid ? p.onInk : p.no) : p.ink;
  const border = variant === 'primary' ? p.ink : variant === 'yes' ? p.yes : variant === 'no' ? p.no : variant === 'quiet' ? 'transparent' : p.ruleStrong;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} testID={testID} style={({ pressed }) => ({ minHeight: size.control, paddingHorizontal: compact ? space.s2 : space.s4, borderRadius: radius.control, backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth, borderColor: border, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1, alignSelf: block ? 'stretch' : 'auto' })}>
      <Text style={[type.uiMedium, type.num, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export type Status = 'open' | 'soon' | 'closed' | 'running' | 'passed' | 'failed' | 'settled' | 'skipped' | 'pending' | 'rejected' | 'cancelled' | 'infra_error' | 'resolved' | 'private' | 'demo';
const WORDS: Record<Status, string> = { open: 'Open', soon: 'Closing soon', closed: 'Closed', running: 'Running', passed: 'Passed', failed: 'Failed', settled: 'Settled at close', skipped: 'Skipped', pending: 'Baseline check', rejected: 'Rejected', cancelled: 'Cancelled', infra_error: 'No result', resolved: 'Resolved', private: 'Private', demo: 'Demo data' };

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const p = usePalette();
  const tone = status === 'open' || status === 'passed' ? [p.yes, p.yesTint] : status === 'soon' || status === 'running' || status === 'pending' || status === 'demo' || status === 'infra_error' ? [p.warn, p.warnTint] : status === 'failed' || status === 'rejected' ? [p.no, p.noTint] : [p.ink2, p.surfaceSunken];
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s1, height: space.s6, paddingHorizontal: space.s2, borderRadius: radius.control, backgroundColor: tone[1] }}>
      {(status === 'open' || status === 'soon' || status === 'running') && <View style={{ width: 6, height: 6, borderRadius: radius.round, backgroundColor: tone[0] }} />}
      <Text style={[type.caption, { fontFamily: type.uiMedium.fontFamily, color: tone[0] }]}>{label ?? WORDS[status]}</Text>
    </View>
  );
}

export function taskStatus(t: { status: string; closesAt?: number; passed?: boolean | null; outcome?: string | null }, now = Date.now()): Status {
  if (t.status === 'open') return t.closesAt !== undefined && t.closesAt - now < 60_000 ? 'soon' : 'open';
  if (t.status === 'resolved') return t.outcome === 'infra_error' ? 'infra_error' : t.passed ? 'passed' : 'failed';
  return (['closed', 'running', 'skipped', 'pending', 'rejected'].includes(t.status) ? t.status : 'closed') as Status;
}
export function marketStatus(m: { status: string; outcome?: string | null }): Status {
  if (m.status === 'settled') return m.outcome === 'passed' || m.outcome === 'failed' ? m.outcome : m.outcome === 'infra_error' ? 'infra_error' : 'settled';
  return (['open', 'closed', 'running', 'pending', 'cancelled'].includes(m.status) ? m.status : 'closed') as Status;
}

export function PriceCell({ cents, size: sz = 'm', side, label }: { cents: number | null | undefined; size?: 'dense' | 'm' | 'l' | 'xl'; side?: 'yes' | 'no'; label?: string }) {
  const p = usePalette();
  const none = cents === null || cents === undefined;
  const st = sz === 'xl' ? type.numXl : sz === 'l' ? type.numL : sz === 'm' ? type.numM : { ...type.dense, fontFamily: type.uiMedium.fontFamily, ...type.num };
  return (
    <Text style={[st, { color: side === 'yes' ? p.yes : side === 'no' ? p.no : p.ink }]} maxFontSizeMultiplier={sz === 'xl' ? 1.2 : 1.5} accessibilityLabel={none ? `${label ?? 'price'} not available` : `${label ? `${label} ` : ''}${cents} cents`}>
      {none ? '—' : `${cents}¢`}
    </Text>
  );
}

export function ChangeCell({ delta }: { delta: number | null | undefined }) {
  const p = usePalette();
  if (delta === null || delta === undefined) return <Text style={[type.dense, type.num, { color: p.ink3 }]}>—</Text>;
  if (delta === 0) return <Text style={[type.dense, type.num, { color: p.ink3 }]} accessibilityLabel="unchanged">0</Text>;
  const up = delta > 0;
  return (
    <Text style={[type.dense, type.num, { color: up ? p.yes : p.no }]} accessibilityLabel={`${up ? 'up' : 'down'} ${Math.abs(delta)}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </Text>
  );
}

export function Money({ cents, signed, style }: { cents: number; signed?: boolean; style?: any }) {
  const p = usePalette();
  const color = signed ? (cents > 0 ? p.yes : cents < 0 ? p.no : p.ink) : p.ink;
  return <Text style={[type.ui, type.num, { color }, style]}>{signed && cents > 0 ? `+${dollars(cents)}` : dollars(cents)}</Text>;
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function Countdown({ closesAt, label, big }: { closesAt: number; label?: string; big?: boolean }) {
  const p = usePalette();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = closesAt - now;
  const soon = left < 60_000;
  const text = left <= 0 ? 'Closing' : formatCountdown(left);
  return (
    <Text style={[type.dense, { color: p.ink2 }]} accessibilityLabel={`${label ?? 'Closes in'} ${text}`}>
      {label ? `${label} ` : ''}
      <Text style={[big ? type.numM : { ...type.dense, fontFamily: type.uiMedium.fontFamily }, type.num, { color: soon ? p.warn : p.ink }]}>{text}</Text>
    </Text>
  );
}

export function Avatar({ name, kind, small }: { name: string; kind: 'human' | 'agent' | 'system'; small?: boolean }) {
  const p = usePalette();
  const d = small ? space.s6 : space.s8;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <View accessibilityLabel={`${name}${kind === 'agent' ? ', AI agent' : ''}`} style={{ width: d, height: d, borderRadius: kind === 'agent' ? radius.control : radius.round, backgroundColor: p.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: p.ruleStrong, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.caption, { fontFamily: type.uiMedium.fontFamily, color: p.ink2 }]}>{kind === 'agent' ? 'AI' : initials}</Text>
    </View>
  );
}

export function Field({ label, value, onChange, keyboard, placeholder, help, error, testID, secure, suffix, disabled }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'default' | 'numeric'; placeholder?: string; help?: string; error?: string | null; testID?: string; secure?: boolean; suffix?: string; disabled?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ gap: space.s1 }}>
      <Text style={[type.dense, { color: p.ink2 }]}>{label}</Text>
      <View>
        <TextInput value={value} onChangeText={onChange} keyboardType={keyboard === 'numeric' ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor={p.ink3} secureTextEntry={secure} editable={!disabled} accessibilityLabel={label} testID={testID} style={[type.ui, type.num, { color: disabled ? p.ink3 : p.ink, backgroundColor: disabled ? p.surfaceSunken : p.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: error ? p.no : p.ruleStrong, borderRadius: radius.control, height: size.control, paddingHorizontal: space.s3, paddingRight: suffix ? space.s8 : space.s3 }]} />
        {suffix && <Text style={[type.dense, { color: p.ink3, position: 'absolute', right: space.s3, top: (size.control - 18) / 2 }]}>{suffix}</Text>}
      </View>
      {error ? <Text style={[type.caption, { color: p.no }]} accessibilityLiveRegion="polite">{error}</Text> : help ? <Text style={[type.caption, { color: p.ink3 }]}>{help}</Text> : null}
    </View>
  );
}

export function Check({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const p = usePalette();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: size.touch }}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.ink, false: p.ruleStrong }} thumbColor={p.surface} />
      <Text style={[type.ui, { color: p.ink, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, hint, action, kind = 'empty', testID }: { title: string; hint?: string; action?: { label: string; onPress: () => void }; kind?: 'empty' | 'error' | 'offline'; testID?: string }) {
  const p = usePalette();
  return (
    <View style={{ padding: space.s6, gap: space.s1 }} accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'} testID={testID}>
      <Text style={[type.body, { fontFamily: type.uiMedium.fontFamily, color: kind === 'error' ? p.no : p.ink }]}>{title}</Text>
      {hint && <Text style={[type.ui, { color: p.ink2 }]}>{hint}</Text>}
      {action && (
        <View style={{ marginTop: space.s3, alignSelf: 'flex-start' }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      )}
    </View>
  );
}

export function FetchError({ error, retry }: { error: unknown; retry: () => void }) {
  const offline = error instanceof TypeError || (error as any)?.status === 0;
  return offline ? <EmptyState kind="offline" title="You are offline" hint="Prices will update when the connection is back." action={{ label: 'Try again', onPress: retry }} /> : <EmptyState kind="error" title="The exchange did not answer" hint={error instanceof Error ? error.message : 'Try again in a moment.'} action={{ label: 'Try again', onPress: retry }} />;
}

export function Skeleton({ rows = 4, shape = 'text' }: { rows?: number; shape?: 'text' | 'table' | 'market' }) {
  const p = usePalette();
  const bar = (w: string | number, h = 20) => <View style={{ width: w as any, height: h, borderRadius: radius.control, backgroundColor: p.surfaceSunken }} />;
  return (
    <View style={{ gap: space.s2 }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {shape === 'market' && bar('30%', 72)}
      {shape === 'market' && bar('100%', 140)}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.s3 }}>
          {bar(shape === 'table' ? '45%' : i === rows - 1 ? '60%' : '100%')}
          {shape === 'table' && bar('15%')}
          {shape === 'table' && bar('20%')}
        </View>
      ))}
    </View>
  );
}

/* ---------- market pieces ---------- */

export interface MarketSummary {
  marketId: string;
  executorId: string;
  executor: { id: string; name: string; org: string; version: string; chosen: number; passed: number };
  status: string;
  outcome?: string | null;
  quote: { yesBid: number | null; yesAsk: number | null; volume: number; chance: number; change?: number | null };
  closingPrice: number | null;
  settlementPrice: number | null;
  traders?: number;
}

export function chanceOf(m: MarketSummary): number | null {
  if (m.status === 'pending' || m.status === 'cancelled') return null;
  if (m.status === 'settled') return m.settlementPrice;
  if (m.status === 'open') return m.quote.chance;
  return m.closingPrice;
}

/** One candidate: name and version, chance and change, the Yes/No buttons when open. */
export function AgentRow({ m, chosen, onPress, onQuick, last }: { m: MarketSummary; chosen?: boolean; onPress?: () => void; onQuick?: (side: 'yes' | 'no') => void; last?: boolean }) {
  const p = usePalette();
  const chance = chanceOf(m);
  const st = marketStatus(m);
  const settled = m.status === 'settled';
  const tone = st === 'passed' ? 'yes' : st === 'failed' ? 'no' : undefined;
  const askNo = m.quote.yesBid === null ? null : 100 - m.quote.yesBid;
  const label = `${m.executor.name}, ${chance === null ? 'no price' : `${chance} cents, ${chance} percent chance to pass`}${m.quote.change ? (m.quote.change > 0 ? `, up ${m.quote.change}` : `, down ${-m.quote.change}`) : ''}`;
  return (
    <View style={{ paddingVertical: space.s2, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: p.rule, gap: space.s2 }} testID={`market-row-${m.executorId}`}>
      <Pressable onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: size.touch }}>
        <View style={{ flex: 1, gap: space.s1 }}>
          <Text style={[type.ui, { color: p.ink }]}>
            <Text style={{ fontFamily: type.uiMedium.fontFamily }}>{m.executor.name}</Text> <Text style={{ color: p.ink3 }}>{m.executor.version}</Text>
          </Text>
          {(chosen || settled || m.status === 'running' || m.status === 'pending' || m.status === 'cancelled') && <StatusPill status={m.status === 'running' || (chosen && !settled) ? 'running' : st} label={settled && st === 'settled' ? `Settled at ${m.closingPrice}¢` : undefined} />}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <PriceCell cents={chance} size="m" side={tone} label="chance" />
          {m.status === 'open' && <ChangeCell delta={m.quote.change ?? null} />}
        </View>
      </Pressable>
      {m.status === 'open' && onQuick && (
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          <View style={{ flex: 1 }}>{m.quote.yesAsk === null ? <Text style={[type.caption, { color: p.ink3 }]}>No asks yet</Text> : <Button label={`Yes ${m.quote.yesAsk}¢`} variant="yes" onPress={() => onQuick('yes')} block />}</View>
          <View style={{ flex: 1 }}>{askNo !== null && <Button label={`No ${askNo}¢`} variant="no" onPress={() => onQuick('no')} block />}</View>
        </View>
      )}
    </View>
  );
}

export function railMarkers(markets: MarketSummary[], chosen: string | null): RailMarker[] {
  const live = markets.filter((m) => m.status === 'open');
  const best = live.length ? Math.max(...live.map((m) => m.quote.chance)) : null;
  return markets
    .map((m): RailMarker | null => {
      const c = chanceOf(m);
      if (c === null) return null;
      const onTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed');
      return { id: m.executorId, name: m.executor.name, price: onTests ? (m.outcome === 'passed' ? 99 : 1) : c, bid: m.quote.yesBid, ask: m.quote.yesAsk, lead: m.status === 'open' ? m.quote.chance === best : chosen === m.executorId, state: onTests ? (m.outcome === 'passed' ? 'settled-yes' : 'settled-no') : m.status === 'open' ? 'live' : 'closed', note: onTests ? (m.outcome === 'passed' ? 'passed' : 'failed') : m.status === 'settled' ? `settled at ${m.settlementPrice}¢` : m.status === 'running' ? `${c}¢, running` : m.status === 'closed' ? `closed at ${c}¢` : undefined };
    })
    .filter((m): m is RailMarker => m !== null);
}

/** Every candidate on one 1–99¢ axis; labels spread so they never overlap, with leaders to their pins; markers glide with a spring. */
export function OddsRail({ markers }: { markers: RailMarker[] }) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(358);
  const anim = useRef<Record<string, Animated.Value>>({}).current;
  for (const m of markers) anim[m.id] ??= new Animated.Value(priceToX(m.price, width));
  useEffect(() => {
    for (const m of markers) {
      const v = anim[m.id]!;
      const to = priceToX(m.price, width);
      if (reduce) v.setValue(to);
      else Animated.spring(v, { toValue: to, stiffness: 300, damping: 30, mass: 1, useNativeDriver: false }).start();
    }
  }, [markers.map((m) => `${m.id}:${m.price}`).join(','), width, reduce]);
  const widthOf = (m: RailMarker) => (m.name.length + (m.note ?? `${m.price}¢`).length) * 7.2 + 12;
  const l = layout(markers, widthOf, width);
  const rowH = 22;
  const top = l.legend ? 28 : l.rows * rowH + 10;
  const sr = markers.map((m) => `${m.name}, ${m.note ?? `${m.price} cents`}`).join('. ');
  const tone = (m: RailMarker) => (m.state === 'settled-yes' ? p.yes : m.state === 'settled-no' ? p.no : m.state === 'closed' ? p.ink3 : m.lead ? p.ink : p.ink2);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={`Odds rail: ${sr}`} style={{ paddingTop: top, paddingBottom: 26 }}>
      <View style={{ height: 3, backgroundColor: p.ruleStrong, borderRadius: 3 }}>
        {[1, 25, 50, 75, 99].map((t) => (
          <View key={t} style={{ position: 'absolute', left: priceToX(t, width), top: -4, width: StyleSheet.hairlineWidth, height: 11, backgroundColor: p.ruleStrong }}>
            <Text style={[type.caption, { color: p.ink3, position: 'absolute', top: 12, left: -12, width: 24, textAlign: 'center' }]}>{t}¢</Text>
          </View>
        ))}
        {l.placed.map((m) => (
          <Animated.View key={m.id} style={{ position: 'absolute', left: anim[m.id]!, top: -16, width: 3, height: 23, marginLeft: -1, backgroundColor: tone(m), borderRadius: 1 }} />
        ))}
        {l.placed.map((m) =>
          l.legend ? null : (
            <View key={`l${m.id}`} style={{ position: 'absolute', left: m.lx, bottom: 14 + m.row * rowH, transform: [{ translateX: -widthOf(m) / 2 }], flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[type.dense, { color: m.lead ? p.ink : p.ink2, fontFamily: m.lead ? type.uiMedium.fontFamily : type.dense.fontFamily }]} numberOfLines={1}>
                {m.name}
              </Text>
              <Text style={[type.numM, { fontSize: 16, lineHeight: 18, color: tone(m) }]}>{m.note ?? `${m.price}¢`}</Text>
            </View>
          ),
        )}
      </View>
      {l.legend && (
        <View style={{ marginTop: space.s4, flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 }}>
          {l.placed.map((m, i) => (
            <Text key={m.id} style={[type.dense, { color: p.ink2 }]}>
              <Text style={{ fontFamily: type.uiMedium.fontFamily }}>{i + 1}</Text> {m.name} <Text style={{ color: tone(m), fontFamily: type.uiMedium.fontFamily }}>{m.note ?? `${m.price}¢`}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export interface Level {
  price: number;
  quantity: number;
  orders: number;
}

/** Yes bids | price | No bids around the spread, depth in the tints. */
export function BookLadder({ book, status, depth = 5 }: { book: { yes: Level[]; no: Level[] }; status: string; depth?: number }) {
  const p = usePalette();
  const yes = book.yes.slice(0, depth);
  const asks = book.no.slice(0, depth).map((l) => ({ ...l, yesPrice: 100 - l.price }));
  const max = Math.max(1, ...yes.map((l) => l.quantity), ...asks.map((l) => l.quantity));
  const n = yes.length + asks.length;
  const note = (t: string, warn?: boolean) => (
    <View style={{ padding: space.s3, backgroundColor: warn ? p.warnTint : 'transparent', borderRadius: radius.control }}>
      <Text style={[type.dense, { color: warn ? p.warn : p.ink2 }]}>{t}</Text>
    </View>
  );
  if (status !== 'open' && n === 0) return note('The order book cleared when trading closed.');
  if (n === 0) return note('No resting orders yet. The first limit order sets the price.');
  const spread = yes[0] && asks[0] ? asks[0].yesPrice - yes[0].price : null;
  const row = (key: string, yq: number | null, price: number, nq: number | null) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 26, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.rule }} accessibilityLabel={yq !== null ? `${yq} Yes at ${price} cents` : `${nq} No at ${100 - price} cents`}>
      <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: space.s3 }}>
        {yq !== null && <View style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: `${Math.round((100 * yq) / max)}%`, backgroundColor: p.yesTint }} />}
        {yq !== null && <Text style={[type.dense, type.num, { color: p.ink }]}>{yq}</Text>}
      </View>
      <Text style={[type.dense, type.num, { width: 64, textAlign: 'center', fontFamily: type.uiMedium.fontFamily, color: yq !== null ? p.yes : p.no }]}>{price}¢</Text>
      <View style={{ flex: 1, justifyContent: 'center', paddingLeft: space.s3 }}>
        {nq !== null && <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: `${Math.round((100 * nq) / max)}%`, backgroundColor: p.noTint }} />}
        {nq !== null && <Text style={[type.dense, type.num, { color: p.ink }]}>{nq}</Text>}
      </View>
    </View>
  );
  return (
    <View>
      {(yes.length === 0 || asks.length === 0) && note('Thin book: only one side has resting orders, so one trade can move the price a lot.', true)}
      <View style={{ flexDirection: 'row', backgroundColor: p.surfaceSunken, paddingVertical: space.s2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.ruleStrong }}>
        <Text style={[type.dense, { flex: 1, textAlign: 'right', paddingRight: space.s3, color: p.ink2 }]}>Yes bids</Text>
        <Text style={[type.dense, { width: 64, textAlign: 'center', color: p.ink2 }]}>Price</Text>
        <Text style={[type.dense, { flex: 1, paddingLeft: space.s3, color: p.ink2 }]}>No bids</Text>
      </View>
      {[...asks].reverse().map((l) => row(`a${l.price}`, null, l.yesPrice, l.quantity))}
      <View style={{ alignItems: 'center', paddingVertical: space.s1, backgroundColor: p.surfaceSunken }}>
        <Text style={[type.dense, { color: p.ink2 }]}>{spread === null ? (yes.length === 0 ? 'no bids' : 'no asks') : `spread ${spread}¢`}</Text>
      </View>
      {yes.map((l) => row(`b${l.price}`, l.quantity, l.price, null))}
    </View>
  );
}

/** Step line on the 1–99 axis, drawn with views (no SVG dependency). */
export function PriceChart({ points, height = 140 }: { points: { at: number; price: number }[]; height?: number }) {
  const p = usePalette();
  const [width, setWidth] = useState(300);
  const W = Math.max(60, width - 40);
  const y = (pr: number) => height - 1 - ((pr - 1) / 98) * (height - 2);
  const n = points.length;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityLabel={n === 0 ? 'No trades yet' : `Yes price over ${n} trades, last ${points[n - 1]!.price} cents`}>
      {n === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: p.ruleStrong, borderRadius: radius.control }}>
          <Text style={[type.dense, { color: p.ink2 }]}>No trades yet. The first trade starts the price history.</Text>
        </View>
      ) : (
        <>
          {[1, 25, 50, 75, 99].map((g) => (
            <View key={g} style={{ position: 'absolute', left: 0, top: y(g), width: W, height: StyleSheet.hairlineWidth, backgroundColor: g === 1 || g === 99 ? p.ruleStrong : p.rule }}>
              <Text style={[type.caption, { color: p.ink3, position: 'absolute', left: W + 8, top: g === 99 ? -2 : g === 1 ? -14 : -8 }]}>{g}¢</Text>
            </View>
          ))}
          {points.map((pt, i) => {
            if (n === 1) return <View key={i} style={{ position: 'absolute', left: W / 2 - 4, top: y(pt.price) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: p.ink }} />;
            const x0 = (i / (n - 1)) * W;
            const x1 = ((i + 1) / (n - 1)) * W;
            const next = points[i + 1];
            return (
              <React.Fragment key={i}>
                {i < n - 1 && <View style={{ position: 'absolute', left: x0, top: y(pt.price) - 1, width: Math.max(1, x1 - x0), height: 2, backgroundColor: p.ink }} />}
                {next && next.price !== pt.price && <View style={{ position: 'absolute', left: x1 - 1, top: Math.min(y(pt.price), y(next.price)), width: 2, height: Math.abs(y(pt.price) - y(next.price)), backgroundColor: p.ink }} />}
                {i === n - 1 && <View style={{ position: 'absolute', left: W - 4, top: y(pt.price) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: p.ink }} />}
              </React.Fragment>
            );
          })}
        </>
      )}
    </View>
  );
}

export function PacketView({ packet, status, closedLabel }: { packet: any; status: Status; closedLabel?: string }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const row = (k: string, v: React.ReactNode, mono?: boolean) => (
    <View key={k} style={{ gap: 2 }}>
      <Text style={[type.caption, { color: p.ink3 }]}>{k}</Text>
      {typeof v === 'string' ? <Text style={[mono ? type.mono : type.ui, { color: p.ink }]}>{v}</Text> : v}
    </View>
  );
  const b = /failing (\d+)\/(\d+)/.exec(packet.baseline);
  return (
    <Panel testID="packet">
      <PanelHead title="Packet" aside={<StatusPill status={status} />} />
      <PanelBody>
        {row('Agent', (
          <View>
            <Text style={[type.ui, { color: p.ink }]}>
              <Text style={{ fontFamily: type.uiMedium.fontFamily }}>{packet.executor.name}</Text> <Text style={{ color: p.ink3 }}>{packet.executor.version}</Text>
            </Text>
            <Text style={[type.dense, { color: p.ink2 }]}>{packet.executor.chosen === 0 ? 'No runs yet on this version' : `Passed ${packet.executor.passed} of ${packet.executor.chosen} runs on this version`}</Text>
          </View>
        ))}
        {row('Prompt', (
          <View style={{ gap: space.s1 }}>
            <View style={{ backgroundColor: p.surfaceSunken, borderRadius: radius.control, padding: space.s3 }}>
              <Text style={[type.mono, { color: p.ink }]} numberOfLines={open ? undefined : 8}>
                {packet.prompt}
              </Text>
            </View>
            {packet.prompt.length > 420 && (
              <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" style={{ minHeight: size.touch, justifyContent: 'center' }}>
                <Text style={[type.dense, { color: p.ink, textDecorationLine: 'underline' }]}>{open ? 'Show less' : 'Show the whole prompt'}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {row('Repository', packet.repo, true)}
        {row('Commit', packet.commit, true)}
        {row('Test command', packet.testCommand, true)}
        {row('Baseline', b ? `Failing ${b[1]} of ${b[2]} before any agent` : packet.baseline === 'pending' ? 'Running now' : 'Not required for this task')}
        {row(closedLabel ?? 'Trading closes', when(packet.closesAt))}
      </PanelBody>
    </Panel>
  );
}

/* ---------- ticket ---------- */

export interface TicketQuote {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
}

/** The order ticket: side, contracts, limit price, cost, fee, total, what it pays, one button that says what happens. A success haptic on every fill. */
export function OrderTicket({ marketId, executorName, status, quote, signedIn, cash, blockedReason, initialSide, onPlaced, onSignIn }: { marketId: string; executorName: string; status: string; quote: TicketQuote; signedIn: boolean; cash?: number; blockedReason?: string | null; initialSide?: 'yes' | 'no'; onPlaced?: (summary: string) => void; onSignIn?: () => void }) {
  const p = usePalette();
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [side, setSide] = useState<'yes' | 'no'>(initialSide ?? 'yes');
  const [market, setMarket] = useState(false);
  const ask = (s: 'yes' | 'no') => (s === 'yes' ? quote.yesAsk : quote.noAsk);
  const bid = (s: 'yes' | 'no') => (s === 'yes' ? quote.yesBid : quote.noBid);
  const [price, setPrice] = useState(String(ask(initialSide ?? 'yes') ?? 50));
  const [qty, setQty] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initialSide) {
      setSide(initialSide);
      const a = ask(initialSide);
      if (a !== null) setPrice(String(a));
    }
  }, [initialSide]);
  const muted = (t: string, testID?: string) => (
    <Text style={[type.ui, { color: p.ink2 }]} testID={testID}>
      {t}
    </Text>
  );
  if (!signedIn)
    return (
      <View style={{ gap: space.s3 }}>
        {muted('Trading is free and uses play money. New traders start with $1,000.')}
        <Button label="Start trading with $1,000 in play money" variant="primary" onPress={() => onSignIn?.()} block testID="ticket-signin" />
      </View>
    );
  if (blockedReason) return muted(blockedReason, 'ticket-blocked');
  if (status !== 'open') return muted(status === 'pending' ? 'Trading opens after the baseline check confirms the tests fail at the pinned commit.' : status === 'cancelled' ? 'This task was rejected at the baseline check, so the market never opened.' : status === 'running' ? 'Trading has closed. The chosen agent is running now; the market settles on its result.' : 'Trading has closed on this market.', 'ticket-closed');
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const pr = market ? 99 : Math.min(99, Math.max(1, Math.floor(Number(price) || 0)));
  const lockPrice = action === 'buy' ? pr : 100 - pr;
  const cost = q * lockPrice;
  const fee = q;
  const short = cash !== undefined && q >= 1 && cost + fee > cash;
  const Side = side === 'yes' ? 'Yes' : 'No';
  const pick = (s: 'yes' | 'no') => {
    setSide(s);
    const ref = action === 'buy' ? ask(s) : bid(s);
    if (ref !== null) setPrice(String(ref));
    setError(null);
  };
  const place = async () => {
    if (short) {
      setError(`Not enough play money. You need ${dollars(cost + fee)} and have ${dollars(cash ?? 0)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof kq.placeOrder>[0] = { marketId, side, action, quantity: q, type: market ? 'market' : 'limit' };
      if (!market) body.price = pr;
      const r = await kq.placeOrder(body);
      const filled = r.fills.reduce((a: number, f: any) => a + f.quantity, 0);
      const avg = filled ? Math.round(r.fills.reduce((a: number, f: any) => a + f.quantity * (side === 'yes' ? f.yesPrice : 100 - f.yesPrice), 0) / filled) : null;
      const resting = r.order.quantity - r.order.filled;
      const summary = filled ? `${action === 'buy' ? 'Bought' : 'Sold'} ${filled} ${Side} at ${avg}¢${resting > 0 ? `; ${resting} resting at ${pr}¢` : ''}` : resting > 0 ? `${q} ${Side} resting at ${pr}¢; it fills when someone takes it` : 'Nothing was available at that price';
      if (filled > 0) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPlaced?.(summary);
    } catch (e) {
      setError(e instanceof ApiError ? words(e) : 'The order was not placed.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };
  const seg = (a: 'buy' | 'sell') => (
    <Pressable key={a} onPress={() => { setAction(a); const ref = a === 'buy' ? ask(side) : bid(side); if (ref !== null) setPrice(String(ref)); }} accessibilityRole="tab" accessibilityState={{ selected: action === a }} style={{ minHeight: size.touch, paddingHorizontal: space.s1, justifyContent: 'center', borderBottomWidth: 2, borderColor: action === a ? p.ink : 'transparent', marginRight: space.s4 }} testID={`tab-${a}`}>
      <Text style={[type.uiMedium, { color: action === a ? p.ink : p.ink2 }]}>{a === 'buy' ? 'Buy' : 'Sell'}</Text>
    </Pressable>
  );
  const sideBtn = (s: 'yes' | 'no') => {
    const on = side === s;
    const ref = action === 'buy' ? ask(s) : bid(s);
    return (
      <Pressable onPress={() => pick(s)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`side-${s}`} style={{ flex: 1, minHeight: size.touch, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.s2, backgroundColor: on ? (s === 'yes' ? p.yes : p.no) : s === 'yes' ? p.yesTint : p.noTint, borderWidth: StyleSheet.hairlineWidth, borderColor: s === 'yes' ? p.yes : p.no }}>
        <Text style={[type.uiMedium, { color: on ? p.onInk : s === 'yes' ? p.yes : p.no }]}>{s === 'yes' ? 'Yes' : 'No'}</Text>
        <Text style={[type.numM, { color: on ? p.onInk : s === 'yes' ? p.yes : p.no }]}>{ref === null ? '—' : `${ref}¢`}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: space.s3 }} testID="ticket" accessibilityLabel={`Order ticket for ${executorName}`}>
      <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.rule }}>{seg('buy')}{seg('sell')}</View>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        {sideBtn('yes')}
        {sideBtn('no')}
      </View>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <View style={{ flex: 1 }}>
          <Field label="Contracts" value={qty} onChange={setQty} keyboard="numeric" testID="quantity" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={market ? 'Price' : 'Limit price'} value={market ? '' : price} onChange={setPrice} keyboard="numeric" suffix="¢" placeholder={market ? 'best' : undefined} disabled={market} help={market ? 'Takes the best resting price, up to 99¢.' : 'Fills at the resting price or better.'} testID="price" />
        </View>
      </View>
      <Check label="Fill now at the best price" value={market} onChange={setMarket} testID="type-market" />
      <View style={{ gap: space.s1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.rule, paddingTop: space.s2 }}>
        {[[action === 'buy' ? 'Cost' : 'Locks', dollars(cost)], ['Fee', dollars(fee)], ['Total', dollars(cost + fee)], [action === 'buy' ? 'Pays if right' : `Returns on ${Side} you hold`, dollars(action === 'buy' ? q * 100 : q * pr)]].map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.dense, { color: p.ink2 }]}>{k}</Text>
            <Text style={[type.dense, type.num, { color: p.ink, fontFamily: i === 2 ? type.uiMedium.fontFamily : type.dense.fontFamily }]}>{v}</Text>
          </View>
        ))}
      </View>
      {(error || short) && (
        <Text style={[type.caption, { color: p.no }]} accessibilityLiveRegion="polite" testID="ticket-error">
          {error ?? `Not enough play money. You need ${dollars(cost + fee)} and have ${dollars(cash ?? 0)}.`}
        </Text>
      )}
      <Button label={short ? 'Not enough play money' : `${action === 'buy' ? 'Buy' : 'Sell'} ${Side} ${market ? 'at the best price' : `at ${pr}¢`}`} variant={side} solid onPress={place} disabled={busy || q < 1 || short} block testID="place-order" />
      <Text style={[type.caption, { color: p.ink3 }]}>{action === 'buy' ? 'A winning contract pays 100¢. The fee is 1¢ a contract, returned on any part that rests.' : `Selling ${Side} you hold returns ${pr}¢ a contract. Without ${Side} to sell, this buys ${side === 'yes' ? 'No' : 'Yes'} at ${100 - pr}¢.`}</Text>
    </View>
  );
}

/** The ticket as a native sheet (iOS page sheet; a bottom sheet elsewhere). */
export function TicketSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: p.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.s4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.rule }}>
          <Text style={[type.h3, { color: p.ink }]} accessibilityRole="header">
            {title}
          </Text>
          <Button label="Close" variant="quiet" onPress={onClose} compact />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.s4, gap: space.s4 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Sticky Buy Yes / Buy No bar above the tab bar. */
export function StickyBar({ yesAsk, noAsk, onPick }: { yesAsk: number | null; noAsk: number | null; onPick: (side: 'yes' | 'no') => void }) {
  const p = usePalette();
  return (
    <View style={[{ flexDirection: 'row', gap: space.s2, padding: space.s2, paddingHorizontal: space.s4, backgroundColor: p.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.ruleStrong }, shadowFloat]}>
      <View style={{ flex: 1 }}>
        <Button label={`Buy Yes ${yesAsk === null ? '' : `${yesAsk}¢`}`} variant="yes" solid onPress={() => onPick('yes')} block testID="sheet-yes" />
      </View>
      <View style={{ flex: 1 }}>
        <Button label={`Buy No ${noAsk === null ? '' : `${noAsk}¢`}`} variant="no" solid onPress={() => onPick('no')} block testID="sheet-no" />
      </View>
    </View>
  );
}

/* ---------- settlement ---------- */

export function parseTests(log: string): { name: string; ok: boolean }[] {
  const out: { name: string; ok: boolean }[] = [];
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^(\S+::\S+) (PASSED|FAILED)/.exec(line))) out.push({ name: m[1]!, ok: m[2] === 'PASSED' });
    else if ((m = /^[✓×✗] (.+?) \d+ms$/.exec(line))) out.push({ name: m[1]!, ok: line.startsWith('✓') });
    else if ((m = /^--- (PASS|FAIL): (\S+)/.exec(line))) out.push({ name: m[2]!, ok: m[1] === 'PASS' });
    else if ((m = /^test (\S+) \.\.\. (ok|FAILED)$/.exec(line))) out.push({ name: m[1]!, ok: m[2] === 'ok' });
  }
  return out;
}

/** The result: log tail, one cell per test, the stamp, what it paid; the one animation when `animate` is set (final state under Reduce Motion). */
export function SettlementPanel({ outcome, agentName, log, settledAt, closingPrice, position, animate, lines = 8 }: { outcome: 'passed' | 'failed' | 'infra_error'; agentName: string; log: string | null; settledAt: number | null; closingPrice?: number | null; position?: { side: 'yes' | 'no'; quantity: number; payout: number } | null; animate?: boolean; lines?: number }) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const run = !!animate && !reduce;
  const tests = log ? parseTests(log) : [];
  const tail = (log ?? '').split('\n').filter(Boolean).slice(-lines);
  const [t, setT] = useState(run ? 0 : -1);
  useEffect(() => {
    if (!run) {
      setT(-1);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const el = Date.now() - start;
      if (el >= 1800) {
        setT(-1);
        clearInterval(id);
      } else setT(el);
    }, 40);
    return () => clearInterval(id);
  }, [run]);
  const final = t < 0;
  const linesShown = final ? tail.length : Math.max(0, Math.floor(((t - 200) / 600) * tail.length) + (t >= 200 ? 1 : 0));
  const cells = final ? tests.length : t < 800 ? 0 : Math.min(tests.length, Math.floor(((t - 800) / 400) * tests.length) + 1);
  const stamp = final || t >= 1200;
  const frac = final ? 1 : t < 1400 ? 0 : Math.min(1, (t - 1400) / 400);
  const infra = outcome === 'infra_error';
  const word = infra ? 'No result' : outcome === 'passed' ? 'Passed' : 'Failed';
  const paid = infra ? `Settled at the closing price of ${closingPrice ?? '—'}¢ after an infrastructure error.` : outcome === 'passed' ? 'Yes paid 100¢, No paid 0¢.' : 'No paid 100¢, Yes paid 0¢.';
  const color = infra ? p.warn : outcome === 'passed' ? p.yes : p.no;
  return (
    <Panel testID="settlement">
      {tail.length > 0 && (
        <View style={{ backgroundColor: p.surfaceSunken, padding: space.s3 }} accessibilityLabel="Run log">
          {tail.map((l, i) => (
            <Text key={i} style={[type.mono, { color: /PASSED|✓|--- PASS|\.\.\. ok|passed \(exit 0\)/.test(l) ? p.yes : /FAILED|×|✗|--- FAIL|failed \(exit 1\)/.test(l) ? p.no : p.ink2, opacity: i < linesShown ? 1 : 0 }]}>
              {l}
            </Text>
          ))}
        </View>
      )}
      {tests.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 2, paddingHorizontal: space.s4, paddingTop: space.s3 }} accessibilityLabel={`${tests.filter((x) => x.ok).length} of ${tests.length} tests passed`}>
          {tests.map((x, i) => (
            <View key={x.name} style={{ flex: 1, height: 10, borderRadius: 2, backgroundColor: i < cells ? (x.ok ? p.yes : p.no) : p.rule }} />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s3, padding: space.s4, flexWrap: 'wrap', opacity: stamp ? 1 : 0 }}>
        <Text style={[type.h2, { color }]}>{word}</Text>
        <Text style={[type.ui, { color: p.ink2, flex: 1 }]}>
          {paid}
          {settledAt ? ` Settled ${when(settledAt)}.` : ''}
        </Text>
      </View>
      {position && (
        <View style={{ paddingHorizontal: space.s4, paddingBottom: space.s4, opacity: frac > 0 ? 1 : 0 }} testID="settle-you">
          <Text style={[type.ui, type.num, { color: p.ink }]}>
            Your {position.quantity} {position.side === 'yes' ? 'Yes' : 'No'} paid <Text style={{ fontFamily: type.uiMedium.fontFamily }}>{dollars(Math.round(position.payout * frac))}</Text>.
          </Text>
        </View>
      )}
      <Text style={{ position: 'absolute', opacity: 0, left: -9999 }} accessibilityLiveRegion="polite">{`${agentName} ${word.toLowerCase()}`}</Text>
    </Panel>
  );
}

/* ---------- theses, toast, words ---------- */

export function ThesisList({ theses, onReport }: { theses: any[]; onReport?: (id: string) => void }) {
  const p = usePalette();
  if (theses.length === 0) return <Text style={[type.ui, { color: p.ink2, paddingVertical: space.s3 }]}>No theses yet.</Text>;
  return (
    <View>
      {theses.map((c, i) => (
        <View key={c.id} style={{ paddingVertical: space.s3, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderColor: p.rule, gap: space.s1 }} testID="thesis">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Avatar name={c.accountName ?? c.account} kind={c.accountKind ?? 'human'} small />
            <Text style={[type.dense, { color: p.ink, fontFamily: type.uiMedium.fontFamily }]}>{c.accountName ?? c.account}</Text>
            {c.probability !== null && <Text style={[type.dense, type.num, { color: p.ink2 }]}>{c.probability}%</Text>}
            <Text style={[type.dense, { color: p.ink3, flex: 1 }]}>{when(c.at)}</Text>
            {onReport && (
              <Pressable onPress={() => onReport(c.id)} accessibilityRole="button" hitSlop={8}>
                <Text style={[type.caption, { color: p.ink3 }]}>Report</Text>
              </Pressable>
            )}
          </View>
          <Text style={[type.ui, { color: p.ink }]}>{c.text}</Text>
        </View>
      ))}
    </View>
  );
}

export function useToast(): [React.ReactNode, (text: string, kind?: 'ok' | 'error') => void] {
  const p = usePalette();
  const [t, setT] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const show = (text: string, kind: 'ok' | 'error' = 'ok') => {
    setT({ text, kind });
    setTimeout(() => setT(null), 4500);
  };
  const node = t ? (
    <View style={[{ position: 'absolute', left: space.s4, right: space.s4, bottom: space.s6, padding: space.s3, borderRadius: radius.panel, backgroundColor: t.kind === 'error' ? p.no : p.ink }, shadowFloat]} accessibilityLiveRegion="polite" testID="toast">
      <Text style={[type.ui, { color: p.onInk }]}>{t.text}</Text>
    </View>
  ) : null;
  return [node, show];
}

/** API errors in plain words. */
export function words(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : 'That did not work.';
  switch (e.code) {
    case 'insufficient_funds': {
      const m = /need (\d+).*have (\d+)/.exec(e.message);
      return m ? `Not enough play money. You need ${dollars(Number(m[1]))} and have ${dollars(Number(m[2]))}.` : 'Not enough play money for this order.';
    }
    case 'conflict':
      return `You cannot trade this market: ${e.message}.`;
    case 'market_not_open':
    case 'task_not_open':
      return 'Trading has closed on this market.';
    case 'market_pending':
      return 'Trading opens after the baseline check.';
    case 'trading_paused':
      return 'Trading is paused on the whole exchange right now.';
    case 'rate_limited':
      return 'Too many requests in a minute. Wait a moment and try again.';
    case 'unauthorized':
      return 'Your session ended. Sign in again.';
    default:
      return e.message ? e.message[0]!.toUpperCase() + e.message.slice(1) + '.' : 'That did not work.';
  }
}

export { count, dollars, when };
