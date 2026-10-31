import { useState } from 'preact/hooks';
import { Avatar } from './Avatar.js';
import { Button } from './Button.js';
import { Field, Input, Textarea } from './Field.js';
import { when } from './PacketView.js';
import './thesis.css';

export interface Thesis {
  id: string;
  account: string;
  accountName?: string;
  accountKind?: 'human' | 'agent' | 'system';
  probability: number | null;
  at: number;
  text: string;
}

export function ThesisList({ theses, canPost, onPost, onReport }: { theses: Thesis[]; canPost: boolean; onPost?: (text: string, probability: number | null) => Promise<void>; onReport?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [prob, setProb] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!onPost) return;
    const p = prob.trim() === '' ? null : Math.floor(Number(prob));
    if (p !== null && (p < 1 || p > 99)) {
      setError('Stated probability is a whole number from 1 to 99.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onPost(text.trim(), p);
      setText('');
      setProb('');
    } catch (err) {
      setError((err as Error).message || 'The thesis was not posted.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="theses">
      {canPost && (
        <form class="thesis-form" onSubmit={submit}>
          <Field label="Your thesis" htmlFor="th-text" help="Theses are public and stay with the market." error={error}>
            <Textarea id="th-text" value={text} onInput={(e: Event) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Why will it pass or fail?" required maxLength={4000} data-testid="thesis-text" />
          </Field>
          <div class="thesis-form-row">
            <Field label="Stated probability" htmlFor="th-prob" class="thesis-prob">
              <span class="input-suffix">
                <Input id="th-prob" type="number" inputMode="numeric" min={1} max={99} value={prob} placeholder="optional" onInput={(e: Event) => setProb((e.target as HTMLInputElement).value)} />
                <span class="sfx">%</span>
              </span>
            </Field>
            <Button type="submit" variant="primary" disabled={busy || text.trim() === ''} data-testid="post-thesis">
              Post thesis
            </Button>
          </div>
        </form>
      )}
      {theses.length === 0 && <p class="thesis-empty">No theses yet. {canPost ? 'Say why it will pass or fail.' : 'Sign in to post the first one.'}</p>}
      {theses.map((t) => (
        <article class="thesis" key={t.id} data-testid="thesis">
          <div class="thesis-who">
            <Avatar name={t.accountName ?? t.account} kind={t.accountKind ?? 'human'} size={24} />
            <b>{t.accountName ?? t.account}</b>
            {t.probability !== null && <span class="thesis-p">{t.probability}%</span>}
            <span class="thesis-at">{when(t.at)}</span>
            {onReport && (
              <button type="button" class="thesis-report" onClick={() => onReport(t.id)}>
                Report
              </button>
            )}
          </div>
          <p>{t.text}</p>
        </article>
      ))}
    </div>
  );
}

export interface Fill {
  id?: string;
  yesPrice: number;
  quantity: number;
  takerSide: 'yes' | 'no';
  at: number;
}

export function TradeList({ fills }: { fills: Fill[] }) {
  if (fills.length === 0) return <p class="thesis-empty">No trades yet.</p>;
  return (
    <table class="table trades" data-testid="trades">
      <caption class="sr-only">Recent trades</caption>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Trade</th>
          <th scope="col" class="r">Price</th>
          <th scope="col" class="r">Contracts</th>
        </tr>
      </thead>
      <tbody>
        {fills.map((f, i) => (
          <tr key={f.id ?? i}>
            <td class="ink-3">{when(f.at)}</td>
            <td class={f.takerSide === 'yes' ? 'yes' : 'no'}>{f.takerSide === 'yes' ? 'Bought Yes' : 'Bought No'}</td>
            <td class="r">{f.yesPrice}¢</td>
            <td class="r">{f.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
