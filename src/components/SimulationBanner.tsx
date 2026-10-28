import { TriangleAlert } from 'lucide-react';

export function SimulationBanner() {
  return (
    <div role="note" aria-label="Simulation notice" className="flex items-center gap-2 border border-signal-amber-dim bg-amber-950/25 text-amber-200 rounded px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
      <TriangleAlert size={13} className="text-signal-amber shrink-0" />
      <span>Simulation — not certified for ride safety or dispatch control</span>
    </div>
  );
}
