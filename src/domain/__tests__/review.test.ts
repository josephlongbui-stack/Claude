import { describe, expect, it } from 'vitest';
import { applyReviewAction, canTransition, nextStatus } from '../review/workflow';
import type { Alert } from '../types';

const alert: Alert = { id: 'ALT-0001', type: 'belt_position', severity: 'concern', rideId: 'vortex', cameraId: 'CAM-02', target: { kind: 'seat', seatId: 'R4S2' }, title: 't', detail: 'd', confidence: 0.86, status: 'open', notes: [], evidenceRef: 'SIM-B-vortex-ALT-0001', scenarioId: 'B', createdMs: 0, createdTs: 'x', updatedMs: 0, updatedTs: 'x' };

describe('review workflow transitions', () => {
  it('open → acknowledged → reviewed', () => {
    const a1 = applyReviewAction(alert, 'acknowledge', { atMs: 1, ts: 't1', reviewer: 'Op' });
    expect(a1.status).toBe('acknowledged');
    const a2 = applyReviewAction(a1, 'review', { atMs: 2, ts: 't2', reviewer: 'Op', note: 'checked' });
    expect(a2.status).toBe('reviewed');
    expect(a2.notes).toHaveLength(1);
    expect(a2.notes[0].text).toBe('checked');
  });
  it('open → false alarm, and reopen', () => {
    const a1 = applyReviewAction(alert, 'false_alarm', { atMs: 1, ts: 't1', reviewer: 'Op' });
    expect(a1.status).toBe('false_alarm');
    expect(canTransition(a1.status, 'review')).toBe(false);
    expect(applyReviewAction(a1, 'reopen', { atMs: 2, ts: 't2', reviewer: 'Op' }).status).toBe('open');
  });
  it('rejects invalid transitions', () => {
    expect(() => nextStatus('reviewed', 'acknowledge')).toThrow();
    expect(() => applyReviewAction({ ...alert, status: 'open' }, 'reopen', { atMs: 1, ts: 't', reviewer: 'Op' })).toThrow();
  });
});
