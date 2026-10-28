import type {
  Alert,
  AlertTarget,
  AlertType,
  CameraRuntime,
  DispatchRecord,
  EvaluatedSeat,
  EvaluatorSettings,
  EventType,
  FusionResult,
  GateObservation,
  Narration,
  RideConfiguration,
  ScenarioAction,
  ScenarioScript,
  ScriptedAlert,
  ScriptedSeat,
  SeatId,
  SensorObservation,
  Severity,
  SlideOp,
  SlideState,
  StationPhase,
  TimelineMarker,
} from '../types';
import { allSeats, cameraForSeat, seatLabel } from '../rides/seats';
import { createEvaluatedSeat, evaluateSeat } from '../observation/evaluator';
import { SimulatedObservationProvider, fuse } from '../observation/provider';
import { SeededRandom } from './rng';
import { NOMINAL_SEAT } from './scenarios';

export const FRAME_MS = 250;
export const FLUME_MS = 13000;

export interface AlertDraft extends ScriptedAlert {
  rideId: string;
  scenarioId: ScenarioScript['id'];
  atMs: number;
}

export interface EventDraftInput {
  type: EventType;
  title: string;
  detail: string;
  severity: Severity;
  rideId: string;
  scenarioId: ScenarioScript['id'] | 'none';
  atMs: number;
  cameraId?: string;
  target?: AlertTarget;
  confidence?: number;
  sensor?: Alert['sensor'];
}

export interface AutoReviewMatch {
  rideId: string;
  seatId?: SeatId;
  zone?: string;
  type: AlertType;
}

/** Side-effect sinks — the records store in the app, an in-memory recorder in tests. */
export interface EngineSinks {
  raiseAlert(draft: AlertDraft): Alert | undefined;
  logEvent(draft: EventDraftInput): void;
  autoReview(match: AutoReviewMatch, outcome: 'acknowledged' | 'reviewed' | 'false_alarm', note: string, atMs: number): void;
  recordDispatch(record: Omit<DispatchRecord, 'id' | 'ts'>): void;
  surfaceTicket(ticketId: string): void;
  optimizeBoarding(): void;
  navigate(route: string): void;
  hasOpenAlert(rideId: string, target: AlertTarget, type: AlertType): boolean;
}

export interface EngineSnapshot {
  rideId: string;
  scenarioId: ScenarioScript['id'] | null;
  simMs: number;
  sessionMs: number;
  durationMs: number;
  phase: StationPhase;
  phaseStartedMs: number;
  seats: Record<SeatId, EvaluatedSeat>;
  scripted: Record<SeatId, ScriptedSeat>;
  cameras: Record<string, CameraRuntime>;
  sensors: Record<SeatId, SensorObservation>;
  fusion: Record<SeatId, FusionResult>;
  slide: SlideState;
  narration: Narration | null;
  markers: TimelineMarker[];
  gates: GateObservation[];
  finished: boolean;
  frameCount: number;
}

function emptySlide(): SlideState {
  return { queue: [], platformRider: undefined, entryReview: 'none', inFlume: [], exitZone: { prolonged: false }, riderCounter: 0, departures: [], exits: [], queueHistory: [{ atMs: 0, length: 0 }] };
}

export class SimulationEngine {
  readonly ride: RideConfiguration;
  private readonly sinks: EngineSinks;
  private readonly getSettings: () => EvaluatorSettings;
  private script: ScenarioScript | null = null;
  private cursor = 0;
  private rng = new SeededRandom(1);
  private provider: SimulatedObservationProvider;
  private lastFrameMs = 0;
  private episodes = new Map<string, Set<AlertType>>();
  private sensorOverrides: Record<SeatId, SensorObservation> = {};
  private riderLabels: Record<string, string> = {};

  simMs = 0;
  sessionMs = 0;
  phase: StationPhase = 'idle';
  phaseStartedMs = 0;
  seats: Record<SeatId, EvaluatedSeat> = {};
  scripted: Record<SeatId, ScriptedSeat> = {};
  cameras: Record<string, CameraRuntime> = {};
  fusion: Record<SeatId, FusionResult> = {};
  slide: SlideState = emptySlide();
  narration: Narration | null = null;
  markers: TimelineMarker[] = [];
  gates: GateObservation[] = [];
  finished = false;
  frameCount = 0;

  constructor(ride: RideConfiguration, getSettings: () => EvaluatorSettings, sinks: EngineSinks) {
    this.ride = ride;
    this.sinks = sinks;
    this.getSettings = getSettings;
    this.provider = new SimulatedObservationProvider({
      getScripted: (id) => this.scripted[id] ?? NOMINAL_SEAT,
      getCamera: (id) => this.cameras[id],
      rng: this.rng,
    });
    this.initRide();
  }

  private initRide(): void {
    this.scripted = {};
    this.seats = {};
    for (const id of allSeats(this.ride.geometry)) {
      this.scripted[id] = { ...NOMINAL_SEAT, riderVariant: (Number(id.replace(/\D/g, '')) % 4) };
      this.seats[id] = createEvaluatedSeat(id, cameraForSeat(this.ride, id), 0);
    }
    this.cameras = {};
    for (const cam of this.ride.cameras) {
      this.cameras[cam.id] = { id: cam.id, degraded: false, offline: false, noise: cam.mode === 'infrared' ? 0.15 : 0.04, latencyMs: 38 + (cam.id.charCodeAt(cam.id.length - 1) % 7) * 3 };
    }
    this.fusion = {};
    this.episodes.clear();
    this.sensorOverrides = {};
    this.slide = emptySlide();
    this.markers = [];
    this.gates = [];
    this.narration = null;
    this.phase = 'idle';
    this.phaseStartedMs = 0;
    this.lastFrameMs = 0;
    this.frameCount = 0;
    this.finished = false;
  }

  loadScenario(script: ScenarioScript, sessionMs: number): void {
    this.script = script;
    this.cursor = 0;
    this.simMs = 0;
    this.sessionMs = sessionMs;
    this.rng = new SeededRandom(`${this.ride.id}:${script.id}`);
    this.provider = new SimulatedObservationProvider({
      getScripted: (id) => this.scripted[id] ?? NOMINAL_SEAT,
      getCamera: (id) => this.cameras[id],
      rng: this.rng,
    });
    this.initRide();
  }

  get scenario(): ScenarioScript | null {
    return this.script;
  }

  get durationMs(): number {
    return this.script?.durationMs ?? 0;
  }

  /** Advance the simulation by `dtMs` of simulated time, deterministically. */
  advance(dtMs: number): void {
    if (!this.script || this.finished) return;
    const target = Math.min(this.simMs + dtMs, this.script.durationMs);
    while (this.lastFrameMs + FRAME_MS <= target) {
      this.lastFrameMs += FRAME_MS;
      this.applyStepsUpTo(this.lastFrameMs);
      this.simMs = this.lastFrameMs;
      this.frame(this.lastFrameMs);
    }
    this.applyStepsUpTo(target);
    this.sessionMs += target - this.simMs;
    this.simMs = target;
    this.updateSlideMotion();
    if (this.simMs >= this.script.durationMs) this.finished = true;
  }

  advanceTo(ms: number): void {
    if (ms > this.simMs) this.advance(ms - this.simMs);
  }

  skipToEnd(): void {
    if (!this.script) return;
    this.advance(this.script.durationMs - this.simMs);
    this.finished = true;
  }

  /** Apply an ad-hoc action immediately (used by the uncertainty / sensor injection controls). */
  applyNow(action: ScenarioAction): void {
    this.apply(action, this.simMs);
  }

  private applyStepsUpTo(ms: number): void {
    if (!this.script) return;
    const steps = this.script.steps;
    while (this.cursor < steps.length && steps[this.cursor].atMs <= ms) {
      const step = steps[this.cursor];
      this.cursor += 1;
      // keep session clock aligned with the step time
      this.sessionMs += Math.max(0, step.atMs - this.simMs);
      this.simMs = Math.max(this.simMs, step.atMs);
      this.apply(step.action, step.atMs);
    }
  }

  private scenarioId(): ScenarioScript['id'] {
    return this.script?.id ?? 'A';
  }

  private apply(action: ScenarioAction, atMs: number): void {
    const rideId = this.ride.id;
    switch (action.kind) {
      case 'phase': {
        this.phase = action.phase;
        this.phaseStartedMs = atMs;
        this.markers = [...this.markers, { atMs, label: action.label, phase: action.phase }];
        this.sinks.logEvent({ type: 'phase', title: action.label, detail: `Station phase → ${action.phase}`, severity: 'info', rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs });
        break;
      }
      case 'seat': {
        this.scripted[action.seatId] = { ...(this.scripted[action.seatId] ?? NOMINAL_SEAT), ...action.patch };
        break;
      }
      case 'seats': {
        for (const id of action.seatIds) this.scripted[id] = { ...(this.scripted[id] ?? NOMINAL_SEAT), ...action.patch };
        break;
      }
      case 'camera': {
        const prev = this.cameras[action.cameraId];
        if (prev) this.cameras[action.cameraId] = { ...prev, ...action.patch };
        break;
      }
      case 'sensor': {
        const sensorId = this.ride.sensors.find((s) => s.perSeat)?.id ?? 'SEN-RESTRAINT';
        this.sensorOverrides[action.seatId] = { sensorId, seatId: action.seatId, atMs, reading: action.reading, status: action.status ?? 'online', confidence: action.confidence ?? 0.8 };
        this.sinks.logEvent({ type: 'sensor', title: `Sensor record updated — ${seatLabel(this.ride, action.seatId)}`, detail: `Fictional ${sensorId} reports "${action.reading.replace('_', ' ')}" (${action.status ?? 'online'}).`, severity: 'info', rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs, target: { kind: 'seat', seatId: action.seatId }, sensor: { sensorId, reading: action.reading, status: action.status ?? 'online' } });
        break;
      }
      case 'alert': {
        this.sinks.raiseAlert({ ...action.alert, rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs });
        break;
      }
      case 'auto_review': {
        this.sinks.autoReview({ rideId, seatId: action.seatId, zone: action.zone, type: action.type }, action.outcome, action.note, this.sessionMs);
        break;
      }
      case 'event': {
        this.sinks.logEvent({ type: action.type, title: action.title, detail: action.detail, severity: action.severity ?? 'info', rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs });
        break;
      }
      case 'narration': {
        this.narration = { title: action.title, text: action.text, atMs };
        break;
      }
      case 'gate': {
        this.gates = [...this.gates, { gateId: action.gateId, atMs, openDurationMs: action.openDurationMs }];
        const slow = action.openDurationMs > 5000;
        this.sinks.logEvent({ type: 'observation', title: `${action.gateId} opened in ${(action.openDurationMs / 1000).toFixed(1)}s`, detail: slow ? 'Opening duration exceeds the 5.0s demonstration threshold.' : 'Within typical range.', severity: slow ? 'review' : 'info', rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs, target: { kind: 'equipment', equipmentId: action.gateId }, cameraId: this.ride.cameras.find((c) => c.view === 'gates')?.id });
        if (slow) {
          this.sinks.raiseAlert({ type: 'slow_gate', severity: 'review', cameraId: this.ride.cameras.find((c) => c.view === 'gates')?.id ?? this.ride.cameras[0].id, target: { kind: 'equipment', equipmentId: action.gateId }, title: `Slow gate — ${action.gateId}`, detail: `${action.gateId} took ${(action.openDurationMs / 1000).toFixed(1)}s to open against a 2.1s typical. Loading delayed; equipment observation recorded for maintenance analytics.`, confidence: 0.93, rideId, scenarioId: this.scenarioId(), atMs: this.sessionMs });
        }
        break;
      }
      case 'dispatch': {
        const capacity = this.ride.baseline.capacity;
        const intervalSec = Math.max(action.dwellSec, this.ride.baseline.minCycleSec) + action.blockWaitSec;
        this.sinks.recordDispatch({ atMs: this.sessionMs, rideId, dwellSec: action.dwellSec, unloadSec: action.unloadSec, loadSec: action.loadSec, reviewSec: action.reviewSec, blockWaitSec: action.blockWaitSec, intervalSec, riders: action.riders, capacity, loadFactor: action.riders / capacity, emptySeats: capacity - action.riders, scenarioId: this.scenarioId() });
        break;
      }
      case 'slide': {
        this.applySlide(action.op, atMs);
        break;
      }
      case 'navigate': {
        this.sinks.navigate(action.route);
        break;
      }
      case 'maintenance': {
        this.sinks.surfaceTicket(action.ticketId);
        break;
      }
      case 'boarding': {
        this.sinks.optimizeBoarding();
        break;
      }
      case 'end': {
        this.finished = true;
        break;
      }
      default:
        break;
    }
  }

  private applySlide(op: SlideOp, atMs: number): void {
    const sl = this.slide;
    const rideId = this.ride.id;
    const sid = this.scenarioId();
    switch (op.op) {
      case 'queue_add': {
        sl.riderCounter += 1;
        const id = `SR-${sl.riderCounter}`;
        this.riderLabels[id] = op.label;
        sl.queue = [...sl.queue, id];
        sl.queueHistory = [...sl.queueHistory, { atMs, length: sl.queue.length }];
        break;
      }
      case 'to_platform': {
        if (sl.platformRider || sl.queue.length === 0) break;
        const [head, ...rest] = sl.queue;
        sl.queue = rest;
        sl.platformRider = head;
        sl.entryReview = 'none';
        sl.queueHistory = [...sl.queueHistory, { atMs, length: sl.queue.length }];
        break;
      }
      case 'entry_review': {
        sl.entryReview = op.state;
        if (op.state === 'recorded' && sl.platformRider) {
          this.sinks.logEvent({ type: 'slide_entry', title: `Entry position reviewed — ${this.riderLabels[sl.platformRider] ?? sl.platformRider}`, detail: 'Attendant recorded the start-position check at the platform (simulation).', severity: 'info', rideId, scenarioId: sid, atMs: this.sessionMs, cameraId: 'CAM-A', target: { kind: 'zone', zone: 'ENTRY-PLATFORM' } });
        }
        break;
      }
      case 'depart': {
        if (!sl.platformRider) break;
        const id = sl.platformRider;
        sl.inFlume = [...sl.inFlume, { id, label: this.riderLabels[id] ?? id, progress: 0, enteredMs: atMs, variant: sl.riderCounter % 3 }];
        sl.platformRider = undefined;
        sl.entryReview = 'none';
        sl.departures = [...sl.departures, atMs];
        this.sinks.logEvent({ type: 'slide_departure', title: `Departure recorded — ${this.riderLabels[id] ?? id}`, detail: 'Simulated departure event. No release signal exists in this demo.', severity: 'info', rideId, scenarioId: sid, atMs: this.sessionMs, cameraId: 'CAM-A', target: { kind: 'zone', zone: 'ENTRY-PLATFORM' } });
        break;
      }
      case 'advance': {
        sl.inFlume = sl.inFlume.map((r) => ({ ...r, progress: op.progress }));
        break;
      }
      case 'exit_enter': {
        const first = sl.inFlume[0];
        if (!first) break;
        sl.inFlume = sl.inFlume.slice(1);
        sl.exitZone = { riderId: first.id, sinceMs: atMs, prolonged: false };
        break;
      }
      case 'exit_prolonged': {
        sl.exitZone = { ...sl.exitZone, prolonged: true };
        this.sinks.raiseAlert({ type: 'exit_zone_occupied', severity: 'review', cameraId: 'CAM-B', target: { kind: 'zone', zone: 'EXIT-ZONE' }, title: 'Exit-zone occupancy persists', detail: 'Splash-zone occupancy has persisted beyond the 6s demonstration threshold. Human review required. No signal is sent to the slide.', confidence: 0.88, rideId, scenarioId: sid, atMs: this.sessionMs });
        break;
      }
      case 'exit_clear': {
        const rid = sl.exitZone.riderId;
        sl.exitZone = { prolonged: false };
        sl.exits = [...sl.exits, atMs];
        this.sinks.logEvent({ type: 'slide_exit', title: `Exit recorded — ${rid ? this.riderLabels[rid] ?? rid : 'rider'}`, detail: 'Exit-zone occupancy cleared (simulation).', severity: 'info', rideId, scenarioId: sid, atMs: this.sessionMs, cameraId: 'CAM-B', target: { kind: 'zone', zone: 'EXIT-ZONE' } });
        break;
      }
      default:
        break;
    }
    this.slide = { ...sl };
  }

  private updateSlideMotion(): void {
    if (this.ride.geometry.kind !== 'slide' || this.slide.inFlume.length === 0) return;
    const inFlume = this.slide.inFlume.map((r) => ({ ...r, progress: Math.min(0.97, (this.simMs - r.enteredMs) / FLUME_MS) }));
    this.slide = { ...this.slide, inFlume };
  }

  private sensorFor(seatId: SeatId, atMs: number): SensorObservation | undefined {
    const perSeat = this.ride.sensors.find((s) => s.perSeat && (s.kind === 'restraint_position' || s.kind === 'harness_lock'));
    if (!perSeat) return undefined;
    const override = this.sensorOverrides[seatId];
    if (override) return override;
    const truth = this.scripted[seatId];
    const reading: SensorObservation['reading'] = truth.occupancy !== 'occupied' || truth.restraint === 'not_applicable' ? 'not_engaged' : truth.restraint === 'concern' ? 'not_engaged' : 'engaged';
    return { sensorId: perSeat.id, seatId, atMs, reading, status: 'online', confidence: 0.84 };
  }

  get sensors(): Record<SeatId, SensorObservation> {
    const out: Record<SeatId, SensorObservation> = {};
    for (const id of Object.keys(this.seats)) {
      const s = this.sensorFor(id, this.simMs);
      if (s) out[id] = s;
    }
    return out;
  }

  private frame(atMs: number): void {
    if (this.ride.geometry.kind === 'slide') return;
    const settings = this.getSettings();
    const nextSeats: Record<SeatId, EvaluatedSeat> = {};
    const nextFusion: Record<SeatId, FusionResult> = {};
    for (const id of Object.keys(this.seats)) {
      const prev = this.seats[id];
      const cameraId = cameraForSeat(this.ride, id);
      const sample = this.provider.sample(id, cameraId, atMs);
      const next = evaluateSeat(prev, sample, settings);
      nextSeats[id] = next;
      this.onSeatEvaluated(prev, next);
      const sensor = this.sensorFor(id, atMs);
      if (sensor) {
        const f = fuse(next, sensor, atMs);
        nextFusion[id] = f;
        this.onFusion(next, f, sensor);
      }
    }
    this.seats = nextSeats;
    this.fusion = nextFusion;
    this.frameCount += 1;
  }

  private episode(seatId: SeatId): Set<AlertType> {
    let set = this.episodes.get(seatId);
    if (!set) {
      set = new Set();
      this.episodes.set(seatId, set);
    }
    return set;
  }

  private onSeatEvaluated(prev: EvaluatedSeat, next: EvaluatedSeat): void {
    const ep = this.episode(next.seatId);
    const changed = next.state !== prev.state;
    if (changed && (next.state === 'nominal' || next.state === 'empty')) {
      ep.clear();
      if (prev.state === 'concern' || prev.state === 'review' || prev.state === 'unknown') {
        this.sinks.logEvent({ type: 'observation', title: `${seatLabel(this.ride, next.seatId)} — observation cleared`, detail: `Seat state ${prev.state} → ${next.state} after ${this.getSettings().stabilizationFrames} consistent frames. Informational only.`, severity: 'info', rideId: this.ride.id, scenarioId: this.scenarioId(), atMs: this.sessionMs, cameraId: next.cameraId, target: { kind: 'seat', seatId: next.seatId }, confidence: next.confidence });
      }
      return;
    }
    if (next.state === 'nominal' || next.state === 'empty') return;
    if (!changed && next.state === 'unknown' && next.frames < this.getSettings().stabilizationFrames * 3) return;
    for (const a of this.deriveAlerts(next)) {
      if (ep.has(a.type)) continue;
      ep.add(a.type);
      const target: AlertTarget = { kind: 'seat', seatId: next.seatId };
      if (this.sinks.hasOpenAlert(this.ride.id, target, a.type)) continue;
      this.sinks.raiseAlert({ ...a, cameraId: next.cameraId, target, confidence: next.confidence, rideId: this.ride.id, scenarioId: this.scenarioId(), atMs: this.sessionMs });
    }
  }

  private deriveAlerts(seat: EvaluatedSeat): { type: AlertType; severity: Severity; title: string; detail: string }[] {
    const label = seatLabel(this.ride, seat.seatId);
    const out: { type: AlertType; severity: Severity; title: string; detail: string }[] = [];
    const pct = `${Math.round(seat.confidence * 100)}%`;
    const restraintType: AlertType = this.ride.restraint === 'ots_harness' || this.ride.restraint === 'flying_vest' ? 'restraint_mismatch' : 'belt_position';
    if (seat.state === 'unknown') {
      if (seat.occluded) out.push({ type: 'occlusion', severity: 'review', title: `Camera occlusion — ${label}`, detail: `${seat.cameraId} view of ${label} is obstructed. Observation unavailable; seat reported as Unknown — review required. No nominal state is assumed.` });
      else out.push({ type: 'low_confidence', severity: 'review', title: `Low confidence — ${label}`, detail: `${seat.cameraId} confidence ${pct} is below the configured threshold. Seat reported as Unknown — review required.` });
      return out;
    }
    if (seat.restraint === 'concern') out.push({ type: restraintType, severity: 'concern', title: `Potential ${this.ride.restraintLabel.toLowerCase()} position concern — ${label}`, detail: `Simulated camera observation (${seat.cameraId}, ${pct}): ${this.ride.restraintLabel.toLowerCase()} position differs from the expected envelope. Human review required; this is not a safety determination.` });
    if (seat.restraint === 'review' || (seat.restraint === 'unknown' && seat.state === 'review')) out.push({ type: restraintType, severity: 'review', title: `Restraint observation requires review — ${label}`, detail: `Simulated camera observation (${seat.cameraId}, ${pct}) could not confirm the ${this.ride.restraintLabel.toLowerCase()} position. Human review required.` });
    if (seat.looseObject === 'detected') out.push({ type: 'loose_article', severity: 'concern', title: `Loose article — ${label}`, detail: `Simulated detection (${seat.cameraId}, ${pct}): hand-held object (phone-like) in the staged frame. Staff check requested.` });
    else if (seat.looseObject === 'possible') out.push({ type: 'loose_article', severity: 'review', title: `Possible loose article — ${label}`, detail: `Simulated detection (${seat.cameraId}, ${pct}): possible hand-held object. Staff check requested.` });
    if (seat.posture === 'unusual') out.push({ type: 'posture', severity: 'review', title: `Unusual seated posture — ${label}`, detail: `Simulated pose observation (${seat.cameraId}, ${pct}) outside the expected seated envelope. Human review required.` });
    return out;
  }

  private onFusion(seat: EvaluatedSeat, f: FusionResult, sensor: SensorObservation): void {
    const ep = this.episode(seat.seatId);
    if (f.agreement !== 'disagree') {
      ep.delete('sensor_discrepancy');
      return;
    }
    if (ep.has('sensor_discrepancy')) return;
    ep.add('sensor_discrepancy');
    const target: AlertTarget = { kind: 'seat', seatId: seat.seatId };
    if (this.sinks.hasOpenAlert(this.ride.id, target, 'sensor_discrepancy')) return;
    const label = seatLabel(this.ride, seat.seatId);
    this.sinks.raiseAlert({ type: 'sensor_discrepancy', severity: 'review', cameraId: seat.cameraId, target, title: `Sensor disagreement — ${label}`, detail: `Camera observation reads "${seat.restraint}" (${Math.round(seat.confidence * 100)}%) while fictional ${sensor.sensorId} reports "${sensor.reading.replace('_', ' ')}". Human review required before any action.`, confidence: seat.confidence, sensor: { sensorId: sensor.sensorId, reading: sensor.reading, status: sensor.status }, rideId: this.ride.id, scenarioId: this.scenarioId(), atMs: this.sessionMs });
  }

  snapshot(): EngineSnapshot {
    return {
      rideId: this.ride.id,
      scenarioId: this.script?.id ?? null,
      simMs: this.simMs,
      sessionMs: this.sessionMs,
      durationMs: this.durationMs,
      phase: this.phase,
      phaseStartedMs: this.phaseStartedMs,
      seats: this.seats,
      scripted: this.scripted,
      cameras: this.cameras,
      sensors: this.sensors,
      fusion: this.fusion,
      slide: this.slide,
      narration: this.narration,
      markers: this.markers,
      gates: this.gates,
      finished: this.finished,
      frameCount: this.frameCount,
    };
  }
}
