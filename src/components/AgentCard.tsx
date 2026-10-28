import type { ReactNode } from 'react';
import { Bot } from 'lucide-react';

export function AgentCard({ n, name, purpose, children, className = '' }: { n: number; name: string; purpose: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`rounded border border-graphite-700 bg-graphite-800 p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded bg-graphite-700 flex items-center justify-center text-signal-teal">
          <Bot size={14} />
        </span>
        <div>
          <div className="text-[12.5px] font-semibold">Agent {n} — {name}</div>
          <div className="text-[11px] text-graphite-300">{purpose}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
