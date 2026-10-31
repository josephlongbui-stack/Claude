import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';
import { Button, EmptyState, FetchError, Money, PageHead, Panel, SectionHead, Skeleton, StatusPill, Table, Td, TitleCell, Tr, count, dollars, toast } from '../ui/index.js';
import { words } from './Market.js';

export function Portfolio({ ctx }: { ctx: Ctx }) {
  const [pf, setPf] = useState<any | null>(null);
  const [titles, setTitles] = useState<Record<string, { title: string; agent: string; taskId: string }>>({});
  const [error, setError] = useState<any | null>(null);
  const load = () =>
    Promise.all([api('GET', '/api/portfolio'), api<{ tasks: any[] }>('GET', '/api/tasks').catch(() => ({ tasks: [] }))])
      .then(([p, t]) => {
        setPf(p);
        const map: Record<string, { title: string; agent: string; taskId: string }> = {};
        for (const e of t.tasks) for (const m of e.markets) map[m.marketId] = { title: e.task.title, agent: `${m.executor.name} ${m.executor.version}`, taskId: e.task.id };
        setTitles(map);
        setError(null);
      })
      .catch((e) => setError(e));
  useEffect(() => {
    if (ctx.me) void load();
  }, [ctx.tick, ctx.me?.id]);

  if (!ctx.me) return <EmptyState page title="Sign in to see your portfolio" hint="New traders start with $1,000 in play money." action={{ href: '#/signin', label: 'Sign in' }} />;
  if (error) return <FetchError error={error} retry={() => void load()} />;
  if (!pf)
    return (
      <>
        <PageHead title="Portfolio" />
        <Skeleton shape="summary" />
        <Panel>
          <Skeleton shape="table" />
        </Panel>
      </>
    );
  const cancel = async (id: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(id)}`);
      toast('Order cancelled; the lock is back in your cash.');
      await Promise.all([load(), ctx.refreshMe()]);
    } catch (e: any) {
      toast(words(e), 'error');
    }
  };
  const agentOf = (executorId: string, market: string) => titles[market]?.agent ?? executorId;
  return (
    <>
      <PageHead title="Portfolio" />
      <div class="summary" data-testid="balances"><dl class="summary-list">
        <div class="hero">
          <dt>Play money</dt>
          <dd>{dollars(pf.cash)}</dd>
        </div>
        <div>
          <dt>Locked in orders</dt>
          <dd>{dollars(pf.locked)}</dd>
        </div>
        <div>
          <dt>{pf.pnl.fees > 0 ? `Realized, after ${dollars(pf.pnl.fees)} in fees` : 'Realized P&L'}</dt>
          <dd>
            <Money cents={pf.pnl.realized - pf.pnl.fees} signed />
          </dd>
        </div>
        <div data-testid="pnl-total">
          <dt>Total P&amp;L</dt>
          <dd>
            <Money cents={pf.pnl.total} signed />
          </dd>
        </div>
        </dl>
      </div>

      <SectionHead title="Positions" aside={pf.positions.length ? `${pf.positions.length} open` : undefined} />
      <Panel testId="positions">
        {pf.positions.length === 0 ? (
          <EmptyState title="No positions yet" hint="Pick an agent in the Arena to make your first trade." action={{ href: '#/', label: 'Go to the Arena' }} />
        ) : (
          <Table caption="Open positions" columns={[{ key: 'm', label: 'Market', width: 'task' }, { key: 'q', label: 'Holding', align: 'right' }, { key: 'c', label: 'Average cost', align: 'right', hideSm: true }, { key: 'k', label: 'Mark', align: 'right', hideSm: true }, { key: 'u', label: 'Unrealized', align: 'right' }]}>
            {pf.positions.map((p: any) => (
              <Tr key={p.market} href={`#/market/${encodeURIComponent(p.market)}`}>
                <Td>
                  <TitleCell title={p.title} sub={agentOf(p.executorId, p.market)} />
                </Td>
                <Td align="right" class="nowrap">
                  {count(p.quantity)} <span class={p.side === 'yes' ? 'yes' : 'no'}>{p.side === 'yes' ? 'Yes' : 'No'}</span>
                  <span class="show-sm t-caption ink-3">
                    at {p.avgCost}¢, mark {p.mark}¢
                  </span>
                </Td>
                <Td align="right" hideSm>
                  {p.avgCost}¢
                </Td>
                <Td align="right" hideSm>
                  {p.mark}¢
                </Td>
                <Td align="right">
                  <Money cents={p.unrealized} signed />
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>

      <SectionHead title="Open orders" aside={pf.openOrders.length ? `${pf.openOrders.length} resting` : undefined} />
      <Panel testId="open-orders">
        {pf.openOrders.length === 0 ? (
          <EmptyState title="No resting orders" hint="Limit orders that do not fill at once wait here until they fill or you cancel them." />
        ) : (
          <Table caption="Open orders" columns={[{ key: 'm', label: 'Market', width: 'task' }, { key: 'l', label: 'Resting', align: 'right' }, { key: 'p', label: 'Price', align: 'right' }, { key: 'k', label: 'Locked', align: 'right', hideSm: true }, { key: 'a', label: '', sr: 'Cancel' }]}>
            {pf.openOrders.map((o: any) => (
              <Tr key={o.id}>
                <Td>
                  <TitleCell title={titles[o.market]?.title ?? o.market} href={`#/market/${encodeURIComponent(o.market)}`} sub={titles[o.market]?.agent} />
                </Td>
                <Td align="right" class="nowrap">
                  {count(o.quantity - o.filled)} <span class={o.side === 'yes' ? 'yes' : 'no'}>{o.side === 'yes' ? 'Yes' : 'No'}</span>
                </Td>
                <Td align="right">{o.price}¢</Td>
                <Td align="right" hideSm>
                  {dollars(o.lockedRemaining ?? (o.quantity - o.filled) * (o.price + 1))}
                </Td>
                <Td align="right">
                  <Button variant="quiet" class="compact" onClick={() => cancel(o.id)} aria-label={`Cancel ${o.quantity - o.filled} ${o.side === 'yes' ? 'Yes' : 'No'} at ${o.price} cents`}>
                    Cancel
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>

      <SectionHead title="Settled" aside={pf.history.length ? `${pf.history.length} ${pf.history.length === 1 ? 'market' : 'markets'}` : undefined} />
      <Panel testId="history">
        {pf.history.length === 0 ? (
          <EmptyState title="Nothing has settled yet" hint="Markets settle when the chosen agent finishes its run, or at the closing price when it is not chosen." />
        ) : (
          <Table caption="Settled positions" columns={[{ key: 'm', label: 'Market', width: 'task' }, { key: 'o', label: 'Outcome' }, { key: 'h', label: 'Held', align: 'right', hideSm: true }, { key: 'p', label: 'Paid out', align: 'right' }, { key: 'r', label: 'Realized', align: 'right' }]}>
            {pf.history.map((h: any) => (
              <Tr key={h.market} href={`#/market/${encodeURIComponent(h.market)}`}>
                <Td>
                  <TitleCell title={h.title} sub={agentOf(h.executorId, h.market)} />
                </Td>
                <Td>
                  <StatusPill status={h.closed.outcome === 'passed' || h.closed.outcome === 'failed' ? h.closed.outcome : h.closed.outcome === 'infra_error' ? 'infra_error' : 'settled'}>{h.closed.outcome === 'passed' || h.closed.outcome === 'failed' ? undefined : `Settled at ${h.closed.settlementPrice}¢`}</StatusPill>
                </Td>
                <Td align="right" hideSm>
                  {h.closed.yes > 0 ? `${count(h.closed.yes)} Yes` : h.closed.no > 0 ? `${count(h.closed.no)} No` : '—'}
                </Td>
                <Td align="right">{dollars(h.payout)}</Td>
                <Td align="right">
                  <Money cents={h.realized} signed />
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
