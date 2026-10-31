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
    const t = setInterval(() => setTick((x) => x + 1), 1000); // live poll every second (v0)
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (tick % 5 === 0) void refreshMe();
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
  else screen = <div class="empty">No such page.</div>;
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
