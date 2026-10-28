import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { AlertStatus, SeatState, Severity } from '@/domain/types';
import { SEAT_STATE_LABEL } from '@/domain/observation/evaluator';
import { SEVERITY_LABEL, STATUS_LABEL } from '@/domain/review/workflow';

export function Panel({ title, actions, children, className = '', bodyClassName = '', id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={`panel flex flex-col min-h-0 ${className}`}>
      {title !== undefined && (
        <header className="panel-header shrink-0">
          <span className="flex items-center gap-2 whitespace-nowrap shrink-0">{title}</span>
          {actions && <span className="flex items-center gap-1.5 flex-wrap justify-end normal-case tracking-normal font-normal text-graphite-200 min-w-0">{actions}</span>}
        </header>
      )}
      <div className={`min-h-0 flex-auto ${bodyClassName || 'p-3'}`}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, sub, tone = 'neutral', className = '' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'teal' | 'amber' | 'red' | 'green'; className?: string }) {
  const toneClass = { neutral: 'text-graphite-100', teal: 'text-signal-teal', amber: 'text-signal-amber', red: 'text-signal-red', green: 'text-signal-green' }[tone];
  return (
    <div className={`panel px-3 py-2.5 flex flex-col gap-0.5 ${className}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">{label}</div>
      <div className={`text-xl font-semibold num leading-tight ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-graphite-300 leading-snug">{sub}</div>}
    </div>
  );
}

export function Badge({ tone, children, className = '', title }: { tone: 'teal' | 'amber' | 'red' | 'green' | 'slate' | 'violet'; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={`badge badge-${tone} ${className}`} title={title}>
      {children}
    </span>
  );
}

export const SEAT_STATE_TONE: Record<SeatState, 'teal' | 'amber' | 'red' | 'green' | 'slate' | 'violet'> = {
  empty: 'slate',
  nominal: 'green',
  review: 'amber',
  concern: 'red',
  unknown: 'violet',
};

export const SEAT_STATE_COLOR: Record<SeatState, string> = {
  empty: '#3d4959',
  nominal: '#4ade80',
  review: '#f59e0b',
  concern: '#ef4444',
  unknown: '#a78bfa',
};

export const SEAT_STATE_SHORT: Record<SeatState, string> = { empty: 'Empty', nominal: 'Nominal', review: 'Review', concern: 'Concern', unknown: 'Unknown' };

export function SeatStateBadge({ state, compact = false }: { state: SeatState; compact?: boolean }) {
  return <Badge tone={SEAT_STATE_TONE[state]} title={SEAT_STATE_LABEL[state]}>{compact ? SEAT_STATE_SHORT[state] : SEAT_STATE_LABEL[state]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = severity === 'concern' ? 'red' : severity === 'review' ? 'amber' : 'teal';
  const label = SEVERITY_LABEL[severity];
  return <Badge tone={tone}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: AlertStatus }) {
  const tone = status === 'open' ? 'red' : status === 'acknowledged' ? 'amber' : status === 'reviewed' ? 'green' : 'slate';
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="text-base font-semibold text-graphite-100 leading-tight">{children}</h1>
      {sub && <p className="text-[12px] text-graphite-300 mt-0.5 max-w-3xl">{sub}</p>}
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 text-graphite-300 gap-2">
      <div className="text-graphite-400">{icon ?? <Info size={20} />}</div>
      <div className="text-[12.5px] font-medium text-graphite-200">{title}</div>
      {hint && <div className="text-[11.5px] max-w-sm">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={`flex gap-2 items-start text-[11.5px] rounded border px-2.5 py-2 ${tone === 'warn' ? 'border-signal-amber-dim bg-amber-950/30 text-amber-100' : 'border-graphite-600 bg-graphite-800 text-graphite-200'}`}>
      {tone === 'warn' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal-amber" /> : <Info size={13} className="mt-0.5 shrink-0 text-signal-teal" />}
      <div>{children}</div>
    </div>
  );
}

export function Field({ label, children, hint, inline = false }: { label: string; children: ReactNode; hint?: string; inline?: boolean }) {
  return (
    <label className={`flex ${inline ? 'items-center justify-between gap-3' : 'flex-col gap-1'} text-[11.5px]`}>
      <span className="text-graphite-300 font-medium">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] text-graphite-400">{hint}</span>}
    </label>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11.5px]">
        <span className="text-graphite-300 font-medium">{label}</span>
        <span className="mono text-graphite-100">{format ? format(value) : value}</span>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[11.5px] cursor-pointer">
      <span className="flex flex-col">
        <span className="text-graphite-200 font-medium">{label}</span>
        {hint && <span className="text-[10.5px] text-graphite-400">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative w-8 h-4 rounded-full transition-colors ${checked ? 'bg-signal-teal-dim' : 'bg-graphite-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} style={{ left: checked ? 18 : 2 }} />
      </button>
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-graphite-700 mb-3">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px transition-colors ${value === t.id ? 'border-signal-teal text-graphite-100 font-medium' : 'border-transparent text-graphite-300 hover:text-graphite-100'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function num(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function money(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
