import { useEffect, useState } from 'preact/hooks';
import { api, countdown } from '../api.js';
import { Card, ErrorState, OrderBookLadder, OrderTicket, PacketView, Pill, PriceCell, Skeleton, Sparkline, ThesisList } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Market({ ctx, id }: { ctx: Ctx; id: string }) {
  const [v, setV] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pf, setPf] = useState<any | null>(null);
  const load = () =>
    api('GET', `/api/markets/${encodeURIComponent(id)}`)
      .then((x) => {
        setV(x);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
  useEffect(() => {
    void load();
    if (ctx.me) api('GET', '/api/portfolio').then(setPf).catch(() => setPf(null));
  }, [id, ctx.tick, ctx.me?.id]);
  if (err) return <ErrorState message={err} retry={() => void load()} />;
  if (!v)
    return (
      <div class="split">
        <div class="card card-body">
          <Skeleton lines={8} />
        </div>
        <div class="card card-body">
          <Skeleton lines={5} />
        </div>
      </div>
    );
  const m = v.market;
  const p = v.packet;
  const open = m.status === 'open';
  const pos = pf?.positions?.find((x: any) => x.market === id) ?? null;
  const myOrders = pf?.openOrders?.filter((o: any) => o.market === id) ?? [];
  const cancel = async (orderId: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(orderId)}`);
      ctx.toast('Order cancelled.');
      await ctx.refreshMe();
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  const post = async (text: string, probability: number | null) => {
    try {
      await api('POST', `/api/markets/${encodeURIComponent(id)}/comments`, { text, probability });
      ctx.toast('Thesis posted.');
      await load();
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  const settledOnTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed');
  const statusLine = open
    ? `closes in ${countdown(p.closesAt, Date.now())}`
    : m.status === 'pending'
      ? 'opens after the baseline check'
      : m.status === 'cancelled'
        ? 'never opened: the task was rejected at the baseline'
        : m.status === 'running'
          ? 'closed · the chosen agent is running'
          : m.outcome
            ? `settled ${m.outcome} at ${m.settlementPrice}¢`
            : `closed at ${m.closingPrice}¢`;
  const blocked = m.status === 'pending' ? 'Trading opens after the baseline check.' : m.status === 'cancelled' ? 'This task was rejected at the baseline check; the market never opened.' : m.status !== 'open' ? 'Trading is closed on this market.' : null;
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div class="grow">
          <div class="row wrap" style="margin-bottom:8px">
            <a href={`#/task/${encodeURIComponent(m.taskId)}`} class="muted">
              ← {p.title}
            </a>
          </div>
          <h1>Will {p.executor.name} pass the tests?</h1>
          <div class="row wrap" style="margin-top:10px">
            <Pill status={m.status} />
            <span class="muted num">{statusLine}</span>
            <span class="chip">{p.testCommand}</span>
          </div>
        </div>
        <div style="text-align:right">
          <PriceCell value={v.quote.chance} size="big" label="chance" side={settledOnTests ? (m.outcome === 'passed' ? 'yes' : 'no') : undefined} />
          <div class="muted" style="font-size:12.5px;margin-top:4px">
            chance · {v.quote.volume.toLocaleString()} traded · {v.traders} traders
          </div>
        </div>
      </div>
      <div class="split trade-first">
        <div class="stack" style="gap:16px">
          <Card title="Order book" sub={v.quote.lastPrice !== null ? `Last trade ${v.quote.lastPrice}¢ · open interest ${v.quote.openInterest}` : 'No trades yet'}>
            <OrderBookLadder book={v.book} status={m.status} />
          </Card>
          <div class="grid grid-2">
            <Card title="Price">
              <Sparkline points={v.priceHistory} height={110} />
            </Card>
            <Card title="Recent trades" flush>
              <div class="table-wrap">
                <table aria-label="Recent trades">
                  <tbody>
                    {v.trades.length === 0 && (
                      <tr>
                        <td class="muted">No trades yet.</td>
                      </tr>
                    )}
                    {v.trades.slice(0, 8).map((f: any) => (
                      <tr>
                        <td class="num" style="font-weight:600">
                          {f.yesPrice}¢
                        </td>
                        <td class="num r">{f.quantity}</td>
                        <td class={f.takerSide === 'yes' ? 'yes-c' : 'no-c'}>{f.takerSide === 'yes' ? 'bought Yes' : 'bought No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <Card title="Theses" sub={`${v.theses.length} posted`}>
            <ThesisList theses={v.theses} canPost={!!ctx.me && open} onPost={post} />
          </Card>
        </div>
        <div class="side stack" style="gap:16px">
          <Card title="Trade">
            <OrderTicket marketId={id} open={open} signedIn={!!ctx.me} blockedReason={blocked} quote={{ yesAsk: v.quote.yesAsk, noAsk: v.quote.noAsk }} toast={ctx.toast} onPlaced={() => ctx.refreshMe()} />
          </Card>
          {(pos || myOrders.length > 0) && (
            <Card title="Your position" flush>
              {pos && (
                <div class="card-body tight" data-testid="position">
                  <div class="row between">
                    <span>
                      <b class={pos.side === 'yes' ? 'yes-c' : 'no-c'}>
                        {pos.quantity} {pos.side === 'yes' ? 'Yes' : 'No'}
                      </b>{' '}
                      <span class="muted num">@ avg {pos.avgCost}¢ · mark {pos.mark}¢</span>
                    </span>
                    <span class={`num ${pos.unrealized >= 0 ? 'yes-c' : 'no-c'}`} style="font-weight:600">
                      {pos.unrealized >= 0 ? '+' : '−'}${(Math.abs(pos.unrealized) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {myOrders.length > 0 && (
                <table aria-label="My open orders">
                  <thead>
                    <tr>
                      <th>Open order</th>
                      <th class="r">Price</th>
                      <th class="r">Left</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {myOrders.map((o: any) => (
                      <tr>
                        <td class={o.side === 'yes' ? 'yes-c' : 'no-c'} style="font-weight:600">
                          {o.side === 'yes' ? 'Yes' : 'No'}
                        </td>
                        <td class="r num">{o.price}¢</td>
                        <td class="r num">{o.quantity - o.filled}</td>
                        <td class="r">
                          <button class="ghost" onClick={() => cancel(o.id)} aria-label={`Cancel order ${o.id}`}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
          <Card title="Packet">
            <PacketView packet={p} compact />
          </Card>
        </div>
      </div>
    </div>
  );
}
