/** Dev-only: every component in every state, for screenshots and the ui-reviewer. */
import { AgentRow, EmptyState, ErrorState, OrderBookLadder, OrderTicket, PacketView, Pill, PriceCell, Skeleton, Sparkline, ThesisList } from '../components/index.js';
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
const executor = { id: 'codex', org: 'OpenAI', version: '0.48.0', chosen: 12, passed: 8 };
const row = (status: string, extra: any = {}) => ({ marketId: `tsk_1:${status}`, executorId: 'codex', executor, status, quote: { yesBid: 66, yesAsk: 71, volume: 120, chance: 69 }, closingPrice: 68, settlementPrice: null, outcome: null, traders: 5, ...extra });
const fullBook = { yes: [{ price: 66, quantity: 30, orders: 1 }, { price: 65, quantity: 12, orders: 2 }, { price: 60, quantity: 40, orders: 3 }], no: [{ price: 29, quantity: 30, orders: 1 }, { price: 25, quantity: 50, orders: 2 }] };
const thinBook = { yes: [{ price: 40, quantity: 1, orders: 1 }], no: [] };
const history = Array.from({ length: 30 }, (_, i) => ({ at: i, price: 50 + Math.round(15 * Math.sin(i / 4)) + (i % 3) }));

export function KitchenSink({ ctx }: { ctx: Ctx }) {
  return (
    <div class="sink">
      <h1>Kitchen sink (dev only)</h1>
      <section class="panel">
        <h2>Tokens</h2>
        {['--bg', '--panel', '--panel-2', '--line', '--text', '--muted', '--yes', '--no', '--accent', '--warn'].map((v) => (
          <span>
            <span class="swatch" style={`background:var(${v})`} /> <span class="mono">{v}</span>{' '}
          </span>
        ))}
        <p>
          Body text · <span class="num">1,234.56 tabular</span> · <span class="mono">mono packet text</span> · <span class="muted">muted</span>
        </p>
      </section>
      <section class="panel">
        <h2>Pills (status is also text, never colour alone)</h2>
        {['pending', 'open', 'closed', 'running', 'resolved', 'settled', 'skipped', 'rejected', 'cancelled', 'passed', 'failed'].map((s) => (
          <>
            <Pill status={s} />{' '}
          </>
        ))}
      </section>
      <section class="panel">
        <h2>PriceCell</h2>
        <PriceCell value={69} /> <PriceCell value={69} side="yes" /> <PriceCell value={31} side="no" /> <PriceCell value={null} /> <PriceCell value={69} big label="chance" />
      </section>
      <section class="panel">
        <h2>AgentRow states</h2>
        <div class="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th class="r">Chance</th>
                <th class="r">Bid/Ask</th>
                <th class="r">Vol</th>
                <th class="r">Traders</th>
              </tr>
            </thead>
            <tbody>
              <AgentRow m={row('pending', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
              <AgentRow m={row('open')} />
              <AgentRow m={row('closed')} />
              <AgentRow m={row('running')} chosen />
              <AgentRow m={row('settled', { settlementPrice: 100, outcome: 'passed' })} chosen />
              <AgentRow m={row('settled', { settlementPrice: 68, outcome: 'unchosen' })} />
              <AgentRow m={row('cancelled', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
            </tbody>
          </table>
        </div>
      </section>
      <section class="grid cols-2">
        <div class="panel">
          <h2>OrderBookLadder · full</h2>
          <OrderBookLadder book={fullBook} status="open" />
        </div>
        <div class="panel">
          <h2>OrderBookLadder · thin</h2>
          <OrderBookLadder book={thinBook} status="open" />
          <h2 style="margin-top:12px">OrderBookLadder · empty, closed</h2>
          <OrderBookLadder book={{ yes: [], no: [] }} status="closed" />
        </div>
      </section>
      <section class="grid cols-2">
        <div class="panel">
          <h2>Sparkline</h2>
          <Sparkline points={history} />
          <h2 style="margin-top:12px">Sparkline · no trades</h2>
          <Sparkline points={[]} />
        </div>
        <div class="panel">
          <h2>PacketView</h2>
          <PacketView packet={packet} />
        </div>
      </section>
      <section class="grid cols-3">
        <div class="panel">
          <h2>OrderTicket · open</h2>
          <OrderTicket marketId="tsk_1:codex" open signedIn toast={ctx.toast} />
        </div>
        <div class="panel">
          <h2>OrderTicket · signed out / closed / pending</h2>
          <OrderTicket marketId="x" open signedIn={false} toast={ctx.toast} />
          <OrderTicket marketId="x" open={false} signedIn toast={ctx.toast} />
          <OrderTicket marketId="x" open={false} signedIn blockedReason="Trading opens after the baseline check." toast={ctx.toast} />
        </div>
        <div class="panel">
          <h2>ThesisList</h2>
          <ThesisList theses={[{ account: 'sim-1', probability: 71, at: 1793412000000, text: 'Narrow pytest file; standard runner. I put it at 71%.' }]} canPost onPost={async () => ctx.toast('posted (demo)')} />
          <h2 style="margin-top:12px">ThesisList · empty</h2>
          <ThesisList theses={[]} canPost={false} onPost={async () => undefined} />
        </div>
      </section>
      <section class="grid cols-3">
        <div class="panel">
          <h2>Skeleton (loading)</h2>
          <Skeleton lines={4} />
        </div>
        <div class="panel">
          <h2>EmptyState</h2>
          <EmptyState title="No tasks yet." hint="Submit one as a customer." action={{ href: '#/submit', label: 'Submit a task' }} />
        </div>
        <div class="panel">
          <h2>ErrorState</h2>
          <ErrorState message="rate limited: 30 orders per minute" retry={() => ctx.toast('retried (demo)')} />
        </div>
      </section>
    </div>
  );
}
