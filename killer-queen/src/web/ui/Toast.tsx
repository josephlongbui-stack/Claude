import { useEffect, useState } from 'preact/hooks';
import './toast.css';

export interface ToastMessage {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

let nextId = 1;
const listeners = new Set<(t: ToastMessage) => void>();

/** Fire a toast from anywhere; the host renders it. */
export function toast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  const t = { id: nextId++, text, kind };
  for (const l of listeners) l(t);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>([]);
  useEffect(() => {
    const on = (t: ToastMessage) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div class={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} data-testid="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
