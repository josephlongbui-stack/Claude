import { useState } from 'preact/hooks';
import { api, dollars, getKey, setKey } from '../api.js';
import { Card, Pill } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Account({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'trader' | 'customer'>('trader');
  const [kind, setKind] = useState<'human' | 'agent'>('human');
  const [org, setOrg] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ apiKey: string }>('POST', '/api/accounts', { name, role, kind, org });
      setCreated(r.apiKey);
      setKey(r.apiKey);
      await ctx.refreshMe();
      ctx.toast('Account created. Copy your API key now; it is shown once.');
    } catch (err: any) {
      ctx.toast(`${err.error} (${err.code})`, true);
    } finally {
      setBusy(false);
    }
  };
  const signin = async (e: Event) => {
    e.preventDefault();
    setKey(pasted.trim());
    await ctx.refreshMe();
    if (!getKey()) ctx.toast('That key did not work.', true);
  };
  const faucet = async () => {
    try {
      const r = await api<{ added: number }>('POST', '/api/wallet/faucet');
      ctx.toast(`Added ${dollars(r.added)} of play money.`);
      await ctx.refreshMe();
    } catch (err: any) {
      ctx.toast(`${err.error} (${err.code})`, true);
    }
  };
  const signout = () => {
    setKey(null);
    setCreated(null);
    void ctx.refreshMe();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created ?? '');
      ctx.toast('Key copied.');
    } catch {
      ctx.toast('Select the key and copy it by hand.', true);
    }
  };
  if (ctx.me)
    return (
      <div class="stack" style="gap:20px">
        <div class="page-head">
          <div>
            <h1>Account</h1>
            <p class="sub">Play money · no cash value</p>
          </div>
        </div>
        <div class="split">
          <Card title={ctx.me.name} sub={<span class="row"><Pill status="kind">{ctx.me.kind}</Pill><Pill status="kind">{ctx.me.role}</Pill>{ctx.me.org && <span class="muted">{ctx.me.org}</span>}</span>}>
            <div class="stack" style="gap:16px">
              <div class="row" style="gap:32px">
                <div>
                  <div class="muted" style="font-size:12.5px">
                    Cash
                  </div>
                  <div class="price md">{dollars(ctx.me.cash)}</div>
                </div>
                <div>
                  <div class="muted" style="font-size:12.5px">
                    Locked in orders
                  </div>
                  <div class="price md">{dollars(ctx.me.locked)}</div>
                </div>
              </div>
              {created && (
                <div class="stack" style="gap:8px">
                  <label style="margin:0">Your API key · shown once, stored only as a hash</label>
                  <div class="key-box" data-testid="api-key">
                    {created}
                  </div>
                  <div class="row">
                    <button onClick={copy}>Copy key</button>
                  </div>
                </div>
              )}
              <div class="row wrap">
                {ctx.me.role === 'trader' && (
                  <button onClick={faucet} data-testid="faucet">
                    Faucet · add $1,000 play money
                  </button>
                )}
                <button class="ghost" onClick={signout} data-testid="signout">
                  Sign out
                </button>
              </div>
            </div>
          </Card>
          <div class="side">
            <Card title="Trading through the API">
              <p class="muted" style="font-size:13.5px">
                Agents use the same key: <span class="code">Authorization: Bearer kq_…</span> against <span class="code">GET /api/agent/markets</span> and <span class="code">POST /api/orders</span>. See <span class="code">AGENT_TRADER.md</span> in the repo for the packet schema and the conflict rules.
              </p>
            </Card>
          </div>
        </div>
      </div>
    );
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Get started</h1>
          <p class="sub">Sandbox accounts need no email. Traders start with $1,000 of play money; customers submit tasks.</p>
        </div>
      </div>
      <div class="grid grid-2">
        <Card title="Create an account">
          <form onSubmit={signup} class="stack" style="gap:16px">
            <div>
              <label for="s-name">Name</label>
              <input id="s-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required placeholder="Your name or your bot's" data-testid="signup-name" />
            </div>
            <div class="fields">
              <div>
                <label for="s-role">I want to</label>
                <select id="s-role" value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as any)} data-testid="signup-role">
                  <option value="trader">Trade · $1,000 play money</option>
                  <option value="customer">Submit tasks</option>
                </select>
              </div>
              <div>
                <label for="s-kind">This account is</label>
                <select id="s-kind" value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as any)}>
                  <option value="human">A person</option>
                  <option value="agent">An AI agent</option>
                </select>
              </div>
            </div>
            <div>
              <label for="s-org">Organization</label>
              <input id="s-org" value={org} onInput={(e) => setOrg((e.target as HTMLInputElement).value)} placeholder="optional" />
              <p class="help">Conflict rules use it: you cannot trade your own org's agent or your own org's tasks.</p>
            </div>
            <button class="primary lg" disabled={busy} data-testid="signup-submit">
              Create account
            </button>
          </form>
        </Card>
        <Card title="Sign in with an API key">
          <form onSubmit={signin} class="stack" style="gap:16px">
            <div>
              <label for="s-key">API key</label>
              <input id="s-key" value={pasted} onInput={(e) => setPasted((e.target as HTMLInputElement).value)} placeholder="kq_…" data-testid="signin-key" autocomplete="off" />
              <p class="help">Keys are shown once at creation and stored only as a hash.</p>
            </div>
            <button data-testid="signin-submit">Sign in</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
