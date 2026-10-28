import { useEffect, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { getRide, WATER_SLIDE_RIDE_ID } from '@/domain/rides/configs';
import { SlideCameraView } from '@/features/slide/SlideCameraView';
import { SlideDiagram } from '@/features/slide/SlideDiagram';
import { SlideAnalytics } from '@/features/slide/SlideAnalytics';
import { AlertQueue } from '@/features/monitor/AlertQueue';
import { NarrationStrip } from '@/features/monitor/NarrationStrip';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';
import type { Alert, ScenarioId } from '@/domain/types';

export default function WaterSlideMonitor() {
  const rideId = useSimulationStore((s) => s.rideId);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const setRide = useSimulationStore((s) => s.setRide);
  const loadScenario = useSimulationStore((s) => s.loadScenario);
  const injectExit = useSimulationStore((s) => s.injectSlideExitProlonged);
  const selectAlert = useSimulationStore((s) => s.selectAlert);
  const events = useRecordsStore((s) => s.events);
  const ride = getRide(WATER_SLIDE_RIDE_ID);

  useEffect(() => {
    if (rideId !== WATER_SLIDE_RIDE_ID) setRide(WATER_SLIDE_RIDE_ID, { autoplay: true });
  }, [rideId, setRide]);

  const entryEvents = useMemo(() => events.filter((e) => e.rideId === WATER_SLIDE_RIDE_ID && (e.type === 'slide_entry' || e.type === 'slide_departure')).slice(-8).reverse(), [events]);
  const exitEvents = useMemo(() => events.filter((e) => e.rideId === WATER_SLIDE_RIDE_ID && (e.type === 'slide_exit' || (e.type === 'alert_raised' && e.title.includes('Exit')) || e.type === 'alert_acknowledged' || e.type === 'alert_reviewed')).slice(-8).reverse(), [events]);

  const onInspect = (a: Alert): void => selectAlert(a.id);

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <NarrationStrip />
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base font-semibold">{ride.name}</h1>
        <Badge tone="slate">{ride.typeLabel}</Badge>
        <Badge tone="slate">2 synchronized cameras</Badge>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-semibold mr-1">Scenarios</span>
          {ride.scenarios.map((s) => (
            <button key={s.id} className={`btn btn-xs ${scenarioId === s.id ? 'btn-primary' : ''}`} title={s.description} onClick={() => loadScenario(s.id as ScenarioId, { autoplay: true, rideId: WATER_SLIDE_RIDE_ID })}>
              {s.id} · {s.label}
            </button>
          ))}
          <button className="btn btn-xs btn-amber" onClick={injectExit} title="Stage an exit-zone occupancy condition now">
            <Zap size={12} /> Inject exit-zone occupancy
          </button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <SlideCameraView view="entrance" />
            <SlideCameraView view="exit" />
          </div>
          <Panel title="Slide schematic · rider positions (simulated)" bodyClassName="p-2">
            <SlideDiagram />
          </Panel>
        </div>
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-3 min-h-0">
          <Panel title="Camera A · entry event history" bodyClassName="p-0 overflow-auto max-h-[190px]">
            {entryEvents.length === 0 ? (
              <EmptyState title="No entry events yet" hint="Entry reviews and departures appear here as the scenario runs." />
            ) : (
              <table className="tbl">
                <tbody>
                  {entryEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="mono text-graphite-300 w-16">{simClock(e.simMs)}</td>
                      <td>{e.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Camera B · exit zone events" bodyClassName="p-0 overflow-auto max-h-[190px]">
            {exitEvents.length === 0 ? (
              <EmptyState title="No exit events yet" hint="Exit-zone occupancy, prolonged-occupancy alerts and reviews appear here." />
            ) : (
              <table className="tbl">
                <tbody>
                  {exitEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="mono text-graphite-300 w-16">{simClock(e.simMs)}</td>
                      <td className={e.severity === 'review' ? 'text-signal-amber' : ''}>{e.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <div className="flex-1 min-h-[260px] max-h-[420px]">
            <AlertQueue rideId={WATER_SLIDE_RIDE_ID} onInspect={onInspect} />
          </div>
        </div>
      </div>
      <SlideAnalytics />
      <p className="text-[10.5px] text-graphite-400">Status displayed on this screen is informational within the simulation. No slide clearance signal, rider-release control or operational timing instruction is implemented.</p>
    </div>
  );
}
