import { RefreshCw, SkipForward, Sparkles, Square } from 'lucide-react';
import { useSimulationStore, GUIDED_SEQUENCE } from '@/store/simulation';

export function GuidedControls() {
  const guided = useSimulationStore((s) => s.guided);
  const { startGuidedDemo, stopGuidedDemo, skip, resetDemo } = useSimulationStore.getState();
  return (
    <div className="flex items-center gap-1.5">
      {guided.active ? (
        <>
          <span className="text-[11px] text-graphite-300 mono">
            Guided {guided.index + 1}/{GUIDED_SEQUENCE.length}
          </span>
          <button className="btn btn-xs" onClick={skip} aria-label="Next step" title="Next step">
            <SkipForward size={13} />
          </button>
          <button className="btn btn-xs btn-amber" onClick={stopGuidedDemo} title="Stop the guided demo">
            <Square size={12} /> Stop
          </button>
        </>
      ) : (
        <button className="btn btn-xs btn-primary" onClick={startGuidedDemo} title="Walk through the main scenarios automatically">
          <Sparkles size={12} /> Start guided demo
        </button>
      )}
      <button className="btn btn-xs btn-ghost" onClick={resetDemo} title="Clear everything and start over" aria-label="Reset demo">
        <RefreshCw size={13} />
      </button>
    </div>
  );
}
