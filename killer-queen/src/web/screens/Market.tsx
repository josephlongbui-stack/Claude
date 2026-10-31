import { useEffect, useState } from 'preact/hooks';
import { api, countdown, when } from '../api.js';
import { ErrorState, OrderBookLadder, OrderTicket, PacketView, Pill, PriceCell, Skeleton, Sparkline, ThesisList } from '../components/index.js';
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
      <div class="grid cols-3">
        <div class="panel">
          <Skeleton lines={6} />
        </div>
        <div class="panel">
          <Skeleton lines={4} />
        </div>
        <div class="panel">
          <Skeleton lines={3} />
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
  const statusLine = open
    ? `closes in ${countdown(p.closesAt, Date.now())}`
    : m.status === 'pending'
      ? 'opens after the baseline check'
      : m.status === 'cancelled'
        ? 'task rejected at the baseline; never opened'
        : m.status === 'running'
          ? 'closed; the chosen agent is running'
          : m.outcome
            ? `settled ${m.outcome} at ${m.settlementPrice}¢ · ${when(m.closedAt ?? null)}`
            : `closed at ${m.closingPrice}¢`;
  const blocked = m.status === 'pending' ? 'Trading opens after the baseline check.' : m.status === 'cancelled' ? 'This task was rejected at the baseline check; the market never opened.' : m.status !== 'open' ? 'Trading is closed.' : null;
  return (
    <div>
      <h1>
        Will <span class="mono">{p.executor.name}</span> pass <span class="mono">{p.testCommand}</span>? <Pill status={m.status} />
      </h1>
      <p class="muted">
        <a href={`#/task/${encodeURIComponent(m.taskId)}`}>{p.title}</a> · {statusLine}
      </p>
      <div class="grid cols-3">
        <div class="panel">
          <h2>Order book</h2>
          <p>
            <PriceCell value={v.quote.chance} big label="chance" /> <span class="muted">chance · last {v.quote.lastPrice ?? '—'} · vol {v.quote.volume} · OI {v.quote.openInterest} · {v.traders} traders</span>
          </p>
          <OrderBookLadder book={v.book} status={m.status} />
          <h2 style="margin-top:12px">Price</h2>
          <Sparkline points={v.priceHistory} />
          <h2 style="margin-top:12px">Recent trades</h2>
          <div class="scroll-x">
            <table aria-label="Recent trades">
              <tbody>
                {v.trades.length === 0 && (
                  <tr>
                    <td class="muted">No trades yet.</td>
                  </tr>
                )}
                {v.trades.slice(0, 15).map((f: any) => (
                  <tr>
                    <td class="num">{f.yesPrice}¢</td>
                    <td class="num r">{f.quantity}</td>
                    <td class={f.takerSide === 'yes' ? 'yes-c' : 'no-c'}>{f.takerSide} taker</td>
                    <td class="muted num">{when(f.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <h2>Order ticket</h2>
          <OrderTicket marketId={id} open={open} signedIn={!!ctx.me} blockedReason={blocked} toast={ctx.toast} onPlaced={() => ctx.refreshMe()} />
          {pos && (
            <p data-testid="position">
              Position: <b class={pos.side === 'yes' ? 'yes-c' : 'no-c'}>{pos.quantity} {pos.side}</b> @ avg <span class="num">{pos.avgCost}¢</span> · mark <span class="num">{pos.mark}¢</span> · unrealized <span class="num">{(pos.unrealized / 100).toFixed(2)}</span>
            </p>
          )}
          {myOrders.length > 0 && (
            <table aria-label="My open orders">
              <thead>
                <tr>
                  <th>My open orders</th>
                  <th class="r">Price</th>
                  <th class="r">Left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {myOrders.map((o: any) => (
                  <tr>
                    <td class={o.side === 'yes' ? 'yes-c' : 'no-c'}>{o.side}</td>
                    <td class="r num">{o.price}¢</td>
                    <td class="r num">{o.quantity - o.filled}</td>
                    <td class="r">
                      <button onClick={() => cancel(o.id)} aria-label={`Cancel order ${o.id}`}>
                        cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style="margin-top:12px">Packet</h2>
          <PacketView packet={p} compact />
        </div>
        <div class="panel">
          <h2>Theses</h2>
          <ThesisList theses={v.theses} canPost={!!ctx.me && open} onPost={post} />
        </div>
      </div>
    </div>
  );
}
