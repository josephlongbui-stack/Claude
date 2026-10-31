/** Killer Queen web components (docs/DESIGN_SYSTEM.md). Tokens only; prices are tabular; colour never carries meaning alone. */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { api, when } from '../api.js';

/* ---------- primitives ---------- */

export function Pill({ status, children }: { status: string; children?: ComponentChildren }) {
  return <span class={`pill ${status}`}>{children ?? status}</span>;
}

export function PriceCell({ value, side, size, suffix = '¢', label }: { value: number | null | undefined; side?: 'yes' | 'no'; size?: 'md' | 'big'; suffix?: string; label?: string }) {
  const text = value === null || value === undefined ? '—' : `${value}${suffix}`;
  return (
    <span class={`price ${side ?? ''} ${size ?? ''}`} aria-label={label ? `${label} ${text}` : undefined}>
      {text}
    </span>
  );
}

export function ChanceBar({ value, muted }: { value: number | null; muted?: boolean }) {
  return (
    <div class={`chance-bar ${muted ? 'muted' : ''}`} role="img" aria-label={value === null ? 'no price' : `${value} percent chance`}>
      <span style={`width:${value ?? 0}%`} />
    </div>
  );
}

export function Card({ title, sub, actions, children, flush, class: cls, testId }: { title?: ComponentChildren; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; flush?: boolean; class?: string; testId?: string }) {
  return (
    <section class={`card ${flush ? 'flush' : ''} ${cls ?? ''}`} data-testid={testId}>
      {(title || actions) && (
        <div class="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div class="sub">{sub}</div>}
          </div>
          {actions && <div class="row">{actions}</div>}
        </div>
      )}
      <div class="card-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, testId }: { label: string; value: ComponentChildren; hint?: string; testId?: string }) {
  return (
    <div class="card stat" data-testid={testId}>
      <div class="label">{label}</div>
      <div class="value num">{value}</div>
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" class={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)} data-testid={`seg-${o.value}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div class="skeleton" style={i === lines - 1 ? 'width:55%' : i % 3 === 1 ? 'width:85%' : ''} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div class="empty" role="status">
      <div class="title">{title}</div>
      {hint && <div class="hint">{hint}</div>}
      {action && (
        <div class="act">
          <a class="btn primary" href={action.href}>
            {action.label}
          </a>
        </div>
      )}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div class="empty error" role="alert">
      <div class="title">Something went wrong</div>
      <div class="hint">{message}</div>
      {retry && (
        <div class="act">
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
  const n = book.yes.length + book.no.length;
  const side = (levels: Level[], kind: 'yes' | 'no') => (
    <table data-testid={`book-${kind}`} aria-label={`${kind === 'yes' ? 'Yes' : 'No'} bids`}>
      <thead>
        <tr>
          <th>{kind === 'yes' ? 'Yes bids' : 'No bids · Yes ask'}</th>
          <th class="r">Qty</th>
        </tr>
      </thead>
      <tbody>
        {levels.length === 0 && (
          <tr>
            <td colSpan={2} class="muted">
              {status && status !== 'open' ? 'Book cleared' : 'No resting bids'}
            </td>
          </tr>
        )}
        {levels.map((l) => (
          <tr class={`lvl ${kind}`} style={`--w:${(100 * l.quantity) / maxQ}%`}>
            <td class="num">
              <span class={kind === 'yes' ? 'yes-c' : 'no-c'} style="font-weight:600">
                {l.price}¢
              </span>
              {kind === 'no' && <span class="muted"> · ask {100 - l.price}¢</span>}
            </td>
            <td class="r num">{l.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div class="stack">
      {n > 0 && n < 3 && <div class="callout warn">Thin book: few resting orders, so one trade can move the price a lot.</div>}
      <div class="ladder">
        {side(book.yes, 'yes')}
        {side(book.no, 'no')}
      </div>
    </div>
  );
}

export function Sparkline({ points, height = 56 }: { points: { at: number; price: number }[]; height?: number }) {
  if (points.length < 2) return <p class="muted">No trades yet.</p>;
  const w = 320;
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
    <div class="stack" data-testid="packet">
      {!compact && <div class="prompt">{packet.prompt}</div>}
      <dl class="kv">
        <dt>Repository</dt>
        <dd>
          <span class="chip">
            {packet.repo} @ {packet.commit}
          </span>
        </dd>
        <dt>Test command</dt>
        <dd>
          <span class="chip">{packet.testCommand}</span>
        </dd>
        <dt>Executor</dt>
        <dd>
          <b>{packet.executor.name}</b> <span class="muted">· {packet.executor.org} · v{packet.executor.version} · record {packet.executor.passed}/{packet.executor.chosen}</span>
        </dd>
        <dt>Baseline</dt>
        <dd>{packet.baseline}</dd>
        <dt>Closes</dt>
        <dd class="num">{when(packet.closesAt)}</dd>
      </dl>
    </div>
  );
}

export function chanceOf(m: any): number | null {
  if (m.status === 'pending' || m.status === 'cancelled') return null;
  if (m.status === 'settled') return m.settlementPrice;
  if (m.status === 'open') return m.quote.chance;
  return m.closingPrice;
}

export function AgentRow({ m, chosen, onOpen }: { m: any; chosen?: boolean; onOpen?: () => void }) {
  const chance = chanceOf(m);
  const settledOnTests = m.status === 'settled' && (m.outcome === 'passed' || m.outcome === 'failed');
  return (
    <div class="agent-row" onClick={onOpen} role={onOpen ? 'link' : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()} data-testid={`market-row-${m.executorId}`}>
      <div class="grow">
        <div class="row wrap">
          <span class="name">{m.executor.name ?? m.executorId}</span>
          {m.outcome && <Pill status={settledOnTests ? m.outcome : m.status}>{m.outcome}</Pill>}
          {chosen && !m.outcome && <Pill status="running">chosen</Pill>}
          {m.status === 'pending' && <Pill status="pending">baseline</Pill>}
        </div>
        <div class="meta">
          {m.executor.org} · v{m.executor.version} · {m.executor.passed}/{m.executor.chosen} passed
        </div>
        <div class="bar">
          <ChanceBar value={chance} muted={m.status !== 'open'} />
        </div>
      </div>
      <div class="col">
        <span class="lbl">Chance</span>
        <PriceCell value={chance} size="md" label="chance" side={settledOnTests ? (m.outcome === 'passed' ? 'yes' : 'no') : undefined} />
      </div>
      <div class="col hide-sm">
        <span class="lbl">Bid · Ask</span>
        <span class="num">
          {m.quote.yesBid ?? '–'} · {m.quote.yesAsk ?? '–'}
        </span>
      </div>
      <div class="col hide-sm">
        <span class="lbl">Volume</span>
        <span class="num">{m.quote.volume}</span>
      </div>
    </div>
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
    <div class="stack">
      {canPost && (
        <form onSubmit={submit} class="stack">
          <div>
            <label for="thesis-text">Your thesis</label>
            <textarea id="thesis-text" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Why will it pass or fail? Theses are public." data-testid="thesis-text" required style="min-height:84px" />
          </div>
          <div class="row">
            <div style="width:160px">
              <label for="thesis-prob">Stated probability</label>
              <input id="thesis-prob" type="number" min={1} max={99} placeholder="optional, 1–99" value={prob} onInput={(e) => setProb((e.target as HTMLInputElement).value === '' ? '' : Number((e.target as HTMLInputElement).value))} />
            </div>
            <div class="grow" />
            <button data-testid="post-thesis" style="align-self:flex-end">
              Post thesis
            </button>
          </div>
        </form>
      )}
      <div>
        {theses.length === 0 && <p class="muted">No theses yet. Be the first to say why.</p>}
        {theses.map((c) => (
          <div class="thesis">
            <div class="who">
              <b>{c.accountName ?? c.account}</b>
              {c.probability !== null && <span class="num">{c.probability}%</span>}
              <span class="faint num">{when(c.at)}</span>
            </div>
            <div>{c.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface TicketProps {
  marketId: string;
  open: boolean;
  signedIn: boolean;
  blockedReason?: string | null;
  quote?: { yesAsk: number | null; noAsk: number | null };
  initialSide?: 'yes' | 'no';
  onPlaced?: () => void | Promise<void>;
  toast: (msg: string, err?: boolean) => void;
}

export function OrderTicket({ marketId, open, signedIn, blockedReason, quote, initialSide, onPlaced, toast }: TicketProps) {
  const [side, setSide] = useState<'yes' | 'no'>(initialSide ?? 'yes');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState<number>(quote?.[initialSide === 'no' ? 'noAsk' : 'yesAsk'] ?? 50);
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  if (!signedIn)
    return (
      <div class="stack">
        <p class="muted">Sign in to trade. New traders start with $1,000 of play money.</p>
        <a class="btn primary" href="#/account">
          Sign in or create an account
        </a>
      </div>
    );
  if (!open || blockedReason) return <div class="callout">{blockedReason ?? 'Trading is closed on this market.'}</div>;
  const effPrice = type === 'market' ? 99 : action === 'sell' ? 100 - price : price;
  const lock = (effPrice + 1) * qty;
  const pick = (s: 'yes' | 'no') => {
    setSide(s);
    const ask = s === 'yes' ? quote?.yesAsk : quote?.noAsk;
    if (ask) setPrice(ask);
  };
  const place = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: any = { marketId, side, action, type, quantity: Number(qty) };
      if (type === 'limit') body.price = Number(price);
      const r = await api<{ order: any; fills: any[] }>('POST', '/api/orders', body);
      const filled = r.fills.reduce((a, f) => a + f.quantity, 0);
      toast(`${action === 'buy' ? 'Bought' : 'Sold'} ${filled} ${side.toUpperCase()}${r.order.status === 'open' ? `, ${r.order.quantity - r.order.filled} resting` : ''}.`);
      await onPlaced?.();
    } catch (err: any) {
      toast(`${err.error} (${err.code})`, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={place} data-testid="ticket" aria-label="Order ticket" class="stack">
      <div class="quick" role="group" aria-label="Side">
        <button type="button" class={`yes lg ${side === 'yes' ? 'on' : ''}`} aria-pressed={side === 'yes'} onClick={() => pick('yes')} data-testid="side-yes">
          Yes {quote?.yesAsk !== null && quote?.yesAsk !== undefined ? `${quote.yesAsk}¢` : ''}
        </button>
        <button type="button" class={`no lg ${side === 'no' ? 'on' : ''}`} aria-pressed={side === 'no'} onClick={() => pick('no')} data-testid="side-no">
          No {quote?.noAsk !== null && quote?.noAsk !== undefined ? `${quote.noAsk}¢` : ''}
        </button>
      </div>
      <div class="fields">
        <div>
          <label for="t-action">Action</label>
          <select id="t-action" value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value as any)} data-testid="action">
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label for="t-type">Order type</label>
          <select id="t-type" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as any)} data-testid="type">
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </div>
      </div>
      <div class="fields">
        <div>
          <label for="t-price">Limit price (¢)</label>
          <input id="t-price" type="number" min={1} max={99} value={price} disabled={type === 'market'} onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))} data-testid="price" />
        </div>
        <div>
          <label for="t-qty">Contracts</label>
          <input id="t-qty" type="number" min={1} value={qty} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))} data-testid="quantity" />
        </div>
      </div>
      <div class="row between muted" style="font-size:12.5px">
        <span>{type === 'market' ? 'Immediate-or-cancel at 99¢' : action === 'sell' ? `Sells ${side.toUpperCase()} by buying the other side at ${100 - price}¢` : 'Fills at the resting price or better'}</span>
        <span class="num">
          Locks ${(lock / 100).toFixed(2)}
        </span>
      </div>
      <button class={`block lg ${side === 'yes' ? 'fill-yes' : 'fill-no'}`} disabled={busy || qty < 1} data-testid="place-order">
        {action === 'buy' ? 'Buy' : 'Sell'} {side === 'yes' ? 'Yes' : 'No'} · {qty} contract{qty === 1 ? '' : 's'}
      </button>
      <p class="help" style="margin:0">Takers pay 1¢ per contract; the fee is returned on any part that rests. A winning contract pays 100¢.</p>
    </form>
  );
}
