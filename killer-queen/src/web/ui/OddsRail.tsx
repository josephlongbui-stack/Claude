import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chanceOf, type MarketSummary } from './AgentRow.js';
import './oddsrail.css';

export interface RailMarker {
  id: string;
  name: string;
  price: number;
  bid: number | null;
  ask: number | null;
  lead: boolean;
  state: 'live' | 'settled-yes' | 'settled-no' | 'closed';
  /** Replaces the price in the label ("settled at 54¢", "passed"). */
  note?: string;
}

export interface PlacedMarker extends RailMarker {
  /** Pin x in px from the rail's left edge. */
  x: number;
  /** Label centre x in px. */
  lx: number;
  row: number;
}

const PAD = 16;
const GAP = 8;

/**
 * Every candidate on one 1–99¢ axis. Pins sit at the Yes price with the bid–ask bar behind them; labels sit
 * on one row, spread apart so they never overlap, joined to their pin by a leader. When one row cannot hold
 * them, two rows alternate; when even that fails (many agents on a phone), markers are numbered and the names
 * are listed below the rail.
 */
export function OddsRail({ markers, width: fixedWidth }: { markers: RailMarker[]; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fixedWidth ?? 800);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    if (fixedWidth !== undefined) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    setWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next: Record<string, number> = {};
    let changed = false;
    el.querySelectorAll<HTMLElement>('[data-lbl]').forEach((n) => {
      next[n.dataset.lbl!] = n.offsetWidth;
      if (measured[n.dataset.lbl!] !== n.offsetWidth) changed = true;
    });
    if (changed) setMeasured(next);
  });
  const inner = Math.max(100, width - 2 * PAD);
  const x = (p: number) => PAD + ((p - 1) / 98) * inner;
  const widthOf = (m: RailMarker) => measured[m.id] ?? (m.name.length + (m.note ?? `${m.price}¢`).length) * 7 + 16;
  const { placed, rows, legend } = layout(markers, x, widthOf, width);
  const sr = markers.map((m) => `${m.name}, ${m.note ?? `${m.price} cents`}`).join('. ');
  return (
    <div class={`rail rows-${rows} ${legend ? 'legend' : ''}`} ref={ref} role="img" aria-label={`Odds rail: ${sr}`} data-testid="odds-rail">
      <svg class="leaders" aria-hidden="true">
        {placed.map((m) => (
          <line key={m.id} class={`leader ${m.state}`} x1={m.x} x2={m.lx} y1="100%" y2={legend ? 'var(--rowN)' : m.row === 0 ? 'var(--row0)' : 'var(--row1)'} />
        ))}
      </svg>
      <div class="track">
        {[1, 25, 50, 75, 99].map((p) => (
          <span class="tickmark" key={p} style={{ left: `${x(p)}px` }}>
            <span>{p}¢</span>
          </span>
        ))}
        {placed.map((m, i) => (
          <span key={m.id} class={`marker ${m.lead ? 'lead' : ''} ${m.state}`} style={{ left: `${m.x}px` }} data-testid={`rail-${m.id}`}>
            {m.bid !== null && m.ask !== null && m.state === 'live' && <span class="bar" style={{ left: `${x(m.bid) - m.x}px`, width: `${Math.max(2, x(m.ask) - x(m.bid))}px` }} />}
            <span class="pin" />
          </span>
        ))}
        {legend &&
          placed.map((m, i) => (
            <span key={`n${m.id}`} class={`num ${m.lead ? 'lead' : ''} ${m.state}`} style={{ left: `${m.lx}px` }}>
              {i + 1}
            </span>
          ))}
        {!legend &&
          placed.map((m) => (
            <span key={`l${m.id}`} class={`lbl ${m.lead ? 'lead' : ''} ${m.state} row-${m.row}`} style={{ left: `${m.lx}px` }} data-lbl={m.id}>
              <span class="name">{m.name}</span> <b>{m.note ?? `${m.price}¢`}</b>
            </span>
          ))}
      </div>
      {legend && (
        <ol class="rail-legend">
          {placed.map((m) => (
            <li key={m.id} class={`${m.lead ? 'lead' : ''} ${m.state}`}>
              <span class="name">{m.name}</span> <b>{m.note ?? `${m.price}¢`}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Spread label centres apart along one row so none overlap, keeping them inside [0, width]. */
export function spread(xs: number[], widths: number[], total: number): number[] {
  const n = xs.length;
  const out = xs.slice();
  if (n === 0) return out;
  // Sweep right: push each label right of its left neighbour; sweep left: pull back inside the rail.
  for (let i = 0; i < n; i++) {
    const half = widths[i]! / 2;
    const minX = i === 0 ? half : out[i - 1]! + widths[i - 1]! / 2 + GAP + half;
    out[i] = Math.max(out[i]!, minX);
  }
  for (let i = n - 1; i >= 0; i--) {
    const half = widths[i]! / 2;
    const maxX = i === n - 1 ? total - half : out[i + 1]! - widths[i + 1]! / 2 - GAP - half;
    out[i] = Math.min(out[i]!, maxX);
  }
  return out;
}

export function layout(markers: RailMarker[], x: (p: number) => number, widthOf: (m: RailMarker) => number, railWidth: number): { placed: PlacedMarker[]; rows: number; legend: boolean } {
  const sorted = [...markers].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const xs = sorted.map((m) => x(m.price));
  const ws = sorted.map(widthOf);
  const fits = (idx: number[]) => idx.reduce((a, i) => a + ws[i]!, 0) + GAP * Math.max(0, idx.length - 1) <= railWidth;
  const all = sorted.map((_, i) => i);
  if (fits(all)) {
    const lx = spread(xs, ws, railWidth);
    return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lx[i]!, row: 0 })), rows: 1, legend: false };
  }
  const even = all.filter((i) => i % 2 === 0);
  const odd = all.filter((i) => i % 2 === 1);
  if (fits(even) && fits(odd)) {
    const lxE = spread(even.map((i) => xs[i]!), even.map((i) => ws[i]!), railWidth);
    const lxO = spread(odd.map((i) => xs[i]!), odd.map((i) => ws[i]!), railWidth);
    const lx: number[] = [];
    even.forEach((i, k) => (lx[i] = lxE[k]!));
    odd.forEach((i, k) => (lx[i] = lxO[k]!));
    return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lx[i]!, row: i % 2 })), rows: 2, legend: false };
  }
  const lxN = spread(xs, sorted.map(() => 18), railWidth);
  return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lxN[i]!, row: 0 })), rows: 0, legend: true };
}

/** Build rail markers from a task's markets. */
export function railMarkers(markets: MarketSummary[], chosen: string | null): RailMarker[] {
  const live = markets.filter((m) => m.status === 'open');
  const best = live.length ? Math.max(...live.map((m) => m.quote.chance)) : null;
  return markets
    .map((m): RailMarker | null => {
      const c = chanceOf(m);
      if (c === null) return null;
      const onTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed');
      return {
        id: m.executorId,
        name: m.executor.name,
        price: onTests ? (m.outcome === 'passed' ? 99 : 1) : c,
        bid: m.quote.yesBid,
        ask: m.quote.yesAsk,
        lead: m.status === 'open' ? m.quote.chance === best : chosen === m.executorId,
        state: onTests ? (m.outcome === 'passed' ? 'settled-yes' : 'settled-no') : m.status === 'open' ? 'live' : 'closed',
        note: onTests ? (m.outcome === 'passed' ? 'passed' : 'failed') : m.status === 'settled' ? `settled at ${m.settlementPrice}¢` : m.status === 'running' ? `${c}¢, running` : m.status === 'closed' ? `closed at ${c}¢` : undefined,
      };
    })
    .filter((m): m is RailMarker => m !== null);
}
