/** Dev-only: every component in every state. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AgentRow, BookLadder, Button, ChangeCell, Countdown, EmptyState, Field, Money, OddsRail, OrderTicket, PageTitle, Panel, PanelBody, PanelHead, PriceCell, PriceChart, Screen, SectionHead, SettlementPanel, Skeleton, StatusPill, useToast, type MarketSummary, type Status } from '../src/ui/components';
import { space, type, usePalette } from '../src/ui/tokens';

const exec = (id: string, name: string, org: string, version: string, chosen = 6, passed = 3) => ({ id, name, org, version, chosen, passed });
const EX = { cc: exec('claude-code', 'Claude Code', 'Anthropic', '2.1.0'), cx: exec('codex', 'Codex', 'OpenAI', '0.48.0', 4, 3), gm: exec('gemini-cli', 'Gemini CLI', 'Google', '0.14.0', 2, 1) };
const m = (executor: ReturnType<typeof exec>, status: string, extra: Partial<MarketSummary> = {}): MarketSummary => ({ marketId: `tsk_1:${executor.id}`, executorId: executor.id, executor, status, outcome: null, quote: { yesBid: 60, yesAsk: 62, volume: 1046, chance: 61, change: 3 }, closingPrice: 61, settlementPrice: null, traders: 23, ...extra });
const NOW = Date.now();
const LOG = ['[runner] $ pytest tests/reminders/test_rate_limit.py', 'tests/reminders/test_rate_limit.py::test_sends_at_40_per_second PASSED', 'tests/reminders/test_rate_limit.py::test_burst_of_100 PASSED', 'tests/reminders/test_rate_limit.py::test_retries_after_header FAILED', '1 failed, 2 passed in 2.44s', '[runner] tests failed (exit 1)'].join('\n');
const history = Array.from({ length: 24 }, (_, i) => ({ at: NOW - (24 - i) * 3_600_000, price: Math.round(52 + i * 0.5 + 4 * Math.sin(i / 3)) }));

export default function KitchenSink() {
  const p = usePalette();
  const [toast, show] = useToast();
  const [seed, setSeed] = useState(0);
  const [replay, setReplay] = useState(0);
  const jitter = (base: number, i: number) => Math.max(5, Math.min(95, base + Math.round(Math.sin(seed * 1.7 + i) * 9)));
  const statuses: Status[] = ['open', 'soon', 'closed', 'running', 'passed', 'failed', 'settled', 'skipped', 'pending', 'rejected', 'cancelled', 'infra_error', 'private', 'demo'];
  return (
    <Screen bottom={toast}>
      <PageTitle title="Components" sub="Every component in every state, in the current theme." />
      <SectionHead title="Type" />
      <Panel><PanelBody>
        {(['caption', 'dense', 'ui', 'body', 'h3', 'h2', 'h1', 'mono'] as const).map((k) => <Text key={k} style={[type[k], { color: p.ink }]}>{k} sample: pytest tests/api/test_cart.py</Text>)}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s3 }}><PriceCell cents={61} size="dense" /><PriceCell cents={61} size="m" /><PriceCell cents={61} size="l" /><PriceCell cents={61} size="xl" /></View>
      </PanelBody></Panel>
      <SectionHead title="Buttons, pills, change, money, countdown" />
      <Panel><PanelBody>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
          <Button label="Submit task" variant="primary" onPress={() => show('Primary')} /><Button label="Cancel order" onPress={() => undefined} /><Button label="Sign out" variant="quiet" onPress={() => undefined} /><Button label="Yes 61¢" variant="yes" onPress={() => undefined} /><Button label="No 40¢" variant="no" onPress={() => undefined} /><Button label="Buy Yes at 61¢" variant="yes" solid onPress={() => undefined} /><Button label="Disabled" onPress={() => undefined} disabled />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>{statuses.map((s) => <StatusPill key={s} status={s} />)}</View>
        <View style={{ flexDirection: 'row', gap: space.s3 }}><ChangeCell delta={3} /><ChangeCell delta={-5} /><ChangeCell delta={0} /><ChangeCell delta={null} /><Money cents={510} signed /><Money cents={-75} signed /><Money cents={97750} /></View>
        <View style={{ flexDirection: 'row', gap: space.s3 }}><Countdown closesAt={NOW + 42_000} label="Closes in" /><Countdown closesAt={NOW + 95 * 60_000} /><Countdown closesAt={NOW + 50 * 3_600_000} big /></View>
        <Field label="Commit" value="58b0ce" onChange={() => undefined} error="A commit is 7 or 40 hex characters; this one has 6." />
        <Field label="Limit price" value="61" onChange={() => undefined} keyboard="numeric" suffix="¢" help="Fills at the resting price or better." />
      </PanelBody></Panel>
      <SectionHead title="Agent rows" />
      <Panel><View style={{ paddingHorizontal: space.s4 }}>
        <AgentRow m={m(EX.cc, 'open')} onQuick={() => show('Quick buy')} />
        <AgentRow m={m(EX.cx, 'pending', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
        <AgentRow m={m(EX.cx, 'running')} chosen />
        <AgentRow m={m(EX.cc, 'settled', { outcome: 'passed', settlementPrice: 100 })} />
        <AgentRow m={m(EX.cx, 'settled', { outcome: 'unchosen', settlementPrice: 54, closingPrice: 54 })} />
        <AgentRow m={m(EX.gm, 'settled', { outcome: 'failed', settlementPrice: 0 })} last />
      </View></Panel>
      <SectionHead title="Odds rail" aside={<Button label="Move the prices" onPress={() => setSeed((s) => s + 1)} compact />} />
      <Panel><PanelBody>
        <OddsRail markers={[{ id: 'gm', name: 'Gemini CLI', price: jitter(44, 0), bid: jitter(44, 0) - 2, ask: jitter(44, 0) + 3, lead: false, state: 'live' }, { id: 'cx', name: 'Codex', price: jitter(53, 1), bid: jitter(53, 1) - 3, ask: jitter(53, 1) + 3, lead: false, state: 'live' }, { id: 'cc', name: 'Claude Code', price: jitter(61, 2), bid: jitter(61, 2) - 1, ask: jitter(61, 2) + 1, lead: true, state: 'live' }]} />
        <OddsRail markers={['Claude Code', 'Codex', 'Gemini CLI', 'Aider', 'Jules', 'Devin', 'Cursor Agent', 'Amp'].map((n, i) => ({ id: `e${i}`, name: n, price: 48 + i, bid: 46 + i, ask: 50 + i, lead: i === 7, state: 'live' as const }))} />
        <OddsRail markers={[{ id: 'gm', name: 'Gemini CLI', price: 44, bid: null, ask: null, lead: false, state: 'closed', note: 'settled at 44¢' }, { id: 'cc', name: 'Claude Code', price: 99, bid: null, ask: null, lead: true, state: 'settled-yes', note: 'passed' }]} />
      </PanelBody></Panel>
      <SectionHead title="Book, chart" />
      <Panel><BookLadder book={{ yes: [{ price: 60, quantity: 30, orders: 1 }, { price: 58, quantity: 17, orders: 2 }], no: [{ price: 38, quantity: 30, orders: 1 }, { price: 36, quantity: 27, orders: 1 }] }} status="open" /></Panel>
      <Panel><BookLadder book={{ yes: [{ price: 40, quantity: 5, orders: 1 }], no: [] }} status="open" /></Panel>
      <Panel><BookLadder book={{ yes: [], no: [] }} status="settled" /></Panel>
      <Panel><PanelBody><PriceChart points={history} /></PanelBody></Panel>
      <Panel><PanelBody><PriceChart points={[]} /></PanelBody></Panel>
      <SectionHead title="Ticket" />
      <Panel><PanelBody><OrderTicket marketId="tsk_1:codex" executorName="Codex" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn cash={97750} onPlaced={(s) => show(s)} /></PanelBody></Panel>
      <Panel><PanelBody><OrderTicket marketId="x" executorName="Codex" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn={false} /></PanelBody></Panel>
      <Panel><PanelBody><OrderTicket marketId="x" executorName="Codex" status="settled" quote={{ yesBid: null, yesAsk: null, noBid: null, noAsk: null }} signedIn /></PanelBody></Panel>
      <Panel><PanelBody><OrderTicket marketId="x" executorName="Codex" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn cash={410} /></PanelBody></Panel>
      <SectionHead title="Settlement" aside={<Button label="Replay" onPress={() => setReplay((r) => r + 1)} compact />} />
      <SettlementPanel key={replay} outcome="failed" agentName="Gemini CLI" log={LOG} settledAt={NOW - 3_600_000} position={{ side: 'yes', quantity: 15, payout: 0 }} animate={replay > 0} />
      <SettlementPanel outcome="infra_error" agentName="Codex" log={'[runner] clone failed: connection reset by peer (attempt 3 of 3)\n[runner] infrastructure error after 3 attempts'} settledAt={NOW - 3_600_000} closingPrice={54} />
      <SectionHead title="Empty and loading" />
      <Panel><EmptyState title="No positions yet" hint="Pick an agent in the Arena to make your first trade." action={{ label: 'Go to the Arena', onPress: () => undefined }} /></Panel>
      <Panel><EmptyState kind="error" title="The exchange did not answer" hint="Try again in a moment." action={{ label: 'Try again', onPress: () => undefined }} /></Panel>
      <Panel><EmptyState kind="offline" title="You are offline" hint="Prices will update when the connection is back." /></Panel>
      <Panel><PanelBody><Skeleton shape="table" /></PanelBody></Panel>
      <Panel><PanelHead title="Panel title" aside={<StatusPill status="open" />} /><PanelBody><Text style={[type.ui, { color: p.ink }]}>Panel body.</Text></PanelBody></Panel>
    </Screen>
  );
}
