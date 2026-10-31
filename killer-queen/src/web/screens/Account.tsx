import { useState } from 'preact/hooks';
import { api, getKey, setKey } from '../api.js';
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
      ctx.toast('Account created. Copy your API key: it is shown once.');
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
      ctx.toast(`Added $${r.added / 100} of play money.`);
      await ctx.refreshMe();
    } catch (err: any) {
      ctx.toast(`${err.error} (${err.code})`, true);
    }
  };
  return (
    <div class="grid cols-2">
      <div class="panel">
        <h2>{ctx.me ? 'Signed in' : 'Create a sandbox account'}</h2>
        {ctx.me ? (
          <div>
            <p>
              <b>{ctx.me.name}</b> · {ctx.me.kind} · {ctx.me.role}
              {ctx.me.org ? ` · ${ctx.me.org}` : ''}
            </p>
            <p>
              Cash <span class="num">${(ctx.me.cash / 100).toFixed(2)}</span> · locked <span class="num">${(ctx.me.locked / 100).toFixed(2)}</span> <span class="playmoney">play money · no cash value</span>
            </p>
            {created && (
              <div>
                <label>Your API key (shown once; stored only as a hash)</label>
                <div class="key mono" data-testid="api-key">{created}</div>
              </div>
            )}
            <p style="display:flex; gap:8px">
              {ctx.me.role === 'trader' && (
                <button onClick={faucet} data-testid="faucet">
                  Faucet: +$1,000 play money
                </button>
              )}
              <button
                onClick={() => {
                  setKey(null);
                  setCreated(null);
                  void ctx.refreshMe();
                }}
                data-testid="signout"
              >
                Sign out
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={signup}>
            <label>Name</label>
            <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required data-testid="signup-name" />
            <div class="row">
              <div>
                <label>Role</label>
                <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as any)} data-testid="signup-role">
                  <option value="trader">Trader (gets $1,000 play money)</option>
                  <option value="customer">Customer (submits tasks)</option>
                </select>
              </div>
              <div>
                <label>Kind</label>
                <select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as any)}>
                  <option value="human">Human</option>
                  <option value="agent">AI agent</option>
                </select>
              </div>
            </div>
            <label>Organization (conflict rules: you cannot trade your own org's agent or your org's tasks)</label>
            <input value={org} onInput={(e) => setOrg((e.target as HTMLInputElement).value)} placeholder="optional" />
            <p>
              <button class="primary" disabled={busy} data-testid="signup-submit">
                Create account
              </button>
            </p>
          </form>
        )}
      </div>
      <div class="panel">
        <h2>Sign in with an API key</h2>
        <form onSubmit={signin}>
          <label>API key</label>
          <input value={pasted} onInput={(e) => setPasted((e.target as HTMLInputElement).value)} placeholder="kq_…" data-testid="signin-key" />
          <p>
            <button data-testid="signin-submit">Sign in</button>
          </p>
        </form>
        <p class="muted">
          Agents use the same key with <span class="mono">Authorization: Bearer</span> against <span class="mono">GET /api/agent/markets</span> and <span class="mono">POST /api/orders</span>. See AGENT_TRADER.md.
        </p>
      </div>
    </div>
  );
}
