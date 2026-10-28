import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { phaseLabel } from '@/domain/simulation/scenarios';
import type { StationPhase } from '@/domain/types';
import { Panel } from '@/components/ui';
import { ScenarioControls } from './ScenarioControls';

const STEPS: StationPhase[] = ['arriving', 'unloading', 'boarding', 'observing', 'review', 'ready', 'dispatch', 'departing'];

/** Station cycle progress, read straight from the phases the scenario has recorded. */
export function ObservationTimeline() {
  const phase = useSimulationStore((s) => s.phase);
  const markers = useSimulationStore((s) => s.markers);
  const simMs = useSimulationStore((s) => s.simMs);
  const durationMs = useSimulationStore((s) => s.durationMs);
  const rideId = useSimulationStore((s) => s.rideId);
  const ride = getRide(rideId);
  const reached = new Set(markers.map((m) => m.phase));
  const progress = durationMs ? Math.min(1, simMs / durationMs) : 0;

  return (
    <Panel title="Station cycle" actions={<ScenarioControls />} bodyClassName="p-3">
      <div className="h-1 bg-graphite-700 rounded mb-3 overflow-hidden">
        <div className="h-full bg-signal-teal" style={{ width: `${progress * 100}%` }} />
      </div>
      <ol className="grid grid-cols-4 lg:grid-cols-8 gap-2 text-[11px]">
        {STEPS.map((p, i) => {
          const current = p === phase;
          const done = reached.has(p) && !current;
          return (
            <li key={p} className={`flex items-center gap-1.5 ${current ? 'text-signal-teal font-medium' : done ? 'text-graphite-200' : 'text-graphite-400'}`}>
              <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center border shrink-0 ${current ? 'border-signal-teal bg-signal-teal/20' : done ? 'border-graphite-400 bg-graphite-600' : 'border-graphite-600'}`}>{i + 1}</span>
              <span className="leading-tight">{phaseLabel(ride, p)}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
