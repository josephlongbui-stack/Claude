import { describe, expect, it } from 'vitest';
import { DEFAULT_EVALUATOR_SETTINGS, classifySample, createEvaluatedSeat, evaluateSeat } from '../observation/evaluator';
import type { SeatObservationSample } from '../types';

const sample = (over: Partial<SeatObservationSample> = {}): SeatObservationSample => ({ seatId: 'R1S1', atMs: 0, cameraId: 'CAM-01', occupancy: 'occupied', restraint: 'nominal', posture: 'nominal', looseObject: 'none', confidence: 0.9, occluded: false, ...over });

describe('classifySample — seat state mapping', () => {
  it('maps a confident nominal frame to nominal', () => {
    expect(classifySample(sample(), DEFAULT_EVALUATOR_SETTINGS).state).toBe('nominal');
  });
  it('maps an empty seat to empty', () => {
    expect(classifySample(sample({ occupancy: 'empty' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('empty');
  });
  it('maps restraint concern and detected loose objects to concern', () => {
    expect(classifySample(sample({ restraint: 'concern' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('concern');
    expect(classifySample(sample({ looseObject: 'detected' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('concern');
  });
  it('maps review-grade observations to review', () => {
    expect(classifySample(sample({ restraint: 'review' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('review');
    expect(classifySample(sample({ posture: 'unusual' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('review');
    expect(classifySample(sample({ looseObject: 'possible' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('review');
  });
  it('never produces an affirmative state when occluded or below threshold', () => {
    expect(classifySample(sample({ occluded: true }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('unknown');
    expect(classifySample(sample({ confidence: 0.5 }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('unknown');
    expect(classifySample(sample({ occupancy: 'empty', occluded: true }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('unknown');
    expect(classifySample(sample({ occupancy: 'unknown' }), DEFAULT_EVALUATOR_SETTINGS).state).toBe('unknown');
  });
});

describe('evaluateSeat — stabilisation and conservative transitions', () => {
  it('starts unknown and needs stabilisation frames before reporting nominal', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 1; i < DEFAULT_EVALUATOR_SETTINGS.stabilizationFrames; i += 1) {
      seat = evaluateSeat(seat, sample({ atMs: i * 250 }), DEFAULT_EVALUATOR_SETTINGS);
      expect(seat.state).toBe('unknown');
    }
    seat = evaluateSeat(seat, sample({ atMs: 9999 }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
  });
  it('absorbs a single flicker frame without changing state', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 0; i < 6; i += 1) seat = evaluateSeat(seat, sample({ atMs: i * 250 }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
    seat = evaluateSeat(seat, sample({ restraint: 'unknown', confidence: 0.78 }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
    expect(seat.candidate).toBe('review');
    seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
  });
  it('escalates to concern after escalation frames and de-escalates only after stabilisation frames', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 0; i < 6; i += 1) seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
    seat = evaluateSeat(seat, sample({ restraint: 'concern' }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
    seat = evaluateSeat(seat, sample({ restraint: 'concern' }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('concern');
    for (let i = 1; i < DEFAULT_EVALUATOR_SETTINGS.stabilizationFrames; i += 1) {
      seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
      expect(seat.state).toBe('concern');
    }
    seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
  });
  it('moves to unknown on occlusion and holds it until the view clears and stabilises', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 0; i < 6; i += 1) seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
    for (let i = 0; i < DEFAULT_EVALUATOR_SETTINGS.escalationFrames; i += 1) seat = evaluateSeat(seat, sample({ occluded: true }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('unknown');
    expect(seat.reasons[0]).toMatch(/occluded/i);
    for (let i = 0; i < 10; i += 1) seat = evaluateSeat(seat, sample({ occluded: true }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('unknown');
    for (let i = 0; i < DEFAULT_EVALUATOR_SETTINGS.stabilizationFrames; i += 1) seat = evaluateSeat(seat, sample(), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('nominal');
  });
  it('low confidence yields unknown, not nominal', () => {
    let seat = createEvaluatedSeat('R1S1', 'CAM-01');
    for (let i = 0; i < 12; i += 1) seat = evaluateSeat(seat, sample({ confidence: 0.55 }), DEFAULT_EVALUATOR_SETTINGS);
    expect(seat.state).toBe('unknown');
  });
});
