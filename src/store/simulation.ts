import { create } from 'zustand';
import type { CameraRuntime, EvaluatedSeat, FusionResult, GateObservation, Narration, ScenarioAction, ScenarioId, ScriptedSeat, SeatId, SensorObservation, SlideState, StationPhase, TimelineMarker } from '@/domain/types';
import { SimulationEngine, type EngineSinks, type EngineSnapshot } from '@/domain/simulation/engine';
import { buildScenario, scenarioRideId } from '@/domain/simulation/scenarios';
import { DEFAULT_RIDE_ID, RIDES, getRide } from '@/domain/rides/configs';
import { cameraForSeat } from '@/domain/rides/seats';
import { useRecordsStore } from './records';
import { useSettingsStore } from './settings';
import { useMaintenanceStore } from './maintenance';
import { useBoardingStore } from './boarding';

export const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;
/** The guided demo: a normal cycle, the four kinds of coaster flags, the water slide, then the dark ride. */
export const GUIDED_SEQUENCE: ScenarioId[] = ['A', 'B', 'C', 'D', 'E', 'G', 'H'];

interface SimulationState {
  rideId: string;
  scenarioId: ScenarioId | null;
  playing: boolean;
  speed: number;
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
  guided: { active: boolean; index: number };
  pendingRoute: string | null;
  selectedSeatId: SeatId | null;
  selectedAlertId: string | null;

  setRide: (rideId: string) => void;
  loadScenario: (id: ScenarioId, opts?: { autoplay?: boolean; rideId?: string; navigate?: boolean }) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  resetDemo: () => void;
  setSpeed: (s: number) => void;
  skip: () => void;
  startGuidedDemo: () => void;
  stopGuidedDemo: () => void;
  consumeRoute: () => string | null;
  selectSeat: (id: SeatId | null) => void;
  selectAlert: (id: string | null) => void;
  injectOcclusion: () => void;
  injectLowConfidence: () => void;
  injectSensorDisagreement: () => void;
  injectLooseObject: () => void;
  injectRestraintConcern: () => void;
  injectSlideExitProlonged: () => void;
}

let engine: SimulationEngine | null = null;
let rafId = 0;
let lastWall = 0;
let lastReactSync = 0;

/** React receives store updates ~11×/s; canvases subscribe to every engine frame instead. */
const REACT_SYNC_MS = 90;
const frameListeners = new Set<(snap: EngineSnapshot) => void>();

export function subscribeFrame(fn: (snap: EngineSnapshot) => void): () => void {
  frameListeners.add(fn);
  if (engine) fn(engine.snapshot());
  return () => {
    frameListeners.delete(fn);
  };
}

function emitFrame(): void {
  if (!engine) return;
  const snap = engine.snapshot();
  for (const fn of frameListeners) fn(snap);
}

const sinks: EngineSinks = {
  raiseAlert: (draft) => useRecordsStore.getState().raiseAlert(draft),
  logEvent: (draft) => {
    useRecordsStore.getState().logEvent(draft);
  },
  autoReview: (match, outcome, note, atMs) => useRecordsStore.getState().autoReview(match, outcome, note, atMs),
  recordDispatch: (rec) => useRecordsStore.getState().recordDispatch(rec),
  hasOpenAlert: (rideId, target, type) => useRecordsStore.getState().hasOpenAlert(rideId, target, type),
};

function snapshotPatch(): Partial<SimulationState> {
  if (!engine) return {};
  const s = engine.snapshot();
  return {
    rideId: s.rideId,
    scenarioId: s.scenarioId,
    simMs: s.simMs,
    sessionMs: s.sessionMs,
    durationMs: s.durationMs,
    phase: s.phase,
    phaseStartedMs: s.phaseStartedMs,
    seats: s.seats,
    scripted: s.scripted,
    cameras: s.cameras,
    sensors: s.sensors,
    fusion: s.fusion,
    slide: s.slide,
    narration: s.narration,
    markers: s.markers,
    gates: s.gates,
    finished: s.finished,
  };
}

function stopLoop(): void {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
}

/** Move the guided demo to its next scenario, or end it. Returns true when a next scenario was loaded. */
function advanceGuided(): boolean {
  const st = useSimulationStore.getState();
  if (!st.guided.active) return false;
  if (st.guided.index >= GUIDED_SEQUENCE.length - 1) {
    useSimulationStore.setState({ guided: { active: false, index: st.guided.index } });
    return false;
  }
  const index = st.guided.index + 1;
  useSimulationStore.setState({ guided: { active: true, index } });
  st.loadScenario(GUIDED_SEQUENCE[index], { autoplay: true });
  return true;
}

function startLoop(): void {
  if (rafId || typeof requestAnimationFrame !== 'function') return;
  lastWall = performance.now();
  const loop = (now: number): void => {
    const st = useSimulationStore.getState();
    if (!st.playing || !engine) {
      rafId = 0;
      return;
    }
    const dtWall = Math.min(200, now - lastWall);
    lastWall = now;
    const phaseBefore = engine.phase;
    engine.advance(dtWall * st.speed);
    emitFrame();
    if (engine.finished || engine.phase !== phaseBefore || now - lastReactSync >= REACT_SYNC_MS) {
      lastReactSync = now;
      useSimulationStore.setState(snapshotPatch());
    }
    if (engine.finished) {
      rafId = 0;
      if (!advanceGuided()) useSimulationStore.setState({ playing: false });
      return;
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

export const useSimulationStore = create<SimulationState>()((set, get) => {
  const inject = (action: ScenarioAction): void => {
    if (!engine) return;
    engine.applyNow(action);
    set(snapshotPatch());
    emitFrame();
  };
  const ride = () => engine?.ride ?? getRide(get().rideId);

  return {
    rideId: DEFAULT_RIDE_ID,
    scenarioId: null,
    playing: false,
    speed: 1,
    simMs: 0,
    sessionMs: 0,
    durationMs: 0,
    phase: 'idle',
    phaseStartedMs: 0,
    seats: {},
    scripted: {},
    cameras: {},
    sensors: {},
    fusion: {},
    slide: { queue: [], entryReview: 'none', inFlume: [], exitZone: { prolonged: false }, riderCounter: 0, departures: [], exits: [], queueHistory: [] },
    narration: null,
    markers: [],
    gates: [],
    finished: false,
    guided: { active: false, index: 0 },
    pendingRoute: null,
    selectedSeatId: null,
    selectedAlertId: null,

    setRide: (rideId) => {
      set({ guided: { active: false, index: 0 } });
      get().loadScenario(getRide(rideId).scenarios[0]?.id ?? 'A', { autoplay: true, rideId });
    },

    loadScenario: (id, opts) => {
      const st = get();
      const wanted = opts?.rideId;
      const rideId = wanted && getRide(wanted).scenarios.some((p) => p.id === id) ? wanted : scenarioRideId(id, wanted ?? st.rideId, RIDES);
      stopLoop();
      engine = new SimulationEngine(getRide(rideId), () => useSettingsStore.getState().evaluator, sinks);
      const script = buildScenario(id, engine.ride);
      engine.loadScenario(script, st.sessionMs);
      set({ ...snapshotPatch(), playing: Boolean(opts?.autoplay), pendingRoute: opts?.navigate || st.guided.active ? script.route : null, selectedSeatId: null });
      emitFrame();
      if (opts?.autoplay) startLoop();
    },

    play: () => {
      if (!engine) {
        get().loadScenario(get().scenarioId ?? 'A', { autoplay: true });
        return;
      }
      if (engine.finished) {
        get().loadScenario(get().scenarioId ?? 'A', { autoplay: true, rideId: get().rideId });
        return;
      }
      set({ playing: true });
      startLoop();
    },
    pause: () => {
      set({ playing: false });
      stopLoop();
    },
    toggle: () => (get().playing ? get().pause() : get().play()),

    reset: () => {
      const st = get();
      get().loadScenario(st.scenarioId ?? 'A', { autoplay: st.playing, rideId: st.rideId });
    },

    resetDemo: () => {
      stopLoop();
      useRecordsStore.getState().resetRecords();
      useMaintenanceStore.getState().resetTickets();
      useBoardingStore.getState().reset();
      useSettingsStore.getState().resetSettings();
      engine = null;
      set({ sessionMs: 0, guided: { active: false, index: 0 }, selectedSeatId: null, selectedAlertId: null, speed: 1 });
      get().loadScenario('A', { autoplay: true, rideId: DEFAULT_RIDE_ID });
    },

    setSpeed: (speed) => set({ speed }),

    skip: () => {
      if (!engine) return;
      engine.skipToEnd();
      set(snapshotPatch());
      emitFrame();
      if (!advanceGuided()) {
        set({ playing: false });
        stopLoop();
      }
    },

    startGuidedDemo: () => {
      set({ guided: { active: true, index: 0 }, speed: 1.5 });
      get().loadScenario(GUIDED_SEQUENCE[0], { autoplay: true, rideId: DEFAULT_RIDE_ID });
    },
    stopGuidedDemo: () => set({ guided: { active: false, index: get().guided.index } }),

    consumeRoute: () => {
      const r = get().pendingRoute;
      if (r) set({ pendingRoute: null });
      return r;
    },

    selectSeat: (selectedSeatId) => set({ selectedSeatId }),
    selectAlert: (selectedAlertId) => set({ selectedAlertId }),

    injectOcclusion: () => {
      const seat = ride().stagedSeats.occluded;
      inject({ kind: 'camera', cameraId: cameraForSeat(ride(), seat), patch: { occlusion: { x: 0.55, y: 0.25, w: 0.32, h: 0.55, label: 'Blocked by you' } } });
      inject({ kind: 'seat', seatId: seat, patch: { occluded: true } });
      inject({ kind: 'narration', title: 'You blocked a camera', text: `${seat} can no longer be seen. In a moment it turns Unknown and goes to review.` });
    },
    injectLowConfidence: () => {
      const seat = ride().stagedSeats.sensor;
      inject({ kind: 'seat', seatId: seat, patch: { baseConfidence: 0.48 } });
      inject({ kind: 'narration', title: 'You lowered camera confidence', text: `The camera is now unsure about ${seat}, so it will show as Unknown rather than fine.` });
    },
    injectSensorDisagreement: () => {
      const seat = ride().stagedSeats.sensor;
      inject({ kind: 'sensor', seatId: seat, reading: 'not_engaged', status: 'online', confidence: 0.79 });
      inject({ kind: 'narration', title: 'You made the sensor disagree', text: `The fictional sensor on ${seat} now says the restraint is not engaged. If the camera disagrees, a person is asked to check.` });
    },
    injectLooseObject: () => {
      const seat = ride().stagedSeats.looseObject;
      inject({ kind: 'seat', seatId: seat, patch: { looseObject: 'detected', occupancy: 'occupied' } });
      inject({ kind: 'narration', title: 'You added a loose object', text: `The rider in ${seat} is now holding a phone.` });
    },
    injectRestraintConcern: () => {
      const seat = ride().stagedSeats.concern;
      inject({ kind: 'seat', seatId: seat, patch: { restraint: 'concern', occupancy: 'occupied' } });
      inject({ kind: 'narration', title: 'You moved a restraint', text: `The restraint on ${seat} now looks out of position. It will be flagged for review.` });
    },
    injectSlideExitProlonged: () => {
      const sl = get().slide;
      if (!sl.exitZone.riderId) {
        if (sl.inFlume.length === 0) {
          inject({ kind: 'slide', op: { op: 'queue_add', label: 'Extra rider' } });
          inject({ kind: 'slide', op: { op: 'to_platform' } });
          inject({ kind: 'slide', op: { op: 'depart' } });
        }
        inject({ kind: 'slide', op: { op: 'exit_enter' } });
      }
      inject({ kind: 'slide', op: { op: 'exit_prolonged' } });
    },
  };
});
