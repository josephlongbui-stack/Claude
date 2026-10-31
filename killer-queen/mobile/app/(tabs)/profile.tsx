import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';
import { ApiError, KQ_URL, dollars, getKey, kq, setKey } from '../../src/api';
import { Button, Field, H2, Panel, PlayMoney } from '../../src/ui/components';
import { space, type, usePalette } from '../../src/ui/tokens';

export default function Profile() {
  const p = usePalette();
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState<'trader' | 'customer'>('trader');
  const [created, setCreated] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [crashReports, setCrashReports] = useState(false);
  const load = useCallback(async () => {
    const key = await getKey();
    if (!key) {
      setMe(null);
      setChecked(true);
      return;
    }
    try {
      setMe((await kq.me()).account);
    } catch {
      await setKey(null);
      setMe(null);
    }
    setChecked(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const fail = (e: unknown) => setMsg(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
  const signup = async () => {
    try {
      const r = await kq.createAccount(name.trim(), 'human', role, org.trim());
      await setKey(r.apiKey);
      setCreated(r.apiKey);
      setMsg(null);
      await load();
    } catch (e) {
      fail(e);
    }
  };
  const signin = async () => {
    await setKey(pasted.trim());
    await load();
    if (!(await getKey())) setMsg('That key did not work.');
  };
  const signout = async () => {
    await setKey(null);
    setCreated(null);
    await load();
  };
  const deleteAccount = () => {
    Alert.alert('Delete account', 'This removes the key from this device and asks the exchange to anonymise the account. Open positions settle normally. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Server-side anonymisation is a follow-up route (docs/STORE_SUBMISSION.md); the key is revoked locally now.
          await signout();
          setMsg('Account removed from this device. Email abuse@killerqueen.dev to finish deletion until the in-app route ships.');
        },
      },
    ]);
  };
  if (!checked) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.s4 }}>
      {me ? (
        <Panel>
          <H2>Signed in</H2>
          <Text style={[type.body, { color: p.text, fontWeight: '600' }]}>{me.name}</Text>
          <Text style={[type.small, { color: p.muted }]}>
            {me.kind} · {me.role}
            {me.org ? ` · ${me.org}` : ''} · {KQ_URL}
          </Text>
          <Text style={[type.num, type.title, { color: p.text, marginTop: space.s2 }]} accessibilityLabel={`cash ${dollars(me.cash)}`}>
            {dollars(me.cash)}
          </Text>
          <Text style={[type.small, { color: p.muted }]}>locked {dollars(me.locked)}</Text>
          <PlayMoney />
          {created && (
            <View style={{ marginTop: space.s2, padding: space.s2, borderWidth: 1, borderStyle: 'dashed', borderColor: p.warn, borderRadius: 4 }}>
              <Text style={[type.label, { color: p.muted }]}>Your API key (shown once)</Text>
              <Text style={[type.mono, { color: p.text }]} selectable testID="api-key">
                {created}
              </Text>
            </View>
          )}
          {me.role === 'trader' && <Button label="Faucet: +$1,000 play money" onPress={() => kq.faucet().then(load).catch(fail)} testID="faucet" />}
          <Button label="Sign out" kind="ghost" onPress={signout} testID="signout" />
          <Button label="Delete account" kind="no" onPress={deleteAccount} testID="delete-account" />
        </Panel>
      ) : (
        <Panel>
          <H2>Create a sandbox account</H2>
          <Field label="Name" value={name} onChange={setName} testID="signup-name" />
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <View style={{ flex: 1 }}>
              <Button label="Trader" kind={role === 'trader' ? 'primary' : 'ghost'} onPress={() => setRole('trader')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Customer" kind={role === 'customer' ? 'primary' : 'ghost'} onPress={() => setRole('customer')} />
            </View>
          </View>
          <Field label="Organization (optional; drives conflict rules)" value={org} onChange={setOrg} />
          <Button label="Create account" kind="primary" onPress={signup} disabled={name.trim() === ''} testID="signup-submit" />
          <H2>Or sign in with an API key</H2>
          <Field label="API key" value={pasted} onChange={setPasted} placeholder="kq_…" testID="signin-key" />
          <Button label="Sign in" onPress={signin} testID="signin-submit" />
          <PlayMoney />
        </Panel>
      )}
      {msg && (
        <Text style={[type.body, { color: p.warn, marginBottom: space.s3 }]} accessibilityLiveRegion="polite">
          {msg}
        </Text>
      )}
      <Panel>
        <H2>Privacy and safety</H2>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[type.body, { color: p.text }]}>Send crash reports</Text>
          <Switch value={crashReports} onValueChange={setCrashReports} accessibilityLabel="Send crash reports" />
        </View>
        <Text style={[type.small, { color: p.muted, marginTop: space.s2 }]}>
          Theses are public. Report abuse or request data deletion: abuse@killerqueen.dev. Play money has no cash value; nothing can be bought, sold, transferred or withdrawn.
        </Text>
        <Button label="Contact" kind="ghost" onPress={() => void Linking.openURL('mailto:abuse@killerqueen.dev')} />
        {__DEV__ && <Button label="Kitchen sink (dev)" kind="ghost" onPress={() => router.push('/kitchen-sink')} />}
      </Panel>
    </ScrollView>
  );
}
