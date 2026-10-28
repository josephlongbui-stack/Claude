import { useEffect, useState } from 'react';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { CameraView } from '@/features/monitor/CameraView';
import { SeatMap } from '@/features/monitor/SeatMap';
import { SeatInspector } from '@/features/monitor/SeatInspector';
import { ObservationTimeline } from '@/features/monitor/ObservationTimeline';
import { AlertQueue } from '@/features/monitor/AlertQueue';
import { SensorFusionPanel } from '@/features/monitor/SensorFusionPanel';
import { UncertaintyControls } from '@/features/monitor/UncertaintyControls';
import { NarrationStrip } from '@/features/monitor/NarrationStrip';
import { Badge, Panel } from '@/components/ui';
import type { Alert, ScenarioId } from '@/domain/types';
import { useNavigate } from 'react-router-dom';

export default function LiveRideMonitor() {
  const rideId = useSimulationStore((s) => s.rideId);
  const seats = useSimulationStore((s) => s.seats);
  const selectedSeatId = useSimulationStore((s) => s.selectedSeatId);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const selectSeat = useSimulationStore((s) => s.selectSeat);
  const selectAlert = useSimulationStore((s) => s.selectAlert);
  const loadScenario = useSimulationStore((s) => s.loadScenario);
  const [focusCam, setFocusCam] = useState<string | null>(null);
  const navigate = useNavigate();
  const ride = getRide(rideId);

  useEffect(() => {
    if (ride.geometry.kind === 'slide') navigate('/water-slide', { replace: true });
  }, [ride, navigate]);

  const onInspect = (a: Alert): void => {
    selectAlert(a.id);
    if (a.target.kind === 'seat') selectSeat(a.target.seatId);
    setFocusCam(a.cameraId);
    document.getElementById('seat-inspector')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (ride.geometry.kind === 'slide') return null;

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <NarrationStrip />
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base font-semibold">{ride.name}</h1>
        <Badge tone="slate">{ride.typeLabel}</Badge>
        <Badge tone="slate">{ride.restraintLabel}</Badge>
        <Badge tone="slate">{ride.geometry.rows * ride.geometry.seatsPerRow} seats · {ride.cameras.length} cameras</Badge>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-semibold mr-1">Scenarios</span>
          {ride.scenarios.map((s) => (
            <button key={s.id} className={`btn btn-xs ${scenarioId === s.id ? 'btn-primary' : ''}`} title={s.description} onClick={() => loadScenario(s.id as ScenarioId, { autoplay: true, rideId })}>
              {s.id} · {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-3">
          <div className={`grid gap-2 ${ride.cameras.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {ride.cameras.map((c) => (
              <div key={c.id} onMouseEnter={() => setFocusCam(c.id)}>
                <CameraView cameraId={c.id} highlight={focusCam === c.id || (selectedSeatId !== null && c.coverage.includes(selectedSeatId))} onSelectSeat={(id) => selectSeat(id)} />
              </div>
            ))}
          </div>
          <ObservationTimeline />
        </div>
        <div className="col-span-12 xl:col-span-5 grid grid-cols-2 gap-3 min-h-[420px] xl:h-[640px]">
          <Panel title={`${ride.geometry.kind === 'train' ? 'Train' : ride.geometry.unitLabel ?? 'Ride'} seat map`} className="col-span-1" bodyClassName="p-3 h-full">
            <SeatMap ride={ride} seats={seats} selectedSeatId={selectedSeatId} onSelect={(id) => selectSeat(id)} />
          </Panel>
          <div id="seat-inspector" className="col-span-1 min-h-0">
            <SeatInspector onFocusCamera={setFocusCam} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-5 min-h-[300px] max-h-[520px]">
          <AlertQueue rideId={rideId} onInspect={onInspect} />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-4 min-h-[300px] max-h-[520px]">
          <SensorFusionPanel />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-3 min-h-[300px]">
          <UncertaintyControls />
        </div>
      </div>

      <Panel title="Applicable observation checklist (simulated)" bodyClassName="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {ride.checklist.map((c) => (
            <div key={c.id} className="rounded border border-graphite-700 bg-graphite-800 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium">{c.label}</span>
                <Badge tone="slate">{c.category}</Badge>
              </div>
              <div className="text-[11px] text-graphite-300 mt-0.5">{c.description}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
