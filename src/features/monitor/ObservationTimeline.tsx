import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { phaseLabel } from '@/domain/simulation/scenarios';
import type { StationPhase } from '@/domain/types';
import { DemoControls } from '@/components/DemoControls';
import { Panel } from '@/components/ui';
import { fmtDuration } from '@/domain/simulation/clock';

const STEPS: { phase: StationPhase; label: string }[] = [
  { phase: 'arriving', label: 'Train arrives' },
  { phase: 'unloading', label: 'Passengers unload' },
  { phase: 'boarding', label: 'Boarding begins' },
  { phase: 'boarding', label: 'Occupancy increases' },
  { phase: 'observing', label: 'Potential issues detected' },
  { phase: 'review', label: 'Human review requested' },
  { phase: 'review', label: 'Human reviews & records outcomes' },
  { phase: 'ready', label: 'Operational readiness changes' },
  { phase: 'dispatch', label: 'Simulated dispatch event recorded' },
  { phase: 'departing', label: 'Train leaves station' },
];

const PHASE_ORDER: StationPhase[] = ['idle', 'arriving', 'unloading', 'boarding', 'observing', 'review', 'ready', 'dispatch', 'departing', 'block_wait'];

export function ObservationTimeline() {
  const phase = useSimulationStore((s) => s.phase);
  const simMs = useSimulationStore((s) => s.simMs);
  const durationMs = useSimulationStore((s) => s.durationMs);
  const markers = useSimulationStore((s) => s.markers);
  const rideId = useSimulationStore((s) => s.rideId);
  const finished = useSimulationStore((s) => s.finished);
  const ride = getRide(rideId);
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const progress = durationMs ? Math.min(1, simMs / durationMs) : 0;
  const seenPhases = new Set(markers.map((m) => m.phase));

  return (
    <Panel title="Observation timeline" actions={<DemoControls compact />} bodyClassName="p-3">
      <div className="relative h-7 mb-2">
        <div className="absolute inset-x-0 top-3 h-1 bg-graphite-700 rounded" />
        <div className="absolute left-0 top-3 h-1 bg-signal-teal rounded" style={{ width: `${progress * 100}%` }} />
        {markers.map((m, i) => (
          <div key={i} className="absolute top-1" style={{ left: `${durationMs ? (m.atMs / durationMs) * 100 : 0}%` }} title={`${fmtDuration(m.atMs)} · ${m.label}`}>
            <div className="w-2 h-2 rounded-full bg-graphite-100 border border-graphite-900 -ml-1" />
          </div>
        ))}
        <div className="absolute top-0 -ml-px w-px h-7 bg-signal-teal" style={{ left: `${progress * 100}%` }} />
        <div className="absolute right-0 -top-0.5 text-[10px] mono text-graphite-300">{fmtDuration(simMs)} / {fmtDuration(durationMs)}</div>
      </div>
      <ol className="grid grid-cols-5 gap-x-3 gap-y-1 text-[11px]">
        {STEPS.map((s, i) => {
          const idx = PHASE_ORDER.indexOf(s.phase);
          const occupancyStep = i === 3;
          const reviewOutcomeStep = i === 6;
          const done = finished || idx < phaseIdx || (occupancyStep && phaseIdx > 3) || (reviewOutcomeStep && phaseIdx > 5) || (idx === phaseIdx && (seenPhases.has(s.phase) && phaseIdx > idx));
          const current = idx === phaseIdx && !done;
          return (
            <li key={i} className={`flex items-start gap-1.5 ${current ? 'text-signal-teal font-medium' : done ? 'text-graphite-200' : 'text-graphite-400'}`}>
              <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center border shrink-0 ${current ? 'border-signal-teal bg-signal-teal/20' : done ? 'border-graphite-400 bg-graphite-600' : 'border-graphite-600'}`}>{i + 1}</span>
              <span className="leading-tight text-[10.5px]" title={s.label}>{ride.geometry.kind === 'train' ? s.label : s.label.replace('Train', phaseLabel(ride, 'arriving').split(' ')[0])}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
