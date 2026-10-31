import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chanceOf, type MarketSummary } from './AgentRow.js';
import { layout, rowPlan, springStep, type RailMarker } from './oddsRailLayout.js';
import './oddsrail.css';

export type { RailMarker, PlacedMarker } from './oddsRailLayout.js';
export { layout, spread } from './oddsRailLayout.js';

/** Animated prices: each marker glides to its target with a spring (stiffness 300, damping 30). */
function useSpringPrices(markers: RailMarker[]): Record<string, number> {
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(markers.map((m) => [m.id, m.price])));
  const state = useRef<Record<string, { x: number; v: number }>>({});
  const raf = useRef(0);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const targets = Object.fromEntries(markers.map((m) => [m.id, m.price]));
    const s = state.current;
    for (const id of Object.keys(targets)) s[id] ??= { x: targets[id]!, v: 0 };
    for (const id of Object.keys(s)) if (!(id in targets)) delete s[id];
    if (reduced) {
      for (const id of Object.keys(targets)) s[id] = { x: targets[id]!, v: 0 };
      setShown({ ...targets });
      return;
    }
    cancelAnimationFrame(raf.current);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let settled = true;
      const next: Record<string, number> = {};
      for (const id of Object.keys(targets)) {
        const cur = s[id]!;
        const [x, v] = springStep(cur.x, cur.v, targets[id]!, dt);
        cur.x = x;
        cur.v = v;
        if (Math.abs(x - targets[id]!) > 0.02 || Math.abs(v) > 0.05) settled = false;
        next[id] = settled && Math.abs(x - targets[id]!) <= 0.02 ? targets[id]! : x;
      }
      setShown(next);
      if (!settled) raf.current = requestAnimationFrame(tick);
      else setShown({ ...targets });
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [markers.map((m) => `${m.id}:${m.price}`).join(','), reduced]);
  return shown;
}

/** Every candidate on one 1–99¢ axis: pins at the Yes price with the bid–ask bar behind them, labels that never overlap, a text alternative. */
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
  const prices = useSpringPrices(markers);
  const animated = markers.map((m) => ({ ...m, price: prices[m.id] ?? m.price }));
  const widthOf = (m: RailMarker) => measured[m.id] ?? (m.name.length + (m.note ?? `${m.price}¢`).length) * 7 + 16;
  // Rows come from the target prices so labels never hop between rows while pins glide.
  const plan = rowPlan(layout(markers, widthOf, width));
  const { placed, rows, legend } = layout(animated, widthOf, width, plan);
  const sr = markers.map((m) => `${m.name}, ${m.note ?? `${m.price} cents`}`).join('. ');
  const labelOf = (m: RailMarker) => m.note ?? `${m.price}¢`;
  const byId = Object.fromEntries(markers.map((m) => [m.id, m]));
  return (
    <div class={`rail rows-${rows} ${legend ? 'legend' : ''}`} ref={ref} role="img" aria-label={`Odds rail: ${sr}`} data-testid="odds-rail">
      <svg class="leaders" aria-hidden="true">
        {placed.map((m) => (
          <line key={m.id} class={`leader ${m.state}`} x1={m.x} x2={m.lx} y1="100%" y2={legend ? 'var(--rowN)' : m.row === 0 ? 'var(--row0)' : 'var(--row1)'} />
        ))}
      </svg>
      <div class="track">
        {[1, 25, 50, 75, 99].map((p) => (
          <span class="tickmark" key={p} style={{ left: `${PAD_X(p, width)}px` }}>
            <span>{p}¢</span>
          </span>
        ))}
        {placed.map((m) => (
          <span key={m.id} class={`marker ${m.lead ? 'lead' : ''} ${m.state}`} style={{ left: `${m.x}px` }} data-testid={`rail-${m.id}`}>
            {m.bid !== null && m.ask !== null && m.state === 'live' && <span class="bar" style={{ left: `${PAD_X(m.bid, width) - m.x}px`, width: `${Math.max(2, PAD_X(m.ask, width) - PAD_X(m.bid, width))}px` }} />}
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
              <span class="name">{m.name}</span> <b>{labelOf(byId[m.id] ?? m)}</b>
            </span>
          ))}
      </div>
      {legend && (
        <ol class="rail-legend">
          {placed.map((m) => (
            <li key={m.id} class={`${m.lead ? 'lead' : ''} ${m.state}`}>
              <span class="name">{m.name}</span> <b>{labelOf(byId[m.id] ?? m)}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const PAD_X = (p: number, w: number) => 16 + ((p - 1) / 98) * Math.max(100, w - 32);

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
