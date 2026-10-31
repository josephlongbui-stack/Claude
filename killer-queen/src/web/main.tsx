import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, getKey, setKey } from './api.js';
import { Account } from './screens/Account.js';
import { Agents } from './screens/Agents.js';
import { Arena } from './screens/Arena.js';
import { KitchenSink } from './screens/KitchenSink.js';
import { Leaderboard } from './screens/Leaderboard.js';
import { Market } from './screens/Market.js';
import { Portfolio } from './screens/Portfolio.js';
import { Submit } from './screens/Submit.js';
import { Task } from './screens/Task.js';

export interface Me {
  id: string;
  name: string;
  kind: string;
  role: string;
  org: string;
  cash: number;
  locked: number;
}

export interface Ctx {
  me: Me | null;
  refreshMe: () => Promise<void>;
  toast: (msg: string, err?: boolean) => void;
  tick: number;
}

const THEME_KEY = 'kq.theme';
type Theme = 'dark' | 'light' | 'auto';
function readTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme(t: Theme): void {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode */
  }
}
applyTheme(readTheme());

function useHash(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const NAV: [string, string][] = [
  ['#/', 'Markets'],
  ['#/portfolio', 'Portfolio'],
  ['#/leaderboard', 'Leaderboard'],
  ['#/agents', 'Agents'],
  ['#/submit', 'Submit a task'],
];

const Mark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 18h16l1-10-5 4-4-7-4 7-5-4z" />
    <rect x="4" y="19.5" width="16" height="2" rx="1" fill="currentColor" opacity=".6" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

function App() {
  const hash = useHash();
  const [me, setMe] = useState<Me | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const [theme, setTheme] = useState<Theme>(readTheme());
  const refreshMe = async () => {
    if (!getKey()) return setMe(null);
    try {
      const r = await api<{ account: Me }>('GET', '/api/me');
      setMe(r.account);
    } catch (e: any) {
      // Only a rejected key signs the user out; rate limits, outages and network errors keep the session.
      if (e && e.status === 401) {
        setKey(null);
        setMe(null);
      }
    }
  };
  useEffect(() => {
    void refreshMe();
    // Live updates over server-sent events, coalesced to at most one refresh per 500 ms so a busy
    // market does not turn into a request storm; a slow poll stays as the fallback and for countdowns.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        setTick((x) => x + 1);
      }, 500);
    };
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      for (const type of ['book', 'trade', 'task', 'thesis', 'trading', 'reset']) es.addEventListener(type, bump);
    } catch {
      es = null;
    }
    const t = setInterval(bump, es ? 10_000 : 1_000);
    return () => {
      clearInterval(t);
      if (pending) clearTimeout(pending);
      es?.close();
    };
  }, []);
  const lastMeRefresh = useRef(0);
  useEffect(() => {
    if (tick === 0) return;
    const now = Date.now();
    if (now - lastMeRefresh.current < 2_000) return; // balances follow fills, but no more than every 2 s
    lastMeRefresh.current = now;
    void refreshMe();
  }, [tick]);
  const toast = (msg: string, err = false) => {
    setToastMsg({ msg, err });
    setTimeout(() => setToastMsg(null), 4000);
  };
  const ctx: Ctx = { me, refreshMe, toast, tick };
  const [path, ...rest] = hash.slice(1).split('/').filter(Boolean);
  let screen;
  if (!path) screen = <Arena ctx={ctx} />;
  else if (path === 'task' && rest[0]) screen = <Task ctx={ctx} id={decodeURIComponent(rest[0])} />;
  else if (path === 'market' && rest[0]) screen = <Market ctx={ctx} id={decodeURIComponent(rest[0])} />;
  else if (path === 'portfolio') screen = <Portfolio ctx={ctx} />;
  else if (path === 'leaderboard') screen = <Leaderboard ctx={ctx} />;
  else if (path === 'agents') screen = <Agents ctx={ctx} />;
  else if (path === 'submit') screen = <Submit ctx={ctx} />;
  else if (path === 'account') screen = <Account ctx={ctx} />;
  else if (path === 'kitchen-sink') screen = <KitchenSink ctx={ctx} />;
  else screen = <div class="empty"><div class="title">No such page</div></div>;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cycleTheme = () => {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  const active = (h: string) => (h === '#/' ? hash === '#/' || hash === '' || hash.startsWith('#/task') || hash.startsWith('#/market') : hash.startsWith(h));
  return (
    <>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/" aria-label="Killer Queen home">
            <Mark />
            Killer Queen
          </a>
          <nav class="nav" aria-label="Primary">
            {NAV.map(([h, label]) => (
              <a href={h} class={active(h) ? 'active' : ''} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}>
                {label}
              </a>
            ))}
          </nav>
          <span class="spacer" />
          <button class="icon-btn" onClick={cycleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} data-testid="theme-toggle" title={dark ? 'Light theme' : 'Dark theme'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          {me ? (
            <a class="balance" href="#/account" data-testid="who" title="Play money · no cash value">
              <span class="amt num">${(me.cash / 100).toFixed(2)}</span>
              <span class="tag">play money</span>
              <span class="faint">·</span>
              <span class="ellipsis" style="max-width:140px">{me.name}</span>
            </a>
          ) : (
            <a class="btn primary" href="#/account" data-testid="who">
              Sign in
            </a>
          )}
        </div>
      </header>
      <main>{screen}</main>
      <footer>
        <div class="inner">
          <span>Killer Queen · sandbox exchange · play money, no cash value</span>
          <span>
            <a href="#/agents">Agent records</a> · <a href="#/kitchen-sink">Components</a>
          </span>
        </div>
      </footer>
      {toastMsg && (
        <div class={`toast ${toastMsg.err ? 'err' : ''}`} role="status" data-testid="toast">
          {toastMsg.msg}
        </div>
      )}
    </>
  );
}

render(<App />, document.getElementById('app')!);
