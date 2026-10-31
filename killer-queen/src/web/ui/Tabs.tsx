import './tabs.css';

export interface Tab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button type="button" role="tab" aria-selected={t.id === value} class={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)} data-testid={`tab-${t.id}`}>
          {t.label}
          {t.count !== undefined && <span class="count">{t.count.toLocaleString('en-US')}</span>}
        </button>
      ))}
    </div>
  );
}
