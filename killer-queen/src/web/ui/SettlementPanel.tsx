import { dollars } from './Price.js';
import { when } from './PacketView.js';
import './settlement.css';

export interface TestLine {
  name: string;
  ok: boolean;
}

/** Pull one line per test out of a run log (pytest, vitest, go test, cargo test); empty when the log has none. */
export function parseTests(log: string): TestLine[] {
  const out: TestLine[] = [];
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^(\S+::\S+) (PASSED|FAILED)/.exec(line))) out.push({ name: m[1]!, ok: m[2] === 'PASSED' });
    else if ((m = /^[✓×✗] (.+?) \d+ms$/.exec(line))) out.push({ name: m[1]!, ok: line.startsWith('✓') });
    else if ((m = /^--- (PASS|FAIL): (\S+)/.exec(line))) out.push({ name: m[2]!, ok: m[1] === 'PASS' });
    else if ((m = /^test (\S+) \.\.\. (ok|FAILED)$/.exec(line))) out.push({ name: m[1]!, ok: m[2] === 'ok' });
  }
  return out;
}

export interface SettlementProps {
  outcome: 'passed' | 'failed' | 'infra_error';
  agentName: string;
  log: string | null;
  settledAt: number | null;
  closingPrice?: number | null;
  /** The viewer's position at close, if any. */
  position?: { side: 'yes' | 'no'; quantity: number; payout: number } | null;
  /** Tail lines to show (D7 streams them in). */
  lines?: number;
}

/** The result: the log tail, one cell per test, the stamp, and what it paid. Static final state; D7 adds the one animation. */
export function SettlementPanel({ outcome, agentName, log, settledAt, closingPrice, position, lines = 8 }: SettlementProps) {
  const tests = log ? parseTests(log) : [];
  const tail = (log ?? '').split('\n').filter(Boolean).slice(-lines);
  const infra = outcome === 'infra_error';
  const word = infra ? 'No result' : outcome === 'passed' ? 'Passed' : 'Failed';
  const paid = infra ? `Settled at the closing price of ${closingPrice ?? '—'}¢ after an infrastructure error.` : outcome === 'passed' ? 'Yes paid 100¢, No paid 0¢.' : 'No paid 100¢, Yes paid 0¢.';
  return (
    <section class={`settle ${outcome}`} aria-label={`Settlement: ${agentName} ${word.toLowerCase()}`} data-testid="settlement">
      {tail.length > 0 && (
        <pre class="settle-log" data-testid="run-log">
          {tail.map((l, i) => (
            <span class={`ln ${/PASSED|✓|--- PASS|\.\.\. ok|passed \(exit 0\)/.test(l) ? 'ok' : /FAILED|×|✗|--- FAIL|failed \(exit 1\)/.test(l) ? 'bad' : ''}`} key={i}>
              {l}
            </span>
          ))}
        </pre>
      )}
      {tests.length > 0 && (
        <div class="settle-strip" role="img" aria-label={`${tests.filter((t) => t.ok).length} of ${tests.length} tests passed`}>
          {tests.map((t) => (
            <span class={t.ok ? 'yes' : 'no'} title={t.name} key={t.name} />
          ))}
        </div>
      )}
      <div class="settle-stamp">
        <span class={`word ${infra ? 'warn' : outcome === 'passed' ? 'yes' : 'no'}`}>{word}</span>
        <span class="paid">
          {paid}
          {settledAt && ` Settled ${when(settledAt)}.`}
        </span>
      </div>
      {position && (
        <div class="settle-you" data-testid="settle-you">
          Your {position.quantity} {position.side === 'yes' ? 'Yes' : 'No'} paid <b>{dollars(position.payout)}</b>.
        </div>
      )}
    </section>
  );
}
