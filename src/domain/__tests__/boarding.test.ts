import { describe, expect, it } from 'vitest';
import { generateParties, naiveAllocation, optimizedAllocation, partyInSameRowOrAdjacent, type Party, type RowSpec } from '../analytics/boarding';

const rows: RowSpec[] = Array.from({ length: 6 }, (_, i) => ({ row: i + 1, seats: 4, accessible: i === 0 }));

describe('boarding allocator', () => {
  it('never splits a party marked together across non-adjacent rows', () => {
    const parties = generateParties('vortex', 1);
    const res = optimizedAllocation(rows, parties, { singleRider: true });
    for (const p of parties.filter((x) => x.together)) {
      const rowsUsed = res.assignments.filter((a) => a.partyId === p.id).map((a) => a.row);
      if (rowsUsed.length === 0) continue;
      if (p.size <= 4) expect(new Set(rowsUsed).size).toBe(1);
      expect(partyInSameRowOrAdjacent(res, p.id)).toBe(true);
    }
  });
  it('never exceeds row capacity or double-books a seat', () => {
    const parties = generateParties('vortex', 3);
    for (const res of [naiveAllocation(rows, parties), optimizedAllocation(rows, parties, { singleRider: true })]) {
      const used = new Map<string, number>();
      for (const a of res.assignments) for (const s of a.seats) {
        const k = `${a.row}:${s}`;
        used.set(k, (used.get(k) ?? 0) + 1);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(4);
      }
      for (const v of used.values()) expect(v).toBe(1);
      expect(res.seatsUsed).toBeLessThanOrEqual(24);
    }
  });
  it('matches or beats the naive allocation on seat fill for seeded queues', () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const parties = generateParties('vortex', seed);
      const n = naiveAllocation(rows, parties);
      const o = optimizedAllocation(rows, parties, { singleRider: true });
      expect(o.seatsUsed).toBeGreaterThanOrEqual(n.seatsUsed);
    }
  });
  it('honours manual constraints and accessible rows', () => {
    const parties: Party[] = [
      { id: 'P1', size: 2, together: true, accessible: true, arrival: 1 },
      { id: 'P2', size: 3, together: true, accessible: false, arrival: 2 },
      { id: 'P3', size: 1, together: false, accessible: false, arrival: 3 },
    ];
    const res = optimizedAllocation(rows, parties, { singleRider: true, manual: { P2: 5 } });
    expect(res.assignments.find((a) => a.partyId === 'P1')?.row).toBe(1);
    expect(res.assignments.find((a) => a.partyId === 'P2')?.row).toBe(5);
    expect(res.decisions.some((d) => d.includes('manual'))).toBe(true);
  });
  it('is deterministic for a given seed', () => {
    expect(generateParties('vortex', 2)).toEqual(generateParties('vortex', 2));
  });
});
