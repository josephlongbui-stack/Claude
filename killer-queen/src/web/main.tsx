import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, getKey, setKey } from './api.js';
import { Account } from './screens/Account.js';
import { Agents } from './screens/Agents.js';
import { Arena } from './screens/Arena.js';
import { Leaderboard } from './screens/Leaderboard.js';
import { Market } from './screens/Market.js';
import { Portfolio } from './screens/Portfolio.js';
import { Submit } from './screens/Submit.js';
import { Task } from './screens/Task.js';
import { KitchenSink } from './screens/KitchenSink.js';

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
function readTheme(): 'dark' | 'light' | 'auto' {
  try {
    return (localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null) ?? 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme(t: 'dark' | 'light' | 'auto'): void {
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
  ['#/', 'Arena'],
  ['#/portfolio', 'Portfolio'],
  ['#/leaderboard', 'Leaderboard'],
  ['#/agents', 'Agents'],
  ['#/submit', 'Submit task'],
  ['#/account', 'Account'],
];

function App() {
  const hash = useHash();
  const [me, setMe] = useState<Me | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const refreshMe = async () => {
    if (!getKey()) return setMe(null);
    try {
      const r = await api<{ account: Me }>('GET', '/api/me');
      setMe(r.account);
    } catch {
      setKey(null);
      setMe(null);
    }
  };
  useEffect(() => {
    void refreshMe();
    // Live updates over server-sent events; a slow poll stays as the fallback and for countdowns.
    const bump = () => setTick((x) => x + 1);
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
      es?.close();
    };
  }, []);
  useEffect(() => {
    if (tick > 0) void refreshMe(); // every event or fallback poll: balances follow fills and settlements
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
  else screen = <div class="empty">No such page.</div>;
  const [theme, setTheme] = useState(readTheme());
  const cycleTheme = () => {
    const next = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
    applyTheme(next);
    setTheme(next);
  };
  return (
    <>
      <header>
        <span class="brand">KILLER QUEEN</span>
        <nav>
          {NAV.map(([h, label]) => (
            <a href={h} class={(h === '#/' ? hash === '#/' || hash === '' : hash.startsWith(h)) ? 'active' : ''} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {label}
            </a>
          ))}
        </nav>
        <span class="spacer" />
        <button class="ghost" onClick={cycleTheme} aria-label={`Theme: ${theme}. Switch theme`} data-testid="theme-toggle" title="Theme">
          {theme === 'auto' ? '◐ auto' : theme === 'dark' ? '● dark' : '○ light'}
        </button>
        <span class="who" data-testid="who">
          {me ? (
            <>
              {me.name} · {me.role} · <span class="num">{(me.cash / 100).toFixed(2)}</span> <span class="playmoney">play money · no cash value</span>
            </>
          ) : (
            <a href="#/account">Sign in</a>
          )}
        </span>
      </header>
      <main>{screen}</main>
      {toastMsg && (
        <div class={`toast ${toastMsg.err ? 'err' : ''}`} data-testid="toast">
          {toastMsg.msg}
        </div>
      )}
    </>
  );
}

render(<App />, document.getElementById('app')!);
