import { useState } from 'react';
import { Check, CheckCheck, Eye, MessageSquarePlus, XCircle } from 'lucide-react';
import type { Alert } from '@/domain/types';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { useSettingsStore } from '@/store/settings';
import { SeverityBadge, StatusBadge, Badge } from '@/components/ui';
import { canTransition } from '@/domain/review/workflow';
import { simClock } from '@/domain/simulation/clock';
import { getRide } from '@/domain/rides/configs';
import { seatLabel } from '@/domain/rides/seats';

export function alertTargetLabel(a: Alert): string {
  const ride = getRide(a.rideId);
  if (a.target.kind === 'seat') return seatLabel(ride, a.target.seatId);
  if (a.target.kind === 'zone') return `Zone ${a.target.zone}`;
  return a.target.equipmentId;
}

export function AlertCard({ alert, onInspect, dense = false }: { alert: Alert; onInspect?: (a: Alert) => void; dense?: boolean }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const review = useRecordsStore((s) => s.review);
  const addNote = useRecordsStore((s) => s.addNote);
  const reviewer = useSettingsStore((s) => s.reviewerName);
  const now = (): number => useSimulationStore.getState().sessionMs;
  const selected = useSimulationStore((s) => s.selectedAlertId === alert.id);

  const act = (action: 'acknowledge' | 'review' | 'false_alarm' | 'reopen'): void => {
    review(alert.id, action, { atMs: now(), reviewer, note: note.trim() || undefined });
    setNote('');
    setNoteOpen(false);
  };

  const saveNote = (): void => {
    if (!note.trim()) return;
    addNote(alert.id, note.trim(), { atMs: now(), reviewer });
    setNote('');
    setNoteOpen(false);
  };

  return (
    <article className={`rounded border ${selected ? 'border-signal-teal' : alert.status === 'open' && alert.severity === 'concern' ? 'border-signal-red-dim' : 'border-graphite-700'} bg-graphite-800 p-2.5 flex flex-col gap-1.5 fade-in`} aria-label={alert.title}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="mono text-[10.5px] text-graphite-300">{alert.id}</span>
            <SeverityBadge severity={alert.severity} />
            <StatusBadge status={alert.status} />
            {alert.sensor && <Badge tone="violet">sensor: {alert.sensor.reading.replace('_', ' ')}</Badge>}
          </div>
          <div className="text-[12.5px] font-medium mt-1 leading-snug">{alert.title}</div>
          {!dense && <div className="text-[11.5px] text-graphite-300 mt-0.5 leading-snug">{alert.detail}</div>}
          <div className="text-[10.5px] text-graphite-400 mt-1 flex gap-3 flex-wrap">
            <span>{alertTargetLabel(alert)}</span>
            <span>{alert.cameraId}</span>
            <span className="mono">conf {Math.round(alert.confidence * 100)}%</span>
            <span className="mono">{simClock(alert.createdMs)}</span>
            <span className="mono">{alert.evidenceRef}</span>
          </div>
        </div>
      </div>
      {alert.notes.length > 0 && (
        <ul className="text-[11px] text-graphite-200 border-l-2 border-graphite-600 pl-2 flex flex-col gap-0.5">
          {alert.notes.map((n, i) => (
            <li key={i}>
              <span className="mono text-graphite-400">{simClock(n.atMs)}</span> <span className="text-graphite-300">{n.author}:</span> {n.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        {onInspect && (
          <button className="btn btn-xs" onClick={() => onInspect(alert)}>
            <Eye size={12} /> Inspect
          </button>
        )}
        <button className="btn btn-xs" disabled={!canTransition(alert.status, 'acknowledge')} onClick={() => act('acknowledge')}>
          <Check size={12} /> Acknowledge
        </button>
        <button className="btn btn-xs" disabled={!canTransition(alert.status, 'review')} onClick={() => act('review')} title="Records that a human reviewed this observation. Not a safety certification.">
          <CheckCheck size={12} /> Mark reviewed
        </button>
        <button className="btn btn-xs" disabled={!canTransition(alert.status, 'false_alarm')} onClick={() => act('false_alarm')}>
          <XCircle size={12} /> False alarm
        </button>
        <button className="btn btn-xs btn-ghost" onClick={() => setNoteOpen((v) => !v)}>
          <MessageSquarePlus size={12} /> Note
        </button>
        {(alert.status === 'reviewed' || alert.status === 'false_alarm') && (
          <button className="btn btn-xs btn-ghost" onClick={() => act('reopen')}>
            Reopen
          </button>
        )}
      </div>
      {noteOpen && (
        <div className="flex flex-col gap-1">
          <textarea className="textarea !min-h-[48px]" aria-label="Review note" placeholder="Review note (recorded in the event log)…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-1">
            <button className="btn btn-xs btn-primary" onClick={saveNote} disabled={!note.trim()}>
              Save note
            </button>
            <span className="text-[10.5px] text-graphite-400 self-center">Notes are attached to the next review action if left open.</span>
          </div>
        </div>
      )}
    </article>
  );
}
