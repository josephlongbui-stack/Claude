import { useEffect, useState } from 'preact/hooks';
import { api, dollars, signed } from '../api.js';
import type { Ctx } from '../main.js';

export function Portfolio({ ctx }: { ctx: Ctx }) {
  const [pf, setPf] = useState<any | null>(null);
  useEffect(() => {
    if (!ctx.me) return;
    api('GET', '/api/portfolio').then(setPf).catch(() => setPf(null));
  }, [ctx.tick, ctx.me?.id]);
  if (!ctx.me)
    return (
      <div class="empty">
        <a href="#/account">Sign in</a> to see your portfolio.
      </div>
    );
  if (!pf) return <div class="empty">Loading…</div>;
  const cancel = async (id: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(id)}`);
      ctx.toast('Cancelled.');
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  return (
    <div>
      <h1>Portfolio</h1>
      <div class="grid cols-2">
        <div class="panel">
          <h2>Balance <span class="playmoney">play money · no cash value</span></h2>
          <table data-testid="balances">
            <tr>
              <th>Cash</th>
              <td class="r num">{dollars(pf.cash)}</td>
            </tr>
            <tr>
              <th>Locked in orders</th>
              <td class="r num">{dollars(pf.locked)}</td>
            </tr>
            <tr>
              <th>Deposited</th>
              <td class="r num">{dollars(pf.deposited)}</td>
            </tr>
            <tr>
              <th>Realized P&amp;L</th>
              <td class={`r num ${pf.pnl.realized >= 0 ? 'yes-c' : 'no-c'}`}>{signed(pf.pnl.realized)}</td>
            </tr>
            <tr>
              <th>Unrealized P&amp;L</th>
              <td class={`r num ${pf.pnl.unrealized >= 0 ? 'yes-c' : 'no-c'}`}>{signed(pf.pnl.unrealized)}</td>
            </tr>
            <tr>
              <th>Fees paid</th>
              <td class="r num">{dollars(pf.pnl.fees)}</td>
            </tr>
            <tr>
              <th>Total P&amp;L (net of fees)</th>
              <td class={`r num ${pf.pnl.total >= 0 ? 'yes-c' : 'no-c'}`} data-testid="pnl-total">
                {signed(pf.pnl.total)}
              </td>
            </tr>
          </table>
        </div>
        <div class="panel">
          <h2>Open orders</h2>
          {pf.openOrders.length === 0 && <p class="muted">None.</p>}
          {pf.openOrders.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th class="r">Price</th>
                  <th class="r">Left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pf.openOrders.map((o: any) => (
                  <tr>
                    <td>
                      <a href={`#/market/${encodeURIComponent(o.market)}`} class="mono">
                        {o.market}
                      </a>
                    </td>
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
      </div>
      <div class="panel" style="margin-top:12px">
        <h2>Positions</h2>
        {pf.positions.length === 0 && <p class="muted">No open positions.</p>}
        {pf.positions.length > 0 && (
          <table data-testid="positions">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th class="r">Qty</th>
                <th class="r">Avg cost</th>
                <th class="r">Mark</th>
                <th class="r">Unrealized</th>
              </tr>
            </thead>
            <tbody>
              {pf.positions.map((p: any) => (
                <tr>
                  <td>
                    <a href={`#/market/${encodeURIComponent(p.market)}`}>{p.title}</a> <span class="mono muted">{p.executorId}</span>
                  </td>
                  <td class={p.side === 'yes' ? 'yes-c' : 'no-c'}>{p.side}</td>
                  <td class="r num">{p.quantity}</td>
                  <td class="r num">{p.avgCost}¢</td>
                  <td class="r num">{p.mark}¢</td>
                  <td class={`r num ${p.unrealized >= 0 ? 'yes-c' : 'no-c'}`}>{signed(p.unrealized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div class="panel" style="margin-top:12px">
        <h2>Settled history</h2>
        {pf.history.length === 0 && <p class="muted">Nothing settled yet.</p>}
        {pf.history.length > 0 && (
          <table data-testid="history">
            <thead>
              <tr>
                <th>Market</th>
                <th>Outcome</th>
                <th class="r">Held</th>
                <th class="r">Settled at</th>
                <th class="r">Payout</th>
                <th class="r">Realized</th>
              </tr>
            </thead>
            <tbody>
              {pf.history.map((h: any) => (
                <tr>
                  <td>
                    <a href={`#/market/${encodeURIComponent(h.market)}`}>{h.title}</a> <span class="mono muted">{h.executorId}</span>
                  </td>
                  <td>
                    <span class="pill">{h.closed.outcome}</span>
                  </td>
                  <td class="r num">
                    {h.closed.yes > 0 ? `${h.closed.yes} yes` : h.closed.no > 0 ? `${h.closed.no} no` : '—'}
                  </td>
                  <td class="r num">{h.closed.settlementPrice}¢</td>
                  <td class="r num">{dollars(h.payout)}</td>
                  <td class={`r num ${h.realized >= 0 ? 'yes-c' : 'no-c'}`}>{signed(h.realized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
