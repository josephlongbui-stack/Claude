import { useMemo } from 'react';
import { MousePointerClick } from 'lucide-react';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { seatLabel } from '@/domain/rides/seats';
import { Badge, EmptyState, Panel, SeatStateBadge } from '@/components/ui';
import { AlertCard } from './AlertCard';
import { simClock } from '@/domain/simulation/clock';
import { isOpen } from '@/domain/review/workflow';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[11.5px] py-1 border-b border-graphite-750 last:border-0">
      <span className="text-graphite-300">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function SeatInspector() {
  const rideId = useSimulationStore((s) => s.rideId);
  const seatId = useSimulationStore((s) => s.selectedSeatId);
  const seat = useSimulationStore((s) => (s.selectedSeatId ? s.seats[s.selectedSeatId] : undefined));
  const sensor = useSimulationStore((s) => (s.selectedSeatId ? s.sensors[s.selectedSeatId] : undefined));
  const fusion = useSimulationStore((s) => (s.selectedSeatId ? s.fusion[s.selectedSeatId] : undefined));
  // Seat history is stamped in scenario time; shift it onto the session clock used everywhere else.
  const clockOffset = useSimulationStore((s) => s.sessionMs - s.simMs);
  const allAlerts = useRecordsStore((s) => s.alerts);
  const openAlerts = useMemo(() => allAlerts.filter((a) => a.rideId === rideId && a.target.kind === 'seat' && a.target.seatId === seatId && isOpen(a)), [allAlerts, rideId, seatId]);
  const ride = getRide(rideId);

  if (!seatId || !seat) {
    return (
      <Panel title="Seat" className="h-full">
        <EmptyState icon={<MousePointerClick size={20} />} title="Pick a seat" hint="Click a seat on the map or in a camera view to see what the camera sees and review it." />
      </Panel>
    );
  }

  const confPct = Math.round(seat.confidence * 100);
  return (
    <Panel title={`Seat · ${seatLabel(ride, seatId)}`} className="h-full" bodyClassName="p-3 overflow-y-auto">
      <div className="mb-2">
        <SeatStateBadge state={seat.state} />
      </div>
      <Row k="Occupied" v={seat.occupancy === 'occupied' ? 'Yes' : seat.occupancy === 'empty' ? 'No' : 'Unknown'} />
      <Row k={ride.restraintLabel} v={<span className="capitalize">{seat.restraint === 'not_applicable' ? 'up' : seat.restraint}</span>} />
      <Row k="Loose object" v={seat.looseObject === 'none' ? 'None' : <span className="capitalize">{seat.looseObject}</span>} />
      <Row k="Camera" v={<span className="mono">{seat.cameraId} · {confPct}% sure{seat.occluded ? ' · blocked' : ''}</span>} />
      {sensor && fusion && (
        <Row
          k="Sensor (fictional)"
          v={
            <span className="flex items-center gap-1.5 justify-end">
              <span className="capitalize">{sensor.reading.replace('_', ' ')}</span>
              <Badge tone={fusion.agreement === 'agree' ? 'green' : fusion.agreement === 'disagree' ? 'red' : 'slate'}>{fusion.agreement === 'not_applicable' ? 'n/a' : fusion.agreement}</Badge>
            </span>
          }
        />
      )}
      <p className="text-[11px] text-graphite-300 mt-2">{seat.reasons[0]}</p>

      {openAlerts.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {openAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} dense />
          ))}
        </div>
      )}

      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mt-3 mb-1">History</div>
      <ol className="text-[11px] flex flex-col gap-0.5">
        {[...seat.history].reverse().slice(0, 6).map((h, i) => (
          <li key={i} className="flex gap-2 items-center min-w-0">
            <span className="mono text-graphite-400 w-14 shrink-0">{simClock(clockOffset + h.atMs)}</span>
            <span className="shrink-0">
              <SeatStateBadge state={h.state} compact />
            </span>
            <span className="text-graphite-300 truncate min-w-0 flex-1">{h.note}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
