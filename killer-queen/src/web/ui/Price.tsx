import './price.css';

export type PriceSize = 'dense' | 'ui' | 'm' | 'l' | 'xl';

/** A price in cents with a screen-reader form ("69 cents"). */
export function PriceCell({ cents, size = 'm', side, label, class: cls }: { cents: number | null | undefined; size?: PriceSize; side?: 'yes' | 'no' | 'ink'; label?: string; class?: string }) {
  const none = cents === null || cents === undefined;
  return (
    <span class={`price ${size} ${side ?? ''} ${cls ?? ''}`} aria-label={none ? `${label ?? 'price'} not available` : `${label ? `${label} ` : ''}${cents} cents`}>
      {none ? '—' : `${cents}¢`}
    </span>
  );
}

/** Change in cents since the previous day: ▲ 3, ▼ 5, or 0. */
export function ChangeCell({ delta, class: cls }: { delta: number | null | undefined; class?: string }) {
  if (delta === null || delta === undefined) return <span class={`change flat ${cls ?? ''}`} aria-label="no change yet">—</span>;
  if (delta === 0) return <span class={`change flat ${cls ?? ''}`} aria-label="unchanged">0</span>;
  const up = delta > 0;
  return (
    <span class={`change ${up ? 'up' : 'down'} ${cls ?? ''}`} aria-label={`${up ? 'up' : 'down'} ${Math.abs(delta)}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

export const dollars = (cents: number): string => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedDollars = (cents: number): string => `${cents > 0 ? '+' : ''}${dollars(cents)}`;
export const count = (n: number): string => n.toLocaleString('en-US');

/** Money with its sign coloured by outcome colour; zero stays ink. */
export function Money({ cents, signed, class: cls }: { cents: number; signed?: boolean; class?: string }) {
  const tone = signed ? (cents > 0 ? 'yes' : cents < 0 ? 'no' : '') : '';
  return <span class={`money ${tone} ${cls ?? ''}`}>{signed ? signedDollars(cents) : dollars(cents)}</span>;
}
