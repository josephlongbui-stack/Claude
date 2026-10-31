import type { ComponentChildren } from 'preact';
import { Button } from './Button.js';
import { ChangeCell, PriceCell, count } from './Price.js';
import { StatusPill, marketStatus } from './StatusPill.js';
import { Td, Tr } from './Table.js';
import './agentrow.css';

export interface MarketSummary {
  marketId: string;
  executorId: string;
  executor: { id: string; name: string; org: string; version: string; chosen: number; passed: number };
  status: string;
  outcome?: string | null;
  quote: { yesBid: number | null; yesAsk: number | null; volume: number; chance: number; change?: number | null };
  closingPrice: number | null;
  settlementPrice: number | null;
  traders?: number;
}

/** The chance a market shows: live chance while open, closing price after, settlement price once settled. */
export function chanceOf(m: MarketSummary): number | null {
  if (m.status === 'pending' || m.status === 'cancelled') return null;
  if (m.status === 'settled') return m.settlementPrice;
  if (m.status === 'open') return m.quote.chance;
  return m.closingPrice;
}

export function agentLabel(m: MarketSummary): string {
  const c = chanceOf(m);
  const parts = [m.executor.name, c === null ? 'no price' : `${c} cents, ${c} percent chance to pass`];
  const d = m.quote.change;
  if (d) parts.push(d > 0 ? `up ${d}` : `down ${-d}`);
  return parts.join(', ');
}

export interface AgentRowProps {
  m: MarketSummary;
  /** First cell(s): the task cell on the arena, rendered by the caller with rowSpan. */
  lead?: ComponentChildren;
  /** Trailing cell on the arena (closes), rendered by the caller with rowSpan. */
  trail?: ComponentChildren;
  columns: ('agent' | 'chance' | 'change' | 'bidask' | 'volume' | 'traders' | 'record' | 'quick')[];
  group?: boolean;
  chosen?: boolean;
  onQuick?: (side: 'yes' | 'no') => void;
  /** 'l' on the task page, where the chance is the most important number on the screen. */
  chanceSize?: 'm' | 'l';
  /** Phone-only line under the agent name, carrying what hidden columns would have said. */
  detail?: ComponentChildren;
}

/** One candidate agent as a table row. */
export function AgentRow({ m, lead, trail, columns, group, chosen, onQuick, chanceSize = 'm', detail }: AgentRowProps) {
  const chance = chanceOf(m);
  const st = marketStatus(m);
  const settled = m.status === 'settled';
  const tone = st === 'passed' ? 'yes' : st === 'failed' ? 'no' : undefined;
  const href = `#/market/${encodeURIComponent(m.marketId)}`;
  const askNo = m.quote.yesBid === null ? null : 100 - m.quote.yesBid;
  return (
    <Tr class={`agent-row ${group ? 'group' : ''}`} testId={`market-row-${m.executorId}`}>
      {lead}
      {columns.map((c) => {
        switch (c) {
          case 'agent':
            return (
              <Td class="agent-cell">
                <a class="agent-name" href={href} aria-label={agentLabel(m)}>
                  {m.executor.name}
                </a>{' '}
                <span class="agent-ver">{m.executor.version}</span>
                {(chosen || settled || m.status === 'running' || m.status === 'pending' || m.status === 'cancelled') && (
                  <span class="agent-pill">
                    <StatusPill status={m.status === 'running' ? 'running' : settled ? st : chosen ? 'running' : st}>{settled && st === 'settled' ? `Settled at ${m.closingPrice}¢` : undefined}</StatusPill>
                  </span>
                )}
                {detail && <span class="agent-detail show-sm t-caption ink-3">{detail}</span>}
              </Td>
            );
          case 'chance':
            return (
              <Td align="right" class="chance-cell">
                <PriceCell cents={chance} size={chanceSize} side={tone} label="chance" />
              </Td>
            );
          case 'change':
            return (
              <Td align="right" class="change-cell">
                {m.status === 'open' ? <ChangeCell delta={m.quote.change ?? null} /> : null}
              </Td>
            );
          case 'bidask':
            return (
              <Td align="right" hideSm>
                {m.quote.yesBid === null && m.quote.yesAsk === null ? <span class="ink-3">—</span> : `${m.quote.yesBid ?? '—'} / ${m.quote.yesAsk ?? '—'}`}
              </Td>
            );
          case 'volume':
            return (
              <Td align="right" hideSm>
                {count(m.quote.volume)}
              </Td>
            );
          case 'traders':
            return (
              <Td align="right" hideSm>
                {m.traders === undefined ? '—' : count(m.traders)}
              </Td>
            );
          case 'record':
            return <Td hideSm>{m.executor.chosen === 0 ? <span class="ink-3">No runs yet</span> : `Passed ${m.executor.passed} of ${m.executor.chosen}`}</Td>;
          case 'quick':
            return (
              <>
                {trail}
                <Td align="right" class="quick-cell">
                  {m.status === 'open' && (
                    <span class="quick">
                      {m.quote.yesAsk === null ? (
                        <span class="quick-none ink-3">No asks yet</span>
                      ) : (
                        <Button variant="yes" class="compact" href={onQuick ? undefined : `${href}?side=yes`} onClick={onQuick ? () => onQuick('yes') : undefined} aria-label={`Buy Yes on ${m.executor.name} at ${m.quote.yesAsk} cents`}>
                          Yes {m.quote.yesAsk}¢
                        </Button>
                      )}
                      {askNo !== null && (
                        <Button variant="no" class="compact" href={onQuick ? undefined : `${href}?side=no`} onClick={onQuick ? () => onQuick('no') : undefined} aria-label={`Buy No on ${m.executor.name} at ${askNo} cents`}>
                          No {askNo}¢
                        </Button>
                      )}
                    </span>
                  )}
                </Td>
              </>
            );
          default:
            return null;
        }
      })}
      {!columns.includes('quick') && trail}
    </Tr>
  );
}
