/** Dev-only: every component in every state, in the current theme. Not linked from the app. */
import { useState } from 'preact/hooks';
import type { Ctx } from '../main.js';
import '../ui/sink.css';
import { AgentRow, Avatar, BookLadder, Button, ChangeCell, Checkbox, Countdown, EmptyState, Field, Icon, Input, Money, OddsRail, OrderTicket, PacketView, PageHead, Panel, PanelBody, PanelHead, PriceCell, PriceChart, SectionHead, Select, SettlementPanel, Skeleton, StatusPill, Table, Tabs, Td, ThesisList, TitleCell, Tr, TradeList, toast, type MarketSummary, type Status } from '../ui/index.js';

const exec = (id: string, name: string, org: string, version: string, chosen = 6, passed = 3) => ({ id, name, org, version, chosen, passed });
const EX = { cc: exec('claude-code', 'Claude Code', 'Anthropic', '2.1.0'), cx: exec('codex', 'Codex', 'OpenAI', '0.48.0', 4, 3), gm: exec('gemini-cli', 'Gemini CLI', 'Google', '0.14.0', 2, 1), none: exec('codex', 'Codex', 'OpenAI', '0.48.0', 0, 0) };
let seq = 0;
const m = (executor: ReturnType<typeof exec>, status: string, extra: Partial<MarketSummary> = {}): MarketSummary => {
  seq += 1;
  const vol = [1046, 412, 210, 688, 931, 327, 583, 394, 742, 618, 240, 539][seq % 12]!;
  return {
    marketId: `tsk_${seq}:${executor.id}`,
    executorId: executor.id,
    executor,
    status,
    outcome: null,
    quote: { yesBid: 60, yesAsk: 62, volume: vol, chance: 61, change: 3 },
    closingPrice: [61, 53, 44, 55, 69][seq % 5]!,
    settlementPrice: null,
    traders: [23, 17, 12, 31, 9][seq % 5]!,
    ...extra,
  };
};
const NOW = Date.now();
const packet = {
  title: 'Honour clinic holidays in availability search',
  prompt: "Availability search offers slots on days a clinic is closed, because holidays are stored per clinic but the search only reads practitioner calendars. Exclude a clinic's holiday dates from its slots, including half-day closures stored with a time range. Tests in tests/scheduling/test_holidays.py cover a full day, a half day and a holiday that falls on a weekend. Keep the response shape for valid requests unchanged, and keep the existing 404 for unknown clinics.",
  repo: 'meridian-health/scheduler',
  commit: 'e2b7a93',
  testCommand: 'pytest tests/scheduling/test_holidays.py',
  baseline: 'failing 3/3',
  closesAt: NOW + 90_000,
  executor: EX.cc,
};
const LOG = ['[runner] $ pytest tests/reminders/test_rate_limit.py', 'tests/reminders/test_rate_limit.py::test_sends_at_40_per_second PASSED', 'tests/reminders/test_rate_limit.py::test_burst_of_100 PASSED', 'tests/reminders/test_rate_limit.py::test_retries_after_header PASSED', 'tests/reminders/test_rate_limit.py::test_logs_unsent_after_15_minutes PASSED', 'tests/reminders/test_rate_limit.py::test_all_sent_eventually PASSED', '5 passed in 2.41s', '[runner] tests passed (exit 0)'].join('\n');
const LOG_FAIL = LOG.replace('test_retries_after_header PASSED', 'test_retries_after_header FAILED').replace('5 passed in 2.41s', '1 failed, 4 passed in 2.44s').replace('tests passed (exit 0)', 'tests failed (exit 1)');
const history = Array.from({ length: 28 }, (_, i) => ({ at: NOW - (28 - i) * 3_600_000, price: Math.round(52 + i * 0.4 + 4 * Math.sin(i / 3)) }));
const BOOK = { yes: [{ price: 60, quantity: 30, orders: 1 }, { price: 58, quantity: 17, orders: 2 }, { price: 55, quantity: 40, orders: 3 }], no: [{ price: 38, quantity: 30, orders: 1 }, { price: 36, quantity: 27, orders: 1 }, { price: 33, quantity: 12, orders: 1 }] };

function Row({ label, children }: { label: string; children: import('preact').ComponentChildren }) {
  return (
    <div class="sink-row">
      <span class="sink-label">{label}</span>
      <div class="sink-cell">{children}</div>
    </div>
  );
}

export function KitchenSink({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState<'theses' | 'trades'>('theses');
  const [railSeed, setRailSeed] = useState(0);
  const [replay, setReplay] = useState(0);
  const jitter = (p: number, i: number) => Math.max(5, Math.min(95, p + Math.round(Math.sin(railSeed * 1.7 + i) * 9)));
  const statuses: Status[] = ['open', 'soon', 'closed', 'running', 'passed', 'failed', 'settled', 'skipped', 'pending', 'rejected', 'cancelled', 'infra_error', 'private', 'demo'];
  return (
    <div class="sink">
      <PageHead title="Components" sub="Every component in every state, in the current theme. Toggle the theme in the top bar." />

      <SectionHead title="Type and colour" />
      <Panel>
        <PanelBody>
          <div class="sink-type">
            <p class="t-caption">Caption 12/16</p>
            <p class="t-dense">Dense 13/18, table cells and the book</p>
            <p class="t-ui">Interface 14/20, the default</p>
            <p class="t-body">Body 16/24, prompts and theses</p>
            <p class="t-h3">Panel title 20/26</p>
            <p class="t-h2">Task title 24/30</p>
            <p class="t-h1">Page title 32/36</p>
            <p class="mono">mono 13/18: pytest tests/api/test_cart.py @ 58b0ce4</p>
            <p>
              <span class="num-m">61¢</span> <span class="num-l">61¢</span> <span class="num-xl">61¢</span>
            </p>
          </div>
          <div class="sink-swatches">
            {['canvas', 'surface', 'surface-sunken', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-strong', 'yes', 'yes-tint', 'no', 'no-tint', 'warn', 'warn-tint', 'focus'].map((t) => (
              <span class="sink-swatch" key={t}>
                <span class="chip" style={{ background: `var(--${t})` }} />
                <span class="mono">--{t}</span>
              </span>
            ))}
          </div>
        </PanelBody>
      </Panel>

      <SectionHead title="Button" />
      <Panel>
        <PanelBody>
          <Row label="Variants, 32">
            <Button variant="primary">Submit task</Button>
            <Button>Cancel order</Button>
            <Button variant="quiet">Sign out</Button>
            <Button variant="yes">Yes 61¢</Button>
            <Button variant="no">No 40¢</Button>
            <Button variant="yes" solid>
              Buy Yes at 61¢
            </Button>
            <Button variant="no" solid>
              Buy No at 40¢
            </Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row label="Size 40, block, compact, icon">
            <Button variant="primary" size={40}>
              Start trading with $1,000 in play money
            </Button>
            <Button variant="yes" class="compact">
              Yes 61¢
            </Button>
            <Button variant="quiet" class="icon-btn" aria-label="Menu">
              <Icon name="menu" />
            </Button>
            <Button onClick={() => toast('Bought 10 Yes at 61¢')}>Toast</Button>
            <Button onClick={() => toast('Not enough play money. You need $6.90 and have $4.10.', 'error')}>Error toast</Button>
          </Row>
        </PanelBody>
      </Panel>

      <SectionHead title="PriceCell, ChangeCell, Money, Countdown" />
      <Panel>
        <PanelBody>
          <Row label="Sizes">
            <PriceCell cents={61} size="dense" /> <PriceCell cents={61} size="ui" /> <PriceCell cents={61} size="m" /> <PriceCell cents={61} size="l" /> <PriceCell cents={61} size="xl" />
          </Row>
          <Row label="Sides, missing">
            <PriceCell cents={100} size="m" side="yes" /> <PriceCell cents={0} size="m" side="no" /> <PriceCell cents={null} size="m" />
          </Row>
          <Row label="Change">
            <ChangeCell delta={3} /> <ChangeCell delta={-5} /> <ChangeCell delta={0} /> <ChangeCell delta={null} />
          </Row>
          <Row label="Money">
            <Money cents={97750} /> <Money cents={510} signed /> <Money cents={-75} signed /> <Money cents={0} signed />
          </Row>
          <Row label="Countdown">
            <Countdown closesAt={NOW + 42_000} label="Closes in" now={NOW} /> <Countdown closesAt={NOW + 95 * 60_000} label="Closes in" now={NOW} /> <Countdown closesAt={NOW + 50 * 3_600_000} now={NOW} /> <Countdown closesAt={NOW + 42_000} size="m" now={NOW} />
          </Row>
        </PanelBody>
      </Panel>

      <SectionHead title="StatusPill, Avatar, Tabs" />
      <Panel>
        <PanelBody>
          <Row label="Every status">
            {statuses.map((s) => (
              <StatusPill status={s} key={s} />
            ))}
          </Row>
          <Row label="Avatar">
            <Avatar name="Ada Shotwell" kind="human" /> <Avatar name="Delphi Forecaster" kind="agent" /> <Avatar name="Ada Shotwell" kind="human" size={24} /> <Avatar name="quantling" kind="agent" size={24} />
          </Row>
          <Row label="Tabs">
            <Tabs tabs={[{ id: 'theses', label: 'Theses', count: 7 }, { id: 'trades', label: 'Trades', count: 43 }]} value={tab} onChange={setTab} label="Demo tabs" />
          </Row>
        </PanelBody>
      </Panel>

      <SectionHead title="Fields" />
      <Panel>
        <PanelBody>
          <div class="sink-fields">
            <Field label="Title" htmlFor="k-title" help="One line, the way you would name a pull request.">
              <Input id="k-title" value="Reject negative quantities in the cart API" />
            </Field>
            <Field label="Commit" htmlFor="k-commit" error="A commit is 7 or 40 hex characters; this one has 6.">
              <Input id="k-commit" value="58b0ce" class="mono" />
            </Field>
            <Field label="I want to" htmlFor="k-role">
              <Select id="k-role">
                <option>Trade with $1,000 in play money</option>
                <option>Submit tasks</option>
              </Select>
            </Field>
            <Field label="Limit price" htmlFor="k-qty">
              <span class="input-suffix">
                <Input id="k-qty" type="number" value="61" />
                <span class="sfx">¢</span>
              </span>
            </Field>
            <Field label="Price (market order)" htmlFor="k-dis" help="Disabled while the order fills at the best price.">
              <Input id="k-dis" value="" placeholder="best available" disabled />
            </Field>
            <Checkbox label="Auto-decide: run the favourite at close" checked />
            <Checkbox label="Private task" />
          </div>
        </PanelBody>
      </Panel>

      <SectionHead title="Table, TitleCell, AgentRow states" />
      <Panel>
        <Table caption="Agent row states" columns={[{ key: 'task', label: 'Task', width: 'task' }, { key: 'agent', label: 'Agent' }, { key: 'chance', label: 'Chance', align: 'right' }, { key: 'change', label: 'Change', align: 'right' }, { key: 'vol', label: 'Volume', align: 'right', hideSm: true }, { key: 'closes', label: 'Closes', hideSm: true }, { key: 'q', label: '' }]} class="arena-table agent-table">
          <AgentRow m={m(EX.cc, 'open')} columns={['agent', 'chance', 'change', 'volume', 'quick']} group lead={<Td rowSpan={3} class="task-cell"><TitleCell title="Honour clinic holidays in availability search" href="#/kitchen-sink" sub={<span class="mono">meridian-health/scheduler e2b7a93</span>} /></Td>} trail={<Td rowSpan={3} class="closes-cell"><Countdown closesAt={NOW + 42_000} now={NOW} /></Td>} />
          <AgentRow m={m(EX.cx, 'open', { quote: { yesBid: 50, yesAsk: 56, volume: 412, chance: 53, change: -2 } })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
          <AgentRow m={m(EX.gm, 'open', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50, change: null } })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
          <AgentRow m={m(EX.cc, 'pending', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} columns={['agent', 'chance', 'change', 'volume', 'quick']} group lead={<Td rowSpan={1} class="task-cell"><TitleCell title="Baseline check running" sub={<span class="mono">quill-ledger/ledgerd 71e3c0b</span>} /></Td>} trail={<Td rowSpan={1} class="closes-cell"><StatusPill status="pending" /></Td>} />
          <AgentRow m={m(EX.cc, 'closed', { closingPrice: 58 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} group lead={<Td rowSpan={2} class="task-cell"><TitleCell title="Closed, waiting for the customer" sub={<span class="mono">tidepool/notify 6d2e4c0</span>} /></Td>} trail={<Td rowSpan={2} class="closes-cell"><StatusPill status="closed">Awaiting decision</StatusPill></Td>} />
          <AgentRow m={m(EX.cx, 'closed', { closingPrice: 71 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
          <AgentRow m={m(EX.cx, 'running', { closingPrice: 74 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} chosen group lead={<Td rowSpan={2} class="task-cell"><TitleCell title="Running: the chosen agent is in the sandbox" sub={<span class="mono">northwind/payments-core 8ab3f71</span>} /></Td>} trail={<Td rowSpan={2} class="closes-cell"><StatusPill status="running" /></Td>} />
          <AgentRow m={m(EX.gm, 'settled', { outcome: 'unchosen', settlementPrice: 39, closingPrice: 39 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
          <AgentRow m={m(EX.cc, 'settled', { outcome: 'passed', settlementPrice: 100 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} group lead={<Td rowSpan={3} class="task-cell"><TitleCell title="Settled: passed, unchosen, failed" sub={<span class="mono">harbor-labs/ledger-api 58b0ce4</span>} /></Td>} trail={<Td rowSpan={3} class="closes-cell"><StatusPill status="passed" /></Td>} />
          <AgentRow m={m(EX.cx, 'settled', { outcome: 'unchosen', settlementPrice: 54, closingPrice: 54 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
          <AgentRow m={m(EX.gm, 'settled', { outcome: 'failed', settlementPrice: 0 })} columns={['agent', 'chance', 'change', 'volume', 'quick']} />
        </Table>
      </Panel>
      <Panel class="sink-gap">
        <Table caption="Task page agent table" columns={[{ key: 'agent', label: 'Agent' }, { key: 'chance', label: 'Chance', align: 'right' }, { key: 'ba', label: 'Bid / ask', align: 'right', hideSm: true }, { key: 'vol', label: 'Volume', align: 'right', hideSm: true }, { key: 'tr', label: 'Traders', align: 'right', hideSm: true }, { key: 'rec', label: 'Record', hideSm: true }]}>
          <AgentRow m={m(EX.cc, 'open')} columns={['agent', 'chance', 'bidask', 'volume', 'traders', 'record']} />
          <AgentRow m={m(EX.none, 'open', { quote: { yesBid: 50, yesAsk: 56, volume: 412, chance: 53, change: -2 } })} columns={['agent', 'chance', 'bidask', 'volume', 'traders', 'record']} />
        </Table>
      </Panel>

      <SectionHead title="OddsRail" aside={<Button onClick={() => setRailSeed((s) => s + 1)} data-testid="rail-shuffle">Move the prices</Button>} />
      <Panel>
        <PanelBody>
          <OddsRail markers={[{ id: 'gm', name: 'Gemini CLI', price: jitter(44, 0), bid: jitter(44, 0) - 2, ask: jitter(44, 0) + 3, lead: false, state: 'live' }, { id: 'cx', name: 'Codex', price: jitter(53, 1), bid: jitter(53, 1) - 3, ask: jitter(53, 1) + 3, lead: false, state: 'live' }, { id: 'cc', name: 'Claude Code', price: jitter(61, 2), bid: jitter(61, 2) - 1, ask: jitter(61, 2) + 1, lead: true, state: 'live' }]} />
          <OddsRail markers={[{ id: 'a', name: 'Claude Code', price: 61, bid: 60, ask: 62, lead: true, state: 'live' }, { id: 'b', name: 'Codex', price: 62, bid: 61, ask: 64, lead: false, state: 'live' }]} />
          <OddsRail markers={[{ id: 'a', name: 'Claude Code', price: 60, bid: 59, ask: 61, lead: true, state: 'live' }, { id: 'b', name: 'Codex', price: 61, bid: 60, ask: 63, lead: false, state: 'live' }, { id: 'c', name: 'Gemini CLI', price: 62, bid: 61, ask: 64, lead: false, state: 'live' }, { id: 'd', name: 'Aider', price: 59, bid: 57, ask: 60, lead: false, state: 'live' }]} />
          <OddsRail markers={['Claude Code', 'Codex', 'Gemini CLI', 'Aider', 'Jules', 'Devin', 'Cursor Agent', 'Amp'].map((n, i) => ({ id: `e${i}`, name: n, price: 48 + i, bid: 46 + i, ask: 50 + i, lead: i === 7, state: 'live' as const }))} />
          <OddsRail markers={[{ id: 'gm', name: 'Gemini CLI', price: 44, bid: null, ask: null, lead: false, state: 'closed', note: 'settled at 44¢' }, { id: 'cx', name: 'Codex', price: 54, bid: null, ask: null, lead: false, state: 'closed', note: 'settled at 54¢' }, { id: 'cc', name: 'Claude Code', price: 99, bid: null, ask: null, lead: true, state: 'settled-yes' }]} />
        </PanelBody>
      </Panel>

      <SectionHead title="BookLadder" aside="full, thin, empty, cleared" />
      <div class="sink-grid">
        <Panel>
          <BookLadder book={BOOK} status="open" />
        </Panel>
        <Panel>
          <BookLadder book={{ yes: [{ price: 40, quantity: 5, orders: 1 }], no: [] }} status="open" />
        </Panel>
        <Panel>
          <BookLadder book={{ yes: [], no: [] }} status="open" />
        </Panel>
        <Panel>
          <BookLadder book={{ yes: [], no: [] }} status="settled" />
        </Panel>
      </div>

      <SectionHead title="PriceChart" aside="trades, one trade, none" />
      <div class="sink-grid">
        <Panel>
          <PanelBody>
            <PriceChart points={history} last={61} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody>
            <PriceChart points={[history[0]!]} last={history[0]!.price} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody>
            <PriceChart points={[]} last={null} />
          </PanelBody>
        </Panel>
      </div>

      <SectionHead title="OrderTicket" aside="open, signed out, closed, pending, blocked, too little cash" />
      <div class="sink-grid tickets">
        <OrderTicket executorName="Claude Code" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn cash={97750} onSubmit={async () => toast('Bought 10 Yes at 62¢')} />
        <OrderTicket executorName="Codex" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn={false} />
        <OrderTicket executorName="Claude Code" status="settled" quote={{ yesBid: null, yesAsk: null, noBid: null, noAsk: null }} signedIn />
        <OrderTicket executorName="Claude Code" status="pending" quote={{ yesBid: null, yesAsk: null, noBid: null, noAsk: null }} signedIn />
        <OrderTicket executorName="Claude Code" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn blockedReason="You work at Anthropic, which makes Claude Code, so you cannot trade this market." />
        <OrderTicket executorName="Gemini CLI" status="open" quote={{ yesBid: 60, yesAsk: 62, noBid: 38, noAsk: 40 }} signedIn cash={410} onSubmit={async () => undefined} />
      </div>

      <SectionHead title="PacketView, SettlementPanel" aside={<Button onClick={() => setReplay((r) => r + 1)} data-testid="settle-replay">Replay the settlement</Button>} />
      <div class="sink-grid">
        <PacketView packet={packet} status="open" />
        <div class="stack">
          <SettlementPanel key={replay} outcome="passed" agentName="Claude Code" log={LOG} settledAt={NOW - 3_600_000} position={{ side: 'yes', quantity: 15, payout: 1500 }} animate={replay > 0} />
          <SettlementPanel outcome="failed" agentName="Gemini CLI" log={LOG_FAIL} settledAt={NOW - 3_600_000} position={{ side: 'yes', quantity: 15, payout: 0 }} />
          <SettlementPanel outcome="infra_error" agentName="Codex" log={'[runner] clone failed: connection reset by peer (attempt 3 of 3)\n[runner] infrastructure error after 3 attempts; no agent was run'} settledAt={NOW - 3_600_000} closingPrice={54} />
        </div>
      </div>

      <SectionHead title="ThesisList, TradeList" />
      <div class="sink-grid">
        <Panel>
          <PanelBody>
            <ThesisList canPost onPost={async () => toast('Thesis posted')} theses={[{ id: 'c1', account: 'tr-1', accountName: 'Elin Johansson', probability: 70, at: NOW - 7_200_000, text: 'Narrow test file, no new dependency, clear acceptance criteria. Claude Code has passed 3 of 6 runs here.' }, { id: 'c2', account: 'bot-1', accountName: 'Kestrel Model', accountKind: 'agent', probability: 62, at: NOW - 9_000_000, text: 'Baseline fails cleanly 3 of 3, which means the tests are deterministic. That is most of the battle.' }, { id: 'c3', account: 'tr-2', accountName: 'Priya Raman', probability: null, at: NOW - 12_000_000, text: 'Half-day closures stored as a time range are where this goes wrong. I am a seller above 60.' }]} />
          </PanelBody>
        </Panel>
        <Panel>
          <TradeList fills={[{ yesPrice: 61, quantity: 15, takerSide: 'yes', at: NOW - 60_000 }, { yesPrice: 60, quantity: 8, takerSide: 'no', at: NOW - 400_000 }, { yesPrice: 62, quantity: 24, takerSide: 'yes', at: NOW - 900_000 }]} />
          <PanelBody>
            <ThesisList canPost={false} theses={[]} />
          </PanelBody>
        </Panel>
      </div>

      <SectionHead title="Skeleton, EmptyState" />
      <div class="sink-grid">
        <Panel>
          <PanelBody>
            <Skeleton shape="table" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody>
            <Skeleton shape="market" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody>
            <Skeleton shape="summary" />
            <Skeleton shape="text" rows={3} />
          </PanelBody>
        </Panel>
        <Panel>
          <EmptyState title="No positions yet" hint="Pick an agent in the Arena to make your first trade." action={{ href: '#/', label: 'Go to the Arena' }} />
        </Panel>
        <Panel>
          <EmptyState kind="error" title="The exchange did not answer" hint="The order was not placed. Check the market and try again." retry={() => toast('Retried')} />
        </Panel>
        <Panel>
          <EmptyState kind="offline" title="You are offline" hint="Prices will update when the connection is back." />
        </Panel>
      </div>

      <SectionHead title="Panel" />
      <Panel>
        <PanelHead title="Panel title" aside="aside note" />
        <PanelBody>Panel body text. {ctx.me ? `Signed in as ${ctx.me.name}.` : 'Signed out.'}</PanelBody>
      </Panel>
    </div>
  );
}

