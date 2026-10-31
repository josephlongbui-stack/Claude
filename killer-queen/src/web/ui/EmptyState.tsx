import type { ComponentChildren } from 'preact';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import './empty.css';

/** Empty, offline and error states: what happened, and a way forward. */
/** A failed fetch: offline when the network failed, otherwise what the exchange said. */
export function FetchError({ error, retry }: { error: { status?: number; error?: string; code?: string } | string; retry?: () => void }) {
  const e = typeof error === 'string' ? { error } : error;
  if (e.status === 0 || e.code === 'offline') return <EmptyState page kind="offline" title="You are offline" hint="Prices will update when the connection is back." retry={retry} />;
  return <EmptyState page kind="error" title="The exchange did not answer" hint={e.error ?? 'Try again in a moment.'} retry={retry} />;
}

export function EmptyState({ title, hint, action, kind = 'empty', retry, children, page }: { title: string; hint?: ComponentChildren; action?: { href: string; label: string }; kind?: 'empty' | 'error' | 'offline'; retry?: () => void; children?: ComponentChildren; /** The state is the whole page, so its title is the page's heading. */ page?: boolean }) {
  return (
    <div class={`empty ${kind} ${page ? 'page' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind !== 'empty' && <Icon name={kind === 'offline' ? 'wifi-off' : 'alert'} size={20} class="empty-icon" />}
      {page ? <h1 class="empty-title">{title}</h1> : <div class="empty-title">{title}</div>}
      {hint && <div class="empty-hint">{hint}</div>}
      {children}
      {(action || retry) && (
        <div class="empty-act">
          {action && <Button href={action.href}>{action.label}</Button>}
          {retry && <Button onClick={retry}>Try again</Button>}
        </div>
      )}
    </div>
  );
}
