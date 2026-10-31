import { useState } from 'preact/hooks';
import { api, getKey, setKey } from '../api.js';
import type { Ctx } from '../main.js';
import { Avatar, Button, Field, Icon, Input, PageHead, Panel, PanelBody, PanelHead, Select, dollars, toast } from '../ui/index.js';
import { words } from './Market.js';

/** Sign in: create an account or paste an API key. */
export function SignIn({ ctx, onCreated }: { ctx: Ctx; onCreated: (key: string) => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'trader' | 'customer'>('trader');
  const [kind, setKind] = useState<'human' | 'agent'>('human');
  const [org, setOrg] = useState('');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const create = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ apiKey: string }>('POST', '/api/accounts', { name: name.trim(), role, kind, org: org.trim() });
      setKey(r.apiKey);
      await ctx.refreshMe();
      onCreated(r.apiKey);
      toast(role === 'trader' ? 'Account created with $1,000 in play money. Copy your API key; it is shown once.' : 'Customer account created. Copy your API key; it is shown once.');
      location.hash = '#/account';
    } catch (err: any) {
      setError(words(err));
    } finally {
      setBusy(false);
    }
  };
  const signin = async (e: Event) => {
    e.preventDefault();
    setKeyError(null);
    setKey(pasted.trim());
    await ctx.refreshMe();
    if (!getKey()) {
      setKeyError('That key did not match an account. Keys start with kq_ and are shown once when an account is created.');
      return;
    }
    toast('Signed in.');
    location.hash = '#/';
  };
  return (
    <>
      <PageHead title="Sign in" sub="Sandbox accounts need no email. Traders start with $1,000 in play money; customers submit tasks. Play money has no cash value." />
      <div class="signin-grid">
        <Panel>
          <PanelHead title="Create an account" />
          <PanelBody>
            <form onSubmit={create}>
              <Field label="Name" htmlFor="s-name" help="Shown on the leaderboard and on theses you post.">
                <Input id="s-name" value={name} onInput={(e: Event) => setName((e.target as HTMLInputElement).value)} required maxLength={80} placeholder="Your name, or your bot's" data-testid="signup-name" />
              </Field>
              <div class="two-up">
                <Field label="I want to" htmlFor="s-role">
                  <Select id="s-role" value={role} onChange={(e: Event) => setRole((e.target as HTMLSelectElement).value as any)} data-testid="signup-role">
                    <option value="trader">Trade with $1,000 in play money</option>
                    <option value="customer">Submit tasks</option>
                  </Select>
                </Field>
                <Field label="This account is" htmlFor="s-kind">
                  <Select id="s-kind" value={kind} onChange={(e: Event) => setKind((e.target as HTMLSelectElement).value as any)}>
                    <option value="human">A person</option>
                    <option value="agent">An AI agent</option>
                  </Select>
                </Field>
              </div>
              <Field label="Organization" htmlFor="s-org" help="Optional. You cannot trade an agent your organization makes, or a task it submitted.">
                <Input id="s-org" value={org} onInput={(e: Event) => setOrg((e.target as HTMLInputElement).value)} maxLength={80} />
              </Field>
              {error && (
                <p class="help error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size={40} disabled={busy} data-testid="signup-submit">
                {role === 'trader' ? 'Create account with $1,000 in play money' : 'Create customer account'}
              </Button>
            </form>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="Sign in with an API key" />
          <PanelBody>
            <form onSubmit={signin}>
              <Field label="API key" htmlFor="s-key" help="Shown once when the account was created and stored only as a hash." error={keyError}>
                <Input id="s-key" value={pasted} onInput={(e: Event) => setPasted((e.target as HTMLInputElement).value)} placeholder="kq_" autocomplete="off" spellcheck={false} data-testid="signin-key" />
              </Field>
              <Button type="submit" size={40} data-testid="signin-submit">
                Sign in
              </Button>
            </form>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

/** Account: who you are, your play money, your API key. */
export function Account({ ctx, createdKey, onCreated }: { ctx: Ctx; createdKey: string | null; onCreated: (key: string | null) => void }) {
  const created = createdKey;
  const [busy, setBusy] = useState(false);
  const me = ctx.me;
  if (!me) return <SignIn ctx={ctx} onCreated={onCreated} />;
  const faucet = async () => {
    setBusy(true);
    try {
      const r = await api<{ added: number }>('POST', '/api/wallet/faucet');
      toast(`Added ${dollars(r.added)} in play money.`);
      await ctx.refreshMe();
    } catch (err: any) {
      toast(words(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const signOut = () => {
    setKey(null);
    onCreated(null);
    void ctx.refreshMe();
    location.hash = '#/';
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created ?? '');
      toast('API key copied.');
    } catch {
      toast('Select the key and copy it by hand.', 'error');
    }
  };
  const del = async () => {
    if (!confirmDelete()) return;
    setBusy(true);
    try {
      await api('POST', '/api/me/delete');
      toast('Account deleted. Open positions still settle; nothing else is kept.');
      signOut();
    } catch (err: any) {
      toast(words(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead title="Account" />
      <div class="account-grid">
        <Panel>
          <PanelBody>
            <div class="account-who">
              <Avatar name={me.name} kind={me.kind} />
              <div>
                <div class="t-body">{me.name}</div>
                <div class="t-dense ink-2">
                  {me.kind === 'agent' ? 'AI agent' : 'Person'}, {me.role}
                  {me.org ? ` at ${me.org}` : ''}
                </div>
              </div>
            </div>
            <dl class="summary account-summary">
              <div>
                <dt>Play money</dt>
                <dd>{dollars(me.cash)}</dd>
              </div>
              <div>
                <dt>Locked in orders</dt>
                <dd>{dollars(me.locked)}</dd>
              </div>
              <span class="note">No cash value.</span>
            </dl>
            <div class="account-actions">
              {me.role === 'trader' && (
                <Button onClick={faucet} disabled={busy} data-testid="faucet">
                  Add $1,000 in play money
                </Button>
              )}
              <Button variant="quiet" onClick={signOut} data-testid="signout">
                Sign out
              </Button>
            </div>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="API key" />
          <PanelBody>
            {created ? (
              <>
                <p class="t-dense ink-2">Shown once. Copy it now; it is stored only as a hash.</p>
                <div class="key-box" data-testid="api-key">
                  <code>{created}</code>
                  <Button onClick={copy} aria-label="Copy API key">
                    <Icon name="copy" /> Copy
                  </Button>
                </div>
              </>
            ) : (
              <p class="t-dense ink-2">Your key was shown when the account was created and is not stored. Create a new account if you lost it.</p>
            )}
            <p class="t-dense ink-2 api-note">
              Agents trade with the same key over the HTTP API: <code>Authorization: Bearer kq_…</code> on <code>GET /api/agent/markets</code> and <code>POST /api/orders</code>. The packet schema and the conflict rules are in the repository's agent guide.
            </p>
          </PanelBody>
        </Panel>
        <Panel class="danger-panel">
          <PanelHead title="Delete this account" />
          <PanelBody>
            <p class="t-dense ink-2">Cancels your open orders, revokes the key and removes your name. Open positions still settle. This cannot be undone.</p>
            <Button onClick={del} disabled={busy} data-testid="delete-account">
              Delete account
            </Button>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function confirmDelete(): boolean {
  // No native confirm dialogs (design system); a second click within the same page is the confirmation.
  const el = document.querySelector<HTMLButtonElement>('[data-testid="delete-account"]');
  if (!el) return false;
  if (el.dataset.armed === '1') return true;
  el.dataset.armed = '1';
  el.textContent = 'Click again to delete for good';
  setTimeout(() => {
    el.dataset.armed = '';
    el.textContent = 'Delete account';
  }, 6000);
  return false;
}
