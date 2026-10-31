/** Pure odds-rail layout, the same algorithm as src/web/ui/oddsRailLayout.ts (kept in step by hand; tested there). */
export interface RailMarker {
  id: string;
  name: string;
  price: number;
  bid: number | null;
  ask: number | null;
  lead: boolean;
  state: 'live' | 'settled-yes' | 'settled-no' | 'closed';
  note?: string;
}
export interface PlacedMarker extends RailMarker {
  x: number;
  lx: number;
  row: number;
}
export interface RailLayout {
  placed: PlacedMarker[];
  rows: number;
  legend: boolean;
}
export const PAD = 16;
export const GAP = 8;
export const LEGEND_W = 18;
export const priceToX = (price: number, railWidth: number): number => PAD + ((price - 1) / 98) * Math.max(100, railWidth - 2 * PAD);

export function spread(xs: number[], widths: number[], total: number): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
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

export function layout(markers: RailMarker[], widthOf: (m: RailMarker) => number, railWidth: number): RailLayout {
  const sorted = [...markers].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const xs = sorted.map((m) => priceToX(m.price, railWidth));
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
  const lxN = spread(xs, sorted.map(() => LEGEND_W), railWidth);
  return { placed: sorted.map((m, i) => ({ ...m, x: xs[i]!, lx: lxN[i]!, row: 0 })), rows: 0, legend: true };
}
