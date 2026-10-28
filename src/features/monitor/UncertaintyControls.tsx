import { useSettingsStore } from '@/store/settings';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { Panel, Slider } from '@/components/ui';

export function UncertaintyControls() {
  const evaluator = useSettingsStore((s) => s.evaluator);
  const setEvaluator = useSettingsStore((s) => s.setEvaluator);
  const rideId = useSimulationStore((s) => s.rideId);
  const cameras = useSimulationStore((s) => s.cameras);
  const { injectOcclusion, injectLowConfidence, injectLooseObject, injectRestraintConcern, injectCameraOffline, clearInjections } = useSimulationStore.getState();
  const ride = getRide(rideId);
  const isSlide = ride.geometry.kind === 'slide';

  return (
    <Panel title="Conservative uncertainty handling" bodyClassName="p-3 flex flex-col gap-3" className="h-full">
      <Slider label="Confidence threshold" value={evaluator.confidenceThreshold} min={0.4} max={0.95} step={0.01} onChange={(v) => setEvaluator({ confidenceThreshold: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Stabilisation frames" value={evaluator.stabilizationFrames} min={1} max={10} step={1} onChange={(v) => setEvaluator({ stabilizationFrames: v })} />
        <Slider label="Escalation frames" value={evaluator.escalationFrames} min={1} max={6} step={1} onChange={(v) => setEvaluator({ escalationFrames: v })} />
      </div>
      <p className="text-[10.5px] text-graphite-400 leading-snug">Seats start as Unknown. De-escalating to nominal/empty requires {evaluator.stabilizationFrames} consistent frames; escalating to review/concern requires {evaluator.escalationFrames}. Occluded or below-threshold frames can never produce an affirmative state.</p>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Inject scenario condition</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn btn-xs" onClick={injectOcclusion} disabled={isSlide}>Occlusion → {ride.stagedSeats.occluded}</button>
        <button className="btn btn-xs" onClick={injectLowConfidence} disabled={isSlide}>Low confidence → {ride.stagedSeats.sensor}</button>
        <button className="btn btn-xs" onClick={injectLooseObject} disabled={isSlide}>Loose object → {ride.stagedSeats.looseObject}</button>
        <button className="btn btn-xs" onClick={injectRestraintConcern} disabled={isSlide}>Restraint concern → {ride.stagedSeats.concern}</button>
      </div>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Camera availability (simulated)</div>
      <div className="flex flex-wrap gap-1.5">
        {ride.cameras.map((c) => (
          <button key={c.id} className={`btn btn-xs ${cameras[c.id]?.offline ? 'btn-danger' : ''}`} onClick={() => injectCameraOffline(c.id, !cameras[c.id]?.offline)}>
            {c.id} {cameras[c.id]?.offline ? 'offline' : 'online'}
          </button>
        ))}
        <button className="btn btn-xs btn-ghost ml-auto" onClick={clearInjections}>Clear injections</button>
      </div>
    </Panel>
  );
}
