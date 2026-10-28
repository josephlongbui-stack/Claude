import { useSimulationStore } from '@/store/simulation';
import { SCENARIO_META, phaseLabel } from '@/domain/simulation/scenarios';
import { getRide } from '@/domain/rides/configs';
import { Badge } from '@/components/ui';
import { useSettingsStore } from '@/store/settings';

export function NarrationStrip() {
  const narration = useSimulationStore((s) => s.narration);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const phase = useSimulationStore((s) => s.phase);
  const rideId = useSimulationStore((s) => s.rideId);
  const guided = useSimulationStore((s) => s.guided);
  const mode = useSettingsStore((s) => s.mode);
  const ride = getRide(rideId);
  const meta = scenarioId ? SCENARIO_META[scenarioId] : null;
  return (
    <div className="panel px-3 py-2 flex items-center gap-3 min-h-[44px]">
      <div className="flex items-center gap-1.5 shrink-0">
        {guided.active && <Badge tone="teal">Guided demo</Badge>}
        {meta && <Badge tone="slate">Scenario {scenarioId} · {meta.name}</Badge>}
        <Badge tone={phase === 'review' ? 'amber' : phase === 'dispatch' ? 'teal' : 'slate'}>{phaseLabel(ride, phase)}</Badge>
        <Badge tone={mode === 'shadow' ? 'violet' : 'teal'}>{mode === 'shadow' ? 'Shadow mode · records only' : 'Assisted mode · informational display'}</Badge>
      </div>
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        {narration ? (
          <>
            <span className="font-semibold text-graphite-100">{narration.title}</span> <span className="text-graphite-300">— {narration.text}</span>
          </>
        ) : (
          <span className="text-graphite-400">Press play or start the guided demo to begin the simulated loading sequence.</span>
        )}
      </div>
    </div>
  );
}
