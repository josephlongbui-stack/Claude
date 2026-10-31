import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from './Button.js';
import { Field, Input } from './Field.js';
import { Panel, PanelBody, PanelHead } from './Panel.js';
import { dollars } from './Price.js';
import { Tabs } from './Tabs.js';
import './ticket.css';

export interface TicketQuote {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
}

export interface OrderInput {
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
}

export interface OrderTicketProps {
  executorName: string;
  status: string;
  quote: TicketQuote;
  signedIn: boolean;
  /** Cash available, for the "not enough play money" check. */
  cash?: number;
  /** Why this account cannot trade here (conflict), if so. */
  blockedReason?: string | null;
  initialSide?: 'yes' | 'no';
  onSubmit?: (order: OrderInput) => Promise<void>;
  /** Rendered inside the phone sheet. */
  compact?: boolean;
}

const FEE = 1;

/** Buy or sell Yes or No: side, contracts, limit price, cost, fee and payout, then one button that says what happens. */
export function OrderTicket({ executorName, status, quote, signedIn, cash, blockedReason, initialSide, onSubmit, compact }: OrderTicketProps) {
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [side, setSide] = useState<'yes' | 'no'>(initialSide ?? 'yes');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [qty, setQty] = useState('10');
  const ask = (s: 'yes' | 'no') => (s === 'yes' ? quote.yesAsk : quote.noAsk);
  const bid = (s: 'yes' | 'no') => (s === 'yes' ? quote.yesBid : quote.noBid);
  const [price, setPrice] = useState(String(ask(initialSide ?? 'yes') ?? 50));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initialSide) setSide(initialSide);
  }, [initialSide]);
  const pick = (s: 'yes' | 'no') => {
    setSide(s);
    const ref = action === 'buy' ? ask(s) : bid(s);
    if (ref !== null) setPrice(String(ref));
    setError(null);
  };
  const switchAction = (a: 'buy' | 'sell') => {
    setAction(a);
    const ref = a === 'buy' ? ask(side) : bid(side);
    if (ref !== null) setPrice(String(ref));
    setError(null);
  };
  const Side = side === 'yes' ? 'Yes' : 'No';

  if (!signedIn)
    return (
      <Shell compact={compact} executorName={executorName}>
        <p class="ticket-note">Trading is free and uses play money. New traders start with $1,000.</p>
        <Button variant="primary" size={40} block href="#/signin" data-testid="ticket-signin">
          Start trading with $1,000 in play money
        </Button>
      </Shell>
    );
  if (blockedReason)
    return (
      <Shell compact={compact} executorName={executorName}>
        <p class="ticket-note" data-testid="ticket-blocked">
          {blockedReason}
        </p>
      </Shell>
    );
  if (status !== 'open')
    return (
      <Shell compact={compact} executorName={executorName}>
        <p class="ticket-note" data-testid="ticket-closed">
          {status === 'pending' ? 'Trading opens after the baseline check confirms the tests fail at the pinned commit.' : status === 'cancelled' ? 'This task was rejected at the baseline check, so the market never opened.' : status === 'running' ? 'Trading has closed. The chosen agent is running now; the market settles on its result.' : 'Trading has closed on this market.'}
        </p>
      </Shell>
    );

  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const p = type === 'market' ? 99 : Math.min(99, Math.max(1, Math.floor(Number(price) || 0)));
  const lockPrice = action === 'buy' ? p : 100 - p;
  const cost = q * lockPrice;
  const fee = q * FEE;
  const pays = q * 100;
  const short = cash !== undefined && q >= 1 && cost + fee > cash;
  const valid = q >= 1 && (type === 'market' || (p >= 1 && p <= 99)) && !short;
  const shortWords = short ? `Not enough play money. You need ${dollars(cost + fee)} and have ${dollars(cash ?? 0)}.` : null;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (short) {
      setError(`Not enough play money. You need ${dollars(cost + fee)} and have ${dollars(cash ?? 0)}.`);
      return;
    }
    if (!valid || !onSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ side, action, type, quantity: q, ...(type === 'limit' ? { price: p } : {}) });
    } catch (err) {
      setError((err as Error).message || 'The order was not placed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell compact={compact} executorName={executorName} head={<Tabs tabs={[{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' }]} value={action} onChange={switchAction} label="Buy or sell" />}>
      <form class="ticket-form" onSubmit={submit} data-testid="ticket" aria-label={`Order ticket for ${executorName}`}>
        <div class="ticket-sides" role="group" aria-label="Side">
          <button type="button" class={`btn side yes ${side === 'yes' ? 'solid' : ''}`} aria-pressed={side === 'yes'} onClick={() => pick('yes')} data-testid="side-yes">
            Yes <span class="px">{(action === 'buy' ? quote.yesAsk : quote.yesBid) === null ? '—' : `${action === 'buy' ? quote.yesAsk : quote.yesBid}¢`}</span>
          </button>
          <button type="button" class={`btn side no ${side === 'no' ? 'solid' : ''}`} aria-pressed={side === 'no'} onClick={() => pick('no')} data-testid="side-no">
            No <span class="px">{(action === 'buy' ? quote.noAsk : quote.noBid) === null ? '—' : `${action === 'buy' ? quote.noAsk : quote.noBid}¢`}</span>
          </button>
        </div>
        <div class="ticket-grid">
          <Field label="Contracts" htmlFor="t-qty">
            <Input id="t-qty" type="number" inputMode="numeric" min={1} step={1} value={qty} onInput={(e: Event) => setQty((e.target as HTMLInputElement).value)} data-testid="quantity" />
          </Field>
          <Field label={type === 'market' ? 'Price' : 'Limit price'} htmlFor="t-price" help={type === 'market' ? 'Takes the best resting price, up to 99¢.' : 'Fills at the resting price or better.'}>
            <span class="input-suffix">
              <Input id="t-price" type="number" inputMode="numeric" min={1} max={99} step={1} value={type === 'market' ? '' : price} placeholder={type === 'market' ? 'best' : undefined} disabled={type === 'market'} onInput={(e: Event) => setPrice((e.target as HTMLInputElement).value)} data-testid="price" />
              <span class="sfx">¢</span>
            </span>
          </Field>
        </div>
        <label class="check ticket-type">
          <input type="checkbox" checked={type === 'market'} onChange={(e) => setType((e.target as HTMLInputElement).checked ? 'market' : 'limit')} data-testid="type-market" />
          <span>Fill now at the best price</span>
        </label>
        <dl class="ticket-sum">
          <dt>{action === 'buy' ? 'Cost' : 'Locks'}</dt>
          <dd>{dollars(cost)}</dd>
          <dt>Fee</dt>
          <dd>{dollars(fee)}</dd>
          <dt>Total</dt>
          <dd class="total">{dollars(cost + fee)}</dd>
          <dt>{action === 'buy' ? 'Pays if right' : `Returns on ${Side} you hold`}</dt>
          <dd>{dollars(action === 'buy' ? pays : q * p)}</dd>
        </dl>
        {(error || shortWords) && (
          <p class="help error" role="alert" data-testid="ticket-error">
            {error ?? shortWords}
          </p>
        )}
        <Button type="submit" variant={side} solid size={40} block disabled={busy || q < 1 || short} data-testid="place-order">
          {short ? 'Not enough play money' : `${action === 'buy' ? 'Buy' : 'Sell'} ${Side} ${type === 'market' ? 'at the best price' : `at ${p}¢`}`}
        </Button>
        <p class="help">
          {action === 'buy' ? 'A winning contract pays 100¢. The fee is 1¢ a contract, returned on any part that rests.' : `Selling ${Side} you hold returns ${p}¢ a contract. Without ${Side} to sell, this buys ${side === 'yes' ? 'No' : 'Yes'} at ${100 - p}¢.`}
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children, compact, executorName, head }: { children: ComponentChildren; compact?: boolean; executorName: string; head?: ComponentChildren }) {
  if (compact) return <div class="ticket compact">{head}{children}</div>;
  return (
    <Panel class="ticket" testId="ticket-panel">
      <PanelHead title={head ? undefined : 'Trade'} aside={executorName}>
        {head}
      </PanelHead>
      <PanelBody>{children}</PanelBody>
    </Panel>
  );
}
