import { useMemo, useState } from 'react';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { RIDES, getRide } from '@/domain/rides/configs';
import { ALERT_TYPE_LABEL, STATUS_LABEL, isOpen } from '@/domain/review/workflow';
import type { AlertStatus, AlertType, Severity } from '@/domain/types';
import { AlertCard, alertTargetLabel } from '@/features/monitor/AlertCard';
import { EmptyState, Panel, SectionTitle, SeverityBadge, StatTile, StatusBadge, pct } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';
import { useNavigate } from 'react-router-dom';
import { ALL_ALERT_TYPES } from '@/store/settings';
import { mean } from '@/domain/analytics/dispatch';

export default function SafetyReview() {
  const alerts = useRecordsStore((s) => s.alerts);
  const selectedId = useSimulationStore((s) => s.selectedAlertId);
  const selectAlert = useSimulationStore((s) => s.selectAlert);
  const navigate = useNavigate();
  const [ride, setRide] = useState<string>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [status, setStatus] = useState<AlertStatus | 'all'>('all');
  const [type, setType] = useState<AlertType | 'all'>('all');

  const filtered = useMemo(() => alerts.filter((a) => (ride === 'all' || a.rideId === ride) && (severity === 'all' || a.severity === severity) && (status === 'all' || a.status === status) && (type === 'all' || a.type === type)).sort((a, b) => b.createdMs - a.createdMs), [alerts, ride, severity, status, type]);
  const selected = alerts.find((a) => a.id === selectedId) ?? filtered[0];

  const open = alerts.filter(isOpen).length;
  const reviewed = alerts.filter((a) => a.status === 'reviewed').length;
  const falseAlarms = alerts.filter((a) => a.status === 'false_alarm').length;
  const closed = reviewed + falseAlarms;
  const ackTimes = alerts.filter((a) => a.status !== 'open').map((a) => (a.updatedMs - a.createdMs) / 1000);

  const openMonitor = (rideId: string, seatId?: string): void => {
    const r = getRide(rideId);
    useSimulationStore.getState().setRide(rideId, { autoplay: true });
    if (seatId) useSimulationStore.getState().selectSeat(seatId);
    navigate(r.geometry.kind === 'slide' ? '/water-slide' : '/live-monitor');
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Every simulated observation flagged for a human, across all attractions. Review actions are recorded in the hash-chained event log. No action here certifies a rider as safe.">Safety Review</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3" label="Open / acknowledged" value={open} tone={open ? 'amber' : 'green'} sub="awaiting human closure" />
        <StatTile className="col-span-6 md:col-span-3" label="Reviewed" value={reviewed} sub="human-recorded outcomes" />
        <StatTile className="col-span-6 md:col-span-3" label="False-alarm share" value={closed ? pct(falseAlarms / closed) : '—'} sub={`${falseAlarms} of ${closed} closed`} />
        <StatTile className="col-span-6 md:col-span-3" label="Median time to first action" value={ackTimes.length ? `${Math.round(mean(ackTimes))}s` : '—'} sub="simulated clock" />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel
          title={`Review queue · ${filtered.length}`}
          className="col-span-12 xl:col-span-7"
          bodyClassName="p-0 flex flex-col min-h-[420px]"
          actions={
            <div className="flex gap-1.5">
              <select className="select !w-auto !py-0.5 !text-[11px]" value={ride} onChange={(e) => setRide(e.target.value)} aria-label="Filter by ride">
                <option value="all">All rides</option>
                {RIDES.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <select className="select !w-auto !py-0.5 !text-[11px]" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | 'all')} aria-label="Filter by severity">
                <option value="all">All severities</option>
                <option value="concern">Simulated concern</option>
                <option value="review">Review required</option>
                <option value="info">Info</option>
              </select>
              <select className="select !w-auto !py-0.5 !text-[11px]" value={status} onChange={(e) => setStatus(e.target.value as AlertStatus | 'all')} aria-label="Filter by status">
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_LABEL) as AlertStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <select className="select !w-auto !py-0.5 !text-[11px]" value={type} onChange={(e) => setType(e.target.value as AlertType | 'all')} aria-label="Filter by type">
                <option value="all">All types</option>
                {ALL_ALERT_TYPES.map((t) => (
                  <option key={t} value={t}>{ALERT_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState title="No alerts match these filters" hint="Run a scenario from the Live Ride Monitor or Water Slide Monitor to generate review items." />
          ) : (
            <div className="overflow-auto max-h-[560px]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Time</th>
                    <th>Ride</th>
                    <th>Target</th>
                    <th>Observation</th>
                    <th>Severity</th>
                    <th>Conf.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className={`cursor-pointer ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => selectAlert(a.id)}>
                      <td className="mono">{a.id}</td>
                      <td className="mono text-graphite-300">{simClock(a.createdMs)}</td>
                      <td>{getRide(a.rideId).name}</td>
                      <td>{alertTargetLabel(a)}</td>
                      <td>{ALERT_TYPE_LABEL[a.type]}</td>
                      <td><SeverityBadge severity={a.severity} /></td>
                      <td className="mono">{Math.round(a.confidence * 100)}%</td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Incident review" className="col-span-12 xl:col-span-5" bodyClassName="p-3 overflow-auto max-h-[640px]">
          {!selected ? (
            <EmptyState title="Select an alert" hint="The review controls, notes and evidence reference appear here." />
          ) : (
            <div className="flex flex-col gap-3">
              <AlertCard alert={selected} onInspect={(a) => openMonitor(a.rideId, a.target.kind === 'seat' ? a.target.seatId : undefined)} />
              <div className="text-[11px] text-graphite-300 rounded border border-graphite-700 p-2.5">
                <div className="font-semibold text-graphite-200 mb-1">Scenario evidence reference</div>
                <div className="mono">{selected.evidenceRef}</div>
                <div className="mt-1">Scenario {selected.scenarioId} · {getRide(selected.rideId).name} · {selected.cameraId}. The reference points to synthetic frames inside this demo; no real recording exists.</div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
