import { useSettingsStore } from '@/store/settings';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { Panel, Slider } from '@/components/ui';

/** Lets a visitor stage a condition and watch the system respond conservatively. */
export function TryConditions() {
  const threshold = useSettingsStore((s) => s.evaluator.confidenceThreshold);
  const setEvaluator = useSettingsStore((s) => s.setEvaluator);
  const rideId = useSimulationStore((s) => s.rideId);
  const { injectRestraintConcern, injectLooseObject, injectOcclusion, injectLowConfidence, injectSensorDisagreement } = useSimulationStore.getState();
  const ride = getRide(rideId);
  const hasSensor = ride.sensors.some((s) => s.perSeat);

  return (
    <Panel title="Try it" bodyClassName="p-3 flex flex-col gap-3" className="h-full">
      <p className="text-[11.5px] text-graphite-300">Stage a condition on the current cycle. Anything the system can't see clearly is shown as Unknown and sent to a person; it is never assumed to be fine.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn btn-xs" onClick={injectRestraintConcern}>Move a restraint</button>
        <button className="btn btn-xs" onClick={injectLooseObject}>Add a phone</button>
        <button className="btn btn-xs" onClick={injectOcclusion}>Block a camera</button>
        <button className="btn btn-xs" onClick={injectLowConfidence}>Lower confidence</button>
        <button className="btn btn-xs col-span-2" onClick={injectSensorDisagreement} disabled={!hasSensor} title={hasSensor ? undefined : 'This ride has no seat sensors'}>
          Make the sensor disagree
        </button>
      </div>
      <Slider label="Confidence needed to call a seat" value={threshold} min={0.4} max={0.95} step={0.01} onChange={(v) => setEvaluator({ confidenceThreshold: v })} format={(v) => `${Math.round(v * 100)}%`} />
    </Panel>
  );
}
