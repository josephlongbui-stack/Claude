import { TriangleAlert } from 'lucide-react';

export function SimulationBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div role="note" aria-label="Simulation notice" className={`flex items-center gap-2 border border-signal-amber-dim bg-amber-950/25 text-amber-200 rounded ${compact ? 'px-2 py-1 text-[10.5px]' : 'px-3 py-1.5 text-[11px]'} font-semibold tracking-wide uppercase`}>
      <TriangleAlert size={13} className="text-signal-amber shrink-0" />
      <span>Simulation — not certified for ride safety or dispatch control</span>
      {!compact && <span className="font-normal normal-case tracking-normal text-amber-200/80 ml-auto hidden lg:inline">Synthetic observations only · green = no issue flagged in simulation · amber = human review required · red = simulated concern</span>}
    </div>
  );
}
