import { describe, expect, it } from 'vitest';
import { fuse } from '../observation/provider';
import { createEvaluatedSeat, evaluateSeat, DEFAULT_EVALUATOR_SETTINGS } from '../observation/evaluator';
import type { SensorObservation, SeatObservationSample } from '../types';

const sample = (over: Partial<SeatObservationSample> = {}): SeatObservationSample => ({ seatId: 'R1S1', atMs: 0, cameraId: 'CAM-01', occupancy: 'occupied', restraint: 'nominal', posture: 'nominal', looseObject: 'none', confidence: 0.9, occluded: false, ...over });
const sensor = (reading: SensorObservation['reading'], status: SensorObservation['status'] = 'online'): SensorObservation => ({ sensorId: 'SEN', seatId: 'R1S1', atMs: 0, reading, status, confidence: 0.8 });

function stable(restraint: 'nominal' | 'concern'): ReturnType<typeof createEvaluatedSeat> {
  let seat = createEvaluatedSeat('R1S1', 'CAM-01');
  for (let i = 0; i < 8; i += 1) seat = evaluateSeat(seat, sample({ restraint }), DEFAULT_EVALUATOR_SETTINGS);
  return seat;
}

describe('sensor fusion', () => {
  it('agrees when camera nominal and sensor engaged', () => {
    expect(fuse(stable('nominal'), sensor('engaged'), 0).agreement).toBe('agree');
  });
  it('disagrees when camera nominal and sensor not engaged → human review', () => {
    const f = fuse(stable('nominal'), sensor('not_engaged'), 0);
    expect(f.agreement).toBe('disagree');
    expect(f.recommendation).toMatch(/human review/i);
  });
  it('ignores a single flicker frame because it compares against the stabilised state', () => {
    let seat = stable('nominal');
    seat = evaluateSeat(seat, sample({ restraint: 'unknown', confidence: 0.78 }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
    expect(fuse(seat, sensor('engaged'), 0).agreement).toBe('agree');
  });
  it('reports insufficient data when the seat is unknown or the sensor is indeterminate', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 0; i < 8; i += 1) seat = evaluateSeat(seat, sample({ occluded: true }), DEFAULT_EVALUATOR_SETTINGS);
    expect(fuse(seat, sensor('engaged'), 0).agreement).toBe('insufficient');
    expect(fuse(stable('nominal'), sensor('indeterminate'), 0).agreement).toBe('insufficient');
  });
  it('is not applicable without a sensor or when offline', () => {
    expect(fuse(stable('nominal'), undefined, 0).agreement).toBe('not_applicable');
    expect(fuse(stable('nominal'), sensor('engaged', 'offline'), 0).agreement).toBe('not_applicable');
  });
});
