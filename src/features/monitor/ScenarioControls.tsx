import { Pause, Play, RotateCcw } from 'lucide-react';
import { useSimulationStore, SPEEDS } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import type { ScenarioId } from '@/domain/types';
import { fmtDuration } from '@/domain/simulation/clock';

/** Scenario picker and playback for the current ride. */
export function ScenarioControls() {
  const rideId = useSimulationStore((s) => s.rideId);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const playing = useSimulationStore((s) => s.playing);
  const speed = useSimulationStore((s) => s.speed);
  const simMs = useSimulationStore((s) => s.simMs);
  const durationMs = useSimulationStore((s) => s.durationMs);
  const { toggle, reset, setSpeed, loadScenario } = useSimulationStore.getState();
  const ride = getRide(rideId);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select aria-label="Scenario" className="select !w-auto !py-1 !text-[11.5px]" value={scenarioId ?? ''} onChange={(e) => loadScenario(e.target.value as ScenarioId, { autoplay: true, rideId })}>
        {ride.scenarios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button className="btn btn-xs" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button className="btn btn-xs" onClick={reset} aria-label="Restart scenario" title="Restart scenario">
        <RotateCcw size={13} />
      </button>
      <select aria-label="Speed" className="select !w-auto !py-1 !text-[11.5px]" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <span className="mono text-[11px] text-graphite-300" aria-label="Scenario progress">
        {fmtDuration(simMs)} / {fmtDuration(durationMs)}
      </span>
    </div>
  );
}
