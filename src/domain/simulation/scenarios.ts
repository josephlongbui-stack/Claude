import type { RideConfiguration, ScenarioAction, ScenarioId, ScenarioScript, ScenarioStep, ScriptedSeat, SeatId, StationPhase } from '../types';
import { allSeats, cameraForSeat, parseSeatId, seatLabel } from '../rides/seats';
import { SeededRandom } from './rng';

const s = (sec: number): number => Math.round(sec * 1000);

export const SCENARIO_META: Record<ScenarioId, { name: string; summary: string; route: string; rideId?: string }> = {
  A: { name: 'Normal loading', summary: 'A full cycle with nothing flagged: arrive, unload, board, check, dispatch.', route: '/live-monitor' },
  B: { name: 'Restraint concern', summary: 'A staged restraint observation is flagged and a person reviews it.', route: '/live-monitor' },
  C: { name: 'Loose object', summary: 'A rider holds a phone; staff are asked to check.', route: '/live-monitor' },
  D: { name: 'Blocked camera', summary: 'A seat cannot be seen clearly, so it is shown as Unknown and sent for review.', route: '/live-monitor' },
  E: { name: 'Sensor disagreement', summary: 'The camera and a fictional sensor disagree, so a person checks.', route: '/live-monitor' },
  F: { name: 'Slow gate', summary: 'A sticking gate stretches loading and shows up in dispatch analytics.', route: '/live-monitor' },
  G: { name: 'Water slide exit occupied', summary: 'A rider stays in the slide exit too long and staff review it.', route: '/water-slide', rideId: 'typhoon' },
  H: { name: 'Dark ride low visibility', summary: 'Infrared view loses confidence on one seat, which is shown as Unknown.', route: '/live-monitor', rideId: 'phantom' },
};

export const VEHICLE_WORD: Record<RideConfiguration['geometry']['kind'], string> = {
  train: 'Train',
  vehicles: 'Vehicle',
  radial: 'Gondola',
  slide: 'Slide',
};

export function phaseLabel(ride: RideConfiguration, phase: StationPhase): string {
  const v = VEHICLE_WORD[ride.geometry.kind];
  const map: Record<StationPhase, string> = {
    idle: 'Idle',
    arriving: `${v} arrives`,
    unloading: 'Unloading',
    boarding: 'Boarding',
    observing: 'Checking seats',
    review: 'Human review',
    ready: 'Ready',
    dispatch: 'Dispatch recorded',
    departing: `${v} leaves`,
  };
  return map[phase];
}

export const NOMINAL_SEAT: ScriptedSeat = { occupancy: 'occupied', restraint: 'nominal', posture: 'nominal', looseObject: 'none', baseConfidence: 0.9, occluded: false, riderVariant: 0 };
export const EMPTY_SEAT: ScriptedSeat = { occupancy: 'empty', restraint: 'not_applicable', posture: 'nominal', looseObject: 'none', baseConfidence: 0.93, occluded: false, riderVariant: 0 };

/** Seats left empty for a given load factor — rear rows first, staged seats never empty, deterministic. */
export function emptySeatsFor(ride: RideConfiguration, loadFactor: number, seed: string): SeatId[] {
  const seats = allSeats(ride.geometry);
  const emptyCount = Math.max(0, Math.round(seats.length * (1 - loadFactor)));
  const rng = new SeededRandom(`${ride.id}:${seed}`);
  const staged = new Set(Object.values(ride.stagedSeats));
  const rearFirst = seats.filter((id) => !staged.has(id)).sort((a, b) => parseSeatId(b).row - parseSeatId(a).row);
  const pool = rearFirst.slice(0, Math.min(rearFirst.length, emptyCount * 3 + 2));
  return rng.shuffle(pool).slice(0, emptyCount);
}

interface Builder {
  steps: ScenarioStep[];
  at(sec: number, action: ScenarioAction): Builder;
}

function builder(): Builder {
  const b: Builder = {
    steps: [],
    at(sec, action) {
      b.steps.push({ atMs: s(sec), action });
      return b;
    },
  };
  return b;
}

interface CycleContext {
  observeAt: number;
  reviewAt: number;
}

interface CycleOptions {
  seed: string;
  staged?: (b: Builder, ctx: CycleContext) => void;
  gateDelaySec?: number;
  dwellSec?: number;
}

/** Shared loading-cycle skeleton for every seated ride. */
function loadingCycle(ride: RideConfiguration, opts: CycleOptions): { steps: ScenarioStep[]; durationMs: number } {
  const b = builder();
  const seats = allSeats(ride.geometry);
  const empty = new Set(emptySeatsFor(ride, ride.baseline.loadFactor, opts.seed));
  const boarded = seats.filter((id) => !empty.has(id));
  const v = VEHICLE_WORD[ride.geometry.kind];
  const gateDelay = opts.gateDelaySec ?? 0;
  const rng = new SeededRandom(`${ride.id}:${opts.seed}:variants`);

  b.at(0, { kind: 'phase', phase: 'arriving', label: `${v} arrives` });
  b.at(0, { kind: 'narration', title: `${v} arrives`, text: 'Every seat starts as Unknown. A seat only shows a result after several camera frames agree.' });
  b.at(4.5, { kind: 'phase', phase: 'unloading', label: 'Unloading' });
  b.at(4.5, { kind: 'narration', title: 'Riders get off', text: 'Seats turn grey as they empty.' });
  seats.forEach((id, i) => b.at(5 + (i / seats.length) * 6, { kind: 'seat', seatId: id, patch: { ...EMPTY_SEAT } }));

  const boardStart = 12.5 + gateDelay;
  b.at(12.5, { kind: 'phase', phase: 'boarding', label: 'Boarding' });
  b.at(12.5, { kind: 'narration', title: 'Boarding', text: gateDelay ? `Gate B is slow to open (${(2.1 + gateDelay).toFixed(1)} s instead of about 2 s), so boarding starts late.` : 'Gates open and riders take their seats.' });
  b.at(13, { kind: 'gate', gateId: 'GATE-B', openDurationMs: s(2.1 + gateDelay) });
  boarded.forEach((id, i) => {
    b.at(boardStart + 1 + (i / boarded.length) * 10, { kind: 'seat', seatId: id, patch: { occupancy: 'occupied', restraint: 'not_applicable', posture: 'nominal', looseObject: 'none', baseConfidence: 0.88 + rng.range(0, 0.06), occluded: false, riderVariant: rng.int(0, 3) } });
  });

  const observeAt = boardStart + 13;
  b.at(observeAt, { kind: 'phase', phase: 'observing', label: 'Checking seats' });
  b.at(observeAt, { kind: 'seats', seatIds: boarded, patch: { restraint: 'nominal' } });
  b.at(observeAt, { kind: 'narration', title: 'Restraints down', text: `${boarded.length} of ${seats.length} seats are filled. Cameras now check each restraint.` });

  const reviewAt = observeAt + 6;
  const readyAt = reviewAt + 10;
  const dispatchAt = readyAt + 3;
  opts.staged?.(b, { observeAt, reviewAt });

  b.at(reviewAt, { kind: 'phase', phase: 'review', label: 'Human review' });
  if (!opts.staged) b.at(reviewAt, { kind: 'narration', title: 'Nothing flagged', text: 'No seat was flagged. The operator still does every required physical check.' });
  b.at(readyAt, { kind: 'phase', phase: 'ready', label: 'Ready' });
  b.at(readyAt, { kind: 'narration', title: 'Reviews closed', text: 'Every flag has been closed by a person. Nothing here authorises dispatch.' });
  const dwellSec = opts.dwellSec ?? ride.baseline.stationDwellSec;
  b.at(dispatchAt, { kind: 'phase', phase: 'dispatch', label: 'Dispatch recorded' });
  b.at(dispatchAt, { kind: 'dispatch', riders: boarded.length, dwellSec, unloadSec: 20, loadSec: Math.round(dwellSec * 0.45), reviewSec: Math.round(dwellSec * 0.28), blockWaitSec: 0 });
  b.at(dispatchAt, { kind: 'narration', title: 'Dispatch recorded', text: `Logged for analytics: ${dwellSec} s in station, ${boarded.length} of ${seats.length} seats. No control signal exists.` });
  b.at(dispatchAt + 2.5, { kind: 'phase', phase: 'departing', label: `${v} leaves` });
  b.at(dispatchAt + 8, { kind: 'phase', phase: 'idle', label: 'Cycle complete' });
  b.at(dispatchAt + 8.5, { kind: 'end' });

  b.steps.sort((x, y) => x.atMs - y.atMs);
  return { steps: b.steps, durationMs: s(dispatchAt + 8.5) };
}

function restraintAlertType(ride: RideConfiguration): 'belt_position' | 'restraint_mismatch' {
  return ride.restraint === 'ots_harness' ? 'restraint_mismatch' : 'belt_position';
}

/** Riders queue, are reviewed at the platform, slide, and exit. `stagedExit` adds a prolonged exit-zone stay. */
function slideSequence(stagedExit: boolean): { steps: ScenarioStep[]; durationMs: number } {
  const b = builder();
  b.at(0, { kind: 'phase', phase: 'boarding', label: 'Queue forming' });
  b.at(0, { kind: 'narration', title: 'Riders queue', text: 'Camera A watches the start platform. Camera B watches the exit pool.' });
  ['Rider 1', 'Rider 2', 'Rider 3'].forEach((label, i) => b.at(i * 0.5, { kind: 'slide', op: { op: 'queue_add', label } }));
  b.at(13, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 4' } });

  // One rider: platform, entry check, departure, then the exit zone. Returns when the exit clears.
  const rider = (platformAt: number, departAt: number, exitStay: number, prolonged = false): number => {
    b.at(platformAt, { kind: 'slide', op: { op: 'to_platform' } });
    b.at(platformAt + 2, { kind: 'slide', op: { op: 'entry_review', state: 'pending' } });
    b.at(platformAt + 2, { kind: 'phase', phase: 'review', label: 'Attendant checks start position' });
    b.at(departAt - 1.5, { kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
    b.at(departAt, { kind: 'slide', op: { op: 'depart' } });
    b.at(departAt, { kind: 'phase', phase: 'dispatch', label: 'Departure recorded' });
    const exitAt = departAt + 13.5;
    b.at(exitAt, { kind: 'slide', op: { op: 'exit_enter' } });
    if (prolonged) {
      b.at(exitAt + 7, { kind: 'slide', op: { op: 'exit_prolonged' } });
      b.at(exitAt + 7, { kind: 'phase', phase: 'review', label: 'Exit zone needs review' });
      b.at(exitAt + 7, { kind: 'narration', title: 'Rider still in the exit', text: 'The exit zone has been occupied longer than expected, so the screen asks a person to check. Rider 2 is held at the top. Nothing is sent to the slide.' });
      b.at(exitAt + 13, { kind: 'auto_review', zone: 'EXIT-ZONE', type: 'exit_zone_occupied', outcome: 'acknowledged', note: 'Exit attendant helping the rider out.' });
      b.at(exitAt + exitStay, { kind: 'narration', title: 'Exit clear', text: 'The rider is out. The exit time and the review are in the log, and throughput updates.' });
      b.at(exitAt + exitStay + 1, { kind: 'auto_review', zone: 'EXIT-ZONE', type: 'exit_zone_occupied', outcome: 'reviewed', note: 'Rider exited with help; no equipment issue seen.' });
    }
    b.at(exitAt + exitStay, { kind: 'slide', op: { op: 'exit_clear' } });
    return exitAt + exitStay;
  };

  b.at(9, { kind: 'narration', title: 'Rider 1 is on the slide', text: 'The departure is only a record. There is no release signal in this demo.' });
  let end: number;
  if (stagedExit) {
    const firstClear = rider(2, 8.5, 18, true);
    end = rider(16, firstClear + 3.5, 3.5);
    end = Math.max(end, rider(firstClear + 5.5, firstClear + 12, 3.5));
  } else {
    rider(2, 8.5, 3.5);
    rider(16, 22.5, 3.5);
    end = rider(30, 36.5, 3.5);
  }
  b.at(end + 1, { kind: 'phase', phase: 'idle', label: 'Sequence complete' });
  b.at(end + 1.5, { kind: 'end' });
  b.steps.sort((x, y) => x.atMs - y.atMs);
  return { steps: b.steps, durationMs: s(end + 1.5) };
}

export function buildScenario(id: ScenarioId, ride: RideConfiguration): ScenarioScript {
  const meta = SCENARIO_META[id];
  const base = { id, rideId: ride.id, name: meta.name, summary: meta.summary, route: ride.geometry.kind === 'slide' ? '/water-slide' : meta.route };

  if (ride.geometry.kind === 'slide') return { ...base, ...slideSequence(id === 'G') };

  switch (id) {
    case 'B': {
      const seat = ride.stagedSeats.concern;
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'B',
          staged: (b, ctx) => {
            b.at(ctx.observeAt + 2, { kind: 'seat', seatId: seat, patch: { restraint: 'concern', baseConfidence: 0.86 } });
            b.at(ctx.observeAt + 2.6, { kind: 'narration', title: 'Possible restraint issue', text: `${seatLabel(ride, seat)}: the ${ride.restraintLabel.toLowerCase()} looks out of position in this staged frame. It is flagged for a person to check, not decided by the system.` });
            b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: restraintAlertType(ride), outcome: 'reviewed', note: 'Operator checked the seat and re-seated the restraint.' });
            b.at(ctx.reviewAt + 6.5, { kind: 'seat', seatId: seat, patch: { restraint: 'nominal' } });
          },
        }),
      };
    }
    case 'C': {
      const seat = ride.stagedSeats.looseObject;
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'C',
          staged: (b, ctx) => {
            b.at(ctx.observeAt + 1.5, { kind: 'seat', seatId: seat, patch: { looseObject: 'detected', baseConfidence: 0.84 } });
            b.at(ctx.observeAt + 2.2, { kind: 'narration', title: 'Phone in hand', text: `${seatLabel(ride, seat)}: a rider is holding a phone. Staff are asked to check.` });
            b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: 'loose_article', outcome: 'reviewed', note: 'Rider put the phone in the station bin.' });
            b.at(ctx.reviewAt + 6.5, { kind: 'seat', seatId: seat, patch: { looseObject: 'none' } });
          },
        }),
      };
    }
    case 'D': {
      const seat = ride.stagedSeats.occluded;
      const cam = cameraForSeat(ride, seat);
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'D',
          staged: (b, ctx) => {
            b.at(ctx.observeAt + 1, { kind: 'camera', cameraId: cam, patch: { occlusion: { x: 0.58, y: 0.28, w: 0.3, h: 0.5, label: 'Sign in the way' } } });
            b.at(ctx.observeAt + 1, { kind: 'seat', seatId: seat, patch: { occluded: true } });
            b.at(ctx.observeAt + 1.8, { kind: 'narration', title: 'Camera view blocked', text: `${seatLabel(ride, seat)} can't be seen, so it shows as Unknown and goes to review. The system never assumes it is fine.` });
            b.at(ctx.reviewAt + 5, { kind: 'auto_review', seatId: seat, type: 'occlusion', outcome: 'acknowledged', note: 'Operator checking the seat by eye.' });
            b.at(ctx.reviewAt + 8, { kind: 'camera', cameraId: cam, patch: { occlusion: undefined } });
            b.at(ctx.reviewAt + 8, { kind: 'seat', seatId: seat, patch: { occluded: false } });
            b.at(ctx.reviewAt + 9, { kind: 'auto_review', seatId: seat, type: 'occlusion', outcome: 'reviewed', note: 'Sign moved; seat checked by eye.' });
          },
        }),
      };
    }
    case 'E': {
      const seat = ride.stagedSeats.sensor;
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'E',
          staged: (b, ctx) => {
            b.at(ctx.observeAt + 2, { kind: 'sensor', seatId: seat, reading: 'not_engaged', status: 'online', confidence: 0.8 });
            b.at(ctx.observeAt + 2.5, { kind: 'narration', title: 'Camera and sensor disagree', text: `${seatLabel(ride, seat)}: the camera sees the restraint down, the fictional sensor says it isn't. Neither is trusted alone, so a person checks.` });
            b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: 'sensor_discrepancy', outcome: 'reviewed', note: 'Checked by hand. Sensor reading sent to maintenance.' });
            b.at(ctx.reviewAt + 6.5, { kind: 'sensor', seatId: seat, reading: 'engaged', status: 'online', confidence: 0.82 });
          },
        }),
      };
    }
    case 'F':
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'F',
          gateDelaySec: 7.4,
          dwellSec: ride.baseline.stationDwellSec + 31,
          staged: (b, ctx) => {
            b.at(ctx.reviewAt, { kind: 'narration', title: 'Slow gate logged', text: 'The slow gate made this cycle longer. It shows up in Operations, both in dispatch time and in the Gate B maintenance trend.' });
            b.at(ctx.reviewAt + 4, { kind: 'auto_review', zone: 'GATE-B', type: 'slow_gate', outcome: 'acknowledged', note: 'Gate B sticking; maintenance ticket MT-1042.' });
          },
        }),
      };
    case 'H': {
      const seat = ride.stagedSeats.occluded;
      const cam = cameraForSeat(ride, seat);
      return {
        ...base,
        ...loadingCycle(ride, {
          seed: 'H',
          staged: (b, ctx) => {
            b.at(ctx.observeAt + 1, { kind: 'camera', cameraId: cam, patch: { noise: 0.5 } });
            b.at(ctx.observeAt + 1, { kind: 'seat', seatId: seat, patch: { baseConfidence: 0.52 } });
            b.at(ctx.observeAt + 1.8, { kind: 'narration', title: 'Too dark to be sure', text: `${seatLabel(ride, seat)}: in the infrared view the camera isn't confident enough, so the seat shows as Unknown instead of fine.` });
            b.at(ctx.reviewAt + 5, { kind: 'auto_review', seatId: seat, type: 'low_confidence', outcome: 'acknowledged', note: 'Operator checking with a torch.' });
            b.at(ctx.reviewAt + 8, { kind: 'seat', seatId: seat, patch: { baseConfidence: 0.86 } });
            b.at(ctx.reviewAt + 8, { kind: 'camera', cameraId: cam, patch: { noise: 0.15 } });
            b.at(ctx.reviewAt + 9.5, { kind: 'auto_review', seatId: seat, type: 'low_confidence', outcome: 'reviewed', note: 'Checked by hand; view recovered.' });
          },
        }),
      };
    }
    case 'A':
    default:
      return { ...base, ...loadingCycle(ride, { seed: 'A' }) };
  }
}

/** The ride a scenario runs on: its own ride if it names one, else the current ride if it offers it, else the coaster. */
export function scenarioRideId(id: ScenarioId, currentRideId: string, rides: RideConfiguration[]): string {
  const own = SCENARIO_META[id].rideId;
  if (own) return own;
  const current = rides.find((r) => r.id === currentRideId);
  if (current?.scenarios.some((p) => p.id === id)) return currentRideId;
  return rides.find((r) => r.scenarios.some((p) => p.id === id))?.id ?? rides[0].id;
}
