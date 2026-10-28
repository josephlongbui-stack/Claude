import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Alert, AlertStatus, AlertTarget, AlertType, DispatchRecord, EventRecord, EventType, Severity } from '@/domain/types';
import type { AlertDraft, AutoReviewMatch, EventDraftInput } from '@/domain/simulation/engine';
import { GENESIS_HASH, computeHash, type EventDraft } from '@/domain/evidence/chain';
import { applyReviewAction, isOpen, type ReviewAction } from '@/domain/review/workflow';
import { simIso } from '@/domain/simulation/clock';

export const MAX_EVENTS = 2500;

interface RecordsState {
  alerts: Alert[];
  events: EventRecord[];
  dispatches: DispatchRecord[];
  counters: { alert: number; event: number; dispatch: number };
  /** Hash of the last pruned record (chain anchor), or genesis. */
  anchorHash: string;
  pendingHashes: number;
  raiseAlert: (draft: AlertDraft) => Alert | undefined;
  logEvent: (draft: EventDraftInput, extra?: Partial<Pick<EventRecord, 'reviewStatus' | 'notes' | 'alertId'>>) => EventRecord;
  review: (alertId: string, action: ReviewAction, opts: { atMs: number; reviewer: string; note?: string }) => void;
  addNote: (alertId: string, text: string, opts: { atMs: number; reviewer: string }) => void;
  autoReview: (match: AutoReviewMatch, outcome: 'acknowledged' | 'reviewed' | 'false_alarm', note: string, atMs: number) => void;
  recordDispatch: (rec: Omit<DispatchRecord, 'id' | 'ts'>) => void;
  hasOpenAlert: (rideId: string, target: AlertTarget, type: AlertType) => boolean;
  /** Replace a record's content in place (demonstrates tamper detection). */
  tamperEvent: (eventId: string, patch: Partial<EventRecord>) => void;
  rehashAll: () => Promise<void>;
  resetRecords: () => void;
}

function targetKey(t: AlertTarget | undefined): string {
  if (!t) return '';
  return t.kind === 'seat' ? `seat:${t.seatId}` : t.kind === 'zone' ? `zone:${t.zone}` : `eq:${t.equipmentId}`;
}

let hashQueue: Promise<void> = Promise.resolve();

export const useRecordsStore = create<RecordsState>()(
  persist(
    (set, get) => {
      const scheduleHash = (eventId: string): void => {
        set((s) => ({ pendingHashes: s.pendingHashes + 1 }));
        hashQueue = hashQueue
          .then(async () => {
            const st = get();
            const idx = st.events.findIndex((e) => e.id === eventId);
            if (idx < 0) return;
            const prevHash = idx === 0 ? st.anchorHash : st.events[idx - 1].hash;
            const { hash: _h, prevHash: _p, ...draft } = st.events[idx];
            void _h;
            void _p;
            const hash = await computeHash(draft as EventDraft, prevHash);
            set((s) => ({ events: s.events.map((e) => (e.id === eventId ? { ...e, prevHash, hash } : e)) }));
          })
          .catch(() => undefined)
          .then(() => {
            set((s) => ({ pendingHashes: Math.max(0, s.pendingHashes - 1) }));
          });
      };

      const appendEvent = (input: { type: EventType; title: string; detail: string; severity: Severity; rideId: string; scenarioId: EventRecord['scenarioId']; atMs: number; cameraId?: string; target?: AlertTarget; confidence?: number; sensor?: Alert['sensor']; reviewStatus?: AlertStatus; notes?: string; alertId?: string; evidenceRef?: string }): EventRecord => {
        const st = get();
        const seq = st.counters.event + 1;
        const id = `EVT-${String(seq).padStart(6, '0')}`;
        const record: EventRecord = {
          id,
          seq,
          ts: simIso(input.atMs),
          simMs: input.atMs,
          rideId: input.rideId,
          cameraId: input.cameraId,
          target: input.target,
          type: input.type,
          severity: input.severity,
          title: input.title,
          detail: input.detail,
          confidence: input.confidence,
          sensor: input.sensor,
          reviewStatus: input.reviewStatus,
          notes: input.notes,
          evidenceRef: input.evidenceRef ?? `SIM-${input.scenarioId}-${input.rideId}-${String(seq).padStart(6, '0')}`,
          scenarioId: input.scenarioId,
          alertId: input.alertId,
          prevHash: '',
          hash: '',
        };
        let events = [...st.events, record];
        let anchorHash = st.anchorHash;
        if (events.length > MAX_EVENTS) {
          const dropped = events.slice(0, events.length - MAX_EVENTS);
          anchorHash = dropped[dropped.length - 1].hash || anchorHash;
          events = events.slice(events.length - MAX_EVENTS);
        }
        set({ events, anchorHash, counters: { ...st.counters, event: seq } });
        scheduleHash(id);
        return record;
      };

      return {
        alerts: [],
        events: [],
        dispatches: [],
        counters: { alert: 0, event: 0, dispatch: 0 },
        anchorHash: GENESIS_HASH,
        pendingHashes: 0,

        hasOpenAlert: (rideId, target, type) => get().alerts.some((a) => a.rideId === rideId && a.type === type && targetKey(a.target) === targetKey(target) && isOpen(a)),

        raiseAlert: (draft) => {
          const st = get();
          if (st.alerts.some((a) => a.rideId === draft.rideId && a.type === draft.type && targetKey(a.target) === targetKey(draft.target) && isOpen(a))) return undefined;
          const n = st.counters.alert + 1;
          const id = `ALT-${String(n).padStart(4, '0')}`;
          const ts = simIso(draft.atMs);
          const alert: Alert = {
            id,
            type: draft.type,
            severity: draft.severity,
            rideId: draft.rideId,
            cameraId: draft.cameraId,
            target: draft.target,
            title: draft.title,
            detail: draft.detail,
            confidence: draft.confidence,
            status: 'open',
            notes: [],
            sensor: draft.sensor,
            evidenceRef: `SIM-${draft.scenarioId}-${draft.rideId}-${id}`,
            scenarioId: draft.scenarioId,
            createdMs: draft.atMs,
            createdTs: ts,
            updatedMs: draft.atMs,
            updatedTs: ts,
          };
          set({ alerts: [...st.alerts, alert], counters: { ...st.counters, alert: n } });
          appendEvent({ type: 'alert_raised', title: alert.title, detail: alert.detail, severity: alert.severity, rideId: alert.rideId, scenarioId: alert.scenarioId, atMs: alert.createdMs, cameraId: alert.cameraId, target: alert.target, confidence: alert.confidence, sensor: alert.sensor, reviewStatus: 'open', alertId: id, evidenceRef: alert.evidenceRef });
          return alert;
        },

        logEvent: (draft, extra) => appendEvent({ ...draft, ...extra }),

        review: (alertId, action, opts) => {
          const st = get();
          const alert = st.alerts.find((a) => a.id === alertId);
          if (!alert) return;
          let next: Alert;
          try {
            next = applyReviewAction(alert, action, { atMs: opts.atMs, ts: simIso(opts.atMs), reviewer: opts.reviewer, note: opts.note });
          } catch {
            return;
          }
          set({ alerts: st.alerts.map((a) => (a.id === alertId ? next : a)) });
          const typeMap: Record<ReviewAction, EventType> = { acknowledge: 'alert_acknowledged', review: 'alert_reviewed', false_alarm: 'alert_false_alarm', reopen: 'alert_raised' };
          const verb: Record<ReviewAction, string> = { acknowledge: 'acknowledged', review: 'marked reviewed', false_alarm: 'marked false alarm', reopen: 'reopened' };
          appendEvent({ type: typeMap[action], title: `${alert.id} ${verb[action]} by ${opts.reviewer}`, detail: `${alert.title}. ${opts.note ? `Note: ${opts.note}` : 'No note recorded.'} Human review record — not a certification of rider safety.`, severity: 'info', rideId: alert.rideId, scenarioId: alert.scenarioId, atMs: opts.atMs, cameraId: alert.cameraId, target: alert.target, confidence: alert.confidence, sensor: alert.sensor, reviewStatus: next.status, notes: opts.note, alertId: alert.id, evidenceRef: alert.evidenceRef });
        },

        addNote: (alertId, text, opts) => {
          const st = get();
          const alert = st.alerts.find((a) => a.id === alertId);
          if (!alert || !text.trim()) return;
          const ts = simIso(opts.atMs);
          const next: Alert = { ...alert, notes: [...alert.notes, { atMs: opts.atMs, ts, text: text.trim(), author: opts.reviewer }], updatedMs: opts.atMs, updatedTs: ts };
          set({ alerts: st.alerts.map((a) => (a.id === alertId ? next : a)) });
          appendEvent({ type: 'note_added', title: `Note added to ${alert.id}`, detail: text.trim(), severity: 'info', rideId: alert.rideId, scenarioId: alert.scenarioId, atMs: opts.atMs, cameraId: alert.cameraId, target: alert.target, reviewStatus: alert.status, notes: text.trim(), alertId: alert.id, evidenceRef: alert.evidenceRef });
        },

        autoReview: (match, outcome, note, atMs) => {
          const st = get();
          const target: AlertTarget | undefined = match.seatId ? { kind: 'seat', seatId: match.seatId } : match.zone ? (match.zone.startsWith('GATE') ? { kind: 'equipment', equipmentId: match.zone } : { kind: 'zone', zone: match.zone }) : undefined;
          const alert = [...st.alerts].reverse().find((a) => a.rideId === match.rideId && a.type === match.type && (!target || targetKey(a.target) === targetKey(target)) && isOpen(a));
          if (!alert) return;
          const action: ReviewAction = outcome === 'acknowledged' ? 'acknowledge' : outcome === 'reviewed' ? 'review' : 'false_alarm';
          if (outcome === 'acknowledged' && alert.status === 'acknowledged') return;
          get().review(alert.id, action, { atMs, reviewer: 'Demo Operator (scripted)', note });
        },

        recordDispatch: (rec) => {
          const st = get();
          const n = st.counters.dispatch + 1;
          const record: DispatchRecord = { ...rec, id: `DSP-${String(n).padStart(4, '0')}`, ts: simIso(rec.atMs) };
          set({ dispatches: [...st.dispatches, record], counters: { ...st.counters, dispatch: n } });
          appendEvent({ type: 'dispatch_recorded', title: `Simulated dispatch recorded — ${record.riders}/${record.capacity} seats`, detail: `Station dwell ${record.dwellSec}s (unload ${record.unloadSec}s, load ${record.loadSec}s, review ${record.reviewSec}s, block wait ${record.blockWaitSec}s). Effective interval ${record.intervalSec}s. Load factor ${(record.loadFactor * 100).toFixed(0)}%. Analytics record only — no dispatch command exists in this demo.`, severity: 'info', rideId: rec.rideId, scenarioId: rec.scenarioId === 'history' ? 'none' : rec.scenarioId, atMs: rec.atMs });
        },

        tamperEvent: (eventId, patch) => set((s) => ({ events: s.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) })),

        rehashAll: async () => {
          const st = get();
          let prev = st.anchorHash;
          const out: EventRecord[] = [];
          for (const e of st.events) {
            const { hash: _h, prevHash: _p, ...draft } = e;
            void _h;
            void _p;
            const hash = await computeHash(draft as EventDraft, prev);
            out.push({ ...e, prevHash: prev, hash });
            prev = hash;
          }
          set({ events: out });
        },

        resetRecords: () => set({ alerts: [], events: [], dispatches: [], counters: { alert: 0, event: 0, dispatch: 0 }, anchorHash: GENESIS_HASH, pendingHashes: 0 }),
      };
    },
    {
      name: 'rideops.records.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ alerts: s.alerts, events: s.events, dispatches: s.dispatches, counters: s.counters, anchorHash: s.anchorHash }),
    },
  ),
);
