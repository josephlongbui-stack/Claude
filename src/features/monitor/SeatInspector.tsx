import { useMemo } from 'react';
import { Camera, MousePointerClick } from 'lucide-react';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { seatLabel } from '@/domain/rides/seats';
import { Badge, EmptyState, Panel, SeatStateBadge } from '@/components/ui';
import { AlertCard } from './AlertCard';
import { simClock } from '@/domain/simulation/clock';
import { useSettingsStore } from '@/store/settings';
import { isOpen } from '@/domain/review/workflow';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[11.5px] py-1 border-b border-graphite-750 last:border-0">
      <span className="text-graphite-300">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function SeatInspector({ onFocusCamera }: { onFocusCamera?: (cameraId: string) => void }) {
  const rideId = useSimulationStore((s) => s.rideId);
  const seatId = useSimulationStore((s) => s.selectedSeatId);
  const seat = useSimulationStore((s) => (s.selectedSeatId ? s.seats[s.selectedSeatId] : undefined));
  const scripted = useSimulationStore((s) => (s.selectedSeatId ? s.scripted[s.selectedSeatId] : undefined));
  const sensor = useSimulationStore((s) => (s.selectedSeatId ? s.sensors[s.selectedSeatId] : undefined));
  const fusion = useSimulationStore((s) => (s.selectedSeatId ? s.fusion[s.selectedSeatId] : undefined));
  const threshold = useSettingsStore((s) => s.evaluator.confidenceThreshold);
  const allAlerts = useRecordsStore((s) => s.alerts);
  const alerts = useMemo(() => allAlerts.filter((a) => a.rideId === rideId && a.target.kind === 'seat' && a.target.seatId === seatId), [allAlerts, rideId, seatId]);
  const ride = getRide(rideId);

  if (!seatId || !seat) {
    return (
      <Panel title="Seat inspector" className="h-full">
        <EmptyState icon={<MousePointerClick size={20} />} title="Select a seat" hint="Click any seat on the train map or a detection box in a camera view to inspect its simulated observation, sensor record and review history." />
      </Panel>
    );
  }

  const openAlerts = alerts.filter(isOpen);
  const closedAlerts = alerts.filter((a) => !isOpen(a)).slice(-3).reverse();
  const confPct = Math.round(seat.confidence * 100);

  return (
    <Panel
      title={<>Seat inspector · {seatLabel(ride, seatId)}</>}
      actions={
        onFocusCamera && (
          <button className="btn btn-xs" onClick={() => onFocusCamera(seat.cameraId)}>
            <Camera size={12} /> {seat.cameraId}
          </button>
        )
      }
      className="h-full"
      bodyClassName="p-3 overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <SeatStateBadge state={seat.state} />
        <span className="text-[10.5px] text-graphite-400 mono whitespace-nowrap">{seat.frames} frames · {seat.stableFrames} stable</span>
      </div>
      {seat.state !== seat.candidate && (
        <div className="text-[10.5px] text-signal-amber mb-2">Candidate state “{seat.candidate}” pending stabilisation ({seat.stableFrames} frame{seat.stableFrames === 1 ? '' : 's'}).</div>
      )}
      <div className="mb-3">
        <Row k="Occupancy" v={<span className="capitalize">{seat.occupancy}</span>} />
        <Row k={`${ride.restraintLabel} (simulated)`} v={<Badge tone={seat.restraint === 'concern' ? 'red' : seat.restraint === 'review' || seat.restraint === 'unknown' ? 'amber' : seat.restraint === 'nominal' ? 'green' : 'slate'}>{seat.restraint.replace('_', ' ')}</Badge>} />
        <Row k="Body position" v={<span className="capitalize">{seat.posture}</span>} />
        <Row k="Loose-object status" v={<span className="capitalize">{seat.looseObject}</span>} />
        <Row
          k="Camera confidence"
          v={
            <span className="flex items-center gap-2">
              <span className="w-20 h-1.5 bg-graphite-700 rounded overflow-hidden inline-block">
                <span className="block h-full" style={{ width: `${confPct}%`, background: seat.confidence < threshold ? '#f59e0b' : '#22d3ee' }} />
              </span>
              <span className="mono">{confPct}%</span>
            </span>
          }
        />
        <Row k="Occluded" v={seat.occluded ? <Badge tone="violet">yes</Badge> : 'no'} />
        <Row k="Camera" v={<span className="mono">{seat.cameraId}</span>} />
        <Row k="Last frame" v={<span className="mono">{simClock(useSimulationStore.getState().sessionMs - (useSimulationStore.getState().simMs - seat.updatedMs))}</span>} />
        {sensor && (
          <>
            <Row k="Sensor (fictional)" v={<span className="mono">{sensor.sensorId} · {sensor.reading.replace('_', ' ')} · {sensor.status}</span>} />
            {fusion && <Row k="Camera vs sensor" v={<Badge tone={fusion.agreement === 'agree' ? 'green' : fusion.agreement === 'disagree' ? 'red' : 'slate'}>{fusion.agreement.replace('_', ' ')}</Badge>} />}
          </>
        )}
        {scripted && <Row k="Scenario script" v={<span className="text-graphite-400 text-[10.5px]">staged truth: {scripted.occupancy}/{scripted.restraint}{scripted.occluded ? '/occluded' : ''}</span>} />}
      </div>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Evaluator reasons</div>
      <ul className="text-[11px] text-graphite-200 mb-3 list-disc pl-4">
        {seat.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Observation history</div>
      <ol className="text-[11px] mb-3 flex flex-col gap-0.5">
        {[...seat.history].reverse().map((h, i) => (
          <li key={i} className="flex gap-2 items-center min-w-0">
            <span className="mono text-graphite-400 w-12 shrink-0">{simClock(h.atMs)}</span>
            <span className="shrink-0"><SeatStateBadge state={h.state} compact /></span>
            <span className="text-graphite-300 truncate min-w-0 flex-1">{h.note}</span>
          </li>
        ))}
      </ol>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Human review</div>
      {openAlerts.length === 0 && closedAlerts.length === 0 ? (
        <div className="text-[11px] text-graphite-400">No alerts recorded for this seat.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {openAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} dense />
          ))}
          {closedAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} dense />
          ))}
        </div>
      )}
      <p className="text-[10px] text-graphite-400 mt-3">Reviewing an observation records a human action. It does not certify a rider as safe and does not authorise dispatch.</p>
    </Panel>
  );
}
