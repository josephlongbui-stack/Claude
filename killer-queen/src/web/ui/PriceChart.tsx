import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import './chart.css';

const PAD_R = 40;

/** Yes price per trade as a step line on the full 1–99 axis, drawn at the container's real size so nothing stretches. */
export function PriceChart({ points, last, height }: { points: { at: number; price: number }[]; last?: number | null; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: height ?? 180 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(60, size.w - PAD_R);
  const H = Math.max(40, size.h);
  const y = (p: number) => H - 1 - ((p - 1) / 98) * (H - 2);
  const n = points.length;
  let d = '';
  if (n >= 2) {
    d = `M0,${y(points[0]!.price).toFixed(1)}`;
    for (let i = 1; i < n; i++) {
      const x = ((i / (n - 1)) * W).toFixed(1);
      d += ` H${x} V${y(points[i]!.price).toFixed(1)}`;
    }
  }
  const label = n === 0 ? 'No trades yet' : n === 1 ? `One trade at ${points[0]!.price} cents` : `Yes price over ${n} trades, last ${points[n - 1]!.price} cents`;
  return (
    <div class="chart" ref={ref} data-testid="chart">
      {n === 0 ? (
        <div class="chart-empty">No trades yet. The first trade starts the price history.</div>
      ) : (
        <svg viewBox={`0 0 ${size.w} ${H}`} width={size.w} height={H} role="img" aria-label={label}>
          {[1, 25, 50, 75, 99].map((p) => (
            <g key={p}>
              <line class={`grid ${p === 1 || p === 99 ? 'edge' : ''}`} x1="0" x2={W} y1={y(p)} y2={y(p)} />
              <text class="axis" x={W + 8} y={y(p) + (p === 1 ? 0 : p === 99 ? 10 : 4)}>
                {p}¢
              </text>
            </g>
          ))}
          {d && <path class="line" d={d} />}
          {n === 1 && <circle class="last" cx={W / 2} cy={y(points[0]!.price)} r="4" />}
          {n >= 2 && last !== null && last !== undefined && <circle class="last" cx={W} cy={y(last)} r="3.5" />}
        </svg>
      )}
    </div>
  );
}
