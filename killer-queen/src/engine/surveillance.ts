/**
 * Trade surveillance (5.1): alerts derived from state (and so from the
 * journal), recomputable at any time. Nothing here changes state or bans
 * anyone; an admin reads the queue and acts with reviewAccount.
 */
import type { Engine } from './engine.js';
import { leaderboard } from './views.js';
import type { Account, Market } from './types.js';

export type AlertKind = 'wash_trade' | 'spoofing' | 'closing_pressure' | 'conflicted_trade' | 'unusual_win_rate';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: 'low' | 'medium' | 'high';
  accounts: string[];
  marketId: string | null;
  at: number;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface SurveillanceOptions {
  spoofMinQty: number;
  spoofWindowMs: number;
  spoofMinCount: number;
  pressureWindowMs: number;
  pressureMinMove: number;
  winRateMinScored: number;
  winRateMin: number;
}

export const DEFAULT_SURVEILLANCE: SurveillanceOptions = {
  spoofMinQty: 100,
  spoofWindowMs: 10_000,
  spoofMinCount: 3,
  pressureWindowMs: 60_000,
  pressureMinMove: 15,
  winRateMinScored: 10,
  winRateMin: 0.9,
};

/** Two accounts are "linked" when they share an org, a verified person, an email or a device. */
export function linkedBy(a: Account, b: Account): string | null {
  if (a.id === b.id) return null;
  if (a.org && a.org === b.org) return `org ${a.org}`;
  if (a.personId && a.personId === b.personId) return `person ${a.personId}`;
  if (a.emailHash && a.emailHash === b.emailHash) return 'same email';
  if (a.deviceHash && a.deviceHash === b.deviceHash) return 'same device';
  return null;
}

export function alerts(engine: Engine, partial: Partial<SurveillanceOptions> = {}): Alert[] {
  const o = { ...DEFAULT_SURVEILLANCE, ...partial };
  const s = engine.state;
  const out: Alert[] = [];

  // 1. Wash trades: fills between linked accounts.
  const wash = new Map<string, { a: string; b: string; link: string; marketId: string; fills: number; quantity: number; last: number }>();
  for (const f of s.fills) {
    const a = s.accounts.get(f.yesAccount)!;
    const b = s.accounts.get(f.noAccount)!;
    const link = linkedBy(a, b);
    if (!link) continue;
    const pair = [a.id, b.id].sort();
    const key = `${f.market}|${pair.join('+')}`;
    const w = wash.get(key) ?? { a: pair[0]!, b: pair[1]!, link, marketId: f.market, fills: 0, quantity: 0, last: f.at };
    w.fills += 1;
    w.quantity += f.quantity;
    w.last = Math.max(w.last, f.at);
    wash.set(key, w);
  }
  for (const w of wash.values()) {
    out.push({ id: `wash_trade:${w.marketId}:${w.a}+${w.b}`, kind: 'wash_trade', severity: 'high', accounts: [w.a, w.b], marketId: w.marketId, at: w.last, summary: `${w.a} and ${w.b} (${w.link}) traded with each other: ${w.fills} fills, ${w.quantity} contracts`, evidence: { link: w.link, fills: w.fills, quantity: w.quantity } });
  }

  // 2. Spoofing: large orders cancelled quickly with no fill, repeatedly.
  const spoof = new Map<string, { account: string; marketId: string; orders: { id: string; quantity: number; price: number; side: string; aliveMs: number }[]; last: number }>();
  for (const ord of s.orders.values()) {
    if (ord.status !== 'cancelled' || ord.cancelReason !== 'user' || ord.filled > 0 || ord.cancelledAt === null) continue;
    const aliveMs = ord.cancelledAt - ord.createdAt;
    if (ord.quantity < o.spoofMinQty || aliveMs > o.spoofWindowMs) continue;
    const key = `${ord.market}|${ord.account}`;
    const sp = spoof.get(key) ?? { account: ord.account, marketId: ord.market, orders: [], last: 0 };
    sp.orders.push({ id: ord.id, quantity: ord.quantity, price: ord.price, side: ord.side, aliveMs });
    sp.last = Math.max(sp.last, ord.cancelledAt);
    spoof.set(key, sp);
  }
  for (const sp of spoof.values()) {
    if (sp.orders.length < o.spoofMinCount) continue;
    out.push({ id: `spoofing:${sp.marketId}:${sp.account}`, kind: 'spoofing', severity: 'medium', accounts: [sp.account], marketId: sp.marketId, at: sp.last, summary: `${sp.account} cancelled ${sp.orders.length} large orders within ${o.spoofWindowMs / 1000}s of placing them, none filled`, evidence: { orders: sp.orders } });
  }

  // 3. Closing-price pressure on markets that settled at the closing price.
  for (const m of s.markets.values()) {
    if (m.status !== 'settled' || (m.outcome !== 'unchosen' && m.outcome !== 'skipped') || m.closingPrice === null) continue;
    const task = s.tasks.get(m.taskId)!;
    if (task.closedAt === null) continue;
    const fills = s.fills.filter((f) => f.market === m.id);
    const before = fills.filter((f) => f.at < task.closedAt! - o.pressureWindowMs);
    const inWindow = fills.filter((f) => f.at >= task.closedAt! - o.pressureWindowMs && f.at <= task.closedAt!);
    if (before.length === 0 || inWindow.length === 0) continue;
    const reference = before[before.length - 1]!.yesPrice;
    const move = m.closingPrice - reference;
    if (Math.abs(move) < o.pressureMinMove) continue;
    const takers = new Map<string, number>();
    for (const f of inWindow) {
      const taker = f.takerSide === 'yes' ? f.yesAccount : f.noAccount;
      takers.set(taker, (takers.get(taker) ?? 0) + (f.takerSide === 'yes' ? f.quantity : -f.quantity));
    }
    // Who benefited: pushing Yes up helps Yes holders at settlement, and vice versa.
    const beneficiaries = [...takers.entries()].filter(([, net]) => (move > 0 ? net > 0 : net < 0)).map(([id]) => id);
    out.push({ id: `closing_pressure:${m.id}`, kind: 'closing_pressure', severity: 'medium', accounts: beneficiaries.length ? beneficiaries : [...takers.keys()], marketId: m.id, at: task.closedAt, summary: `closing price ${m.closingPrice}¢ moved ${move > 0 ? '+' : ''}${move}¢ from ${reference}¢ in the final ${o.pressureWindowMs / 1000}s of an ${m.outcome} market`, evidence: { reference, closingPrice: m.closingPrice, move, windowFills: inWindow.length, takers: Object.fromEntries(takers) } });
  }

  // 4. Conflicted trading: should be impossible; alert high if it ever happened.
  const conflicted = (acct: Account, market: Market): string | null => {
    const task = s.tasks.get(market.taskId)!;
    const executor = s.executors.get(market.executorId)!;
    return engine.conflictReason(acct, task, executor);
  };
  const seenConflict = new Set<string>();
  const pushConflict = (accountId: string, marketId: string, why: string, at: number, what: string) => {
    const id = `conflicted_trade:${marketId}:${accountId}`;
    if (seenConflict.has(id)) return;
    seenConflict.add(id);
    out.push({ id, kind: 'conflicted_trade', severity: 'high', accounts: [accountId], marketId, at, summary: `${accountId} ${what} on ${marketId} despite a conflict: ${why}`, evidence: { reason: why } });
  };
  for (const f of s.fills) {
    const m = s.markets.get(f.market)!;
    for (const id of [f.yesAccount, f.noAccount]) {
      const why = conflicted(s.accounts.get(id)!, m);
      if (why) pushConflict(id, m.id, why, f.at, 'traded');
    }
  }
  for (const c of s.comments) {
    const why = conflicted(s.accounts.get(c.account)!, s.markets.get(c.market)!);
    if (why) pushConflict(c.account, c.market, why, c.at, 'commented');
  }

  // 5. Unusual win rates.
  for (const row of leaderboard(engine)) {
    if (row.scored < o.winRateMinScored) continue;
    const rate = row.hits / row.scored;
    if (rate < o.winRateMin) continue;
    out.push({ id: `unusual_win_rate:${row.id}`, kind: 'unusual_win_rate', severity: 'low', accounts: [row.id], marketId: null, at: 0, summary: `${row.id} was right on ${row.hits} of ${row.scored} settled markets (${Math.round(rate * 100)}%)`, evidence: { hits: row.hits, scored: row.scored, profit: row.profit } });
  }

  return out.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : 1));
}
