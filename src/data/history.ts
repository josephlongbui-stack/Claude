import type { DispatchRecord } from '@/domain/types';
import { RIDES, getRide } from '@/domain/rides/configs';
import { SeededRandom } from '@/domain/simulation/rng';

export const DAY_START_HOUR = 10;
export const DAY_END_HOUR = 20;

/** Synthetic dispatch history for one operating day, per ride. Deterministic. */
export function historicalDispatches(rideId: string): DispatchRecord[] {
  const ride = getRide(rideId);
  const rng = new SeededRandom(`history:${rideId}`);
  const out: DispatchRecord[] = [];
  const b = ride.baseline;
  let t = DAY_START_HOUR * 3600;
  let n = 0;
  const nowSec = 14 * 3600 + 12 * 60; // the simulated "current" time: 14:12
  while (t < nowSec) {
    n += 1;
    const hourFrac = (t / 3600 - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR);
    const demandFactor = 0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, hourFrac * 1.1));
    const unload = Math.max(8, rng.gaussian(b.stationDwellSec * 0.18, 3));
    const load = Math.max(12, rng.gaussian(b.stationDwellSec * 0.46, 7));
    const review = Math.max(8, rng.gaussian(b.stationDwellSec * 0.3, 5));
    const slowGate = rng.chance(0.07) ? rng.range(6, 14) : 0;
    const dwell = unload + load + review + slowGate;
    const blockWait = Math.max(0, b.minCycleSec - dwell);
    const interval = Math.max(dwell, b.minCycleSec) + rng.range(0, 4);
    const lf = Math.min(1, Math.max(0.35, rng.gaussian(b.loadFactor * demandFactor + 0.1, 0.07)));
    const riders = Math.round(b.capacity * lf);
    out.push({
      id: `H-${rideId}-${n}`,
      atMs: (t - DAY_START_HOUR * 3600) * 1000,
      ts: new Date(Date.UTC(2026, 9, 28, 0, 0, t)).toISOString(),
      rideId,
      dwellSec: Math.round(dwell),
      unloadSec: Math.round(unload),
      loadSec: Math.round(load + slowGate),
      reviewSec: Math.round(review),
      blockWaitSec: Math.round(blockWait),
      intervalSec: Math.round(interval),
      riders,
      capacity: b.capacity,
      loadFactor: riders / b.capacity,
      emptySeats: b.capacity - riders,
      scenarioId: 'history',
    });
    t += interval;
  }
  return out;
}

export function hourlyBuckets(records: DispatchRecord[]): { hour: string; riders: number; dispatches: number; avgInterval: number; avgLoad: number; utilization: number }[] {
  const buckets = new Map<number, DispatchRecord[]>();
  for (const r of records) {
    const h = Math.floor(r.atMs / 3600000) + DAY_START_HOUR;
    const arr = buckets.get(h) ?? [];
    arr.push(r);
    buckets.set(h, arr);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([h, rs]) => {
    const riders = rs.reduce((a, r) => a + r.riders, 0);
    const avgInterval = rs.reduce((a, r) => a + r.intervalSec, 0) / rs.length;
    const avgLoad = rs.reduce((a, r) => a + r.loadFactor, 0) / rs.length;
    const capacity = rs[0]?.capacity ?? 1;
    const theoretical = (capacity * 3600) / Math.max(1, getRide(rs[0].rideId).baseline.minCycleSec);
    return { hour: `${String(h).padStart(2, '0')}:00`, riders, dispatches: rs.length, avgInterval, avgLoad, utilization: Math.min(1, riders / theoretical) };
  });
}

export interface ParkTrendPoint { time: string; occupancy: number; riders: number; reviews: number }

export function parkOccupancyTrend(parkId: string): ParkTrendPoint[] {
  const rng = new SeededRandom(`park:${parkId}`);
  const points: ParkTrendPoint[] = [];
  const rides = RIDES.filter((r) => r.parkId === parkId);
  for (let m = DAY_START_HOUR * 60; m <= 14 * 60 + 15; m += 15) {
    const frac = (m / 60 - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR);
    const occ = Math.round(1800 + 9000 * Math.sin(Math.PI * Math.min(1, frac * 1.15)) + rng.gaussian(0, 200));
    const riders = Math.round(rides.reduce((a, r) => a + r.baseline.demandPerHour, 0) * 0.25 * (0.5 + 0.6 * Math.sin(Math.PI * Math.min(1, frac * 1.1))) + rng.gaussian(0, 20));
    points.push({ time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, occupancy: Math.max(0, occ), riders: Math.max(0, riders), reviews: rng.int(0, 4) });
  }
  return points;
}

export interface ShiftStats {
  shift: string;
  rideId: string;
  reviewsCompleted: number;
  reviewsOpen: number;
  medianAckSec: number;
  p90AckSec: number;
  avgDwellSec: number;
  slowGateEvents: number;
  bottleneck: string;
}

export function shiftStats(): ShiftStats[] {
  const rng = new SeededRandom('shifts');
  const out: ShiftStats[] = [];
  const shifts = ['Early (10:00–14:00)', 'Mid (14:00–18:00)', 'Late (18:00–close)'];
  for (const ride of RIDES.filter((r) => r.status !== 'closed')) {
    shifts.forEach((shift, i) => {
      const med = Math.round(rng.range(14, 40) + i * 4);
      out.push({
        shift,
        rideId: ride.id,
        reviewsCompleted: rng.int(8, 30),
        reviewsOpen: rng.int(0, 3),
        medianAckSec: med,
        p90AckSec: Math.round(med * rng.range(1.8, 2.6)),
        avgDwellSec: Math.round(ride.baseline.stationDwellSec * rng.range(0.92, 1.15)),
        slowGateEvents: rng.int(0, 3),
        bottleneck: rng.pick(['Loading (parties)', 'Restraint review', 'Unloading', 'Gate timing', 'None observed']),
      });
    });
  }
  return out;
}

export interface TrainingTopic { topic: string; relevance: number; rationale: string }

export const COACHING_TOPICS: TrainingTopic[] = [
  { topic: 'Loose-article pre-boarding reminders', relevance: 0.82, rationale: 'Loose-article flags cluster at the gates before boarding; a pre-boarding announcement reduces review volume.' },
  { topic: 'Occlusion awareness — where to stand during checks', relevance: 0.74, rationale: 'Operator position during restraint checks caused most "unknown" seats on rows 5–6.' },
  { topic: 'Party batching at the gates', relevance: 0.68, rationale: 'Empty seats per dispatch are higher on the early shift; batching practice aligns with Smart Boarding suggestions.' },
  { topic: 'Sensor-disagreement SOP walkthrough', relevance: 0.61, rationale: 'Acknowledgement time on sensor-disagreement alerts is ~2x other alert types.' },
  { topic: 'Accessible boarding flow', relevance: 0.52, rationale: 'Accessible boarding adds dwell when the transfer row is not pre-cleared.' },
];

export interface CertificationRow { role: string; certified: number; dueSoon: number; expired: number }

export const CERTIFICATIONS: CertificationRow[] = [
  { role: 'Ride operator — coaster', certified: 18, dueSoon: 3, expired: 0 },
  { role: 'Ride operator — water', certified: 11, dueSoon: 2, expired: 1 },
  { role: 'Lead / supervisor', certified: 6, dueSoon: 1, expired: 0 },
  { role: 'Maintenance technician', certified: 5, dueSoon: 0, expired: 0 },
];
