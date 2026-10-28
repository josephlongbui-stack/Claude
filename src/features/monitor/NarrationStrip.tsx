import { useSimulationStore } from '@/store/simulation';

/** One line explaining what is happening right now. */
export function NarrationStrip() {
  const narration = useSimulationStore((s) => s.narration);
  return (
    <div className="panel px-3 py-2 min-h-[40px] flex items-center text-[12.5px] leading-snug" aria-live="polite">
      {narration ? (
        <span>
          <span className="font-semibold text-graphite-100">{narration.title}.</span> <span className="text-graphite-300">{narration.text}</span>
        </span>
      ) : (
        <span className="text-graphite-400">Press play, or start the guided demo at the top right.</span>
      )}
    </div>
  );
}
