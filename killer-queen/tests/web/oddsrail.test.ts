import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAP, LEGEND_W, layout, spans, spread, springStep, type RailMarker } from '../../src/web/ui/oddsRailLayout.js';

const NAMES = ['Claude Code', 'Codex', 'Gemini CLI', 'Aider', 'Jules', 'Devin', 'Cursor Agent', 'Amp'];
const widthOf = (m: RailMarker) => (m.name.length + `${m.price}¢`.length) * 7 + 16;
const cluster = (n: number, around: number): RailMarker[] => NAMES.slice(0, n).map((name, i) => ({ id: `m${i}`, name, price: around + i, bid: around + i - 1, ask: around + i + 1, lead: i === n - 1, state: 'live' as const }));

function assertNoOverlap(markers: RailMarker[], railWidth: number): ReturnType<typeof layout> {
  const l = layout(markers, widthOf, railWidth);
  const s = spans(l, widthOf);
  for (const a of s) {
    assert.ok(a.x0 >= -0.01 && a.x1 <= railWidth + 0.01, `${a.id} inside the rail (${a.x0.toFixed(1)}–${a.x1.toFixed(1)} of ${railWidth})`);
    for (const b of s) {
      if (a === b || a.row !== b.row) continue;
      assert.ok(a.x1 + GAP <= b.x0 + 0.01 || b.x1 + GAP <= a.x0 + 0.01, `${a.id} and ${b.id} overlap on row ${a.row}`);
    }
  }
  return l;
}

describe('odds rail layout', () => {
  for (const railWidth of [1232, 358]) {
    for (const n of [2, 4, 8]) {
      it(`${n} agents at nearly equal prices never overlap at ${railWidth}px`, () => {
        const l = assertNoOverlap(cluster(n, 48), railWidth);
        assert.equal(l.placed.length, n);
        // Pins stay at their prices even when labels move.
        for (const m of l.placed) assert.ok(Math.abs(m.x - (16 + ((m.price - 1) / 98) * (railWidth - 32))) < 0.01);
      });
    }
  }
  it('uses one row when labels fit, two rows when they do not, and a legend when even two rows cannot hold them', () => {
    assert.equal(layout(cluster(2, 50), widthOf, 1232).rows, 1);
    assert.equal(layout(cluster(8, 48), widthOf, 1232).rows, 1);
    const two = layout(cluster(4, 59), widthOf, 358);
    assert.equal(two.rows, 2);
    assert.equal(two.legend, false);
    const legend = layout(cluster(8, 48), widthOf, 358);
    assert.equal(legend.legend, true);
    assert.equal(legend.rows, 0);
    const s = spans(legend, widthOf);
    for (const a of s) for (const b of s) if (a !== b) assert.ok(a.x1 + GAP <= b.x0 + 0.01 || b.x1 + GAP <= a.x0 + 0.01, 'legend numbers do not overlap');
    assert.ok(s.every((x) => x.x1 - x.x0 === LEGEND_W));
  });
  it('labels at the rail edges end or start at the edge instead of leaving it', () => {
    const l = layout([{ id: 'a', name: 'Claude Code', price: 99, bid: null, ask: null, lead: true, state: 'settled-yes', note: 'passed' }, { id: 'b', name: 'Gemini CLI', price: 1, bid: null, ask: null, lead: false, state: 'settled-no', note: 'failed' }], widthOf, 358);
    for (const s of spans(l, widthOf)) assert.ok(s.x0 >= 0 && s.x1 <= 358);
  });
  it('spread keeps order and the minimum gap', () => {
    const out = spread([100, 102, 104], [60, 60, 60], 400);
    assert.deepEqual(out.map((x) => Math.round(x)), [34, 102, 170]);
    const edge = spread([395], [60], 400);
    assert.equal(edge[0], 370);
  });
  it('the spring settles on the target without overshooting past 1¢ and within a second', () => {
    let x = 40;
    let v = 0;
    let maxX = x;
    let t = 0;
    while (t < 1) {
      [x, v] = springStep(x, v, 60, 1 / 60);
      maxX = Math.max(maxX, x);
      t += 1 / 60;
    }
    assert.ok(Math.abs(x - 60) < 0.05, `settled at ${x}`);
    assert.ok(maxX < 61, `overshoot ${maxX}`);
  });
});
