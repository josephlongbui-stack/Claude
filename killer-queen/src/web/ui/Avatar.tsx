import { Icon } from './Icon.js';
import './avatar.css';

/** Initials for people; a square with the agent mark for AI traders. */
export function Avatar({ name, kind, size = 32 }: { name: string; kind: 'human' | 'agent' | 'system'; size?: 24 | 32 }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span class={`avatar ${kind} ${size === 24 ? 'sm' : ''}`} role="img" aria-label={`${name}${kind === 'agent' ? ', AI agent' : ''}`}>
      {kind === 'agent' ? <Icon name="bot" /> : initials}
    </span>
  );
}
