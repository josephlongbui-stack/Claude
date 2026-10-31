import { useEffect, useState } from 'preact/hooks';
import { api, countdown, when } from '../api.js';
import type { Ctx } from '../main.js';

export function Market({ ctx, id }: { ctx: Ctx; id: string }) {
  const [v, setV] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState(50);
  const [qty, setQty] = useState(10);
  const [thesis, setThesis] = useState('');
  const [prob, setProb] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [pf, setPf] = useState<any | null>(null);
  useEffect(() => {
    api('GET', `/api/markets/${encodeURIComponent(id)}`)
      .then((x) => {
        setV(x);
        setErr(null);
      })
      .catch((e) => setErr(e.error));
    if (ctx.me) api('GET', '/api/portfolio').then(setPf).catch(() => setPf(null));
  }, [id, ctx.tick, ctx.me?.id]);
  if (err) return <div class="empty no-c">{err}</div>;
  if (!v) return <div class="empty">Loading…</div>;
  const m = v.market;
  const p = v.packet;
  const open = m.status === 'open';
  const pos = pf?.positions?.find((x: any) => x.market === id) ?? null;
  const myOrders = pf?.openOrders?.filter((o: any) => o.market === id) ?? [];
  const place = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: any = { marketId: id, side, action, type, quantity: Number(qty) };
      if (type === 'limit') body.price = Number(price);
      const r = await api<{ order: any; fills: any[] }>('POST', '/api/orders', body);
      const filled = r.fills.reduce((a, f) => a + f.quantity, 0);
      ctx.toast(`${action} ${side}: ${filled} filled${r.order.status === 'open' ? `, ${r.order.quantity - r.order.filled} resting` : ''}.`);
      await ctx.refreshMe();
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (orderId: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(orderId)}`);
      ctx.toast('Order cancelled.');
      await ctx.refreshMe();
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  const post = async (e: Event) => {
    e.preventDefault();
    try {
      await api('POST', `/api/markets/${encodeURIComponent(id)}/comments`, { text: thesis, probability: prob === '' ? null : Number(prob) });
      setThesis('');
      ctx.toast('Thesis posted.');
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  const maxQ = Math.max(1, ...v.book.yes.map((l: any) => l.quantity), ...v.book.no.map((l: any) => l.quantity));
  return (
    <div>
      <h1>
        Will <span class="mono">{p.executor.name}</span> pass <span class="mono">{p.testCommand}</span>? <span class={`pill ${m.status}`} data-testid="market-status">{m.status}</span>
      </h1>
      <p class="muted">
        <a href={`#/task/${encodeURIComponent(m.taskId)}`}>{p.title}</a> · {p.repo} @ {p.commit} · {p.executor.org} v{p.executor.version} · record {p.executor.passed}/{p.executor.chosen} ·{' '}
        baseline {p.baseline} · {open ? `closes in ${countdown(p.closesAt, Date.now())}` : m.status === 'pending' ? 'not open yet' : m.status === 'cancelled' ? 'cancelled' : m.outcome ? `settled ${m.outcome} at ${m.settlementPrice}¢` : `closed at ${m.closingPrice}¢`}
      </p>
      <div class="grid cols-3">
        <div class="panel">
          <h2>Order book</h2>
          <p>
            <span class="chance num" data-testid="chance">{v.quote.chance}¢</span> <span class="muted">chance · last {v.quote.lastPrice ?? '—'} · vol {v.quote.volume} · OI {v.quote.openInterest} · {v.traders} traders</span>
          </p>
          <div class="ladder">
            <div class="side">
              <h3 class="yes-c">Yes bids</h3>
              <table data-testid="book-yes">
                <tbody>
                  {v.book.yes.length === 0 && (
                    <tr>
                      <td class="muted">no bids</td>
                    </tr>
                  )}
                  {v.book.yes.map((l: any) => (
                    <tr class="bar yes" style={`--w:${(100 * l.quantity) / maxQ}%`}>
                      <td class="num">
                        <span>{l.price}¢</span>
                      </td>
                      <td class="r num">
                        <span>{l.quantity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="side">
              <h3 class="no-c">No bids (= Yes asks)</h3>
              <table data-testid="book-no">
                <tbody>
                  {v.book.no.length === 0 && (
                    <tr>
                      <td class="muted">no bids</td>
                    </tr>
                  )}
                  {v.book.no.map((l: any) => (
                    <tr class="bar no" style={`--w:${(100 * l.quantity) / maxQ}%`}>
                      <td class="num">
                        <span>
                          {l.price}¢ <span class="muted">(ask {100 - l.price})</span>
                        </span>
                      </td>
                      <td class="r num">
                        <span>{l.quantity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <h2 style="margin-top:10px">Recent trades</h2>
          <table>
            <tbody>
              {v.trades.length === 0 && (
                <tr>
                  <td class="muted">no trades yet</td>
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
        <div class="panel">
          <h2>Order ticket</h2>
          {!ctx.me && (
            <p class="muted">
              <a href="#/account">Sign in</a> to trade.
            </p>
          )}
          {ctx.me && !open && <p class="muted">{m.status === 'pending' ? 'Trading opens after the baseline check.' : m.status === 'cancelled' ? 'This task was rejected at the baseline check; the market never opened.' : 'Trading is closed.'}</p>}
          {ctx.me && open && (
            <form onSubmit={place} data-testid="ticket">
              <div class="row">
                <button type="button" class={side === 'yes' ? 'yes' : ''} onClick={() => setSide('yes')} data-testid="side-yes">
                  Yes
                </button>
                <button type="button" class={side === 'no' ? 'no' : ''} onClick={() => setSide('no')} data-testid="side-no">
                  No
                </button>
              </div>
              <div class="row">
                <div>
                  <label>Action</label>
                  <select value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value as any)} data-testid="action">
                    <option value="buy">Buy</option>
                    <option value="sell">Sell (= buy the other side)</option>
                  </select>
                </div>
                <div>
                  <label>Type</label>
                  <select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as any)} data-testid="type">
                    <option value="limit">Limit</option>
                    <option value="market">Market (IOC at 99¢)</option>
                  </select>
                </div>
              </div>
              <div class="row">
                <div>
                  <label>Price (¢)</label>
                  <input type="number" min={1} max={99} value={price} disabled={type === 'market'} onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))} data-testid="price" />
                </div>
                <div>
                  <label>Quantity</label>
                  <input type="number" min={1} value={qty} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))} data-testid="quantity" />
                </div>
              </div>
              <p class="muted">
                Locks {type === 'market' ? 99 + 1 : (action === 'sell' ? 100 - price : price) + 1}¢ × {qty} = <span class="num">${(((type === 'market' ? 100 : (action === 'sell' ? 100 - price : price) + 1) * qty) / 100).toFixed(2)}</span> (price + 1¢ taker fee; fee returns if you make)
              </p>
              <p>
                <button class={`primary ${side}`} disabled={busy} data-testid="place-order">
                  {action === 'buy' ? 'Buy' : 'Sell'} {side.toUpperCase()}
                </button>
              </p>
            </form>
          )}
          {pos && (
            <p data-testid="position">
              Position: <b class={pos.side === 'yes' ? 'yes-c' : 'no-c'}>{pos.quantity} {pos.side}</b> @ avg {pos.avgCost}¢ · mark {pos.mark}¢ · unrealized <span class="num">{(pos.unrealized / 100).toFixed(2)}</span>
            </p>
          )}
          {myOrders.length > 0 && (
            <table>
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
                      <button onClick={() => cancel(o.id)}>cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div class="panel">
          <h2>Theses</h2>
          {ctx.me && open && (
            <form onSubmit={post}>
              <textarea value={thesis} onInput={(e) => setThesis((e.target as HTMLTextAreaElement).value)} placeholder="Why will it pass or fail?" data-testid="thesis-text" />
              <div class="row">
                <div>
                  <label>Stated probability (optional)</label>
                  <input type="number" min={1} max={99} value={prob} onInput={(e) => setProb((e.target as HTMLInputElement).value === '' ? '' : Number((e.target as HTMLInputElement).value))} />
                </div>
                <button data-testid="post-thesis">Post</button>
              </div>
            </form>
          )}
          {v.theses.length === 0 && <p class="muted">No theses yet.</p>}
          {v.theses.map((c: any) => (
            <div class="thesis">
              <div>
                <b class="mono">{c.account}</b> {c.probability !== null && <span class="num">· {c.probability}%</span>} <span class="muted num">· {when(c.at)}</span>
              </div>
              <div>{c.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
