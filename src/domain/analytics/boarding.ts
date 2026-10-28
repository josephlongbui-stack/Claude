import { SeededRandom } from '../simulation/rng';
import { getRide } from '../rides/configs';

export interface Party {
  id: string;
  size: number;
  together: boolean;
  accessible: boolean;
  arrival: number;
}

export interface RowSpec {
  row: number;
  seats: number;
  accessible?: boolean;
}

export interface Assignment {
  partyId: string;
  row: number;
  seats: number[];
}

export interface AllocationResult {
  label: string;
  assignments: Assignment[];
  unassigned: Party[];
  seatsUsed: number;
  totalSeats: number;
  emptySeats: number;
  loadFactor: number;
  decisions: string[];
  boardingTimeSec: number;
  splitParties: number;
}

export function generateParties(rideId: string, seed: number): Party[] {
  const ride = getRide(rideId);
  const rng = new SeededRandom(`parties:${rideId}:${seed}`);
  const total = ride.geometry.rows * ride.geometry.seatsPerRow;
  const maxParty = Math.min(5, Math.max(2, ride.geometry.seatsPerRow + 1));
  const parties: Party[] = [];
  let riders = 0;
  let i = 0;
  while (riders < total * 1.25 && i < 40) {
    i += 1;
    const r = rng.next();
    const size = r < 0.22 ? 1 : r < 0.6 ? 2 : r < 0.8 ? 3 : r < 0.93 ? 4 : Math.min(maxParty, 5);
    parties.push({ id: `P${i}`, size, together: size > 1 ? rng.chance(0.8) : false, accessible: rng.chance(0.07), arrival: i });
    riders += size;
  }
  return parties;
}

interface RowState {
  spec: RowSpec;
  free: number[];
}

function rowStates(rows: RowSpec[]): RowState[] {
  return rows.map((spec) => ({ spec, free: Array.from({ length: spec.seats }, (_, k) => k + 1) }));
}

function take(row: RowState, n: number): number[] {
  const seats = row.free.slice(0, n);
  row.free = row.free.slice(n);
  return seats;
}

function finish(label: string, rows: RowState[], assignments: Assignment[], unassigned: Party[], decisions: string[], parties: Party[], splitParties: number): AllocationResult {
  const totalSeats = rows.reduce((a, r) => a + r.spec.seats, 0);
  const seatsUsed = assignments.reduce((a, x) => a + x.seats.length, 0);
  const assignedIds = new Set(assignments.map((a) => a.partyId));
  const assignedParties = parties.filter((p) => assignedIds.has(p.id));
  const boardingTimeSec = Math.round(18 + assignedParties.length * 2.2 + seatsUsed * 1.4 + splitParties * 4 + assignedParties.filter((p) => p.accessible).length * 6);
  return { label, assignments, unassigned, seatsUsed, totalSeats, emptySeats: totalSeats - seatsUsed, loadFactor: totalSeats ? seatsUsed / totalSeats : 0, decisions, boardingTimeSec, splitParties };
}

/** Arrival-order allocation: fill rows front to back; a party that does not fit the current row moves to the next, leaving a gap. */
export function naiveAllocation(rowSpecs: RowSpec[], parties: Party[]): AllocationResult {
  const rows = rowStates(rowSpecs);
  const assignments: Assignment[] = [];
  const unassigned: Party[] = [];
  const decisions: string[] = [];
  let cursor = 0;
  let splits = 0;
  for (const p of [...parties].sort((a, b) => a.arrival - b.arrival)) {
    let remaining = p.size;
    let placed = false;
    while (remaining > 0 && cursor < rows.length) {
      const row = rows[cursor];
      if (row.free.length === 0) {
        cursor += 1;
        continue;
      }
      if (remaining <= row.free.length) {
        const seats = take(row, remaining);
        assignments.push({ partyId: p.id, row: row.spec.row, seats });
        decisions.push(`${p.id} (${p.size}) → Row ${row.spec.row} seats ${seats.join(',')} (arrival order)`);
        remaining = 0;
        placed = true;
      } else if (p.size > row.spec.seats) {
        // Larger than a row: spill across consecutive rows.
        const seats = take(row, row.free.length);
        assignments.push({ partyId: p.id, row: row.spec.row, seats });
        remaining -= seats.length;
        splits += 1;
        cursor += 1;
        placed = true;
      } else {
        decisions.push(`${p.id} (${p.size}) does not fit Row ${row.spec.row} (${row.free.length} free) → ${row.free.length} seat(s) left empty`);
        cursor += 1;
      }
    }
    if (!placed || remaining > 0) {
      if (!placed) unassigned.push(p);
      decisions.push(`${p.id} (${p.size}) waits for next train`);
    }
  }
  return finish('Naive (arrival order)', rows, assignments, unassigned, decisions, parties, splits);
}

export interface OptimizeOptions {
  singleRider: boolean;
  manual?: Record<string, number | undefined>;
}

/**
 * Optimised allocation:
 *  1. Honour manual (operational) constraints first, e.g. accessible boarding at Row 1.
 *  2. Place "together" parties largest-first using best-fit (the row whose free seats most tightly fit).
 *     Parties larger than a row span consecutive rows.
 *  3. Parties that may split are placed to fill the largest remaining gaps.
 *  4. Single riders back-fill remaining seats when the single-rider line is enabled.
 */
export function optimizedAllocation(rowSpecs: RowSpec[], parties: Party[], opts: OptimizeOptions): AllocationResult {
  const rows = rowStates(rowSpecs);
  const assignments: Assignment[] = [];
  const unassigned: Party[] = [];
  const decisions: string[] = [];
  let splits = 0;
  const pending = [...parties];
  const manual = opts.manual ?? {};

  const placeInRow = (p: Party, row: RowState, why: string): boolean => {
    if (row.free.length < p.size) return false;
    const seats = take(row, p.size);
    assignments.push({ partyId: p.id, row: row.spec.row, seats });
    decisions.push(`${p.id} (${p.size}) → Row ${row.spec.row} seats ${seats.join(',')} — ${why}`);
    return true;
  };

  // 1. Manual assignments and accessible parties.
  for (const p of [...pending]) {
    const forced = manual[p.id];
    if (forced !== undefined) {
      const row = rows.find((r) => r.spec.row === forced);
      if (row && placeInRow(p, row, 'manual assignment by operator')) pending.splice(pending.indexOf(p), 1);
      else decisions.push(`${p.id} manual assignment to Row ${forced} not possible (insufficient seats)`);
      continue;
    }
    if (p.accessible) {
      const row = rows.find((r) => r.spec.accessible && r.free.length >= p.size);
      if (row && placeInRow(p, row, 'accessible boarding row (operational constraint)')) pending.splice(pending.indexOf(p), 1);
    }
  }

  // 2. Together parties, largest first.
  const together = pending.filter((p) => p.together && p.size > 1).sort((a, b) => b.size - a.size || a.arrival - b.arrival);
  for (const p of together) {
    const maxRow = Math.max(...rows.map((r) => r.spec.seats));
    if (p.size <= maxRow) {
      const candidates = rows.filter((r) => r.free.length >= p.size).sort((a, b) => a.free.length - b.free.length || a.spec.row - b.spec.row);
      const row = candidates[0];
      if (row) {
        placeInRow(p, row, `best fit (${row.free.length} free before placement, party stays together)`);
        pending.splice(pending.indexOf(p), 1);
      } else {
        decisions.push(`${p.id} (${p.size}, together) cannot be seated without splitting → waits for next train`);
      }
    } else {
      // Needs consecutive rows.
      let placed = false;
      for (let i = 0; i < rows.length - 1 && !placed; i += 1) {
        const a = rows[i];
        const b = rows[i + 1];
        if (a.free.length === a.spec.seats && a.free.length + b.free.length >= p.size) {
          const s1 = take(a, a.free.length);
          const s2 = take(b, p.size - s1.length);
          assignments.push({ partyId: p.id, row: a.spec.row, seats: s1 });
          assignments.push({ partyId: p.id, row: b.spec.row, seats: s2 });
          decisions.push(`${p.id} (${p.size}, together) → Rows ${a.spec.row}–${b.spec.row} (adjacent rows, no separation)`);
          pending.splice(pending.indexOf(p), 1);
          splits += 1;
          placed = true;
        }
      }
      if (!placed) decisions.push(`${p.id} (${p.size}, together) needs two adjacent rows → waits for next train`);
    }
  }

  // 3. Splittable groups fill the largest gaps.
  const splittable = pending.filter((p) => !p.together && p.size > 1).sort((a, b) => b.size - a.size || a.arrival - b.arrival);
  for (const p of splittable) {
    let remaining = p.size;
    const parts: string[] = [];
    while (remaining > 0) {
      const row = [...rows].filter((r) => r.free.length > 0).sort((a, b) => b.free.length - a.free.length || a.spec.row - b.spec.row)[0];
      if (!row) break;
      const n = Math.min(remaining, row.free.length);
      const seats = take(row, n);
      assignments.push({ partyId: p.id, row: row.spec.row, seats });
      parts.push(`Row ${row.spec.row} seats ${seats.join(',')}`);
      remaining -= n;
    }
    if (remaining === p.size) {
      decisions.push(`${p.id} (${p.size}) → no seats remaining, waits for next train`);
    } else {
      if (parts.length > 1) splits += 1;
      decisions.push(`${p.id} (${p.size}, may split) → ${parts.join(' + ')}${remaining > 0 ? ` (${remaining} rider(s) wait)` : ''}`);
      pending.splice(pending.indexOf(p), 1);
    }
  }

  // 4. Singles back-fill.
  const singles = pending.filter((p) => p.size === 1).sort((a, b) => a.arrival - b.arrival);
  for (const p of singles) {
    if (!opts.singleRider) {
      decisions.push(`${p.id} (1) → single-rider line disabled; boards in arrival order if space`);
    }
    const row = rows.find((r) => r.free.length > 0);
    if (row) {
      placeInRow(p, row, opts.singleRider ? 'single-rider back-fill' : 'arrival order');
      pending.splice(pending.indexOf(p), 1);
    }
  }

  for (const p of pending) if (!assignments.some((a) => a.partyId === p.id)) unassigned.push(p);
  return finish('Optimized (RideOps allocator)', rows, assignments, unassigned, decisions, parties, splits);
}

export function partyInSameRowOrAdjacent(result: AllocationResult, partyId: string): boolean {
  const rowsUsed = result.assignments.filter((a) => a.partyId === partyId).map((a) => a.row).sort((a, b) => a - b);
  if (rowsUsed.length <= 1) return true;
  for (let i = 1; i < rowsUsed.length; i += 1) if (rowsUsed[i] - rowsUsed[i - 1] > 1) return false;
  return true;
}
