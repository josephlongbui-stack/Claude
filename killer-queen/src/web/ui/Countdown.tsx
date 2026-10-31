import { useEffect, useState } from 'preact/hooks';
import './countdown.css';

/** "0:42" under an hour, "3h 1m" under a day, "2d 4h" beyond; amber under a minute. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function Countdown({ closesAt, label, size = 'dense', now: fixedNow }: { closesAt: number; label?: string; size?: 'dense' | 'm'; now?: number }) {
  const [now, setNow] = useState(fixedNow ?? Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fixedNow]);
  const left = closesAt - now;
  const soon = left < 60_000;
  const text = left <= 0 ? 'Closing' : formatCountdown(left);
  return (
    <span class={`countdown ${size} ${soon ? 'soon' : ''}`} aria-live={soon ? 'polite' : 'off'} aria-label={`${label ?? 'Closes in'} ${text}`}>
      {label && <span class="lbl">{label}</span>}
      <span class="t">{text}</span>
    </span>
  );
}
