import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dollars } from './Price.js';
import { when } from './PacketView.js';
import './settlement.css';

export interface TestLine {
  name: string;
  ok: boolean;
}

/** A log line that may wrap only after a path or identifier separator, never inside a word. */
function breakable(line: string): ComponentChildren {
  const parts = line.split(/(?<=[/_:.])/);
  return parts.map((part, i) => (i === 0 ? part : [<wbr key={i} />, part]));
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
  /** Tail lines to show. */
  lines?: number;
  /** Run the one orchestrated animation (the viewer watched this settle); otherwise show the final state at once. */
  animate?: boolean;
  onDone?: () => void;
}

/** Timing of the one animation, ms: open, log lines, test strip, stamp, count-up. Under two seconds in total. */
export const SETTLE_TIMING = { open: 200, log: 600, strip: 400, stamp: 200, count: 400 } as const;

/** The result: the log tail streams in, one cell per test fills, the stamp lands, the position counts into cash. */
export function SettlementPanel({ outcome, agentName, log, settledAt, closingPrice, position, lines = 12, animate = false, onDone }: SettlementProps) {
  const tests = log ? parseTests(log) : [];
  const tail = (log ?? '').split('\n').filter(Boolean).slice(-lines);
  const infra = outcome === 'infra_error';
  const word = infra ? 'No result' : outcome === 'passed' ? 'Passed' : 'Failed';
  const paid = infra ? `Settled at the closing price of ${closingPrice ?? '—'}¢ after an infrastructure error.` : outcome === 'passed' ? 'Yes paid 100¢, No paid 0¢.' : 'No paid 100¢, Yes paid 0¢.';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = animate && !reduced;
  // Phase clock in ms since the panel opened; -1 means "final state".
  const [t, setT] = useState(run ? 0 : -1);
  const raf = useRef(0);
  useEffect(() => {
    if (!run) {
      setT(-1);
      return;
    }
    const start = performance.now();
    const total = SETTLE_TIMING.open + SETTLE_TIMING.log + SETTLE_TIMING.strip + SETTLE_TIMING.stamp + SETTLE_TIMING.count;
    const tick = (now: number) => {
      const el = now - start;
      if (el >= total) {
        setT(-1);
        onDone?.();
        return;
      }
      setT(el);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [run]);
  const final = t < 0;
  const T = SETTLE_TIMING;
  const logStart = T.open;
  const stripStart = logStart + T.log;
  const stampStart = stripStart + T.strip;
  const countStart = stampStart + T.stamp;
  const linesShown = final ? tail.length : Math.max(0, Math.floor(((t - logStart) / T.log) * tail.length) + (t >= logStart ? 1 : 0));
  const cellsFilled = final ? tests.length : t < stripStart ? 0 : Math.min(tests.length, Math.floor(((t - stripStart) / T.strip) * tests.length) + 1);
  const stampOn = final || t >= stampStart;
  const countFrac = final ? 1 : t < countStart ? 0 : Math.min(1, (t - countStart) / T.count);
  const open = final || t >= 0;
  return (
    <section class={`settle ${outcome} ${open ? 'open' : ''} ${final ? 'final' : 'playing'}`} aria-label={`Settlement: ${agentName} ${word.toLowerCase()}`} data-testid="settlement" aria-live={run ? 'polite' : undefined}>
      <div class="settle-inner">
        {tail.length > 0 && (
          <pre class="settle-log" data-testid="run-log" tabIndex={0} aria-label="Run log">
            {tail.map((l, i) => (
              <span class={`ln ${i < linesShown ? 'in' : ''} ${/PASSED|✓|--- PASS|\.\.\. ok|passed \(exit 0\)/.test(l) ? 'ok' : /FAILED|×|✗|--- FAIL|failed \(exit 1\)/.test(l) ? 'bad' : ''}`} key={i}>
                {breakable(l)}
              </span>
            ))}
          </pre>
        )}
        {tests.length > 0 && (
          <div class="settle-strip" role="img" aria-label={`${tests.filter((x) => x.ok).length} of ${tests.length} tests passed`}>
            {tests.map((x, i) => (
              <span class={`${i < cellsFilled ? (x.ok ? 'yes' : 'no') : ''}`} title={x.name} key={x.name} />
            ))}
          </div>
        )}
        <div class={`settle-stamp ${stampOn ? 'on' : ''}`}>
          <span class={`word ${infra ? 'warn' : outcome === 'passed' ? 'yes' : 'no'}`}>{word}</span>
          <span class="paid">
            {paid}
            {settledAt && ` Settled ${when(settledAt)}.`}
          </span>
        </div>
        {position && (
          <div class={`settle-you ${countFrac > 0 ? 'on' : ''}`} data-testid="settle-you">
            Your {position.quantity} {position.side === 'yes' ? 'Yes' : 'No'} paid <b>{dollars(Math.round(position.payout * countFrac))}</b>.
          </div>
        )}
      </div>
    </section>
  );
}
