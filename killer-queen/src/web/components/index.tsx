/** Killer Queen web components (docs/DESIGN_SYSTEM.md). Tokens only; every price is tabular; colour never carries meaning alone. */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { api, when } from '../api.js';

/* ---------- primitives ---------- */

export function Pill({ status, children }: { status: string; children?: ComponentChildren }) {
  return <span class={`pill ${status}`}>{children ?? status}</span>;
}

export function PriceCell({ value, side, big, suffix = '¢', label }: { value: number | null | undefined; side?: 'yes' | 'no'; big?: boolean; suffix?: string; label?: string }) {
  const text = value === null || value === undefined ? '—' : `${value}${suffix}`;
  return (
    <span class={`price ${side ?? ''} ${big ? 'big' : ''}`} aria-label={label ? `${label} ${text}` : undefined}>
      {text}
    </span>
  );
}

export function Skeleton({ lines = 3, width }: { lines?: number; width?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div class="skeleton" style={width ? `width:${width}` : i === lines - 1 ? 'width:60%' : ''} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div class="empty" role="status">
      <div>{title}</div>
      {hint && <div class="muted">{hint}</div>}
      {action && (
        <div style="margin-top:8px">
          <a href={action.href}>{action.label}</a>
        </div>
      )}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div class="empty" role="alert">
      <div class="no-c">Error: {message}</div>
      {retry && (
        <div style="margin-top:8px">
          <button onClick={retry}>Try again</button>
        </div>
      )}
    </div>
  );
}

/* ---------- market pieces ---------- */

export interface Level {
  price: number;
  quantity: number;
  orders: number;
}

export function OrderBookLadder({ book, status }: { book: { yes: Level[]; no: Level[] }; status?: string }) {
  const maxQ = Math.max(1, ...book.yes.map((l) => l.quantity), ...book.no.map((l) => l.quantity));
  const thin = book.yes.length + book.no.length > 0 && book.yes.length + book.no.length < 3;
  const side = (levels: Level[], kind: 'yes' | 'no') => (
    <table data-testid={`book-${kind}`} aria-label={`${kind === 'yes' ? 'Yes' : 'No'} bids`}>
      <thead>
        <tr>
          <th>Price</th>
          <th class="r">Qty</th>
        </tr>
      </thead>
      <tbody>
        {levels.length === 0 && (
          <tr>
            <td colSpan={2} class="muted">
              {status && status !== 'open' ? 'book cleared' : 'no bids'}
            </td>
          </tr>
        )}
        {levels.map((l) => (
          <tr class={`bar ${kind}`} style={`--w:${(100 * l.quantity) / maxQ}%`}>
            <td>
              <span class="num">
                {l.price}¢{kind === 'no' && <span class="muted"> (ask {100 - l.price})</span>}
              </span>
            </td>
            <td class="r">
              <span class="num">{l.quantity}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      {thin && <p class="warn-c">Thin book: few resting orders; prices can move a lot on one trade.</p>}
      <div class="ladder">
        <div class="side">
          <h3 class="yes-c">Yes bids</h3>
          {side(book.yes, 'yes')}
        </div>
        <div class="side">
          <h3 class="no-c">No bids (= Yes asks)</h3>
          {side(book.no, 'no')}
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ points, height = 48 }: { points: { at: number; price: number }[]; height?: number }) {
  if (points.length < 2) return <p class="muted">No trades yet.</p>;
  const w = 300;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((p) => height - 4 - ((p.price - 1) / 98) * (height - 8));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!.price;
  return (
    <svg class="sparkline" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Price history, ${points.length} trades, last ${last} cents`}>
      <path class="area" d={`${d} L${w} ${height} L0 ${height} Z`} />
      <path d={d} />
    </svg>
  );
}

export function PacketView({ packet, compact }: { packet: any; compact?: boolean }) {
  return (
    <div class="packet" data-testid="packet">
      {!compact && <div class="mono">{packet.prompt}</div>}
      <dl>
        <dt>Repo</dt>
        <dd class="mono">
          {packet.repo} @ {packet.commit}
        </dd>
        <dt>Test command</dt>
        <dd class="mono">{packet.testCommand}</dd>
        <dt>Executor</dt>
        <dd>
          <span class="mono">{packet.executor.id}</span> · {packet.executor.org} · v{packet.executor.version} · record {packet.executor.passed}/{packet.executor.chosen}
        </dd>
        <dt>Baseline</dt>
        <dd>{packet.baseline}</dd>
        <dt>Closes</dt>
        <dd class="num">{when(packet.closesAt)}</dd>
      </dl>
    </div>
  );
}

export function AgentRow({ m, chosen, onOpen }: { m: any; chosen?: boolean; onOpen?: () => void }) {
  const chance = m.status === 'pending' || m.status === 'cancelled' ? null : m.status === 'settled' ? m.settlementPrice : m.status === 'open' ? m.quote.chance : m.closingPrice;
  return (
    <tr class={onOpen ? 'click' : ''} onClick={onOpen} data-testid={`market-row-${m.executorId}`}>
      <td>
        <a href={`#/market/${encodeURIComponent(m.marketId)}`} class="mono">
          {m.executorId}
        </a>
        <div class="muted">
          {m.executor.org} · v{m.executor.version} · {m.executor.passed}/{m.executor.chosen} passed
        </div>
        <div>
          {m.outcome && <Pill status={m.status}>{m.outcome}</Pill>} {chosen && <Pill status="running">chosen</Pill>} {m.status === 'pending' && <Pill status="pending">baseline</Pill>}
        </div>
      </td>
      <td class="r">
        <PriceCell value={chance} big label="chance" />
      </td>
      <td class="r">
        <span class="num">
          {m.quote.yesBid ?? '–'}/{m.quote.yesAsk ?? '–'}
        </span>
      </td>
      <td class="r num">{m.quote.volume}</td>
      <td class="r num">{m.traders}</td>
    </tr>
  );
}

export function ThesisList({ theses, canPost, onPost }: { theses: any[]; canPost: boolean; onPost: (text: string, probability: number | null) => Promise<void> }) {
  const [text, setText] = useState('');
  const [prob, setProb] = useState<number | ''>('');
  const submit = async (e: Event) => {
    e.preventDefault();
    await onPost(text, prob === '' ? null : Number(prob));
    setText('');
  };
  return (
    <div>
      {canPost && (
        <form onSubmit={submit}>
          <label for="thesis-text">Thesis</label>
          <textarea id="thesis-text" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Why will it pass or fail?" data-testid="thesis-text" required />
          <div class="row">
            <div>
              <label for="thesis-prob">Stated probability (optional)</label>
              <input id="thesis-prob" type="number" min={1} max={99} value={prob} onInput={(e) => setProb((e.target as HTMLInputElement).value === '' ? '' : Number((e.target as HTMLInputElement).value))} />
            </div>
            <button data-testid="post-thesis">Post</button>
          </div>
        </form>
      )}
      {theses.length === 0 && <p class="muted">No theses yet.</p>}
      {theses.map((c) => (
        <div class="thesis">
          <div>
            <b class="mono">{c.account}</b> {c.probability !== null && <span class="num">· {c.probability}%</span>} <span class="muted num">· {when(c.at)}</span>
          </div>
          <div>{c.text}</div>
        </div>
      ))}
    </div>
  );
}

export interface TicketProps {
  marketId: string;
  open: boolean;
  signedIn: boolean;
  blockedReason?: string | null;
  onPlaced?: () => void | Promise<void>;
  toast: (msg: string, err?: boolean) => void;
}

export function OrderTicket({ marketId, open, signedIn, blockedReason, onPlaced, toast }: TicketProps) {
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState(50);
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  if (!signedIn)
    return (
      <p class="muted">
        <a href="#/account">Sign in</a> to trade.
      </p>
    );
  if (!open) return <p class="muted">{blockedReason ?? 'Trading is closed.'}</p>;
  if (blockedReason) return <p class="warn-c">{blockedReason}</p>;
  const effPrice = type === 'market' ? 99 : action === 'sell' ? 100 - price : price;
  const lock = (effPrice + 1) * qty;
  const place = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: any = { marketId, side, action, type, quantity: Number(qty) };
      if (type === 'limit') body.price = Number(price);
      const r = await api<{ order: any; fills: any[] }>('POST', '/api/orders', body);
      const filled = r.fills.reduce((a, f) => a + f.quantity, 0);
      toast(`${action} ${side}: ${filled} filled${r.order.status === 'open' ? `, ${r.order.quantity - r.order.filled} resting` : ''}.`);
      await onPlaced?.();
    } catch (err: any) {
      toast(`${err.error} (${err.code})`, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={place} data-testid="ticket" aria-label="Order ticket">
      <div class="row" role="group" aria-label="Side">
        <button type="button" class={side === 'yes' ? 'yes' : ''} aria-pressed={side === 'yes'} onClick={() => setSide('yes')} data-testid="side-yes">
          Yes
        </button>
        <button type="button" class={side === 'no' ? 'no' : ''} aria-pressed={side === 'no'} onClick={() => setSide('no')} data-testid="side-no">
          No
        </button>
      </div>
      <div class="row">
        <div>
          <label for="t-action">Action</label>
          <select id="t-action" value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value as any)} data-testid="action">
            <option value="buy">Buy</option>
            <option value="sell">Sell (= buy the other side)</option>
          </select>
        </div>
        <div>
          <label for="t-type">Type</label>
          <select id="t-type" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as any)} data-testid="type">
            <option value="limit">Limit</option>
            <option value="market">Market (IOC at 99¢)</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div>
          <label for="t-price">Price (¢)</label>
          <input id="t-price" type="number" min={1} max={99} value={price} disabled={type === 'market'} onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))} data-testid="price" />
        </div>
        <div>
          <label for="t-qty">Quantity</label>
          <input id="t-qty" type="number" min={1} value={qty} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))} data-testid="quantity" />
        </div>
      </div>
      <p class="muted">
        Locks {effPrice + 1}¢ × {qty} = <span class="num">${(lock / 100).toFixed(2)}</span> (price + 1¢ taker fee; the fee returns if you make)
      </p>
      <p>
        <button class={`primary ${side}`} disabled={busy} data-testid="place-order">
          {action === 'buy' ? 'Buy' : 'Sell'} {side.toUpperCase()}
        </button>
      </p>
    </form>
  );
}
