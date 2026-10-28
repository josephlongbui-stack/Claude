import type { CameraRuntime, EvaluatedSeat, FusionResult, ScriptedSeat, SeatObservationSample, SensorObservation, SensorReading } from '../types';
import { SeededRandom, clamp } from '../simulation/rng';

/**
 * ObservationProvider — the seam where a real computer-vision service would plug in.
 * The UI and evaluator only ever see `SeatObservationSample`s, never the script.
 */
export interface ObservationProvider {
  sample(seatId: string, cameraId: string, atMs: number): SeatObservationSample;
}

export interface SensorProvider {
  read(seatId: string, atMs: number): SensorObservation | undefined;
}

export interface SimulatedProviderDeps {
  getScripted: (seatId: string) => ScriptedSeat;
  getCamera: (cameraId: string) => CameraRuntime | undefined;
  rng: SeededRandom;
}

/** Simulated provider: scripted ground truth + seeded detector noise. */
export class SimulatedObservationProvider implements ObservationProvider {
  private lastFlicker = new Map<string, number>();
  constructor(private readonly deps: SimulatedProviderDeps) {}

  sample(seatId: string, cameraId: string, atMs: number): SeatObservationSample {
    const truth = this.deps.getScripted(seatId);
    const cam = this.deps.getCamera(cameraId);
    const rng = this.deps.rng;

    let confidence = truth.baseConfidence + rng.gaussian(0, 0.018);
    if (cam) confidence -= cam.noise * 0.25;
    // A blocked view gives the detector almost nothing to go on.
    if (truth.occluded) confidence = 0.15 + rng.gaussian(0, 0.03);
    confidence = clamp(confidence, 0.02, 0.99);

    // Occasional single-frame detector flicker — never on consecutive frames, so stabilisation absorbs it.
    const prevFlicker = this.lastFlicker.get(seatId);
    const flicker = truth.occupancy === 'occupied' && !truth.occluded && truth.restraint !== 'not_applicable' && prevFlicker !== atMs - 250 && rng.chance(0.03);
    if (flicker) this.lastFlicker.set(seatId, atMs);

    return {
      seatId,
      cameraId,
      atMs,
      occupancy: truth.occupancy,
      restraint: flicker ? 'unknown' : truth.restraint,
      posture: truth.posture,
      looseObject: truth.looseObject,
      confidence: flicker ? confidence - 0.12 : confidence,
      occluded: truth.occluded,
    };
  }
}

export class SimulatedSensorProvider implements SensorProvider {
  constructor(private readonly readings: () => Record<string, SensorObservation>) {}
  read(seatId: string): SensorObservation | undefined {
    return this.readings()[seatId];
  }
}

export function fuse(seat: EvaluatedSeat, sensor: SensorObservation | undefined, atMs: number): FusionResult {
  // Compare against the STABILISED seat state, never a single raw frame.
  const cameraRestraint: EvaluatedSeat['restraint'] = seat.state === 'nominal' ? 'nominal' : seat.restraint;
  const base = {
    seatId: seat.seatId,
    cameraRestraint,
    cameraConfidence: seat.confidence,
    atMs,
  };
  if (!sensor || sensor.status === 'offline' || sensor.reading === 'no_data') {
    return { ...base, sensorReading: sensor?.reading ?? 'no_data', sensorStatus: sensor?.status ?? 'offline', agreement: 'not_applicable', recommendation: 'No sensor record — camera observation stands alone; human check per SOP.' };
  }
  if (seat.restraint === 'not_applicable' || seat.state === 'empty') {
    return { ...base, sensorReading: sensor.reading, sensorStatus: sensor.status, agreement: 'not_applicable', recommendation: 'Restraint check not applicable in the current phase.' };
  }
  const cameraSays: 'engaged' | 'not_engaged' | 'insufficient' = seat.state === 'nominal' ? 'engaged' : seat.state === 'concern' && seat.restraint === 'concern' ? 'not_engaged' : 'insufficient';
  if (cameraSays === 'insufficient' || sensor.reading === 'indeterminate') {
    return { ...base, sensorReading: sensor.reading, sensorStatus: sensor.status, agreement: 'insufficient', recommendation: 'Insufficient data to compare — human review required.' };
  }
  const sensorSays: SensorReading = sensor.reading;
  if (cameraSays === sensorSays) {
    return { ...base, sensorReading: sensor.reading, sensorStatus: sensor.status, agreement: 'agree', recommendation: cameraSays === 'engaged' ? 'Observations agree — no issue flagged in simulation. Human check still required.' : 'Observations agree a concern may exist — human review required.' };
  }
  return { ...base, sensorReading: sensor.reading, sensorStatus: sensor.status, agreement: 'disagree', recommendation: 'Camera and sensor observations disagree — human review required before any action.' };
}
