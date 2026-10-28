import type { Alert, AlertStatus, AlertType, ReviewNote, Severity } from '../types';

export type ReviewAction = 'acknowledge' | 'review' | 'false_alarm' | 'reopen';

const TRANSITIONS: Record<AlertStatus, Partial<Record<ReviewAction, AlertStatus>>> = {
  open: { acknowledge: 'acknowledged', review: 'reviewed', false_alarm: 'false_alarm' },
  acknowledged: { review: 'reviewed', false_alarm: 'false_alarm', reopen: 'open' },
  reviewed: { reopen: 'open' },
  false_alarm: { reopen: 'open' },
};

export function canTransition(status: AlertStatus, action: ReviewAction): boolean {
  return Boolean(TRANSITIONS[status][action]);
}

export function nextStatus(status: AlertStatus, action: ReviewAction): AlertStatus {
  const next = TRANSITIONS[status][action];
  if (!next) throw new Error(`Invalid review transition: ${status} → ${action}`);
  return next;
}

export function applyReviewAction(alert: Alert, action: ReviewAction, opts: { atMs: number; ts: string; reviewer: string; note?: string }): Alert {
  const status = nextStatus(alert.status, action);
  const notes: ReviewNote[] = opts.note ? [...alert.notes, { atMs: opts.atMs, ts: opts.ts, text: opts.note, author: opts.reviewer }] : alert.notes;
  return { ...alert, status, notes, updatedMs: opts.atMs, updatedTs: opts.ts, reviewer: opts.reviewer };
}

export function addNote(alert: Alert, note: ReviewNote): Alert {
  return { ...alert, notes: [...alert.notes, note], updatedMs: note.atMs, updatedTs: note.ts };
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  belt_position: 'Potential belt / lap-bar position concern',
  restraint_mismatch: 'Possible restraint mismatch',
  loose_article: 'Loose article',
  posture: 'Unusual seated posture',
  occlusion: 'Camera occlusion',
  low_confidence: 'Low confidence',
  slow_gate: 'Slow gate',
  sensor_discrepancy: 'Simulated sensor discrepancy',
  exit_zone_occupied: 'Exit zone occupied',
  entry_position: 'Entry position review',
  spacing: 'Boat spacing',
  policy_review: 'Policy review flag',
  camera_degraded: 'Camera degradation',
  cycle_variability: 'Cycle variability',
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  reviewed: 'Reviewed',
  false_alarm: 'False alarm',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  review: 'Review required',
  concern: 'Simulated concern',
};

export function isOpen(alert: Alert): boolean {
  return alert.status === 'open' || alert.status === 'acknowledged';
}
