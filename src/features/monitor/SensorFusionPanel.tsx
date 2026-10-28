import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { shortSeatLabel } from '@/domain/rides/seats';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';

export function SensorFusionPanel() {
  const rideId = useSimulationStore((s) => s.rideId);
  const fusion = useSimulationStore((s) => s.fusion);
  const sensors = useSimulationStore((s) => s.sensors);
  const seats = useSimulationStore((s) => s.seats);
  const sessionMs = useSimulationStore((s) => s.sessionMs);
  const simMs = useSimulationStore((s) => s.simMs);
  const inject = useSimulationStore((s) => s.injectSensorDisagreement);
  const selectSeat = useSimulationStore((s) => s.selectSeat);
  const ride = getRide(rideId);
  const perSeatSensor = ride.sensors.find((s) => s.perSeat && (s.kind === 'restraint_position' || s.kind === 'harness_lock'));

  const rows = useMemo(() => {
    const all = Object.values(fusion);
    const ranked = all.sort((a, b) => {
      const rank = (x: typeof a): number => (x.agreement === 'disagree' ? 0 : x.agreement === 'insufficient' ? 1 : x.agreement === 'agree' ? 2 : 3);
      return rank(a) - rank(b) || a.seatId.localeCompare(b.seatId);
    });
    return ranked.filter((f) => seats[f.seatId]?.occupancy === 'occupied' || f.agreement === 'disagree').slice(0, 8);
  }, [fusion, seats]);

  const disagreements = Object.values(fusion).filter((f) => f.agreement === 'disagree').length;

  return (
    <Panel
      title={
        <>
          Simulated sensor fusion {disagreements > 0 && <span className="badge badge-red ml-1">{disagreements} disagree</span>}
        </>
      }
      actions={
        <button className="btn btn-xs btn-amber" onClick={inject} disabled={!perSeatSensor} title="Inject a synthetic reading that conflicts with the camera observation">
          <Zap size={12} /> Inject disagreement
        </button>
      }
      bodyClassName="p-0 overflow-auto"
      className="h-full"
    >
      {!perSeatSensor ? (
        <EmptyState title="No per-seat sensor adapter configured" hint={`${ride.name} has ${ride.sensors.map((s) => s.label).join(', ') || 'no'} fictional adapters. Per-seat fusion is shown for rides with restraint or harness adapters.`} />
      ) : rows.length === 0 ? (
        <EmptyState title="No occupied seats to compare" hint="Fusion rows appear once riders board and restraints are lowered." />
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Seat</th>
              <th>Sensor</th>
              <th>Camera</th>
              <th>Reading</th>
              <th>Agreement</th>
              <th>Conf.</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const s = sensors[f.seatId];
              return (
                <tr key={f.seatId} className="cursor-pointer" onClick={() => selectSeat(f.seatId)} title={f.recommendation}>
                  <td className="mono">{shortSeatLabel(ride, f.seatId)}</td>
                  <td>
                    <Badge tone={s?.status === 'online' ? 'green' : s?.status === 'degraded' ? 'amber' : 'slate'}>{s?.status ?? 'offline'}</Badge>
                  </td>
                  <td className="capitalize">{f.cameraRestraint.replace('_', ' ')}</td>
                  <td className="capitalize">{f.sensorReading.replace('_', ' ')}</td>
                  <td>
                    <Badge tone={f.agreement === 'agree' ? 'green' : f.agreement === 'disagree' ? 'red' : 'slate'}>{f.agreement === 'disagree' ? 'disagree · review' : f.agreement.replace('_', ' ')}</Badge>
                  </td>
                  <td className="mono">{Math.round(f.cameraConfidence * 100)}%</td>
                  <td className="mono text-graphite-300">{simClock(sessionMs - (simMs - f.atMs))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-graphite-400 px-3 py-2">Read-only fictional adapter. No sensor is connected and nothing here verifies a restraint. Disagreement always routes to human review.</p>
    </Panel>
  );
}
