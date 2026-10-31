/** Dev-only: every component in every state, for screenshots and the ui-reviewer. */
import { AgentRow, Card, ChanceBar, EmptyState, ErrorState, OrderBookLadder, OrderTicket, PacketView, Pill, PriceCell, Segmented, Skeleton, Sparkline, Stat, ThesisList } from '../components/index.js';
import type { Ctx } from '../main.js';

const packet = {
  marketId: 'tsk_8f2a:codex',
  title: 'Reject negative quantities in the cart API',
  baseline: 'failing 3/3',
  prompt: 'POST /cart/items accepts quantity -3 ... add tests for 0, -1 and non-integers.',
  repo: 'github.com/example-org/shop-api',
  commit: '58b0ce4',
  testCommand: 'pytest tests/api/test_cart.py',
  executor: { id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0', chosen: 12, passed: 8 },
  closesAt: 1793412000000,
  quote: { yesBid: 66, yesAsk: 71, noBid: 29, noAsk: 34 },
  lastPrice: 69,
};
const executor = { id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0', chosen: 12, passed: 8 };
const row = (status: string, extra: any = {}) => ({ marketId: `tsk_1:${status}`, executorId: 'codex', executor, status, quote: { yesBid: 66, yesAsk: 71, volume: 120, chance: 69 }, closingPrice: 68, settlementPrice: null, outcome: null, traders: 5, ...extra });
const fullBook = { yes: [{ price: 66, quantity: 30, orders: 1 }, { price: 65, quantity: 12, orders: 2 }, { price: 60, quantity: 40, orders: 3 }], no: [{ price: 29, quantity: 30, orders: 1 }, { price: 25, quantity: 50, orders: 2 }] };
const history = Array.from({ length: 30 }, (_, i) => ({ at: i, price: 50 + Math.round(15 * Math.sin(i / 4)) + (i % 3) }));

export function KitchenSink({ ctx }: { ctx: Ctx }) {
  return (
    <div class="sink stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Components</h1>
          <p class="sub">Every component in every state, in the current theme.</p>
        </div>
      </div>
      <Card title="Tokens">
        <div class="row wrap" style="gap:12px">
          {['--bg', '--panel', '--panel-2', '--line', '--text', '--muted', '--yes', '--no', '--accent', '--warn'].map((v) => (
            <span class="row">
              <span class="swatch" style={`background:var(${v})`} /> <span class="code">{v}</span>
            </span>
          ))}
        </div>
        <p style="margin-top:12px">
          Body text · <span class="num">1,234.56 tabular</span> · <span class="code">code and commits</span> · <span class="muted">muted</span>
        </p>
      </Card>
      <Card title="Pills · status is also text">
        <div class="row wrap">
          {['pending', 'open', 'closed', 'running', 'resolved', 'settled', 'skipped', 'rejected', 'cancelled', 'passed', 'failed', 'private'].map((s) => (
            <Pill status={s} />
          ))}
        </div>
      </Card>
      <div class="grid grid-4">
        <Stat label="Open markets" value={12} />
        <Stat label="Contracts traded" value="4,312" hint="today" />
        <Stat label="Price accuracy" value="0.184" hint="Brier · lower is better" />
        <Stat label="Median spread" value="6¢" hint="target 6¢ or less" />
      </div>
      <Card title="PriceCell · ChanceBar · Segmented">
        <div class="stack">
          <div class="row" style="gap:24px;align-items:baseline">
            <PriceCell value={69} /> <PriceCell value={69} side="yes" /> <PriceCell value={31} side="no" /> <PriceCell value={null} /> <PriceCell value={69} size="md" /> <PriceCell value={69} size="big" />
          </div>
          <ChanceBar value={69} />
          <ChanceBar value={35} muted />
          <Segmented value="open" label="demo" onChange={() => undefined} options={[{ value: 'open', label: 'Live · 3' }, { value: 'done', label: 'Settled · 9' }, { value: 'all', label: 'All' }]} />
        </div>
      </Card>
      <Card title="AgentRow states" flush>
        <AgentRow m={row('pending', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
        <AgentRow m={row('open')} />
        <AgentRow m={row('closed')} />
        <AgentRow m={row('running')} chosen />
        <AgentRow m={row('settled', { settlementPrice: 100, outcome: 'passed' })} chosen />
        <AgentRow m={row('settled', { settlementPrice: 68, outcome: 'unchosen' })} />
        <AgentRow m={row('cancelled', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
      </Card>
      <div class="grid grid-2">
        <Card title="OrderBookLadder · full">
          <OrderBookLadder book={fullBook} status="open" />
        </Card>
        <Card title="OrderBookLadder · thin and cleared">
          <div class="stack">
            <OrderBookLadder book={{ yes: [{ price: 40, quantity: 1, orders: 1 }], no: [] }} status="open" />
            <OrderBookLadder book={{ yes: [], no: [] }} status="closed" />
          </div>
        </Card>
      </div>
      <div class="grid grid-2">
        <Card title="Sparkline">
          <div class="stack">
            <Sparkline points={history} />
            <Sparkline points={[]} />
          </div>
        </Card>
        <Card title="PacketView">
          <PacketView packet={packet} />
        </Card>
      </div>
      <div class="grid grid-3">
        <Card title="OrderTicket · open">
          <OrderTicket marketId="tsk_1:codex" open signedIn quote={{ yesAsk: 71, noAsk: 34 }} toast={ctx.toast} />
        </Card>
        <Card title="OrderTicket · signed out / closed / pending">
          <div class="stack">
            <OrderTicket marketId="x" open signedIn={false} toast={ctx.toast} />
            <OrderTicket marketId="x" open={false} signedIn toast={ctx.toast} />
            <OrderTicket marketId="x" open={false} signedIn blockedReason="Trading opens after the baseline check." toast={ctx.toast} />
          </div>
        </Card>
        <Card title="ThesisList">
          <ThesisList theses={[{ account: 'sim-1', probability: 71, at: 1793412000000, text: 'Narrow pytest file; standard runner. I put it at 71%.' }]} canPost onPost={async () => ctx.toast('posted (demo)')} />
        </Card>
      </div>
      <div class="grid grid-3">
        <Card title="Skeleton">
          <Skeleton lines={4} />
        </Card>
        <Card title="EmptyState">
          <EmptyState title="No tasks yet" hint="Submit one as a customer." action={{ href: '#/submit', label: 'Submit a task' }} />
        </Card>
        <Card title="ErrorState">
          <ErrorState message="rate limited: 30 orders per minute" retry={() => ctx.toast('retried (demo)')} />
        </Card>
      </div>
      <Card title="Callouts">
        <div class="stack">
          <div class="callout">Neutral note.</div>
          <div class="callout info">Informational note.</div>
          <div class="callout warn">Thin book: few resting orders.</div>
          <div class="callout yes">Codex passed · Yes paid 100¢</div>
          <div class="callout no">Codex failed · No paid 100¢</div>
        </div>
      </Card>
    </div>
  );
}
