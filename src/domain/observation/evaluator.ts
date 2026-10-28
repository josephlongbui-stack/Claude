import type { EvaluatedSeat, EvaluatorSettings, SeatObservationSample, SeatState } from '../types';

/**
 * Conservative observation evaluator.
 *
 * Rules (all simulated):
 *  - Occluded or low-confidence frames can never produce an affirmative state.
 *  - A seat starts as `unknown` and must earn `nominal` / `empty` through several
 *    consistent frames (stabilisation).
 *  - Escalations (towards review / concern) need fewer frames than de-escalations.
 *  - `unknown` is a first-class state that always routes to human review.
 */
export const DEFAULT_EVALUATOR_SETTINGS: EvaluatorSettings = {
  confidenceThreshold: 0.7,
  stabilizationFrames: 4,
  escalationFrames: 2,
};

/** Higher rank = more conservative. Equal ranks are treated as lateral moves. */
export const STATE_RANK: Record<SeatState, number> = {
  empty: 0,
  nominal: 1,
  unknown: 2,
  review: 2,
  concern: 3,
};

export function classifySample(sample: SeatObservationSample, settings: EvaluatorSettings): { state: SeatState; reasons: string[] } {
  const reasons: string[] = [];
  if (sample.occluded) {
    reasons.push('View occluded — observation unavailable');
    return { state: 'unknown', reasons };
  }
  if (sample.confidence < settings.confidenceThreshold) {
    reasons.push(`Confidence ${(sample.confidence * 100).toFixed(0)}% below threshold ${(settings.confidenceThreshold * 100).toFixed(0)}%`);
    return { state: 'unknown', reasons };
  }
  if (sample.occupancy === 'unknown') {
    reasons.push('Occupancy could not be determined');
    return { state: 'unknown', reasons };
  }
  if (sample.occupancy === 'empty') {
    reasons.push('Seat observed empty');
    return { state: 'empty', reasons };
  }
  // Occupied with usable confidence.
  if (sample.restraint === 'concern') reasons.push('Potential restraint-position concern (simulated)');
  if (sample.looseObject === 'detected') reasons.push('Loose article detected (simulated)');
  if (reasons.length) return { state: 'concern', reasons };

  if (sample.restraint === 'review') reasons.push('Restraint observation requires human review');
  if (sample.restraint === 'unknown') reasons.push('Restraint state not determinable from this view');
  if (sample.posture === 'unusual') reasons.push('Unusual seated posture observed');
  if (sample.posture === 'unknown') reasons.push('Posture not determinable');
  if (sample.looseObject === 'possible') reasons.push('Possible loose article');
  if (sample.looseObject === 'unknown') reasons.push('Loose-article check not determinable');
  if (reasons.length) return { state: 'review', reasons };

  reasons.push('No issue flagged in simulation');
  return { state: 'nominal', reasons };
}

export function createEvaluatedSeat(seatId: string, cameraId: string, atMs = 0): EvaluatedSeat {
  return {
    seatId,
    state: 'unknown',
    occupancy: 'unknown',
    restraint: 'unknown',
    posture: 'unknown',
    looseObject: 'unknown',
    confidence: 0,
    occluded: false,
    candidate: 'unknown',
    stableFrames: 0,
    frames: 0,
    reasons: ['Awaiting observation frames'],
    cameraId,
    updatedMs: atMs,
    history: [{ atMs, state: 'unknown', note: 'Initial state — no frames yet' }],
  };
}

export function evaluateSeat(prev: EvaluatedSeat, sample: SeatObservationSample, settings: EvaluatorSettings): EvaluatedSeat {
  const { state: frameState, reasons } = classifySample(sample, settings);
  const candidate = frameState;
  const stableFrames = candidate === prev.candidate ? prev.stableFrames + 1 : 1;
  const frames = prev.frames + 1;

  let state = prev.state;
  let history = prev.history;
  if (candidate !== prev.state) {
    const escalating = STATE_RANK[candidate] > STATE_RANK[prev.state];
    const required = escalating ? settings.escalationFrames : settings.stabilizationFrames;
    if (stableFrames >= required) {
      state = candidate;
      history = [...prev.history.slice(-29), { atMs: sample.atMs, state, note: reasons[0] ?? '' }];
    }
  }

  return {
    ...prev,
    state,
    candidate,
    stableFrames,
    frames,
    occupancy: sample.occupancy,
    restraint: sample.restraint,
    posture: sample.posture,
    looseObject: sample.looseObject,
    confidence: sample.confidence,
    occluded: sample.occluded,
    reasons: state === candidate ? reasons : [`Holding "${state}" until ${candidate} stabilises (${stableFrames} frame${stableFrames === 1 ? '' : 's'})`, ...reasons],
    cameraId: sample.cameraId,
    updatedMs: sample.atMs,
    history,
  };
}

export const SEAT_STATE_LABEL: Record<SeatState, string> = {
  empty: 'Empty',
  nominal: 'No issue flagged in simulation',
  review: 'Review required',
  concern: 'Potential concern',
  unknown: 'Occluded / unknown — review required',
};
