import { Pause, Play, RefreshCw, RotateCcw, SkipForward, Sparkles, Square } from 'lucide-react';
import { useSimulationStore, SPEEDS, GUIDED_SEQUENCE } from '@/store/simulation';
import type { ScenarioId } from '@/domain/types';
import { fmtDuration } from '@/domain/simulation/clock';

const ALL_SCENARIOS: ScenarioId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
export const SCENARIO_SHORT: Record<ScenarioId, string> = { A: 'Normal loading', B: 'Restraint concern', C: 'Loose object', D: 'Occluded camera', E: 'Sensor disagreement', F: 'Slow dispatch', G: 'Optimized boarding', H: 'Slide exit occupied', I: 'Dark ride', J: 'Maintenance', K: 'Boat spacing', L: 'Accompaniment' };

export function DemoControls({ compact = false }: { compact?: boolean }) {
  const playing = useSimulationStore((s) => s.playing);
  const speed = useSimulationStore((s) => s.speed);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const guided = useSimulationStore((s) => s.guided);
  const simMs = useSimulationStore((s) => s.simMs);
  const durationMs = useSimulationStore((s) => s.durationMs);
  const { toggle, reset, skip, setSpeed, loadScenario, startGuidedDemo, stopGuidedDemo, resetDemo } = useSimulationStore.getState();

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'flex-wrap' : ''}`}>
      {!compact && (
        <select aria-label="Scenario" className="select !w-auto !py-1 !text-[11.5px]" value={scenarioId ?? 'A'} onChange={(e) => loadScenario(e.target.value as ScenarioId, { autoplay: true, navigate: true })}>
          {ALL_SCENARIOS.map((id) => (
            <option key={id} value={id}>
              {id} · {SCENARIO_SHORT[id]}
            </option>
          ))}
        </select>
      )}
      <button className="btn btn-xs" onClick={toggle} aria-label={playing ? 'Pause simulation' : 'Play simulation'} title={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button className="btn btn-xs" onClick={reset} aria-label="Reset scenario" title="Reset scenario">
        <RotateCcw size={13} />
      </button>
      <button className="btn btn-xs" onClick={skip} aria-label="Skip to next scenario" title={guided.active ? 'Skip to next scenario' : 'Skip to end of scenario'}>
        <SkipForward size={13} />
      </button>
      <select aria-label="Simulation speed" className="select !w-auto !py-1 !text-[11.5px]" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      {compact && (
        <span className="mono text-[11px] text-graphite-300 min-w-[84px] text-center" aria-label="Scenario progress">
          {fmtDuration(simMs)} / {fmtDuration(durationMs)}
        </span>
      )}
      {guided.active ? (
        <button className="btn btn-xs btn-amber" onClick={stopGuidedDemo} title="Stop guided demo">
          <Square size={12} /> Guided {guided.index + 1}/{GUIDED_SEQUENCE.length}
        </button>
      ) : (
        <button className="btn btn-xs btn-primary" onClick={startGuidedDemo} title="Walk through all scenarios automatically">
          <Sparkles size={12} /> Start Guided Demo
        </button>
      )}
      {!compact && (
        <button className="btn btn-xs btn-ghost" onClick={resetDemo} title="Reset Demo — restore every store to the starting state" aria-label="Reset demo">
          <RefreshCw size={13} />
        </button>
      )}
    </div>
  );
}
