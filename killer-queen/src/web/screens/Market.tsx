import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useTitle, type Ctx } from '../main.js';
import { BookLadder, Button, ChangeCell, Countdown, EmptyState, Icon, IconButton, Money, OrderTicket, PacketView, Panel, PanelBody, PanelHead, PriceCell, PriceChart, SettlementPanel, Skeleton, StatusPill, Tabs, ThesisList, TradeList, dollars, marketStatus, toast, type OrderInput } from '../ui/index.js';
import { when } from '../ui/PacketView.js';

export function Market({ ctx, id }: { ctx: Ctx; id: string }) {
  const [v, setV] = useState<any | null>(null);
  const [task, setTask] = useState<any | null>(null);
  const [pf, setPf] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'theses' | 'trades'>('theses');
  const [sheet, setSheet] = useState<null | 'yes' | 'no'>(null);
  // The one animation runs only when this viewer saw the market move from unsettled to settled.
  const seenUnsettled = useRef(false);
  const [animateSettle, setAnimateSettle] = useState(false);
  const side = /[?&]side=(yes|no)/.exec(location.hash)?.[1] as 'yes' | 'no' | undefined;
  const load = () =>
    api('GET', `/api/markets/${encodeURIComponent(id)}`)
      .then((x) => {
        setV(x);
        setError(null);
        return api('GET', `/api/tasks/${encodeURIComponent(x.market.taskId)}`).then(setTask).catch(() => undefined);
      })
      .catch((e) => setError(e.status === 404 ? 'not_found' : (e.error ?? 'The exchange did not answer.')));
  const loadPf = () => (ctx.me ? api('GET', '/api/portfolio').then(setPf).catch(() => setPf(null)) : Promise.resolve(setPf(null)));
  useEffect(() => {
    void load();
    void loadPf();
  }, [id, ctx.tick, ctx.me?.id]);
  useTitle(v ? `${v.packet.executor.name} on ${v.packet.title}` : null);
  useEffect(() => {
    if (!v) return;
    if (v.market.status !== 'settled') seenUnsettled.current = true;
    else if (seenUnsettled.current) {
      setAnimateSettle(true);
      seenUnsettled.current = false;
    }
  }, [v?.market.status]);

  if (error === 'not_found') return <EmptyState title="There is no market at this address" hint="It may have been removed, or the link is wrong." action={{ href: '#/', label: 'Go to the Arena' }} />;
  if (error) return <EmptyState kind="error" title="The exchange did not answer" hint={error} retry={() => void load()} />;
  if (!v)
    return (
      <div class="market">
        <Panel class="col-packet">
          <PanelBody>
            <Skeleton shape="text" rows={8} />
          </PanelBody>
        </Panel>
        <div class="col-centre">
          <Skeleton shape="market" />
        </div>
        <Panel class="col-ticket">
          <PanelBody>
            <Skeleton shape="text" rows={6} />
          </PanelBody>
        </Panel>
      </div>
    );

  const m = v.market;
  const p = v.packet;
  const open = m.status === 'open';
  const st = marketStatus(m);
  const onTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed' || m.outcome === 'infra_error');
  const chance = v.quote.chance;
  const name = p.executor.name;
  const pos = pf?.positions?.find((x: any) => x.market === id) ?? null;
  const closed = pf?.history?.find((x: any) => x.market === id) ?? null;
  const myOrders = pf?.openOrders?.filter((o: any) => o.market === id) ?? [];
  const me = ctx.me;
  const blocked = !me
    ? null
    : me.role !== 'trader'
      ? `${me.role === 'customer' ? 'Customers' : 'Staff accounts'} cannot trade. Create a trader account to buy and sell.`
      : task && task.task.customer === me.id
        ? 'You submitted this task, so you cannot trade its markets.'
        : me.org && me.org === p.executor.org
          ? `You are at ${me.org}, which makes ${name}, so you cannot trade this market.`
          : task && me.org && task.task.customerOrg && me.org === task.task.customerOrg
            ? `You are at ${me.org}, which submitted this task, so you cannot trade it.`
            : null;

  const place = async (o: OrderInput) => {
    try {
      const r = await api<{ order: any; fills: any[] }>('POST', '/api/orders', { marketId: id, side: o.side, action: o.action, type: o.type, quantity: o.quantity, ...(o.price !== undefined ? { price: o.price } : {}) });
      const filled = r.fills.reduce((a, f) => a + f.quantity, 0);
      const Side = o.side === 'yes' ? 'Yes' : 'No';
      const verb = o.action === 'buy' ? 'Bought' : 'Sold';
      const resting = r.order.quantity - r.order.filled;
      const avg = filled ? Math.round(r.fills.reduce((a, f) => a + f.quantity * (o.side === 'yes' ? f.yesPrice : 100 - f.yesPrice), 0) / filled) : null;
      toast(filled ? `${verb} ${filled} ${Side} at ${avg}¢${resting > 0 ? `; ${resting} resting at ${o.price}¢` : ''}` : resting > 0 ? `${o.quantity} ${Side} resting at ${o.price}¢; it fills when someone takes it` : 'Nothing was available at that price');
      setSheet(null);
      await Promise.all([load(), loadPf(), ctx.refreshMe()]);
    } catch (e: any) {
      throw new Error(words(e));
    }
  };
  const cancel = async (orderId: string) => {
    try {
      await api('DELETE', `/api/orders/${encodeURIComponent(orderId)}`);
      toast('Order cancelled; the lock is back in your cash.');
      await Promise.all([load(), loadPf(), ctx.refreshMe()]);
    } catch (e: any) {
      toast(words(e), 'error');
    }
  };
  const post = async (text: string, probability: number | null) => {
    try {
      await api('POST', `/api/markets/${encodeURIComponent(id)}/comments`, { text, probability });
      toast('Thesis posted.');
      await load();
    } catch (e: any) {
      throw new Error(words(e));
    }
  };
  const report = async (commentId: string) => {
    try {
      await api('POST', `/api/markets/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/report`, { reason: 'reported from the market page' });
      toast('Reported. An operator will look at it.');
    } catch (e: any) {
      toast(words(e), 'error');
    }
  };

  const heroLine = open ? (
    <>
      <b>{chance}% chance</b> {name} passes <ChangeCell delta={v.quote.change} /> {v.quote.change !== null && v.quote.change !== undefined ? 'today' : ''}
    </>
  ) : m.status === 'pending' ? (
    <>Trading opens after the baseline check.</>
  ) : m.status === 'cancelled' ? (
    <>The task was rejected at the baseline check; this market never opened.</>
  ) : m.status === 'running' ? (
    <>
      Closed at <b>{m.closingPrice}¢</b>. {name} is running now; the market settles on the result.
    </>
  ) : m.status === 'closed' ? (
    <>
      Closed at <b>{m.closingPrice}¢</b>, waiting for the customer to pick an agent.
    </>
  ) : m.outcome === 'passed' ? (
    <>
      <b>{name} passed.</b> Yes paid 100¢, No paid 0¢.
    </>
  ) : m.outcome === 'failed' ? (
    <>
      <b>{name} failed.</b> No paid 100¢, Yes paid 0¢.
    </>
  ) : m.outcome === 'infra_error' ? (
    <>
      <b>No result.</b> An infrastructure error stopped the run; settled at the closing price of {m.settlementPrice}¢.
    </>
  ) : (
    <>
      Settled at <b>{m.settlementPrice}¢</b>, the closing price: the customer ran a different agent.
    </>
  );
  const heroTone = m.status === 'settled' && m.outcome === 'passed' ? 'yes' : m.status === 'settled' && m.outcome === 'failed' ? 'no' : undefined;
  const ticketQuote = { yesBid: v.quote.yesBid, yesAsk: v.quote.yesAsk, noBid: v.quote.noBid, noAsk: v.quote.noAsk };

  const yourSide = (
    <>
      {m.status === 'settled' && closed && (
        <Panel testId="your-result">
          <PanelHead title="Your result" />
          <PanelBody>
            <dl class="kv">
              <dt>Held at close</dt>
              <dd>
                {closed.closed.yes > 0 ? `${closed.closed.yes} Yes` : closed.closed.no > 0 ? `${closed.closed.no} No` : 'nothing'}
              </dd>
              <dt>Paid out</dt>
              <dd>
                <Money cents={closed.payout} />
              </dd>
              <dt>Realized</dt>
              <dd>
                <Money cents={closed.realized} signed />
              </dd>
            </dl>
            <Button href="#/portfolio" block>
              See your portfolio
            </Button>
          </PanelBody>
        </Panel>
      )}
      {pos && pos.side && (
        <Panel testId="position">
          <PanelHead title="Your position" />
          <PanelBody>
            <dl class="kv">
              <dt>Holding</dt>
              <dd class={pos.side === 'yes' ? 'yes' : 'no'}>
                {pos.quantity} {pos.side === 'yes' ? 'Yes' : 'No'}
              </dd>
              <dt>Average cost</dt>
              <dd>{pos.avgCost}¢</dd>
              <dt>Mark</dt>
              <dd>{pos.mark}¢</dd>
              <dt>Unrealized</dt>
              <dd>
                <Money cents={pos.unrealized} signed />
              </dd>
            </dl>
          </PanelBody>
        </Panel>
      )}
      {myOrders.length > 0 && (
        <Panel testId="my-orders">
          <PanelHead title="Your open orders" />
          <table class="table">
            <caption class="sr-only">Your open orders on this market</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col" class="r">Price</th>
                <th scope="col" class="r">Left</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {myOrders.map((o: any) => (
                <tr key={o.id}>
                  <td class={o.side === 'yes' ? 'yes' : 'no'}>{o.side === 'yes' ? 'Yes' : 'No'}</td>
                  <td class="r">{o.price}¢</td>
                  <td class="r">{o.quantity - o.filled}</td>
                  <td class="r">
                    <Button variant="quiet" class="compact" onClick={() => cancel(o.id)} aria-label={`Cancel ${o.quantity - o.filled} ${o.side === 'yes' ? 'Yes' : 'No'} at ${o.price} cents`}>
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );

  return (
    <>
      <p class="crumb t-dense ink-2">
        <a href={`#/task/${encodeURIComponent(m.taskId)}`}>{p.title}</a>
      </p>
      <div class="market" data-testid="market-status" data-status={m.status}>
        <aside class="col-packet">
          <PacketView packet={p} status={st} closedLabel={m.status === 'settled' ? 'Settled' : m.status === 'open' || m.status === 'pending' ? 'Trading closes' : 'Trading closed'} />
        </aside>
        <div class="col-centre">
          <div class="chance-hero">
            <PriceCell cents={m.status === 'pending' || m.status === 'cancelled' ? null : chance} size="xl" side={heroTone} label="chance" class="chance" />
            <p class="hero-line t-body ink-2" data-testid="chance">
              {heroLine}
            </p>
            {open && (
              <span class="hero-closes">
                <Countdown closesAt={p.closesAt} label="Closes in" />
              </span>
            )}
          </div>
          <PriceChart points={v.priceHistory} last={m.lastPrice} />
          {onTests && task && task.task.chosenAgent === m.executorId && (
            <SettlementPanel outcome={m.outcome} agentName={name} log={task.task.runLog} settledAt={task.task.resolvedAt} closingPrice={m.closingPrice} animate={animateSettle} onDone={() => void ctx.refreshMe()} position={closed && (closed.closed.yes > 0 || closed.closed.no > 0) ? { side: closed.closed.yes > 0 ? 'yes' : 'no', quantity: closed.closed.yes > 0 ? closed.closed.yes : closed.closed.no, payout: closed.payout } : null} />
          )}
          <Panel>
            <BookLadder book={v.book} status={m.status} />
          </Panel>
          <div class="market-tabs">
            <Tabs label="Theses and trades" value={tab} onChange={setTab} tabs={[{ id: 'theses', label: 'Theses', count: v.theses.length }, { id: 'trades', label: 'Trades', count: v.trades.length }]} />
            {tab === 'theses' ? <ThesisList theses={v.theses} canPost={!!me && open && !blocked} onPost={post} onReport={me ? report : undefined} /> : <TradeList fills={v.trades} />}
          </div>
        </div>
        <aside class="col-ticket">
          <OrderTicket executorName={name} status={m.status} quote={ticketQuote} signedIn={!!me} cash={me?.cash} blockedReason={blocked} initialSide={side} onSubmit={place} />
        </aside>
        {(pos || closed || myOrders.length > 0) && <div class="col-yours">{yourSide}</div>}
      </div>
      {open && (
        <div class="sticky-bar">
          <Button variant="yes" solid onClick={() => setSheet('yes')} data-testid="sheet-yes">
            Buy Yes {v.quote.yesAsk === null ? '' : `${v.quote.yesAsk}¢`}
          </Button>
          <Button variant="no" solid onClick={() => setSheet('no')} data-testid="sheet-no">
            Buy No {v.quote.noAsk === null ? '' : `${v.quote.noAsk}¢`}
          </Button>
        </div>
      )}
      {sheet && (
        <div class="sheet-scrim" onClick={() => setSheet(null)}>
          <div class="sheet" role="dialog" aria-label={`Trade ${name}`} onClick={(e) => e.stopPropagation()}>
            <div class="sheet-head">
              <span class="t-h3">{name}</span>
              <IconButton onClick={() => setSheet(null)} aria-label="Close">
                <Icon name="x" />
              </IconButton>
            </div>
            <OrderTicket compact executorName={name} status={m.status} quote={ticketQuote} signedIn={!!me} cash={me?.cash} blockedReason={blocked} initialSide={sheet} onSubmit={place} />
          </div>
        </div>
      )}
      <p class="sr-only">Last price {m.lastPrice ?? 'none'}; {dollars(0)} fee shown in the ticket.</p>
    </>
  );
}

/** API errors in plain words. */
export function words(e: any): string {
  const code = e?.code;
  const msg: string = e?.error ?? '';
  switch (code) {
    case 'insufficient_funds': {
      const m = /need (\d+).*have (\d+)/.exec(msg);
      return m ? `Not enough play money. You need ${dollars(Number(m[1]))} and have ${dollars(Number(m[2]))}.` : 'Not enough play money for this order.';
    }
    case 'conflict':
      return 'You cannot trade this market: ' + msg + '.';
    case 'market_not_open':
    case 'task_not_open':
      return 'Trading has closed on this market.';
    case 'market_pending':
      return 'Trading opens after the baseline check.';
    case 'trading_paused':
      return 'Trading is paused on the whole exchange right now. Cancels still work.';
    case 'rate_limited':
      return 'Too many requests in a minute. Wait a moment and try again.';
    case 'bad_price':
      return 'Price is a whole number of cents from 1 to 99.';
    case 'bad_quantity':
      return 'Contracts is a whole number of at least 1.';
    case 'unauthorized':
      return 'Your session ended. Sign in again.';
    default:
      return msg ? msg[0]!.toUpperCase() + msg.slice(1) + '.' : 'That did not work.';
  }
}
