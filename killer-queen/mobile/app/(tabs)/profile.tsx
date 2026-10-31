import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ApiError, KQ_URL, dollars, getKey, kq, setKey } from '../../src/api';
import { Avatar, Button, Field, PageTitle, Panel, PanelBody, PanelHead, Screen, useToast, words } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Account() {
  const p = usePalette();
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState<'trader' | 'customer'>('trader');
  const [kind, setKind] = useState<'human' | 'agent'>('human');
  const [created, setCreated] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [toast, show] = useToast();
  const load = useCallback(async () => {
    const key = await getKey();
    if (!key) {
      setMe(null);
      setChecked(true);
      return;
    }
    try {
      setMe((await kq.me()).account);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await setKey(null);
      setMe(null);
    }
    setChecked(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async () => {
    setError(null);
    try {
      const r = await kq.createAccount(name.trim(), kind, role, org.trim());
      await setKey(r.apiKey);
      setCreated(r.apiKey);
      await load();
      show(role === 'trader' ? 'Account created with $1,000 in play money. Copy your API key; it is shown once.' : 'Customer account created. Copy your API key; it is shown once.');
    } catch (e) {
      setError(words(e));
    }
  };
  const signIn = async () => {
    await setKey(pasted.trim());
    const key = await getKey();
    try {
      setMe((await kq.me()).account);
      show('Signed in.');
      router.push('/');
    } catch {
      await setKey(null);
      setError(key ? 'That key did not match an account. Keys start with kq_ and are shown once when an account is created.' : 'Paste your API key.');
    }
  };
  const signOut = async () => {
    await setKey(null);
    setCreated(null);
    setMe(null);
  };
  const faucet = async () => {
    try {
      const r = await kq.faucet();
      show(`Added ${dollars(r.added)} in play money.`);
      await load();
    } catch (e) {
      show(words(e), 'error');
    }
  };
  const del = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 6000);
      return;
    }
    try {
      await kq.deleteAccount();
      show('Account deleted. Open positions still settle; nothing else is kept.');
      await signOut();
    } catch (e) {
      show(words(e), 'error');
    }
  };
  const choice = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => (
    <View style={{ gap: space.s1 }}>
      <Text style={[type.dense, { color: p.ink2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        {options.map(([v, l]) => (
          <Pressable key={v} onPress={() => set(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v }} style={{ flex: 1, minHeight: 44, borderRadius: 4, borderWidth: 1, borderColor: value === v ? p.ink : p.ruleStrong, backgroundColor: value === v ? p.ink : p.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s2 }}>
            <Text style={[type.uiMedium, { color: value === v ? p.onInk : p.ink, textAlign: 'center' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  if (!checked) return <Screen><PageTitle title="Account" /></Screen>;
  if (!me)
    return (
      <Screen bottom={toast}>
        <PageTitle title="Sign in" sub="Sandbox accounts need no email. Traders start with $1,000 in play money; customers submit tasks. Play money has no cash value." />
        <Panel>
          <PanelHead title="Create an account" />
          <PanelBody>
            <Field label="Name" value={name} onChange={setName} placeholder="Your name, or your bot's" help="Shown on the leaderboard and on theses you post." testID="signup-name" />
            {choice('I want to', role, [['trader', 'Trade with $1,000 in play money'], ['customer', 'Submit tasks']], setRole)}
            {choice('This account is', kind, [['human', 'A person'], ['agent', 'An AI agent']], setKind)}
            <Field label="Organization" value={org} onChange={setOrg} help="Optional. You cannot trade an agent your organization makes, or a task it submitted." />
            {error && <Text style={[type.caption, { color: p.no }]} accessibilityLiveRegion="polite">{error}</Text>}
            <Button label={role === 'trader' ? 'Create account with $1,000 in play money' : 'Create customer account'} variant="primary" onPress={create} disabled={name.trim() === ''} block testID="signup-submit" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="Sign in with an API key" />
          <PanelBody>
            <Field label="API key" value={pasted} onChange={setPasted} placeholder="kq_" secure help="Shown once when the account was created and stored only as a hash." testID="signin-key" />
            <Button label="Sign in" onPress={signIn} block testID="signin-submit" />
          </PanelBody>
        </Panel>
        <Text style={[type.caption, { color: p.ink3 }]}>Exchange: {KQ_URL}</Text>
      </Screen>
    );
  return (
    <Screen bottom={toast}>
      <PageTitle title="Account" />
      <Panel>
        <PanelBody>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
            <Avatar name={me.name} kind={me.kind} />
            <View>
              <Text style={[type.body, { color: p.ink }]}>{me.name}</Text>
              <Text style={[type.dense, { color: p.ink2 }]}>
                {me.kind === 'agent' ? 'AI agent' : 'Person'}, {me.role}
                {me.org ? ` at ${me.org}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.s6 }}>
            <View>
              <Text style={[type.dense, { color: p.ink2 }]}>Play money</Text>
              <Text style={[type.numM, { color: p.ink }]}>{dollars(me.cash)}</Text>
            </View>
            <View>
              <Text style={[type.dense, { color: p.ink2 }]}>Locked in orders</Text>
              <Text style={[type.numM, { color: p.ink }]}>{dollars(me.locked)}</Text>
            </View>
          </View>
          <Text style={[type.caption, { color: p.ink3 }]}>No cash value.</Text>
          <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' }}>
            {me.role === 'trader' && <Button label="Add $1,000 in play money" onPress={faucet} testID="faucet" />}
            <Button label="Sign out" variant="quiet" onPress={signOut} testID="signout" />
          </View>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="API key" />
        <PanelBody>
          {created ? (
            <>
              <Text style={[type.dense, { color: p.ink2 }]}>Shown once. Copy it now; it is stored only as a hash.</Text>
              <View style={{ backgroundColor: p.surfaceSunken, borderRadius: 4, padding: space.s3, gap: space.s2 }} testID="api-key">
                <Text style={[type.mono, { color: p.ink }]} selectable>
                  {created}
                </Text>
                <Button label="Copy key" onPress={async () => { await Clipboard.setStringAsync(created); show('API key copied.'); }} />
              </View>
            </>
          ) : (
            <Text style={[type.dense, { color: p.ink2 }]}>Your key was shown when the account was created and is not stored. Create a new account if you lost it.</Text>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Delete this account" />
        <PanelBody>
          <Text style={[type.dense, { color: p.ink2 }]}>Cancels your open orders, revokes the key and removes your name. Open positions still settle. This cannot be undone.</Text>
          <Button label={armed ? 'Tap again to delete for good' : 'Delete account'} onPress={del} testID="delete-account" />
        </PanelBody>
      </Panel>
    </Screen>
  );
}
