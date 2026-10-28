import { useMemo, useState } from 'react';
import { Download, FileJson, Hammer, ShieldCheck, ShieldOff, Wrench } from 'lucide-react';
import { useRecordsStore } from '@/store/records';
import { RIDES, getRide } from '@/domain/rides/configs';
import type { AlertStatus, EventRecord, EventType, Severity } from '@/domain/types';
import { eventsToCsv, eventsToJson, downloadText } from '@/domain/evidence/export';
import { verifyChain, type ChainVerification } from '@/domain/evidence/chain';
import { Badge, EmptyState, Notice, Panel, SectionTitle, SeverityBadge, StatTile, StatusBadge } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';
import { STATUS_LABEL } from '@/domain/review/workflow';

const EVENT_TYPES: EventType[] = ['phase', 'observation', 'alert_raised', 'alert_acknowledged', 'alert_reviewed', 'alert_false_alarm', 'note_added', 'dispatch_recorded', 'sensor', 'slide_entry', 'slide_departure', 'slide_exit', 'maintenance', 'boarding', 'system', 'training_label'];

function targetText(e: EventRecord): string {
  if (!e.target) return '—';
  return e.target.kind === 'seat' ? e.target.seatId : e.target.kind === 'zone' ? e.target.zone : e.target.equipmentId;
}

export default function EvidenceReports() {
  const events = useRecordsStore((s) => s.events);
  const alerts = useRecordsStore((s) => s.alerts);
  const pending = useRecordsStore((s) => s.pendingHashes);
  const anchorHash = useRecordsStore((s) => s.anchorHash);
  const tamper = useRecordsStore((s) => s.tamperEvent);
  const rehash = useRecordsStore((s) => s.rehashAll);
  const [ride, setRide] = useState('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [status, setStatus] = useState<AlertStatus | 'all'>('all');
  const [type, setType] = useState<EventType | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [tampered, setTampered] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return events
      .filter((e) => (ride === 'all' || e.rideId === ride) && (severity === 'all' || e.severity === severity) && (status === 'all' || e.reviewStatus === status) && (type === 'all' || e.type === type))
      .filter((e) => {
        const clock = simClock(e.simMs);
        if (from && clock < from) return false;
        if (to && clock > to) return false;
        if (q && !`${e.title} ${e.detail} ${e.id} ${targetText(e)}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .slice()
      .reverse();
  }, [events, ride, severity, status, type, from, to, q]);

  const [exportNote, setExportNote] = useState<string | null>(null);
  const offer = (filename: string, text: string, mime: string): void => {
    setExportNote(null);
    void downloadText(filename, text, mime).then((r) => {
      if (r === 'unavailable') setExportNote('File downloads are not available in this view. Open the demo in a browser tab to export.');
    });
  };
  const exportJson = (): void => offer(`rideops-events-${Date.now()}.json`, eventsToJson(filtered, { filters: { ride, severity, status, type, from, to, q }, anchorHash }), 'application/json');
  const exportCsv = (): void => offer(`rideops-events-${Date.now()}.csv`, eventsToCsv(filtered), 'text/csv');
  const exportReport = (): void => {
    const byType = Object.fromEntries(EVENT_TYPES.map((t) => [t, events.filter((e) => e.type === t).length]));
    const report = {
      title: 'RideOps AI — demonstration event report',
      disclaimer: 'SIMULATION. Synthetic records only; not an incident report, not a regulatory submission.',
      generatedAt: new Date().toISOString(),
      rides: RIDES.map((r) => ({ id: r.id, name: r.name, alerts: alerts.filter((a) => a.rideId === r.id).length, open: alerts.filter((a) => a.rideId === r.id && (a.status === 'open' || a.status === 'acknowledged')).length })),
      eventsByType: byType,
      alertsByStatus: Object.fromEntries((Object.keys(STATUS_LABEL) as AlertStatus[]).map((s) => [s, alerts.filter((a) => a.status === s).length])),
      chain: { records: events.length, anchorHash, headHash: events[events.length - 1]?.hash ?? null },
    };
    offer(`rideops-report-${Date.now()}.json`, JSON.stringify(report, null, 2), 'application/json');
  };

  const runVerify = async (): Promise<void> => {
    const st = useRecordsStore.getState();
    setVerification(await verifyChain(st.events, st.anchorHash));
  };

  const doTamper = (): void => {
    const target = events.find((e) => e.type === 'alert_reviewed') ?? events[Math.floor(events.length / 2)];
    if (!target) return;
    tamper(target.id, { detail: `${target.detail} [MODIFIED LOCALLY — demonstration of tamper detection]`, notes: 'edited after the fact' });
    setTampered(target.id);
    setVerification(null);
  };

  const counts = {
    total: events.length,
    alerts: events.filter((e) => e.type === 'alert_raised').length,
    reviews: events.filter((e) => e.type === 'alert_reviewed' || e.type === 'alert_false_alarm' || e.type === 'alert_acknowledged').length,
    dispatches: events.filter((e) => e.type === 'dispatch_recorded').length,
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Hash-chained event log for every simulated observation, review action and dispatch record. Exports are client-side. No real recordings, incidents, approvals or endorsements are represented.">Evidence & Reports</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3" label="Event records" value={counts.total} sub={`${pending} hash${pending === 1 ? '' : 'es'} pending`} />
        <StatTile className="col-span-6 md:col-span-3" label="Alerts raised" value={counts.alerts} />
        <StatTile className="col-span-6 md:col-span-3" label="Human review actions" value={counts.reviews} />
        <StatTile className="col-span-6 md:col-span-3" label="Dispatches recorded" value={counts.dispatches} />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Panel
          title={`Event log · ${filtered.length} of ${events.length}`}
          className="col-span-12 xl:col-span-8"
          bodyClassName="p-0 flex flex-col"
          actions={
            <div className="flex gap-1">
              <button className="btn btn-xs" onClick={exportJson} disabled={!filtered.length}>
                <FileJson size={12} /> JSON
              </button>
              <button className="btn btn-xs" onClick={exportCsv} disabled={!filtered.length}>
                <Download size={12} /> CSV
              </button>
              <button className="btn btn-xs btn-primary" onClick={exportReport} disabled={!events.length}>
                <Download size={12} /> Demo report
              </button>
            </div>
          }
        >
          <div className="flex flex-wrap gap-1.5 p-2 border-b border-graphite-700">
            <input className="input !w-44 !py-0.5 !text-[11px]" placeholder="Search title / detail / target" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
            <select className="select !w-auto !py-0.5 !text-[11px]" value={ride} onChange={(e) => setRide(e.target.value)} aria-label="Ride filter">
              <option value="all">All rides</option>
              {RIDES.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <select className="select !w-auto !py-0.5 !text-[11px]" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | 'all')} aria-label="Severity filter">
              <option value="all">All severities</option>
              <option value="concern">Simulated concern</option>
              <option value="review">Review required</option>
              <option value="info">Info</option>
            </select>
            <select className="select !w-auto !py-0.5 !text-[11px]" value={status} onChange={(e) => setStatus(e.target.value as AlertStatus | 'all')} aria-label="Review status filter">
              <option value="all">Any review status</option>
              {(Object.keys(STATUS_LABEL) as AlertStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <select className="select !w-auto !py-0.5 !text-[11px]" value={type} onChange={(e) => setType(e.target.value as EventType | 'all')} aria-label="Event type filter">
              <option value="all">All event types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-graphite-300">
              from <input type="time" step="1" className="input !w-28 !py-0.5 !text-[11px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From time" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-graphite-300">
              to <input type="time" step="1" className="input !w-28 !py-0.5 !text-[11px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To time" />
            </label>
          </div>
          {exportNote && (
            <div className="p-2 border-b border-graphite-700">
              <Notice tone="warn">{exportNote}</Notice>
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState title="No events match" hint="Adjust the filters or run a scenario to generate records." />
          ) : (
            <div className="overflow-auto max-h-[620px]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Time</th>
                    <th>Ride</th>
                    <th>Cam</th>
                    <th>Target</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Sev.</th>
                    <th>Conf.</th>
                    <th>Sensor</th>
                    <th>Review</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className={tampered === e.id ? 'bg-red-950/30' : ''} title={`${e.detail}\nEvidence: ${e.evidenceRef}`}>
                      <td className="mono">{e.id}</td>
                      <td className="mono text-graphite-300">{simClock(e.simMs)}</td>
                      <td className="nowrap">{getRide(e.rideId).name}</td>
                      <td className="mono">{e.cameraId ?? '—'}</td>
                      <td className="mono">{targetText(e)}</td>
                      <td><Badge tone="slate">{e.type.replace(/_/g, ' ')}</Badge></td>
                      <td className="max-w-[260px] truncate">{e.title}</td>
                      <td><SeverityBadge severity={e.severity} /></td>
                      <td className="mono">{e.confidence !== undefined ? `${Math.round(e.confidence * 100)}%` : '—'}</td>
                      <td className="mono text-[10.5px]">{e.sensor ? e.sensor.reading.replace('_', ' ') : '—'}</td>
                      <td>{e.reviewStatus ? <StatusBadge status={e.reviewStatus} /> : '—'}</td>
                      <td className="mono text-[10px] text-graphite-400">{e.hash ? e.hash.slice(0, 10) : 'pending…'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Tamper-evident log · SHA-256 hash chain (demonstration)" className="col-span-12 xl:col-span-4" bodyClassName="p-3 flex flex-col gap-3">
          <div className="text-[11.5px] text-graphite-200">
            Each record stores the SHA-256 of its own canonical content plus the previous record's hash, computed in the browser with the Web Crypto API. Editing any record breaks every subsequent link.
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Chain length</div>
              <div className="num text-lg font-semibold">{events.length}</div>
            </div>
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Head hash</div>
              <div className="mono text-[10px] break-all">{events[events.length - 1]?.hash?.slice(0, 24) ?? '—'}…</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-primary" onClick={runVerify} disabled={!events.length || pending > 0}>
              <ShieldCheck size={13} /> Verify chain
            </button>
            <button className="btn btn-amber" onClick={doTamper} disabled={!events.length}>
              <Hammer size={13} /> Tamper with a record
            </button>
            <button className="btn" onClick={() => { void rehash().then(() => { setTampered(null); setVerification(null); }); }} disabled={!events.length} title="Recompute every hash (shows that whoever controls the store can rewrite the chain — hence not a forensic system)">
              <Wrench size={13} /> Re-hash (repair)
            </button>
          </div>
          {pending > 0 && <div className="text-[11px] text-graphite-400">Hashing {pending} new record{pending === 1 ? '' : 's'}…</div>}
          {verification && (
            <div className={`rounded border p-2.5 text-[11.5px] ${verification.valid ? 'border-signal-green-dim bg-green-950/20' : 'border-signal-red-dim bg-red-950/20'}`}>
              <div className="flex items-center gap-2 font-semibold">
                {verification.valid ? <ShieldCheck size={14} className="text-signal-green" /> : <ShieldOff size={14} className="text-signal-red" />}
                {verification.valid ? `Chain intact — ${verification.checked} records verified` : `Chain broken at record ${verification.brokenAt! + 1} (${verification.brokenId})`}
              </div>
              {!verification.valid && <div className="mt-1 text-graphite-200">{verification.reason}</div>}
            </div>
          )}
          {tampered && <Notice tone="warn">Record {tampered} was modified locally. Run “Verify chain” to see the break detected. Use “Re-hash” to restore a consistent chain.</Notice>}
          <Notice>This demonstrates tamper-evident logging only. It is not a production-grade, immutable or forensic system: records live in browser storage and anyone with access can re-hash them.</Notice>
        </Panel>
      </div>
    </div>
  );
}
