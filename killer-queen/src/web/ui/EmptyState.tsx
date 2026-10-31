import type { ComponentChildren } from 'preact';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import './empty.css';

/** Empty, offline and error states: what happened, and a way forward. */
export function EmptyState({ title, hint, action, kind = 'empty', retry, children }: { title: string; hint?: ComponentChildren; action?: { href: string; label: string }; kind?: 'empty' | 'error' | 'offline'; retry?: () => void; children?: ComponentChildren }) {
  return (
    <div class={`empty ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind !== 'empty' && <Icon name={kind === 'offline' ? 'wifi-off' : 'alert'} size={20} class="empty-icon" />}
      <div class="empty-title">{title}</div>
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
