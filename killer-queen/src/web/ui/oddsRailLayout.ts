/** Pure layout for the odds rail (no DOM): where pins and labels go. Tested in tests/web/oddsrail.test.ts. */

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

export interface RailLayout {
  placed: PlacedMarker[];
  /** 1 or 2 label rows; 0 when the legend fallback is in use. */
  rows: number;
  legend: boolean;
}

export const PAD = 16;
export const GAP = 8;
export const LEGEND_W = 18;

export const priceToX = (price: number, railWidth: number): number => PAD + ((price - 1) / 98) * Math.max(100, railWidth - 2 * PAD);

/**
 * Spread label centres apart along one row so none overlap: labels that would collide form a group placed
 * side by side and centred on the group's pins, then the group is kept inside [0, total]. Classic 1-D label
 * placement; order is preserved.
 */
export function spread(xs: number[], widths: number[], total: number): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  // Groups of consecutive (in x order) labels that must be laid side by side.
  let groups: number[][] = order.map((i) => [i]);
  const place = (g: number[]): number[] => {
    const W = g.reduce((a, i) => a + widths[i]!, 0) + GAP * (g.length - 1);
    const centre = g.reduce((a, i) => a + xs[i]!, 0) / g.length;
    let start = Math.min(Math.max(centre - W / 2, 0), Math.max(0, total - W));
    const out: number[] = [];
    for (const i of g) {
      out.push(start + widths[i]! / 2);
      start += widths[i]! + GAP;
    }
    return out;
  };
  for (;;) {
    const placed = groups.map(place);
    let merged = false;
    const next: number[][] = [];
    let cur = groups[0]!;
    let curEnd = placed[0]![placed[0]!.length - 1]! + widths[cur[cur.length - 1]!]! / 2;
    for (let k = 1; k < groups.length; k++) {
      const g = groups[k]!;
      const gStart = placed[k]![0]! - widths[g[0]!]! / 2;
      if (gStart < curEnd + GAP - 0.001) {
        cur = cur.concat(g);
        merged = true;
      } else {
        next.push(cur);
        cur = g;
      }
      curEnd = placed[k]![placed[k]!.length - 1]! + widths[g[g.length - 1]!]! / 2;
      if (merged && cur !== g) curEnd = Math.max(curEnd, gStart + widths[g[0]!]! / 2);
    }
    next.push(cur);
    if (!merged) {
      const out = xs.slice();
      groups.forEach((g, k) => g.forEach((i, j) => (out[i] = placed[k]![j]!)));
      return out;
    }
    groups = next;
  }
}

/**
 * Labels sit on one row, spread apart so they never overlap, each joined to its pin by a leader. When one row
 * cannot hold them, odd and even markers take two rows; when even that fails, markers are numbered and the
 * names go in a legend under the rail.
 */
export interface RowPlan {
  rows: number;
  legend: boolean;
  rowOf: Record<string, number>;
}

/** The row plan of a layout, so an animated rail keeps labels on their rows while prices glide. */
export function rowPlan(l: RailLayout): RowPlan {
  return { rows: l.rows, legend: l.legend, rowOf: Object.fromEntries(l.placed.map((m) => [m.id, m.row])) };
}

/**
 * The lower row (nearest the track) must never cover another marker's pin, or that marker's leader would run
 * behind the label. Each lower label is centred on its pin when that is clear, else it ends at its pin on the
 * side away from the crowding pin; when neither works the two-row layout is impossible and null comes back.
 */
export function placeLower(idx: number[], xs: number[], ws: number[], total: number): number[] | null {
  const out: number[] = [];
  let prevRight = -Infinity;
  for (const i of idx) {
    const w = ws[i]!;
    const x = xs[i]!;
    const clear = (lx: number) => lx - w / 2 >= 0 && lx + w / 2 <= total && lx - w / 2 >= prevRight + GAP && !xs.some((o, j) => j !== i && o > lx - w / 2 - GAP && o < lx + w / 2 + GAP);
    const lx = [x, x + w / 2, x - w / 2].find(clear);
    if (lx === undefined) return null;
    out.push(lx);
    prevRight = lx + w / 2;
  }
  return out;
}

export function layout(markers: RailMarker[], widthOf: (m: RailMarker) => number, railWidth: number, plan?: RowPlan): RailLayout {
  const sorted = [...markers].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const xs = sorted.map((m) => priceToX(m.price, railWidth));
  const ws = sorted.map(widthOf);
  if (plan) {
    // Keep the planned rows; only re-spread each row for the current pin positions.
    if (plan.legend) {
      const lxN = spread(xs, sorted.map(() => LEGEND_W), railWidth);
      return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lxN[i]!, row: 0 })), rows: 0, legend: true };
    }
    const lx: number[] = [];
    for (let r = 0; r < plan.rows; r++) {
      const idx = sorted.map((_, i) => i).filter((i) => (plan.rowOf[sorted[i]!.id] ?? 0) === r);
      // Row 1 is the lower row: keep it clear of pins while gliding too, falling back to a plain spread mid-motion.
      const got = (r === 1 && plan.rows === 2 ? placeLower(idx, xs, ws, railWidth) : null) ?? spread(idx.map((i) => xs[i]!), idx.map((i) => ws[i]!), railWidth);
      idx.forEach((i, k) => (lx[i] = got[k]!));
    }
    return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lx[i] ?? xs[i]!, row: plan.rowOf[m.id] ?? 0 })), rows: plan.rows, legend: false };
  }
  const fits = (idx: number[]) => idx.reduce((a, i) => a + ws[i]!, 0) + GAP * Math.max(0, idx.length - 1) <= railWidth;
  const all = sorted.map((_, i) => i);
  if (fits(all)) {
    const lx = spread(xs, ws, railWidth);
    return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lx[i]!, row: 0 })), rows: 1, legend: false };
  }
  // Two rows: alternate markers between the upper row (0) and the lower row (1); try both assignments, since
  // the lower row must stay clear of every pin (D3: lower-row labels end at their pin so pins never cross labels).
  const even = all.filter((i) => i % 2 === 0);
  const odd = all.filter((i) => i % 2 === 1);
  for (const [upper, lower] of [[even, odd], [odd, even]] as [number[], number[]][]) {
    if (!fits(upper) || !fits(lower)) continue;
    const lxL = placeLower(lower, xs, ws, railWidth);
    if (!lxL) continue;
    const lxU = spread(upper.map((i) => xs[i]!), upper.map((i) => ws[i]!), railWidth);
    const lx: number[] = [];
    const row: number[] = [];
    upper.forEach((i, k) => ((lx[i] = lxU[k]!), (row[i] = 0)));
    lower.forEach((i, k) => ((lx[i] = lxL[k]!), (row[i] = 1)));
    return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lx[i]!, row: row[i]! })), rows: 2, legend: false };
  }
  const lxN = spread(xs, sorted.map(() => LEGEND_W), railWidth);
  return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lxN[i]!, row: 0 })), rows: 0, legend: true };
}

/** Label spans per row, for tests and for the leader geometry. */
export function spans(l: RailLayout, widthOf: (m: RailMarker) => number): { id: string; row: number; x0: number; x1: number }[] {
  return l.placed.map((m) => {
    const w = l.legend ? LEGEND_W : widthOf(m);
    return { id: m.id, row: m.row, x0: m.lx - w / 2, x1: m.lx + w / 2 };
  });
}

/** One step of a damped spring (stiffness 300, damping 30, mass 1) at dt seconds. */
export function springStep(x: number, v: number, target: number, dt: number, stiffness = 300, damping = 30): [number, number] {
  const a = -stiffness * (x - target) - damping * v;
  const nv = v + a * dt;
  const nx = x + nv * dt;
  return [nx, nv];
}
