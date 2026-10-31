import { useEffect, useState } from 'preact/hooks';
import { Avatar } from './Avatar.js';
import { Button, IconButton } from './Button.js';
import { Icon } from './Icon.js';
import { dollars } from './Price.js';
import { StatusPill } from './StatusPill.js';
import './topbar.css';

export interface TopBarUser {
  id: string;
  name: string;
  kind: 'human' | 'agent' | 'system';
  role: string;
  cash: number;
}

export const NAV: [string, string][] = [
  ['#/', 'Arena'],
  ['#/portfolio', 'Portfolio'],
  ['#/leaderboard', 'Leaderboard'],
  ['#/agents', 'Agents'],
];

export function Wordmark() {
  return (
    <a class="wordmark" href="#/" aria-label="Killer Queen, home">
      <Icon name="crown" size={20} />
      <span>Killer Queen</span>
    </a>
  );
}

export function isActive(href: string, hash: string): boolean {
  if (href === '#/') return hash === '#/' || hash === '' || hash.startsWith('#/task') || hash.startsWith('#/market');
  return hash.startsWith(href);
}

export function TopBar({ me, hash, demo, dark, onTheme, onSignOut }: { me: TopBarUser | null; hash: string; demo: boolean; dark: boolean; onTheme: () => void; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [hash]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  const themeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <header class="topbar">
      <div class="wrap topbar-inner">
        <Wordmark />
        <nav class="nav" aria-label="Primary">
          {NAV.map(([h, label]) => (
            <a href={h} class={isActive(h, hash) ? 'on' : ''} aria-current={isActive(h, hash) ? 'page' : undefined} data-testid={`nav-${label.toLowerCase()}`} key={h}>
              {label}
            </a>
          ))}
          {me && (me.role === 'customer' || me.role === 'admin') && (
            <a href="#/submit" class={hash.startsWith('#/submit') ? 'on' : ''} data-testid="nav-submit-a-task">
              Submit a task
            </a>
          )}
        </nav>
        {demo && <StatusPill status="demo" class="topbar-demo" title="Filled by the demo seed; nothing here is a real result" />}
        <span class="spacer" />
        {me && me.role !== 'trader' ? (
          <a class="balance" href="#/account" data-testid="who">
            <span class="lbl">{me.role === 'customer' ? 'Customer' : me.role === 'admin' ? 'Admin' : 'Staff'}</span>
          </a>
        ) : me ? (
          <a class="balance" href="#/portfolio" data-testid="who" title="Play money has no cash value">
            <span class="lbl">Play money</span>
            <span class="amt">{dollars(me.cash)}</span>
          </a>
        ) : hash.startsWith('#/signin') ? null : (
          <Button href="#/signin" class="topbar-signin" data-testid="who">
            Sign in
          </Button>
        )}
        {me && (
          <a class="topbar-account" href="#/account" aria-label={`Account: ${me.name}`}>
            <Avatar name={me.name} kind={me.kind} />
          </a>
        )}
        <IconButton class="theme-btn" onClick={onTheme} aria-label={themeLabel} title={themeLabel} data-testid="theme-toggle">
          <Icon name={dark ? 'sun' : 'moon'} />
        </IconButton>
        <IconButton class="menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} data-testid="menu">
          <Icon name="menu" />
        </IconButton>
      </div>
      {open && (
        <div class="sheet-scrim" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div class="sheet-head">
              <span class="t-h3">Menu</span>
              <IconButton onClick={() => setOpen(false)} aria-label="Close menu">
                <Icon name="x" />
              </IconButton>
            </div>
            <nav class="sheet-nav" aria-label="Primary">
              {NAV.map(([h, label]) => (
                <a href={h} class={isActive(h, hash) ? 'on' : ''} key={h}>
                  {label}
                </a>
              ))}
              {me && (me.role === 'customer' || me.role === 'admin') && <a href="#/submit">Submit a task</a>}
              <a href="#/account">{me ? 'Account and API key' : 'Sign in'}</a>
            </nav>
            <div class="sheet-foot">
              {demo && <StatusPill status="demo" />}
              <Button onClick={onTheme}>{dark ? 'Light theme' : 'Dark theme'}</Button>
              {me && onSignOut && (
                <Button variant="quiet" onClick={onSignOut}>
                  Sign out
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      <div class="wrap footer-inner">
        <span>Play money has no cash value.</span>
        <span class="footer-links">
          <a href="#/terms">Terms</a>
          <a href="#/contact">Contact</a>
        </span>
      </div>
    </footer>
  );
}
