import { useMemo, useState } from 'react';
import { Download, FileJson, Hammer, ShieldCheck, ShieldOff, Wrench } from 'lucide-react';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { RIDES, getRide } from '@/domain/rides/configs';
import type { AlertStatus } from '@/domain/types';
import { ALERT_TYPE_LABEL, STATUS_LABEL, isOpen } from '@/domain/review/workflow';
import { eventsToCsv, eventsToJson, downloadText } from '@/domain/evidence/export';
import { verifyChain, type ChainVerification } from '@/domain/evidence/chain';
import { AlertCard, alertTargetLabel } from '@/features/monitor/AlertCard';
import { EmptyState, Notice, Panel, SectionTitle, SeverityBadge, StatTile, StatusBadge, Tabs } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';

type Tab = 'reviews' | 'log';

export default function ReviewLog() {
  const [tab, setTab] = useState<Tab>('reviews');
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Every camera flag, what a person decided, and a tamper-evident record of it all. Reviewing a flag records a human decision; it never certifies a rider as safe.">Review Log</SectionTitle>
      <Tabs
        tabs={[
          { id: 'reviews', label: 'Reviews' },
          { id: 'log', label: 'Event log' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'reviews' ? <Reviews /> : <EventLog />}
    </div>
  );
}

function Reviews() {
  const alerts = useRecordsStore((s) => s.alerts);
  const selectedId = useSimulationStore((s) => s.selectedAlertId);
  const selectAlert = useSimulationStore((s) => s.selectAlert);
  const [ride, setRide] = useState('all');
  const [status, setStatus] = useState<AlertStatus | 'all'>('all');

  const filtered = useMemo(() => alerts.filter((a) => (ride === 'all' || a.rideId === ride) && (status === 'all' || a.status === status)).sort((a, b) => b.createdMs - a.createdMs), [alerts, ride, status]);
  const selected = alerts.find((a) => a.id === selectedId) ?? filtered[0];
  const open = alerts.filter(isOpen).length;
  const reviewed = alerts.filter((a) => a.status === 'reviewed').length;
  const falseAlarms = alerts.filter((a) => a.status === 'false_alarm').length;
  const actionTimes = alerts.filter((a) => a.status !== 'open').map((a) => (a.updatedMs - a.createdMs) / 1000);
  const avgAction = actionTimes.length ? actionTimes.reduce((x, y) => x + y, 0) / actionTimes.length : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Waiting" value={open} tone={open ? 'amber' : 'green'} sub="open or acknowledged" />
        <StatTile label="Reviewed" value={reviewed} />
        <StatTile label="False alarms" value={falseAlarms} />
        <StatTile label="Average time to first action" value={actionTimes.length ? `${Math.round(avgAction)} s` : '—'} sub="simulated clock" />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel
          title={`Flags · ${filtered.length}`}
          className="col-span-12 xl:col-span-7"
          bodyClassName="p-0 overflow-auto max-h-[560px]"
          actions={
            <>
              <select className="select !w-auto !py-0.5 !text-[11px]" value={ride} onChange={(e) => setRide(e.target.value)} aria-label="Filter by ride">
                <option value="all">All rides</option>
                {RIDES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select className="select !w-auto !py-0.5 !text-[11px]" value={status} onChange={(e) => setStatus(e.target.value as AlertStatus | 'all')} aria-label="Filter by status">
                <option value="all">Any status</option>
                {(Object.keys(STATUS_LABEL) as AlertStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState title="No flags yet" hint="Run a scenario on the Live Monitor or Water Slide to create some." />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ride</th>
                  <th>Where</th>
                  <th>What</th>
                  <th>Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className={`cursor-pointer ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => selectAlert(a.id)}>
                    <td className="mono text-graphite-300">{simClock(a.createdMs)}</td>
                    <td className="nowrap">{getRide(a.rideId).name}</td>
                    <td>{alertTargetLabel(a)}</td>
                    <td>{ALERT_TYPE_LABEL[a.type]}</td>
                    <td>
                      <SeverityBadge severity={a.severity} />
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <div className="col-span-12 xl:col-span-5">{selected ? <AlertCard alert={selected} /> : <Panel title="Flag">{<EmptyState title="Pick a flag" hint="Its details and review buttons appear here." />}</Panel>}</div>
      </div>
    </>
  );
}

function EventLog() {
  const events = useRecordsStore((s) => s.events);
  const pending = useRecordsStore((s) => s.pendingHashes);
  const tamper = useRecordsStore((s) => s.tamperEvent);
  const rehash = useRecordsStore((s) => s.rehashAll);
  const [ride, setRide] = useState('all');
  const [q, setQ] = useState('');
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [tampered, setTampered] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      events
        .filter((e) => (ride === 'all' || e.rideId === ride) && (!q || `${e.title} ${e.detail} ${e.id}`.toLowerCase().includes(q.toLowerCase())))
        .slice()
        .reverse(),
    [events, ride, q],
  );

  const offer = (filename: string, text: string, mime: string): void => {
    setExportNote(null);
    void downloadText(filename, text, mime).then((r) => {
      if (r === 'unavailable') setExportNote('Downloads are not available in this view.');
    });
  };

  const runVerify = async (): Promise<void> => {
    const st = useRecordsStore.getState();
    setVerification(await verifyChain(st.events, st.anchorHash));
  };

  const doTamper = (): void => {
    const target = events.find((e) => e.type === 'alert_reviewed') ?? events[Math.floor(events.length / 2)];
    if (!target) return;
    tamper(target.id, { detail: `${target.detail} [edited after the fact]` });
    setTampered(target.id);
    setVerification(null);
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel
        title={`Events · ${filtered.length}`}
        className="col-span-12 xl:col-span-8"
        bodyClassName="p-0 flex flex-col"
        actions={
          <>
            <button className="btn btn-xs" onClick={() => offer(`rideops-events-${Date.now()}.json`, eventsToJson(filtered), 'application/json')} disabled={!filtered.length}>
              <FileJson size={12} /> JSON
            </button>
            <button className="btn btn-xs" onClick={() => offer(`rideops-events-${Date.now()}.csv`, eventsToCsv(filtered), 'text/csv')} disabled={!filtered.length}>
              <Download size={12} /> CSV
            </button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5 p-2 border-b border-graphite-700">
          <input className="input !w-56 !py-0.5 !text-[11px]" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
          <select className="select !w-auto !py-0.5 !text-[11px]" value={ride} onChange={(e) => setRide(e.target.value)} aria-label="Ride filter">
            <option value="all">All rides</option>
            {RIDES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {exportNote && (
          <div className="p-2 border-b border-graphite-700">
            <Notice tone="warn">{exportNote}</Notice>
          </div>
        )}
        {filtered.length === 0 ? (
          <EmptyState title="No events" hint="Events appear as scenarios run." />
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ride</th>
                  <th>Event</th>
                  <th>Review</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className={tampered === e.id ? 'bg-red-950/30' : ''} title={e.detail}>
                    <td className="mono text-graphite-300">{simClock(e.simMs)}</td>
                    <td className="nowrap">{getRide(e.rideId).name}</td>
                    <td className={e.severity === 'concern' ? 'text-signal-red' : e.severity === 'review' ? 'text-signal-amber' : ''}>{e.title}</td>
                    <td>{e.reviewStatus ? <StatusBadge status={e.reviewStatus} /> : <span className="text-graphite-500">—</span>}</td>
                    <td className="mono text-[10px] text-graphite-400">{e.hash ? e.hash.slice(0, 10) : 'pending…'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Tamper check" className="col-span-12 xl:col-span-4" bodyClassName="p-3 flex flex-col gap-3">
        <p className="text-[11.5px] text-graphite-200">Each event stores a SHA-256 fingerprint of itself plus the previous event, so editing any record breaks the chain after it.</p>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn btn-primary" onClick={runVerify} disabled={!events.length || pending > 0}>
            <ShieldCheck size={13} /> Verify chain
          </button>
          <button className="btn btn-amber" onClick={doTamper} disabled={!events.length}>
            <Hammer size={13} /> Tamper with a record
          </button>
          <button
            className="btn"
            onClick={() => {
              void rehash().then(() => {
                setTampered(null);
                setVerification(null);
              });
            }}
            disabled={!events.length}
            title="Recompute every fingerprint"
          >
            <Wrench size={13} /> Re-hash
          </button>
        </div>
        {pending > 0 && <div className="text-[11px] text-graphite-400">Fingerprinting {pending} new record{pending === 1 ? '' : 's'}…</div>}
        {verification && (
          <div className={`rounded border p-2.5 text-[11.5px] ${verification.valid ? 'border-signal-green-dim bg-green-950/20' : 'border-signal-red-dim bg-red-950/20'}`}>
            <div className="flex items-center gap-2 font-semibold">
              {verification.valid ? <ShieldCheck size={14} className="text-signal-green" /> : <ShieldOff size={14} className="text-signal-red" />}
              {verification.valid ? `Chain intact — ${verification.checked} records checked` : `Chain broken at ${verification.brokenId}`}
            </div>
            {!verification.valid && <div className="mt-1 text-graphite-200">{verification.reason}</div>}
          </div>
        )}
        <Notice>This shows how tamper-evident logging works. It is not a forensic system: the records live in this browser and anyone with access could re-hash them.</Notice>
      </Panel>
    </div>
  );
}
