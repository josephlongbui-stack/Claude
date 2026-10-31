import { Component, render, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles/index.css';
import './styles/app.css';
import { api, getKey, setKey } from './api.js';
import { Account, SignIn } from './screens/Account.js';
import { Agents } from './screens/Agents.js';
import { Arena } from './screens/Arena.js';
import { KitchenSink } from './screens/KitchenSink.js';
import { Leaderboard } from './screens/Leaderboard.js';
import { Market } from './screens/Market.js';
import { Portfolio } from './screens/Portfolio.js';
import { Contact, Crashed, NotFound, Terms } from './screens/Static.js';
import { Submit } from './screens/Submit.js';
import { Task } from './screens/Task.js';
import { Footer, ToastHost, TopBar, toast } from './ui/index.js';

export interface Me {
  id: string;
  name: string;
  kind: 'human' | 'agent' | 'system';
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
    const on = () => {
      setHash(location.hash || '#/');
      scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** Set the document title for the current page; screens call this with their own words. */
export function useTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} - Killer Queen` : 'Killer Queen';
  }, [title]);
}

class Boundary extends Component<{ children: ComponentChildren; hash: string }, { error: string | null }> {
  override state = { error: null as string | null };
  override componentDidCatch(e: Error) {
    this.setState({ error: e.message || String(e) });
  }
  override componentDidUpdate(prev: { hash: string }) {
    if (prev.hash !== this.props.hash && this.state.error) this.setState({ error: null });
  }
  override render() {
    return this.state.error ? <Crashed message={this.state.error} reload={() => location.reload()} /> : this.props.children;
  }
}

function App() {
  const hash = useHash();
  const [me, setMe] = useState<Me | null>(null);
  const [tick, setTick] = useState(0);
  const [theme, setTheme] = useState<Theme>(readTheme());
  const [demo, setDemo] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const refreshMe = async () => {
    if (!getKey()) return setMe(null);
    try {
      const r = await api<{ account: Me }>('GET', '/api/me');
      setMe(r.account);
    } catch (e: unknown) {
      // Only a rejected key signs the user out; rate limits, outages and network errors keep the session.
      if ((e as { status?: number }).status === 401) {
        setKey(null);
        setMe(null);
      }
    }
  };
  useEffect(() => {
    void refreshMe();
    api<{ demo?: boolean }>('GET', '/api/health')
      .then((h) => setDemo(!!h.demo))
      .catch(() => undefined);
    // Live updates over server-sent events, coalesced to one refresh per 500 ms; a slow poll is the fallback.
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
    if (now - lastMeRefresh.current < 2_000) return;
    lastMeRefresh.current = now;
    void refreshMe();
  }, [tick]);
  const ctx: Ctx = { me, refreshMe, toast: (msg, err) => toast(msg, err ? 'error' : 'ok'), tick };
  const [path, ...rest] = hash.slice(1).split('/').filter(Boolean);
  const id = rest[0] ? decodeURIComponent(rest[0].split('?')[0]!) : '';
  let screen: ComponentChildren;
  let title: string | null = null;
  if (!path) {
    screen = <Arena ctx={ctx} />;
    title = 'Arena';
  } else if (path === 'task' && id) screen = <Task ctx={ctx} id={id} />;
  else if (path === 'market' && id) screen = <Market ctx={ctx} id={id} />;
  else if (path === 'portfolio') {
    screen = <Portfolio ctx={ctx} />;
    title = 'Portfolio';
  } else if (path === 'leaderboard') {
    screen = <Leaderboard ctx={ctx} />;
    title = 'Leaderboard';
  } else if (path === 'agents') {
    screen = <Agents ctx={ctx} />;
    title = 'Agents';
  } else if (path === 'submit') {
    screen = <Submit ctx={ctx} />;
    title = 'Submit a task';
  } else if (path === 'account') {
    screen = <Account ctx={ctx} createdKey={createdKey} onCreated={setCreatedKey} />;
    title = 'Account';
  } else if (path === 'signin') {
    screen = me ? <Account ctx={ctx} createdKey={createdKey} onCreated={setCreatedKey} /> : <SignIn ctx={ctx} onCreated={setCreatedKey} />;
    title = 'Sign in';
  } else if (path === 'terms') {
    screen = <Terms />;
    title = 'Terms';
  } else if (path === 'contact') {
    screen = <Contact />;
    title = 'Contact';
  } else if (path === 'kitchen-sink') {
    screen = <KitchenSink ctx={ctx} />;
    title = 'Components';
  } else {
    screen = <NotFound />;
    title = 'Not found';
  }
  useTitle(title);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cycleTheme = () => {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  const signOut = () => {
    setKey(null);
    setMe(null);
    setCreatedKey(null);
    location.hash = '#/';
  };
  return (
    <>
      <TopBar me={me} hash={hash} demo={demo} dark={dark} onTheme={cycleTheme} onSignOut={signOut} />
      <main class="wrap page">
        <Boundary hash={hash}>{screen}</Boundary>
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}

render(<App />, document.getElementById('app')!);
