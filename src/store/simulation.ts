import { create } from 'zustand';
import type { CameraRuntime, DemoMode, EvaluatedSeat, FusionResult, GateObservation, Narration, ScenarioAction, ScenarioId, ScriptedSeat, SeatId, SensorObservation, SlideState, StationPhase, TimelineMarker } from '@/domain/types';
import { SimulationEngine, type EngineSinks, type EngineSnapshot } from '@/domain/simulation/engine';
import { SCENARIO_ORDER, buildScenario, scenarioRideId } from '@/domain/simulation/scenarios';
import { DEFAULT_PARK_ID, DEFAULT_RIDE_ID, PARK_BY_ID, getRide, ridesForPark } from '@/domain/rides/configs';
import { useRecordsStore } from './records';
import { useSettingsStore } from './settings';
import { useMaintenanceStore } from './maintenance';
import { useBoardingStore } from './boarding';

export const SPEEDS = [0.5, 1, 1.5, 2, 4, 8] as const;
export const GUIDED_SEQUENCE: ScenarioId[] = SCENARIO_ORDER;

interface SimulationState {
  parkId: string;
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
  frameCount: number;
  guided: { active: boolean; index: number };
  pendingRoute: string | null;
  selectedSeatId: SeatId | null;
  selectedAlertId: string | null;
  connection: 'simulated' | 'reconnecting';

  setPark: (parkId: string) => void;
  setRide: (rideId: string, opts?: { autoplay?: boolean }) => void;
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
  inject: (action: ScenarioAction) => void;
  injectOcclusion: () => void;
  injectLowConfidence: () => void;
  injectSensorDisagreement: () => void;
  injectLooseObject: () => void;
  injectRestraintConcern: () => void;
  injectSlideExitProlonged: () => void;
  injectCameraOffline: (cameraId: string, offline: boolean) => void;
  clearInjections: () => void;
  mode: () => DemoMode;
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
  raiseAlert: (draft) => {
    const enabled = useSettingsStore.getState().enabledAlerts[draft.type];
    if (enabled === false) return undefined;
    return useRecordsStore.getState().raiseAlert(draft);
  },
  logEvent: (draft) => {
    useRecordsStore.getState().logEvent(draft);
  },
  autoReview: (match, outcome, note, atMs) => useRecordsStore.getState().autoReview(match, outcome, note, atMs),
  recordDispatch: (rec) => useRecordsStore.getState().recordDispatch(rec),
  surfaceTicket: (id) => useMaintenanceStore.getState().surfaceTicket(id),
  optimizeBoarding: () => useBoardingStore.getState().optimize(),
  navigate: (route) => useSimulationStore.setState({ pendingRoute: route }),
  hasOpenAlert: (rideId, target, type) => useRecordsStore.getState().hasOpenAlert(rideId, target, type),
};

function makeEngine(rideId: string): SimulationEngine {
  return new SimulationEngine(getRide(rideId), () => useSettingsStore.getState().evaluator, sinks);
}

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
    frameCount: s.frameCount,
  };
}

function stopLoop(): void {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
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
      const g = useSimulationStore.getState().guided;
      if (g.active && g.index < GUIDED_SEQUENCE.length - 1) {
        const nextIndex = g.index + 1;
        useSimulationStore.setState({ guided: { active: true, index: nextIndex } });
        useSimulationStore.getState().loadScenario(GUIDED_SEQUENCE[nextIndex], { autoplay: true });
      } else {
        useSimulationStore.setState({ playing: false, guided: { active: false, index: g.index } });
        rafId = 0;
        return;
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  parkId: DEFAULT_PARK_ID,
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
  frameCount: 0,
  guided: { active: false, index: 0 },
  pendingRoute: null,
  selectedSeatId: null,
  selectedAlertId: null,
  connection: 'simulated',

  mode: () => useSettingsStore.getState().mode,

  setPark: (parkId) => {
    const park = PARK_BY_ID[parkId];
    if (!park) return;
    set({ parkId });
    const rides = ridesForPark(parkId);
    if (!rides.some((r) => r.id === get().rideId)) get().setRide(rides[0].id, { autoplay: true });
  },

  setRide: (rideId, opts) => {
    const ride = getRide(rideId);
    const first = ride.scenarios[0]?.id ?? 'A';
    set({ parkId: ride.parkId, selectedSeatId: null, guided: { active: false, index: 0 } });
    get().loadScenario(first, { autoplay: opts?.autoplay ?? true, rideId });
  },

  loadScenario: (id, opts) => {
    const st = get();
    let rideId = opts?.rideId ?? scenarioRideId(id, st.rideId);
    let ride = getRide(rideId);
    if (!ride.scenarios.some((s) => s.id === id)) {
      // Fall back to a ride that supports the scenario.
      const fallback = id === 'H' ? 'typhoon' : id === 'I' ? 'phantom' : id === 'K' ? 'rapids' : id === 'L' ? 'dipper' : DEFAULT_RIDE_ID;
      rideId = fallback;
      ride = getRide(fallback);
    }
    stopLoop();
    engine = makeEngine(rideId);
    const script = buildScenario(id, ride);
    engine.loadScenario(script, st.sessionMs);
    set({ ...snapshotPatch(), rideId, parkId: ride.parkId, scenarioId: id, playing: Boolean(opts?.autoplay), pendingRoute: opts?.navigate || get().guided.active ? script.route : null, selectedSeatId: null, finished: false });
    emitFrame();
    if (opts?.autoplay) startLoop();
  },

  play: () => {
    if (!engine) {
      get().loadScenario(get().scenarioId ?? 'A', { autoplay: true });
      return;
    }
    if (engine.finished) {
      get().reset();
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
    const id = st.scenarioId ?? 'A';
    const wasPlaying = st.playing;
    get().loadScenario(id, { autoplay: wasPlaying, rideId: st.rideId });
  },

  resetDemo: () => {
    stopLoop();
    useRecordsStore.getState().resetRecords();
    useMaintenanceStore.getState().resetTickets();
    useBoardingStore.getState().reset();
    engine = null;
    set({ sessionMs: 0, guided: { active: false, index: 0 }, parkId: DEFAULT_PARK_ID, rideId: DEFAULT_RIDE_ID, selectedSeatId: null, selectedAlertId: null, speed: 1 });
    get().loadScenario('A', { autoplay: true, rideId: DEFAULT_RIDE_ID });
  },

  setSpeed: (speed) => set({ speed }),

  skip: () => {
    const st = get();
    if (!engine) return;
    engine.skipToEnd();
    set(snapshotPatch());
    if (st.guided.active && st.guided.index < GUIDED_SEQUENCE.length - 1) {
      const nextIndex = st.guided.index + 1;
      set({ guided: { active: true, index: nextIndex } });
      get().loadScenario(GUIDED_SEQUENCE[nextIndex], { autoplay: true });
    } else {
      set({ playing: false, guided: { active: false, index: st.guided.index } });
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

  inject: (action) => {
    if (!engine) return;
    engine.applyNow(action);
    set(snapshotPatch());
    emitFrame();
  },
  injectOcclusion: () => {
    if (!engine) return;
    const ride = engine.ride;
    const seat = ride.stagedSeats.occluded;
    const cam = ride.cameras.find((c) => c.coverage.includes(seat))?.id ?? ride.cameras[0].id;
    get().inject({ kind: 'camera', cameraId: cam, patch: { occlusion: { x: 0.55, y: 0.25, w: 0.32, h: 0.55, label: 'Injected occlusion' } } });
    get().inject({ kind: 'seat', seatId: seat, patch: { occluded: true } });
    get().inject({ kind: 'narration', title: 'Occlusion injected', text: `Operator injected an occlusion over ${seat}. The seat will be reported as Unknown — review required once frames stabilise.` });
  },
  injectLowConfidence: () => {
    if (!engine) return;
    const seat = engine.ride.stagedSeats.sensor;
    get().inject({ kind: 'seat', seatId: seat, patch: { baseConfidence: 0.48 } });
    get().inject({ kind: 'narration', title: 'Low confidence injected', text: `Operator lowered the simulated detector confidence on ${seat} below threshold. No nominal state is reported while confidence is insufficient.` });
  },
  injectSensorDisagreement: () => {
    if (!engine) return;
    const seat = engine.ride.stagedSeats.sensor;
    get().inject({ kind: 'sensor', seatId: seat, reading: 'not_engaged', status: 'online', confidence: 0.79 });
    get().inject({ kind: 'narration', title: 'Sensor disagreement injected', text: `A synthetic "not engaged" reading was injected for ${seat}. If the camera observation is nominal, the disagreement routes to human review.` });
  },
  injectLooseObject: () => {
    if (!engine) return;
    const seat = engine.ride.stagedSeats.looseObject;
    get().inject({ kind: 'seat', seatId: seat, patch: { looseObject: 'detected', occupancy: 'occupied' } });
    get().inject({ kind: 'narration', title: 'Loose object injected', text: `A staged hand-held object was injected on ${seat}.` });
  },
  injectRestraintConcern: () => {
    if (!engine) return;
    const seat = engine.ride.stagedSeats.concern;
    get().inject({ kind: 'seat', seatId: seat, patch: { restraint: 'concern', occupancy: 'occupied' } });
    get().inject({ kind: 'narration', title: 'Restraint concern injected', text: `A staged restraint-position observation was injected on ${seat}. Flagged for human review — not a determination.` });
  },
  injectSlideExitProlonged: () => {
    if (!engine) return;
    const sl = get().slide;
    if (!sl.exitZone.riderId) {
      if (sl.inFlume.length === 0) {
        get().inject({ kind: 'slide', op: { op: 'queue_add', label: 'Injected rider' } });
        get().inject({ kind: 'slide', op: { op: 'to_platform' } });
        get().inject({ kind: 'slide', op: { op: 'entry_review', state: 'recorded' } });
        get().inject({ kind: 'slide', op: { op: 'depart' } });
      }
      get().inject({ kind: 'slide', op: { op: 'exit_enter' } });
    }
    get().inject({ kind: 'slide', op: { op: 'exit_prolonged' } });
  },
  injectCameraOffline: (cameraId, offline) => {
    get().inject({ kind: 'camera', cameraId, patch: { offline } });
  },
  clearInjections: () => {
    if (!engine) return;
    const ride = engine.ride;
    for (const cam of ride.cameras) get().inject({ kind: 'camera', cameraId: cam.id, patch: { occlusion: undefined, offline: false, degraded: false, noise: cam.mode === 'infrared' ? 0.15 : 0.04 } });
    for (const id of Object.keys(get().scripted)) {
      const sc = get().scripted[id];
      get().inject({ kind: 'seat', seatId: id, patch: { occluded: false, baseConfidence: Math.max(sc.baseConfidence, 0.86), looseObject: 'none', restraint: sc.occupancy === 'occupied' && sc.restraint !== 'not_applicable' ? 'nominal' : sc.restraint } });
      get().inject({ kind: 'sensor', seatId: id, reading: sc.occupancy === 'occupied' ? 'engaged' : 'not_engaged', status: 'online', confidence: 0.84 });
    }
    get().inject({ kind: 'narration', title: 'Injections cleared', text: 'Scripted observations restored. Open alerts remain in the review queue until a human closes them.' });
  },
}));

export function getEngine(): SimulationEngine | null {
  return engine;
}
