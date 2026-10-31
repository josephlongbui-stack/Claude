import { useEffect, useState } from 'preact/hooks';
import { api, dollars, signed } from '../api.js';
import { Card, EmptyState, Pill, Skeleton, Stat } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Portfolio({ ctx }: { ctx: Ctx }) {
  const [pf, setPf] = useState<any | null>(null);
  useEffect(() => {
    if (!ctx.me) return;
    api('GET', '/api/portfolio').then(setPf).catch(() => setPf(null));
  }, [ctx.tick, ctx.me?.id]);
  if (!ctx.me) return <EmptyState title="Sign in to see your portfolio" hint="New traders start with $1,000 of play money." action={{ href: '#/account', label: 'Sign in or create an account' }} />;
  if (!pf)
    return (
      <div class="card card-body">
        <Skeleton lines={6} />
      </div>
    );
  const cancel = async (id: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(id)}`);
      ctx.toast('Order cancelled.');
    } catch (e: any) {
      ctx.toast(`${e.error} (${e.code})`, true);
    }
  };
  const pnl = (n: number) => <span class={n >= 0 ? 'yes-c' : 'no-c'}>{signed(n)}</span>;
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Portfolio</h1>
          <p class="sub">Play money · no cash value</p>
        </div>
      </div>
      <div class="grid grid-4" data-testid="balances">
        <Stat label="Cash" value={dollars(pf.cash)} hint={`${dollars(pf.locked)} locked in orders`} />
        <Stat label="Total P&L" value={pnl(pf.pnl.total)} hint="net of fees" testId="pnl-total" />
        <Stat label="Realized" value={pnl(pf.pnl.realized)} hint={`${dollars(pf.pnl.fees)} in fees`} />
        <Stat label="Unrealized" value={pnl(pf.pnl.unrealized)} hint="open positions at the live price" />
      </div>
      <Card title="Positions" sub={pf.positions.length ? `${pf.positions.length} open` : undefined} flush testId="positions">
        {pf.positions.length === 0 && (
          <div class="card-body">
            <p class="muted">
              No open positions. <a href="#/">Find a market</a>.
            </p>
          </div>
        )}
        {pf.positions.length > 0 && (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th class="r">Contracts</th>
                  <th class="r">Avg cost</th>
                  <th class="r">Mark</th>
                  <th class="r">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {pf.positions.map((p: any) => (
                  <tr class="click" onClick={() => (location.hash = `#/market/${encodeURIComponent(p.market)}`)}>
                    <td>
                      <div style="font-weight:500">{p.title}</div>
                      <div class="muted" style="font-size:12.5px">
                        {p.executorId}
                      </div>
                    </td>
                    <td class={p.side === 'yes' ? 'yes-c' : 'no-c'} style="font-weight:600">
                      {p.side === 'yes' ? 'Yes' : 'No'}
                    </td>
                    <td class="r num">{p.quantity}</td>
                    <td class="r num">{p.avgCost}¢</td>
                    <td class="r num">{p.mark}¢</td>
                    <td class="r num">{pnl(p.unrealized)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div class="grid grid-2">
        <Card title="Open orders" flush>
          {pf.openOrders.length === 0 && (
            <div class="card-body">
              <p class="muted">None resting.</p>
            </div>
          )}
          {pf.openOrders.length > 0 && (
            <div class="table-wrap">
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
                        <a href={`#/market/${encodeURIComponent(o.market)}`} class="code">
                          {o.market}
                        </a>
                      </td>
                      <td class={o.side === 'yes' ? 'yes-c' : 'no-c'} style="font-weight:600">
                        {o.side === 'yes' ? 'Yes' : 'No'}
                      </td>
                      <td class="r num">{o.price}¢</td>
                      <td class="r num">{o.quantity - o.filled}</td>
                      <td class="r">
                        <button class="ghost" onClick={() => cancel(o.id)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Settled" flush testId="history">
          {pf.history.length === 0 && (
            <div class="card-body">
              <p class="muted">Nothing settled yet.</p>
            </div>
          )}
          {pf.history.length > 0 && (
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Outcome</th>
                    <th class="r">Held</th>
                    <th class="r">Payout</th>
                    <th class="r">Realized</th>
                  </tr>
                </thead>
                <tbody>
                  {pf.history.map((h: any) => (
                    <tr class="click" onClick={() => (location.hash = `#/market/${encodeURIComponent(h.market)}`)}>
                      <td>
                        <div style="font-weight:500">{h.title}</div>
                        <div class="muted" style="font-size:12.5px">
                          {h.executorId}
                        </div>
                      </td>
                      <td>
                        <Pill status={h.closed.outcome === 'passed' || h.closed.outcome === 'failed' ? h.closed.outcome : 'settled'}>{h.closed.outcome}</Pill>
                      </td>
                      <td class="r num">{h.closed.yes > 0 ? `${h.closed.yes} Yes` : h.closed.no > 0 ? `${h.closed.no} No` : '—'}</td>
                      <td class="r num">{dollars(h.payout)}</td>
                      <td class="r num">{pnl(h.realized)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
