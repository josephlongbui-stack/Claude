/**
 * RideOps AI — shared domain types.
 *
 * Everything in this file describes a SIMULATION. No type here represents a
 * certified safety determination, a ride-controller signal, or a real sensor.
 */

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------

export type RideType =
  | 'lap_bar_coaster'
  | 'ots_coaster'
  | 'flying_coaster'
  | 'wing_coaster'
  | 'spinning_coaster'
  | 'dark_ride'
  | 'water_slide'
  | 'water_coaster'
  | 'drop_tower'
  | 'flat_ride'
  | 'family_ride';

export type RestraintType =
  | 'lap_bar'
  | 'ots_harness'
  | 'flying_vest'
  | 'lap_bar_belt'
  | 'none_slide'
  | 'lap_belt';

export type SeatId = string; // "R4S2" — row 4, seat 2 (1-based)

export type GeometryKind = 'train' | 'radial' | 'gondolas' | 'vehicles' | 'boats' | 'slide';

export interface RideGeometry {
  kind: GeometryKind;
  /** Number of rows (train), gondolas (gondolas), vehicle-rows (vehicles), boat rows (boats). */
  rows: number;
  seatsPerRow: number;
  /** Wing coaster: seats 1–2 hang left of the track, 3–4 right. */
  mirrored?: boolean;
  /** Label for the row unit: "Row", "Car", "Gondola", "Vehicle". */
  rowLabel: string;
  /** For vehicles/boats: rows grouped into units of this size. */
  rowsPerUnit?: number;
  unitLabel?: string;
  facing?: 'forward' | 'inward' | 'outward';
}

export type CameraView = 'front' | 'middle' | 'rear' | 'gates' | 'entrance' | 'exit' | 'overhead' | 'side';
export type CameraMode = 'visible' | 'infrared';

export interface CameraConfig {
  id: string;
  label: string;
  view: CameraView;
  coverage: SeatId[];
  mode: CameraMode;
  /** Placement diagram coordinates (0–100 station space) and bearing in degrees. */
  placement: { x: number; y: number; angle: number; fov: number };
}

export type CheckCategory = 'restraint' | 'position' | 'object' | 'zone' | 'policy' | 'camera' | 'equipment';

export interface ObservationCheck {
  id: string;
  label: string;
  description: string;
  category: CheckCategory;
}

export type SensorKind = 'restraint_position' | 'seat_occupancy' | 'gate_state' | 'zone_presence' | 'harness_lock';

export interface SyntheticSensorConfig {
  id: string;
  label: string;
  kind: SensorKind;
  perSeat: boolean;
}

export type ScenarioId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  description: string;
}

export interface RideBaseline {
  stationDwellSec: number;
  minCycleSec: number;
  loadFactor: number;
  demandPerHour: number;
  /** Seats per dispatch unit (train / boat / cycle). */
  capacity: number;
}

export interface RideConfiguration {
  id: string;
  parkId: string;
  name: string;
  type: RideType;
  typeLabel: string;
  restraint: RestraintType;
  restraintLabel: string;
  description: string;
  geometry: RideGeometry;
  cameras: CameraConfig[];
  checklist: ObservationCheck[];
  sensors: SyntheticSensorConfig[];
  scenarios: ScenarioPreset[];
  visual: { style: 'standard' | 'infrared' | 'water'; accent: string };
  baseline: RideBaseline;
  /** Seats the scenario generator uses for staged concerns, in priority order. */
  stagedSeats: { concern: SeatId; occluded: SeatId; looseObject: SeatId; sensor: SeatId };
  /** Fictional operating status for the park overview. */
  status: 'operating' | 'delayed' | 'maintenance' | 'closed';
  metrics: string[];
}

export interface Park {
  id: string;
  name: string;
  kind: 'theme' | 'water';
  location: string;
  rideIds: string[];
}

// ---------------------------------------------------------------------------
// Observations (simulated)
// ---------------------------------------------------------------------------

export type Occupancy = 'empty' | 'occupied' | 'unknown';
export type RestraintObservation = 'nominal' | 'review' | 'concern' | 'unknown' | 'not_applicable';
export type PostureObservation = 'nominal' | 'unusual' | 'unknown';
export type LooseObjectObservation = 'none' | 'possible' | 'detected' | 'unknown';

/** Scripted "ground truth" for a seat inside a scenario (what the simulated camera would see). */
export interface ScriptedSeat {
  occupancy: Occupancy;
  restraint: RestraintObservation;
  posture: PostureObservation;
  looseObject: LooseObjectObservation;
  /** Nominal confidence the simulated detector reports for this seat. */
  baseConfidence: number;
  occluded: boolean;
  /** Rider silhouette variant for the camera renderer (0–3). */
  riderVariant: number;
}

export interface SeatObservationSample {
  seatId: SeatId;
  atMs: number;
  cameraId: string;
  occupancy: Occupancy;
  restraint: RestraintObservation;
  posture: PostureObservation;
  looseObject: LooseObjectObservation;
  confidence: number;
  occluded: boolean;
}

export type SeatState = 'empty' | 'nominal' | 'review' | 'concern' | 'unknown';

export interface EvaluatedSeat {
  seatId: SeatId;
  state: SeatState;
  occupancy: Occupancy;
  restraint: RestraintObservation;
  posture: PostureObservation;
  looseObject: LooseObjectObservation;
  confidence: number;
  occluded: boolean;
  /** State the latest frames are pointing at (may differ from `state` until stabilised). */
  candidate: SeatState;
  /** Consecutive frames agreeing with `candidate`. */
  stableFrames: number;
  /** Total frames evaluated for this seat in the current scenario. */
  frames: number;
  reasons: string[];
  cameraId: string;
  updatedMs: number;
  history: SeatHistoryEntry[];
}

export interface SeatHistoryEntry {
  atMs: number;
  state: SeatState;
  note: string;
}

export interface EvaluatorSettings {
  confidenceThreshold: number;
  /** Frames required before a seat may move to a LESS conservative state. */
  stabilizationFrames: number;
  /** Frames required before a seat may move to a MORE conservative state. */
  escalationFrames: number;
  /** Frames in the sliding window. */
  windowFrames: number;
}

// ---------------------------------------------------------------------------
// Simulated sensors
// ---------------------------------------------------------------------------

export type SensorReading = 'engaged' | 'not_engaged' | 'indeterminate' | 'no_data';
export type SensorStatus = 'online' | 'degraded' | 'offline';

export interface SensorObservation {
  sensorId: string;
  seatId?: SeatId;
  atMs: number;
  reading: SensorReading;
  status: SensorStatus;
  confidence: number;
}

export type FusionAgreement = 'agree' | 'disagree' | 'insufficient' | 'not_applicable';

export interface FusionResult {
  seatId: SeatId;
  cameraRestraint: RestraintObservation;
  cameraConfidence: number;
  sensorReading: SensorReading;
  sensorStatus: SensorStatus;
  agreement: FusionAgreement;
  recommendation: string;
  atMs: number;
}

// ---------------------------------------------------------------------------
// Alerts and review
// ---------------------------------------------------------------------------

export type AlertType =
  | 'belt_position'
  | 'restraint_mismatch'
  | 'loose_article'
  | 'posture'
  | 'occlusion'
  | 'low_confidence'
  | 'slow_gate'
  | 'sensor_discrepancy'
  | 'exit_zone_occupied'
  | 'entry_position'
  | 'spacing'
  | 'policy_review'
  | 'camera_degraded'
  | 'cycle_variability';

export type Severity = 'info' | 'review' | 'concern';
export type AlertStatus = 'open' | 'acknowledged' | 'reviewed' | 'false_alarm';

export type AlertTarget =
  | { kind: 'seat'; seatId: SeatId }
  | { kind: 'zone'; zone: string }
  | { kind: 'equipment'; equipmentId: string };

export interface ReviewNote {
  atMs: number;
  ts: string;
  text: string;
  author: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  rideId: string;
  cameraId: string;
  target: AlertTarget;
  title: string;
  detail: string;
  confidence: number;
  status: AlertStatus;
  notes: ReviewNote[];
  sensor?: { reading: SensorReading; status: SensorStatus; sensorId: string };
  evidenceRef: string;
  scenarioId: ScenarioId;
  createdMs: number;
  createdTs: string;
  updatedMs: number;
  updatedTs: string;
  reviewer?: string;
}

// ---------------------------------------------------------------------------
// Events and evidence
// ---------------------------------------------------------------------------

export type EventType =
  | 'phase'
  | 'observation'
  | 'alert_raised'
  | 'alert_acknowledged'
  | 'alert_reviewed'
  | 'alert_false_alarm'
  | 'note_added'
  | 'dispatch_recorded'
  | 'sensor'
  | 'slide_entry'
  | 'slide_departure'
  | 'slide_exit'
  | 'maintenance'
  | 'boarding'
  | 'system'
  | 'training_label';

export interface EventRecord {
  id: string;
  seq: number;
  /** ISO timestamp in the simulated session clock. */
  ts: string;
  simMs: number;
  rideId: string;
  cameraId?: string;
  target?: AlertTarget;
  type: EventType;
  severity: Severity;
  title: string;
  detail: string;
  confidence?: number;
  sensor?: { reading: SensorReading; status: SensorStatus; sensorId: string };
  reviewStatus?: AlertStatus;
  notes?: string;
  evidenceRef: string;
  scenarioId: ScenarioId | 'none';
  alertId?: string;
  prevHash: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Station / scenario runtime
// ---------------------------------------------------------------------------

export type StationPhase =
  | 'idle'
  | 'arriving'
  | 'unloading'
  | 'boarding'
  | 'observing'
  | 'review'
  | 'ready'
  | 'dispatch'
  | 'departing'
  | 'block_wait';

export interface CameraRuntime {
  id: string;
  /** Normalised occlusion rectangle inside the frame, if any. */
  occlusion?: { x: number; y: number; w: number; h: number; label: string };
  degraded: boolean;
  offline: boolean;
  noise: number;
  latencyMs: number;
}

export interface SlideRider {
  id: string;
  label: string;
  /** 0 = platform, 1 = exit; progress along the flume. */
  progress: number;
  enteredMs: number;
  variant: number;
}

export interface SlideState {
  queue: string[];
  platformRider?: string;
  entryReview: 'none' | 'pending' | 'recorded';
  inFlume: SlideRider[];
  exitZone: { riderId?: string; sinceMs?: number; prolonged: boolean };
  riderCounter: number;
  departures: number[];
  exits: number[];
  queueHistory: { atMs: number; length: number }[];
}

export interface DispatchRecord {
  id: string;
  atMs: number;
  ts: string;
  rideId: string;
  dwellSec: number;
  unloadSec: number;
  loadSec: number;
  reviewSec: number;
  blockWaitSec: number;
  intervalSec: number;
  riders: number;
  capacity: number;
  loadFactor: number;
  emptySeats: number;
  scenarioId: ScenarioId | 'history';
}

export interface GateObservation {
  gateId: string;
  atMs: number;
  openDurationMs: number;
}

export interface Narration {
  title: string;
  text: string;
  atMs: number;
}

export interface TimelineMarker {
  atMs: number;
  label: string;
  phase: StationPhase;
}

// ---------------------------------------------------------------------------
// Scenario scripts
// ---------------------------------------------------------------------------

export type ScenarioAction =
  | { kind: 'phase'; phase: StationPhase; label: string }
  | { kind: 'seat'; seatId: SeatId; patch: Partial<ScriptedSeat> }
  | { kind: 'seats'; seatIds: SeatId[]; patch: Partial<ScriptedSeat> }
  | { kind: 'camera'; cameraId: string; patch: Partial<CameraRuntime> }
  | { kind: 'sensor'; seatId: SeatId; reading: SensorReading; status?: SensorStatus; confidence?: number }
  | { kind: 'alert'; alert: ScriptedAlert }
  | { kind: 'auto_review'; seatId?: SeatId; zone?: string; type: AlertType; outcome: 'acknowledged' | 'reviewed' | 'false_alarm'; note: string }
  | { kind: 'event'; type: EventType; title: string; detail: string; severity?: Severity }
  | { kind: 'narration'; title: string; text: string }
  | { kind: 'gate'; gateId: string; openDurationMs: number }
  | { kind: 'dispatch'; riders: number; dwellSec: number; unloadSec: number; loadSec: number; reviewSec: number; blockWaitSec: number }
  | { kind: 'slide'; op: SlideOp }
  | { kind: 'navigate'; route: string }
  | { kind: 'maintenance'; ticketId: string; op: 'surface' }
  | { kind: 'boarding'; op: 'optimize' }
  | { kind: 'end' };

export type SlideOp =
  | { op: 'queue_add'; label: string }
  | { op: 'to_platform' }
  | { op: 'entry_review'; state: 'pending' | 'recorded' }
  | { op: 'depart' }
  | { op: 'advance'; progress: number }
  | { op: 'exit_enter' }
  | { op: 'exit_prolonged' }
  | { op: 'exit_clear' };

export interface ScriptedAlert {
  type: AlertType;
  severity: Severity;
  cameraId: string;
  target: AlertTarget;
  title: string;
  detail: string;
  confidence: number;
  sensor?: { reading: SensorReading; status: SensorStatus; sensorId: string };
}

export interface ScenarioStep {
  atMs: number;
  action: ScenarioAction;
}

export interface ScenarioScript {
  id: ScenarioId;
  rideId: string;
  name: string;
  summary: string;
  durationMs: number;
  route: string;
  steps: ScenarioStep[];
}

export type DemoMode = 'shadow' | 'assisted';
