import type { RideConfiguration, ScenarioAction, ScenarioId, ScenarioScript, ScenarioStep, ScriptedSeat, SeatId, StationPhase } from '../types';
import { allSeats, cameraForSeat, parseSeatId, seatLabel } from '../rides/seats';
import { SeededRandom } from './rng';

const s = (sec: number): number => Math.round(sec * 1000);

export const SCENARIO_ORDER: ScenarioId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const SCENARIO_META: Record<ScenarioId, { name: string; summary: string; route: string; rideId?: string }> = {
  A: { name: 'Normal coaster loading', summary: 'Train enters, passengers board, simulated observations update, operations timeline recorded.', route: '/live-monitor' },
  B: { name: 'Potential restraint concern', summary: 'A staged restraint observation appears on the camera overlay, seat map, alert queue and evidence log. Human review demonstrated.', route: '/live-monitor' },
  C: { name: 'Loose object', summary: 'A simulated passenger holds a phone; the loose-article alert and review workflow appear.', route: '/live-monitor' },
  D: { name: 'Occluded camera', summary: 'The system cannot determine an observation confidently; the seat becomes Unknown — review required.', route: '/live-monitor' },
  E: { name: 'Sensor disagreement', summary: 'A synthetic camera observation conflicts with a fictional sensor record and triggers human review.', route: '/live-monitor' },
  F: { name: 'Slow station dispatch', summary: 'A sticking gate increases cycle time; pacing, throughput and maintenance analytics update.', route: '/live-monitor' },
  G: { name: 'Optimized boarding', summary: 'The row-assignment algorithm improves seat utilisation for a fictional party queue.', route: '/boarding' },
  H: { name: 'Water slide exit occupied', summary: 'The water slide shows a staged exit-zone concern and the associated review events.', route: '/water-slide', rideId: 'typhoon' },
  I: { name: 'Dark ride', summary: 'Infrared-style imagery and a low-visibility seat demonstrate conservative uncertainty handling.', route: '/live-monitor', rideId: 'phantom' },
  J: { name: 'Maintenance deterioration', summary: 'Historical simulated measurements produce a maintenance recommendation.', route: '/maintenance' },
  K: { name: 'Boat spacing', summary: 'Simulated boat spacing in the lift approach falls below the demonstration threshold.', route: '/live-monitor', rideId: 'rapids' },
  L: { name: 'Accompaniment policy review', summary: 'Fictional ticketing data flags a row for a staff accompaniment check.', route: '/live-monitor', rideId: 'dipper' },
};

export const VEHICLE_WORD: Record<RideConfiguration['geometry']['kind'], string> = {
  train: 'Train',
  radial: 'Gondola',
  gondolas: 'Ride',
  vehicles: 'Vehicle',
  boats: 'Boat',
  slide: 'Slide',
};

export function phaseLabel(ride: RideConfiguration, phase: StationPhase): string {
  const v = VEHICLE_WORD[ride.geometry.kind];
  const map: Record<StationPhase, string> = {
    idle: 'Idle',
    arriving: `${v} arrives`,
    unloading: 'Passengers unload',
    boarding: 'Boarding',
    observing: 'Observations update',
    review: 'Human review',
    ready: 'Readiness observed',
    dispatch: 'Dispatch recorded',
    departing: `${v} leaves station`,
    block_wait: 'Block wait',
  };
  return map[phase];
}

export const NOMINAL_SEAT: ScriptedSeat = { occupancy: 'occupied', restraint: 'nominal', posture: 'nominal', looseObject: 'none', baseConfidence: 0.9, occluded: false, riderVariant: 0 };
export const EMPTY_SEAT: ScriptedSeat = { occupancy: 'empty', restraint: 'not_applicable', posture: 'nominal', looseObject: 'none', baseConfidence: 0.93, occluded: false, riderVariant: 0 };

/** Seats left empty for a given load factor — rear rows first, deterministic. */
export function emptySeatsFor(ride: RideConfiguration, loadFactor: number, seed: string): SeatId[] {
  const seats = allSeats(ride.geometry);
  const emptyCount = Math.max(0, Math.round(seats.length * (1 - loadFactor)));
  const rng = new SeededRandom(`${ride.id}:${seed}`);
  const staged = new Set(Object.values(ride.stagedSeats));
  const rearFirst = seats.filter((id) => !staged.has(id)).sort((a, b) => parseSeatId(b).row - parseSeatId(a).row);
  const pool = rearFirst.slice(0, Math.min(seats.length, emptyCount * 3 + 2));
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

interface CycleOptions {
  loadFactor: number;
  seed: string;
  staged?: (b: Builder, ctx: CycleContext) => void;
  gateDelaySec?: number;
  reviewOutcomeSec?: number;
  dispatch?: { dwellSec: number; unloadSec: number; loadSec: number; reviewSec: number; blockWaitSec: number };
}

interface CycleContext {
  ride: RideConfiguration;
  boarded: SeatId[];
  empty: SeatId[];
  observeAt: number;
  reviewAt: number;
  readyAt: number;
  dispatchAt: number;
}

/** Shared loading-cycle skeleton for every seated ride. */
function loadingCycle(ride: RideConfiguration, opts: CycleOptions): { steps: ScenarioStep[]; durationMs: number } {
  const b = builder();
  const seats = allSeats(ride.geometry);
  const empty = new Set(emptySeatsFor(ride, opts.loadFactor, opts.seed));
  const boarded = seats.filter((id) => !empty.has(id));
  const v = VEHICLE_WORD[ride.geometry.kind];
  const gateDelay = opts.gateDelaySec ?? 0;
  const rng = new SeededRandom(`${ride.id}:${opts.seed}:variants`);

  b.at(0, { kind: 'phase', phase: 'arriving', label: `${v} arrives` });
  b.at(0, { kind: 'narration', title: `${v} arrives in station`, text: `Cameras resume per-seat observation as the ${v.toLowerCase()} stops. All seats begin as "unknown" until enough frames stabilise.` });
  b.at(4.5, { kind: 'phase', phase: 'unloading', label: 'Passengers unload' });
  b.at(4.5, { kind: 'narration', title: 'Passengers unload', text: 'Seats transition to empty as riders leave. Empty is only reported after several consistent frames.' });
  // Unload progressively, front to rear.
  seats.forEach((id, i) => {
    const t = 5 + (i / seats.length) * 6;
    b.at(t, { kind: 'seat', seatId: id, patch: { ...EMPTY_SEAT } });
  });

  const boardStart = 12.5 + gateDelay;
  b.at(12.5, { kind: 'phase', phase: 'boarding', label: 'Boarding begins' });
  b.at(12.5, { kind: 'narration', title: 'Boarding begins', text: gateDelay ? `Gate B opened slowly (${(2.1 + gateDelay).toFixed(1)}s vs 2.1s typical). The delay is recorded as an equipment observation.` : 'Air gates open. Occupancy increases row by row; restraint checks are not applicable until restraints are lowered.' });
  if (gateDelay) b.at(13, { kind: 'gate', gateId: 'GATE-B', openDurationMs: s(2.1 + gateDelay) });
  else b.at(13, { kind: 'gate', gateId: 'GATE-B', openDurationMs: s(2.1) });

  boarded.forEach((id, i) => {
    const t = boardStart + 1 + (i / boarded.length) * 10;
    b.at(t, { kind: 'seat', seatId: id, patch: { occupancy: 'occupied', restraint: 'not_applicable', posture: 'nominal', looseObject: 'none', baseConfidence: 0.88 + rng.range(0, 0.06), occluded: false, riderVariant: rng.int(0, 3) } });
  });
  const occupancyAt = boardStart + 7;
  b.at(occupancyAt, { kind: 'narration', title: 'Occupancy increases', text: `${boarded.length} of ${seats.length} seats boarded in this cycle (${Math.round((boarded.length / seats.length) * 100)}% load factor, simulated).` });

  const observeAt = boardStart + 13;
  b.at(observeAt, { kind: 'phase', phase: 'observing', label: 'Restraints lowered · observations update' });
  b.at(observeAt, { kind: 'seats', seatIds: boarded, patch: { restraint: 'nominal' } });
  b.at(observeAt, { kind: 'narration', title: 'Restraint observations update', text: 'Restraints are lowered. Each occupied seat is observed over several frames before any state is reported.' });

  const reviewAt = observeAt + 6;
  const readyAt = reviewAt + 10;
  const dispatchAt = readyAt + 3;
  const ctx: CycleContext = { ride, boarded, empty: [...empty], observeAt, reviewAt, readyAt, dispatchAt };
  opts.staged?.(b, ctx);

  b.at(reviewAt, { kind: 'phase', phase: 'review', label: 'Human review' });
  b.at(reviewAt, { kind: 'narration', title: 'Human review', text: opts.staged ? 'Flagged observations are queued for the operator. Nothing here authorises dispatch — the operator performs the required physical checks.' : 'No observations flagged in simulation. The operator still performs every required physical check.' });
  b.at(readyAt, { kind: 'phase', phase: 'ready', label: 'Readiness observed' });
  b.at(readyAt, { kind: 'narration', title: 'Operational readiness changes', text: 'All review items are closed by a human. The display shows readiness as an informational state only.' });
  b.at(dispatchAt, { kind: 'phase', phase: 'dispatch', label: 'Simulated dispatch recorded' });
  const d = opts.dispatch ?? { dwellSec: ride.baseline.stationDwellSec, unloadSec: 20, loadSec: 48, reviewSec: 32, blockWaitSec: 0 };
  b.at(dispatchAt, { kind: 'dispatch', riders: boarded.length, ...d });
  b.at(dispatchAt, { kind: 'narration', title: 'Simulated dispatch event recorded', text: `Dispatch recorded for analytics only: ${d.dwellSec}s station dwell, ${boarded.length}/${seats.length} seats. No control signal is sent.` });
  b.at(dispatchAt + 2.5, { kind: 'phase', phase: 'departing', label: `${v} leaves station` });
  b.at(dispatchAt + 2.5, { kind: 'narration', title: `${v} leaves station`, text: 'Observation frames end for this cycle. The event log retains every record with its hash-chain link.' });
  b.at(dispatchAt + 8, { kind: 'phase', phase: 'idle', label: 'Cycle complete' });
  b.at(dispatchAt + 8.5, { kind: 'end' });

  b.steps.sort((x, y) => x.atMs - y.atMs);
  return { steps: b.steps, durationMs: s(dispatchAt + 8.5) };
}

function restraintAlertType(ride: RideConfiguration): 'belt_position' | 'restraint_mismatch' {
  return ride.restraint === 'ots_harness' || ride.restraint === 'flying_vest' ? 'restraint_mismatch' : 'belt_position';
}

export function buildScenario(id: ScenarioId, ride: RideConfiguration): ScenarioScript {
  const meta = SCENARIO_META[id];
  const base = { id, rideId: ride.id, name: meta.name, summary: meta.summary, route: meta.route };
  const lf = ride.baseline.loadFactor;

  if (ride.geometry.kind === 'slide' && id !== 'H') return { ...base, ...slideCycle(false) };

  switch (id) {
    case 'A': {
      const cyc = loadingCycle(ride, { loadFactor: lf, seed: 'A' });
      return { ...base, ...cyc };
    }
    case 'B': {
      const seat = ride.stagedSeats.concern;
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'B',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 2, { kind: 'seat', seatId: seat, patch: { restraint: 'concern', baseConfidence: 0.86 } });
          b.at(ctx.observeAt + 2.6, { kind: 'narration', title: 'Potential issue detected', text: `${seatLabel(ride, seat)}: ${ride.restraintLabel.toLowerCase()} position differs from the expected envelope in the staged scenario. Flagged as a potential concern for human review — not a determination.` });
          b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: restraintAlertType(ride), outcome: 'reviewed', note: 'Operator performed physical check and re-seated the restraint. Observation cleared in simulation.' });
          b.at(ctx.reviewAt + 6.5, { kind: 'seat', seatId: seat, patch: { restraint: 'nominal' } });
        },
      });
      return { ...base, ...cyc };
    }
    case 'C': {
      const seat = ride.stagedSeats.looseObject;
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'C',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 1.5, { kind: 'seat', seatId: seat, patch: { looseObject: 'detected', baseConfidence: 0.84 } });
          b.at(ctx.observeAt + 2.2, { kind: 'narration', title: 'Loose object detected (staged)', text: `${seatLabel(ride, seat)}: a hand-held phone appears in the staged frame. The loose-article flag asks staff to check — it does not block or control anything.` });
          b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: 'loose_article', outcome: 'reviewed', note: 'Item placed in the station bin by the rider at operator request.' });
          b.at(ctx.reviewAt + 6.5, { kind: 'seat', seatId: seat, patch: { looseObject: 'none' } });
        },
      });
      return { ...base, ...cyc };
    }
    case 'D': {
      const seat = ride.stagedSeats.occluded;
      const cam = cameraForSeat(ride, seat);
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'D',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 1, { kind: 'camera', cameraId: cam, patch: { occlusion: { x: 0.58, y: 0.28, w: 0.3, h: 0.5, label: 'Platform signage' } } });
          b.at(ctx.observeAt + 1, { kind: 'seat', seatId: seat, patch: { occluded: true } });
          b.at(ctx.observeAt + 1.8, { kind: 'narration', title: 'View obstructed', text: `${seatLabel(ride, seat)}: the covering camera is partially blocked. Confidence is insufficient, so the seat is reported as Unknown — review required. The system never assumes a nominal state.` });
          b.at(ctx.reviewAt + 5, { kind: 'auto_review', seatId: seat, type: 'occlusion', outcome: 'acknowledged', note: 'Operator performing manual visual check; signage to be repositioned.' });
          b.at(ctx.reviewAt + 8, { kind: 'camera', cameraId: cam, patch: { occlusion: undefined } });
          b.at(ctx.reviewAt + 8, { kind: 'seat', seatId: seat, patch: { occluded: false } });
          b.at(ctx.reviewAt + 9, { kind: 'auto_review', seatId: seat, type: 'occlusion', outcome: 'reviewed', note: 'Obstruction cleared; observation stabilised after manual check.' });
        },
      });
      return { ...base, ...cyc };
    }
    case 'E': {
      const seat = ride.stagedSeats.sensor;
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'E',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 2, { kind: 'sensor', seatId: seat, reading: 'not_engaged', status: 'online', confidence: 0.8 });
          b.at(ctx.observeAt + 2.5, { kind: 'narration', title: 'Sensor disagreement (synthetic)', text: `${seatLabel(ride, seat)}: the camera observation reads nominal while the fictional restraint adapter reports "not engaged". Disagreement always routes to a human — neither source is trusted alone.` });
          b.at(ctx.reviewAt + 6, { kind: 'auto_review', seatId: seat, type: 'sensor_discrepancy', outcome: 'reviewed', note: 'Manual check performed. Adapter reading flagged for maintenance follow-up.' });
          b.at(ctx.reviewAt + 6.5, { kind: 'sensor', seatId: seat, reading: 'engaged', status: 'online', confidence: 0.82 });
        },
      });
      return { ...base, ...cyc };
    }
    case 'F': {
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'F',
        gateDelaySec: 7.4,
        dispatch: { dwellSec: ride.baseline.stationDwellSec + 31, unloadSec: 20, loadSec: 72, reviewSec: 36, blockWaitSec: 0 },
        staged: (b, ctx) => {
          b.at(ctx.observeAt - 4, { kind: 'narration', title: 'Slow gate recorded', text: 'Gate B took 9.5s to open against a 2.1s typical. Loading is extended, the cycle gets longer, and the observation feeds pacing, throughput and maintenance analytics.' });
          b.at(ctx.reviewAt + 4, { kind: 'auto_review', zone: 'GATE-B', type: 'slow_gate', outcome: 'acknowledged', note: 'Gate B sticking; maintenance ticket referenced.' });
        },
      });
      return { ...base, ...cyc };
    }
    case 'G': {
      const b = builder();
      b.at(0, { kind: 'phase', phase: 'boarding', label: 'Party queue assembled' });
      b.at(0, { kind: 'narration', title: 'Optimized boarding', text: 'A fictional queue of parties waits at the gates. The naive allocation fills rows in arrival order and leaves gaps.' });
      b.at(4, { kind: 'boarding', op: 'optimize' });
      b.at(4, { kind: 'narration', title: 'Generate better assignment', text: 'The allocator packs parties into rows without splitting any party marked "together", then back-fills singles. Load factor and empty seats are computed, not asserted.' });
      b.at(10, { kind: 'event', type: 'boarding', title: 'Optimized assignment generated', detail: 'Row assignment computed from the fictional party queue; see Smart Boarding for the decision log.', severity: 'info' });
      b.at(12, { kind: 'phase', phase: 'dispatch', label: 'Simulated dispatch recorded' });
      b.at(12, { kind: 'dispatch', riders: Math.round(ride.baseline.capacity * 0.92), dwellSec: 95, unloadSec: 18, loadSec: 40, reviewSec: 30, blockWaitSec: 0 });
      b.at(14, { kind: 'narration', title: 'Measured gain', text: 'The assisted dispatch records a higher load factor than the naive baseline. Dispatch Analytics shows the same figures feeding the throughput projection.' });
      b.at(18, { kind: 'phase', phase: 'idle', label: 'Cycle complete' });
      b.at(18.5, { kind: 'end' });
      return { ...base, steps: b.steps, durationMs: s(18.5) };
    }
    case 'H': {
      const b = builder();
      b.at(0, { kind: 'phase', phase: 'boarding', label: 'Queue forming' });
      b.at(0, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 1' } });
      b.at(0.5, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 2' } });
      b.at(1, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 3' } });
      b.at(0, { kind: 'narration', title: 'Rider approaches slide', text: 'Camera A observes the start platform and queue zone. Camera B observes the exit run-out and splash zone.' });
      b.at(2.5, { kind: 'slide', op: { op: 'to_platform' } });
      b.at(5, { kind: 'slide', op: { op: 'entry_review', state: 'pending' } });
      b.at(5, { kind: 'phase', phase: 'review', label: 'Attendant reviews entry position' });
      b.at(5, { kind: 'narration', title: 'Attendant reviews entry position', text: 'The entry-position observation is informational. The attendant performs the start-position check and records it.' });
      b.at(9, { kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
      b.at(11, { kind: 'slide', op: { op: 'depart' } });
      b.at(11, { kind: 'phase', phase: 'dispatch', label: 'Departure recorded' });
      b.at(11, { kind: 'narration', title: 'Simulated departure event recorded', text: 'The rider is represented as occupying the slide. No release signal exists in this demo; this is a record only.' });
      b.at(13, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 4' } });
      b.at(13.5, { kind: 'slide', op: { op: 'to_platform' } });
      b.at(14, { kind: 'narration', title: 'Another rider appears in the queue', text: 'Rider 2 moves to the platform while Rider 1 is in the flume. Entry review is pending.' });
      b.at(16, { kind: 'slide', op: { op: 'entry_review', state: 'pending' } });
      b.at(24, { kind: 'slide', op: { op: 'exit_enter' } });
      b.at(24, { kind: 'narration', title: 'Rider reaches exit zone', text: 'Camera B reports splash-zone occupancy. Normal exits clear within a few seconds in this simulation.' });
      b.at(31, { kind: 'slide', op: { op: 'exit_prolonged' } });
      b.at(31, { kind: 'phase', phase: 'review', label: 'Exit-zone review required' });
      b.at(31, { kind: 'narration', title: 'Exit-zone occupancy persists (staged)', text: 'Occupancy has persisted beyond the demonstration threshold. The dashboard highlights that human review is required. Nothing is signalled to the slide.' });
      b.at(38, { kind: 'auto_review', zone: 'EXIT-ZONE', type: 'exit_zone_occupied', outcome: 'acknowledged', note: 'Exit attendant assisting rider out of run-out.' });
      b.at(42, { kind: 'slide', op: { op: 'exit_clear' } });
      b.at(42, { kind: 'narration', title: 'Exit event recorded', text: 'Exit-zone occupancy cleared. The exit event, interval and throughput analytics update.' });
      b.at(43, { kind: 'auto_review', zone: 'EXIT-ZONE', type: 'exit_zone_occupied', outcome: 'reviewed', note: 'Rider exited safely with assistance; no equipment issue observed.' });
      b.at(44, { kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
      b.at(46, { kind: 'slide', op: { op: 'depart' } });
      b.at(46, { kind: 'phase', phase: 'dispatch', label: 'Departure recorded' });
      b.at(47, { kind: 'slide', op: { op: 'to_platform' } });
      b.at(49, { kind: 'slide', op: { op: 'entry_review', state: 'pending' } });
      b.at(53, { kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
      b.at(55, { kind: 'slide', op: { op: 'depart' } });
      b.at(58, { kind: 'slide', op: { op: 'exit_enter' } });
      b.at(62, { kind: 'slide', op: { op: 'exit_clear' } });
      b.at(62, { kind: 'narration', title: 'Throughput analytics update', text: 'Dispatch intervals, riders per hour, queue length and the current bottleneck are recomputed from the recorded events.' });
      b.at(64, { kind: 'phase', phase: 'idle', label: 'Sequence complete' });
      b.at(64.5, { kind: 'end' });
      b.steps.sort((x, y) => x.atMs - y.atMs);
      return { ...base, steps: b.steps, durationMs: s(64.5) };
    }
    case 'I': {
      const seat = ride.stagedSeats.occluded;
      const cam = cameraForSeat(ride, seat);
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'I',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 1, { kind: 'camera', cameraId: cam, patch: { noise: 0.5 } });
          b.at(ctx.observeAt + 1, { kind: 'seat', seatId: seat, patch: { baseConfidence: 0.52 } });
          b.at(ctx.observeAt + 1.8, { kind: 'narration', title: 'Low visibility (infrared)', text: `${seatLabel(ride, seat)}: under infrared illumination confidence drops below threshold. The seat is reported as Unknown rather than assumed nominal.` });
          b.at(ctx.reviewAt + 5, { kind: 'auto_review', seatId: seat, type: 'low_confidence', outcome: 'acknowledged', note: 'Operator performing manual check with torch; scenic lighting cue to be reviewed.' });
          b.at(ctx.reviewAt + 8, { kind: 'seat', seatId: seat, patch: { baseConfidence: 0.86 } });
          b.at(ctx.reviewAt + 8, { kind: 'camera', cameraId: cam, patch: { noise: 0.15 } });
          b.at(ctx.reviewAt + 9.5, { kind: 'auto_review', seatId: seat, type: 'low_confidence', outcome: 'reviewed', note: 'Manual check complete; view recovered after lighting cue.' });
        },
      });
      return { ...base, ...cyc };
    }
    case 'J': {
      const b = builder();
      b.at(0, { kind: 'phase', phase: 'idle', label: 'Maintenance analysis' });
      b.at(0, { kind: 'narration', title: 'Maintenance deterioration', text: 'Fourteen simulated days of gate-opening durations show a rising trend on Station Gate B.' });
      b.at(3, { kind: 'maintenance', ticketId: 'MT-1042', op: 'surface' });
      b.at(3, { kind: 'event', type: 'maintenance', title: 'Maintenance recommendation generated', detail: 'Station Gate B — opening duration increasing over the previous 14 simulated days. Illustrative trend, not validated predictive maintenance.', severity: 'review' });
      b.at(4, { kind: 'narration', title: 'Recommendation with evidence', text: 'The ticket carries the supporting chart, the gate observations from this session and the recommended inspection. A technician can inspect and close it.' });
      b.at(12, { kind: 'end' });
      return { ...base, steps: b.steps, durationMs: s(12) };
    }
    case 'K': {
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'K',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 1, { kind: 'alert', alert: { type: 'spacing', severity: 'review', cameraId: 'CAM-02', target: { kind: 'zone', zone: 'LIFT-APPROACH' }, title: 'Boat spacing below demonstration threshold', detail: 'Simulated spacing between Boat 2 and Boat 3 in the lift approach is 6.8 m against a 9 m demonstration threshold. Informational only.', confidence: 0.81 } });
          b.at(ctx.observeAt + 1.5, { kind: 'narration', title: 'Boat spacing (simulated)', text: 'The overhead camera estimates inter-boat spacing. Values below the demonstration threshold are queued for staff review.' });
          b.at(ctx.reviewAt + 5, { kind: 'auto_review', zone: 'LIFT-APPROACH', type: 'spacing', outcome: 'reviewed', note: 'Dock operator held Boat 3 at the dock brake per SOP; spacing recovered.' });
        },
      });
      return { ...base, ...cyc };
    }
    case 'L': {
      const row = parseSeatId(ride.stagedSeats.concern).row;
      const cyc = loadingCycle(ride, {
        loadFactor: lf,
        seed: 'L',
        staged: (b, ctx) => {
          b.at(ctx.observeAt + 1, { kind: 'alert', alert: { type: 'policy_review', severity: 'review', cameraId: 'CAM-01', target: { kind: 'zone', zone: `ROW-${row}` }, title: `Accompaniment check — Row ${row}`, detail: `Fictional ticketing record for the party in Row ${row} indicates an accompaniment requirement. Staff confirm per policy. No age or height is inferred from imagery.`, confidence: 1 } });
          b.at(ctx.observeAt + 1.5, { kind: 'narration', title: 'Policy review flag', text: 'The flag originates from fictional ticketing data, not from the camera. The camera never estimates age or height eligibility.' });
          b.at(ctx.reviewAt + 5, { kind: 'auto_review', zone: `ROW-${row}`, type: 'policy_review', outcome: 'reviewed', note: 'Accompanying adult confirmed seated in the same row.' });
        },
      });
      return { ...base, ...cyc };
    }
    default:
      return { ...base, steps: [{ atMs: 0, action: { kind: 'end' } }], durationMs: 1 };
  }
}

/** Normal slide cycle (scenario A on slide rides): riders queue, are reviewed, depart and exit without a staged concern. */
function slideCycle(_staged: boolean): { steps: ScenarioStep[]; durationMs: number } {
  const b = builder();
  b.at(0, { kind: 'phase', phase: 'boarding', label: 'Queue forming' });
  b.at(0, { kind: 'narration', title: 'Normal slide cycle', text: 'Riders queue at the platform; each entry is reviewed by the attendant and recorded, then departure and exit events follow.' });
  ['Rider 1', 'Rider 2', 'Rider 3'].forEach((l, i) => b.at(0.4 * i, { kind: 'slide', op: { op: 'queue_add', label: l } }));
  let t = 2;
  for (let i = 0; i < 3; i += 1) {
    b.at(t, { kind: 'slide', op: { op: 'to_platform' } });
    b.at(t + 2, { kind: 'slide', op: { op: 'entry_review', state: 'pending' } });
    b.at(t + 2, { kind: 'phase', phase: 'review', label: 'Attendant reviews entry position' });
    b.at(t + 5, { kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
    b.at(t + 6.5, { kind: 'slide', op: { op: 'depart' } });
    b.at(t + 6.5, { kind: 'phase', phase: 'dispatch', label: 'Departure recorded' });
    b.at(t + 6.5 + 13.5, { kind: 'slide', op: { op: 'exit_enter' } });
    b.at(t + 6.5 + 17, { kind: 'slide', op: { op: 'exit_clear' } });
    if (i === 1) b.at(t + 1, { kind: 'slide', op: { op: 'queue_add', label: 'Rider 4' } });
    t += 14;
  }
  b.at(t + 10, { kind: 'narration', title: 'Cycle complete', text: 'Intervals, riders per hour and queue length are recomputed from the recorded events.' });
  b.at(t + 12, { kind: 'phase', phase: 'idle', label: 'Sequence complete' });
  b.at(t + 12.5, { kind: 'end' });
  b.steps.sort((x, y) => x.atMs - y.atMs);
  return { steps: b.steps, durationMs: s(t + 12.5) };
}

export function scenarioRideId(id: ScenarioId, currentRideId: string): string {
  return SCENARIO_META[id].rideId ?? currentRideId;
}
