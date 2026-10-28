import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { WATER_SLIDE_RIDE_ID, getRide, isSlide } from '@/domain/rides/configs';
import { SlideCameraView } from '@/features/slide/SlideCameraView';
import { SlideDiagram } from '@/features/slide/SlideDiagram';
import { SlideAnalytics } from '@/features/slide/SlideAnalytics';
import { AlertQueue } from '@/features/monitor/AlertQueue';
import { NarrationStrip } from '@/features/monitor/NarrationStrip';
import { ScenarioControls } from '@/features/monitor/ScenarioControls';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';

export default function WaterSlideMonitor() {
  const rideId = useSimulationStore((s) => s.rideId);
  const injectExit = useSimulationStore((s) => s.injectSlideExitProlonged);
  const events = useRecordsStore((s) => s.events);
  const navigate = useNavigate();
  const started = useRef(false);
  const ride = getRide(WATER_SLIDE_RIDE_ID);

  // Opening this page switches to the slide; if something later switches to another ride, follow it.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      if (!isSlide(useSimulationStore.getState().rideId)) useSimulationStore.getState().setRide(WATER_SLIDE_RIDE_ID);
      return;
    }
    if (!isSlide(useSimulationStore.getState().rideId)) navigate('/live-monitor', { replace: true });
  }, [rideId, navigate]);

  const slideEvents = useMemo(() => events.filter((e) => e.rideId === WATER_SLIDE_RIDE_ID && e.type !== 'phase').slice(-10).reverse(), [events]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base font-semibold">{ride.name}</h1>
        <Badge tone="slate">{ride.typeLabel}</Badge>
        <Badge tone="slate">2 cameras</Badge>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <ScenarioControls />
          <button className="btn btn-xs btn-amber" onClick={injectExit} title="Keep a rider in the exit zone now">
            <Zap size={12} /> Hold a rider in the exit
          </button>
        </div>
      </div>
      <NarrationStrip />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <SlideCameraView view="entrance" />
            <SlideCameraView view="exit" />
          </div>
          <Panel title="Where the riders are" bodyClassName="p-2">
            <SlideDiagram />
          </Panel>
        </div>
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-3">
          <div className="min-h-[220px] max-h-[360px]">
            <AlertQueue rideId={WATER_SLIDE_RIDE_ID} />
          </div>
          <Panel title="Slide activity" bodyClassName="p-0 overflow-auto max-h-[300px]">
            {slideEvents.length === 0 ? (
              <EmptyState title="No activity yet" hint="Entry checks, departures and exits appear here." />
            ) : (
              <table className="tbl">
                <tbody>
                  {slideEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="mono text-graphite-300 w-20">{simClock(e.simMs)}</td>
                      <td className={e.severity === 'review' ? 'text-signal-amber' : ''}>{e.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
      <SlideAnalytics />
    </div>
  );
}
