/**
 * Read models: pure functions over engine state. No mutation, no clock.
 */
import type { Engine } from './engine.js';
import { CONTRACT_VALUE, midHalfUp } from './money.js';
import type { Account, Comment, Fill, Market, Order, Position, Task } from './types.js';

export interface Quote {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  lastPrice: number | null;
  volume: number;
  openInterest: number;
  /** Market probability of passing, in cents (D15). */
  chance: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface ExecutorRecord {
  id: string;
  name: string;
  org: string;
  version: string;
  chosen: number;
  passed: number;
  passRate: number | null;
  byVersion: Record<string, { chosen: number; passed: number }>;
}

export interface Packet {
  marketId: string;
  title: string;
  /** D2: "failing 3/3" once the baseline ran, "pending" while waiting, "not run" when not required. */
  baseline: string;
  prompt: string;
  repo: string;
  commit: string;
  testCommand: string;
  executor: { id: string; name: string; org: string; version: string; chosen: number; passed: number };
  closesAt: number;
  quote: { yesBid: number | null; yesAsk: number | null; noBid: number | null; noAsk: number | null };
  lastPrice: number | null;
}

export interface MarketView {
  market: Market;
  quote: Quote;
  book: { yes: BookLevel[]; no: BookLevel[] };
  trades: Fill[];
  priceHistory: { at: number; price: number; quantity: number }[];
  theses: (Comment & { accountName: string })[];
  packet: Packet;
  traders: number;
}

export interface TaskMarketSummary {
  marketId: string;
  executorId: string;
  executor: ExecutorRecord;
  status: Market['status'];
  quote: Quote;
  closingPrice: number | null;
  settlementPrice: number | null;
  outcome: Market['outcome'];
  traders: number;
}

export interface TaskView {
  task: PublicTask;
  markets: TaskMarketSummary[];
  /** Candidate with the highest chance, or null (D15). */
  recommendation: { executorId: string; chance: number } | null;
}

export type PublicTask = Omit<Task, 'forceOutcome' | 'forceBaseline'>;

export interface PortfolioPosition {
  market: string;
  taskId: string;
  executorId: string;
  title: string;
  side: 'yes' | 'no' | null;
  quantity: number;
  avgCost: number | null;
  cost: number;
  mark: number;
  unrealized: number;
  realized: number;
  fees: number;
}

export interface Portfolio {
  /** pnl.total is realized + unrealized − fees. */
  account: PublicAccount;
  cash: number;
  locked: number;
  deposited: number;
  positions: PortfolioPosition[];
  openOrders: Order[];
  history: (Position & { title: string; executorId: string; taskId: string })[];
  pnl: { realized: number; unrealized: number; fees: number; total: number };
}

export type PublicAccount = Omit<Account, 'keyHash' | 'emailHash' | 'deviceHash'>;

export interface LeaderboardRow {
  id: string;
  name: string;
  kind: Account['kind'];
  org: string;
  profit: number;
  realized: number;
  unrealized: number;
  fees: number;
  /** Mean squared error of implied probability vs. outcome over test-settled markets (D22). */
  brier: number | null;
  hits: number;
  scored: number;
  rankByProfit: number;
  rankByAccuracy: number | null;
}

export interface Stats {
  accounts: number;
  tasks: { total: number; pending: number; open: number; closed: number; running: number; resolved: number; skipped: number; rejected: number };
  markets: { total: number; open: number; settled: number; settledOnTests: number };
  volume: number;
  fees: number;
  /** Brier of closing Yes prices vs. outcomes over markets settled on a test result. */
  priceBrier: number | null;
  /** Brier of each agent's historical pass rate (before that task) on the same markets. */
  baseRateBrier: number | null;
  /** Share of test-settled markets closing at 70–80¢ that passed. */
  calibration70to80: { count: number; passRate: number | null };
  medianSpreadAtClose: number | null;
  medianTradersPerMarket: number | null;
  medianMsToTradable: number | null;
}

export function publicAccount(a: Account): PublicAccount {
  const { keyHash: _k, emailHash: _e, deviceHash: _d, ...rest } = a;
  return rest;
}

export function publicTask(t: Task): PublicTask {
  const { forceOutcome: _f, forceBaseline: _b, ...rest } = t;
  return rest;
}

export function quote(engine: Engine, marketId: string): Quote {
  const market = engine.market(marketId);
  if (!market) throw new Error(`no market ${marketId}`);
  const sides = engine.quoteSides(marketId);
  let chance: number;
  if (market.status === 'settled') chance = market.settlementPrice!;
  else if (market.status !== 'open' && market.closingPrice !== null) chance = market.closingPrice;
  else if (sides.yesBid !== null && sides.yesAsk !== null && sides.yesAsk - sides.yesBid <= 20) chance = midHalfUp(sides.yesBid, sides.yesAsk);
  else if (market.lastPrice !== null) chance = market.lastPrice;
  else chance = 50;
  return { ...sides, lastPrice: market.lastPrice, volume: market.volume, openInterest: market.openInterest, chance };
}

export function bookLevels(engine: Engine, marketId: string): { yes: BookLevel[]; no: BookLevel[] } {
  const book = engine.book(marketId);
  const agg = (orders: Order[]): BookLevel[] => {
    const levels: BookLevel[] = [];
    for (const o of orders) {
      const rem = o.quantity - o.filled;
      const last = levels[levels.length - 1];
      if (last && last.price === o.price) {
        last.quantity += rem;
        last.orders += 1;
      } else levels.push({ price: o.price, quantity: rem, orders: 1 });
    }
    return levels;
  };
  return { yes: agg(book.yes), no: agg(book.no) };
}

export function executorRecords(engine: Engine): ExecutorRecord[] {
  const s = engine.state;
  const out: ExecutorRecord[] = [];
  const ids = [...s.executors.keys()].sort();
  for (const id of ids) {
    const e = s.executors.get(id)!;
    const rec: ExecutorRecord = { ...e, chosen: 0, passed: 0, passRate: null, byVersion: {} };
    for (const t of s.tasks.values()) {
      if (t.chosenAgent !== id) continue;
      if (t.status !== 'running' && t.status !== 'resolved') continue;
      if (t.outcome === 'infra_error') continue; // D6
      const v = t.candidateVersions[id] ?? e.version;
      const bv = (rec.byVersion[v] ??= { chosen: 0, passed: 0 });
      rec.chosen += 1;
      bv.chosen += 1;
      if (t.passed === true) {
        rec.passed += 1;
        bv.passed += 1;
      }
    }
    rec.passRate = rec.chosen > 0 ? rec.passed / rec.chosen : null;
    out.push(rec);
  }
  return out;
}

export function executorRecord(engine: Engine, executorId: string): ExecutorRecord | undefined {
  return executorRecords(engine).find((r) => r.id === executorId);
}

export function packet(engine: Engine, marketId: string): Packet {
  const market = engine.market(marketId);
  if (!market) throw new Error(`no market ${marketId}`);
  const task = engine.task(market.taskId)!;
  const rec = executorRecord(engine, market.executorId)!;
  const q = engine.quoteSides(marketId);
  const baseline = task.baseline ? `failing ${task.baseline.results.filter((r) => r === 'failed').length}/${task.baseline.results.length}` : task.status === 'pending' ? 'pending' : 'not run';
  return {
    marketId,
    title: task.title,
    baseline,
    prompt: task.prompt,
    repo: task.repo,
    commit: task.commit,
    testCommand: task.testCommand,
    executor: {
      id: rec.id,
      name: rec.name,
      org: rec.org,
      version: task.candidateVersions[rec.id] ?? rec.version,
      chosen: rec.chosen,
      passed: rec.passed,
    },
    closesAt: task.closesAt,
    quote: { yesBid: q.yesBid, yesAsk: q.yesAsk, noBid: q.noBid, noAsk: q.noAsk },
    lastPrice: market.lastPrice,
  };
}

export function distinctTraders(engine: Engine, marketId: string): number {
  const ids = new Set<string>();
  for (const f of engine.state.fills) {
    if (f.market !== marketId) continue;
    ids.add(f.yesAccount);
    ids.add(f.noAccount);
  }
  return ids.size;
}

export function marketView(engine: Engine, marketId: string, limit = 50): MarketView {
  const market = engine.market(marketId);
  if (!market) throw new Error(`no market ${marketId}`);
  const fills = engine.state.fills.filter((f) => f.market === marketId);
  return {
    market,
    quote: quote(engine, marketId),
    book: bookLevels(engine, marketId),
    trades: fills.slice(-limit).reverse(),
    priceHistory: fills.map((f) => ({ at: f.at, price: f.yesPrice, quantity: f.quantity })),
    theses: engine.state.comments
      .filter((c) => c.market === marketId)
      .slice()
      .reverse()
      .map((c) => ({ ...c, accountName: engine.account(c.account)?.name ?? c.account })),
    packet: packet(engine, marketId),
    traders: distinctTraders(engine, marketId),
  };
}

export function taskView(engine: Engine, taskId: string): TaskView {
  const task = engine.task(taskId);
  if (!task) throw new Error(`no task ${taskId}`);
  const records = new Map(executorRecords(engine).map((r) => [r.id, r]));
  const markets: TaskMarketSummary[] = task.candidateAgents.map((execId) => {
    const marketId = `${taskId}:${execId}`;
    const m = engine.market(marketId)!;
    return {
      marketId,
      executorId: execId,
      executor: records.get(execId)!,
      status: m.status,
      quote: quote(engine, marketId),
      closingPrice: m.closingPrice,
      settlementPrice: m.settlementPrice,
      outcome: m.outcome,
      traders: distinctTraders(engine, marketId),
    };
  });
  let recommendation: TaskView['recommendation'] = null;
  if (task.status !== 'pending' && task.status !== 'rejected') {
    for (const m of markets) {
      const chance = m.status === 'open' ? m.quote.chance : (m.closingPrice ?? m.quote.chance);
      if (!recommendation || chance > recommendation.chance) recommendation = { executorId: m.executorId, chance };
    }
  }
  return { task: publicTask(task), markets, recommendation };
}

/** Every task the viewer may see (private tasks only for the customer, admins, the house and vetted traders). */
export function allTasks(engine: Engine, viewer?: Account | null): TaskView[] {
  return [...engine.state.tasks.values()]
    .filter((t) => engine.canSeeTask(viewer ?? null, t))
    .map((t) => taskView(engine, t.id))
    .sort((a, b) => b.task.createdAt - a.task.createdAt);
}

function markPrice(engine: Engine, market: Market): number {
  if (market.status === 'settled') return market.settlementPrice!;
  if (market.status !== 'open') return market.closingPrice ?? quote(engine, market.id).chance;
  return quote(engine, market.id).chance;
}

export function portfolio(engine: Engine, accountId: string): Portfolio {
  const account = engine.account(accountId);
  if (!account) throw new Error(`no account ${accountId}`);
  const s = engine.state;
  const positions: PortfolioPosition[] = [];
  const history: Portfolio['history'] = [];
  let realized = 0;
  let unrealized = 0;
  let fees = 0;
  for (const pos of s.positions.values()) {
    if (pos.account !== accountId) continue;
    const market = s.markets.get(pos.market)!;
    const task = s.tasks.get(market.taskId)!;
    realized += pos.realized;
    fees += pos.fees;
    if (pos.closed) history.push({ ...pos, title: task.title, executorId: market.executorId, taskId: task.id });
    if (pos.yes === 0 && pos.no === 0) continue;
    const mark = markPrice(engine, market);
    const side = pos.yes > 0 ? 'yes' : 'no';
    const quantity = pos.yes > 0 ? pos.yes : pos.no;
    const cost = pos.yes > 0 ? pos.yesCost : pos.noCost;
    const value = pos.yes * mark + pos.no * (CONTRACT_VALUE - mark);
    const u = value - cost;
    unrealized += u;
    positions.push({
      market: pos.market,
      taskId: task.id,
      executorId: market.executorId,
      title: task.title,
      side,
      quantity,
      avgCost: quantity > 0 ? Math.round(cost / quantity) : null,
      cost,
      mark,
      unrealized: u,
      realized: pos.realized,
      fees: pos.fees,
    });
  }
  const openOrders = [...s.orders.values()].filter((o) => o.account === accountId && o.status === 'open');
  return {
    account: publicAccount(account),
    cash: account.cash,
    locked: account.locked,
    deposited: account.deposited,
    positions,
    openOrders,
    history: history.sort((a, b) => a.market.localeCompare(b.market)),
    pnl: { realized, unrealized, fees, total: realized + unrealized - fees },
  };
}

/** D22: profit = realized + unrealized; accuracy = Brier of implied probability over test-settled markets. */
export function leaderboard(engine: Engine): LeaderboardRow[] {
  const s = engine.state;
  const rows: LeaderboardRow[] = [];
  for (const a of s.accounts.values()) {
    if (a.role !== 'trader') continue;
    if (a.flagged || a.closed) continue; // under review or deleted: off the board (5.2)
    const p = portfolio(engine, a.id);
    let se = 0;
    let scored = 0;
    let hits = 0;
    for (const h of p.history) {
      const c = h.closed!;
      if (c.outcome !== 'passed' && c.outcome !== 'failed') continue;
      if (c.yes === 0 && c.no === 0) continue;
      const outcome = c.outcome === 'passed' ? 1 : 0;
      // Side-aware implied forecast (D22): midpoint between the entry Yes price and the holder's side's certainty.
      const entryYesPrice = c.yes > 0 ? c.yesCost / c.yes / CONTRACT_VALUE : 1 - c.noCost / c.no / CONTRACT_VALUE;
      const implied = c.yes > 0 ? (1 + entryYesPrice) / 2 : entryYesPrice / 2;
      se += (implied - outcome) ** 2;
      scored += 1;
      if ((c.yes > 0 && outcome === 1) || (c.no > 0 && outcome === 0)) hits += 1;
    }
    rows.push({
      id: a.id,
      name: a.name,
      kind: a.kind,
      org: a.org,
      profit: p.pnl.total,
      realized: p.pnl.realized,
      unrealized: p.pnl.unrealized,
      fees: p.pnl.fees,
      brier: scored > 0 ? se / scored : null,
      hits,
      scored,
      rankByProfit: 0,
      rankByAccuracy: null,
    });
  }
  rows.sort((x, y) => y.profit - x.profit || x.id.localeCompare(y.id));
  rows.forEach((r, i) => (r.rankByProfit = i + 1));
  const scoredRows = rows.filter((r) => r.brier !== null).sort((x, y) => x.brier! - y.brier! || x.id.localeCompare(y.id));
  scoredRows.forEach((r, i) => (r.rankByAccuracy = i + 1));
  return rows;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stats(engine: Engine): Stats {
  const s = engine.state;
  const tasks = { total: 0, pending: 0, open: 0, closed: 0, running: 0, resolved: 0, skipped: 0, rejected: 0 };
  const msToTradable: number[] = [];
  for (const t of s.tasks.values()) {
    tasks.total += 1;
    tasks[t.status] += 1;
    if (t.openedAt !== null) msToTradable.push(t.openedAt - t.createdAt);
  }
  const markets = { total: 0, open: 0, settled: 0, settledOnTests: 0 };
  let volume = 0;
  let fees = 0;
  for (const f of s.fills) fees += f.fee;
  const spreads: number[] = [];
  const traders: number[] = [];
  // Test-settled markets in resolution order, for the price-vs-base-rate comparison.
  const settledOnTests: { market: Market; task: Task; outcome: 0 | 1 }[] = [];
  for (const m of s.markets.values()) {
    markets.total += 1;
    volume += m.volume;
    if (m.status === 'open') markets.open += 1;
    if (m.status === 'settled') {
      markets.settled += 1;
      if (m.closingSpread !== null) spreads.push(m.closingSpread);
      traders.push(distinctTraders(engine, m.id));
      if (m.outcome === 'passed' || m.outcome === 'failed') {
        markets.settledOnTests += 1;
        settledOnTests.push({ market: m, task: s.tasks.get(m.taskId)!, outcome: m.outcome === 'passed' ? 1 : 0 });
      }
    }
  }
  settledOnTests.sort((a, b) => (a.task.resolvedAt! - b.task.resolvedAt!) || a.market.id.localeCompare(b.market.id));
  let priceSe = 0;
  let baseSe = 0;
  const history = new Map<string, { chosen: number; passed: number }>();
  let cal = { count: 0, passed: 0 };
  for (const { market, outcome } of settledOnTests) {
    const p = market.closingPrice! / CONTRACT_VALUE;
    priceSe += (p - outcome) ** 2;
    const h = history.get(market.executorId) ?? { chosen: 0, passed: 0 };
    const base = h.chosen > 0 ? h.passed / h.chosen : 0.5;
    baseSe += (base - outcome) ** 2;
    history.set(market.executorId, { chosen: h.chosen + 1, passed: h.passed + outcome });
    if (market.closingPrice! >= 70 && market.closingPrice! <= 80) cal = { count: cal.count + 1, passed: cal.passed + outcome };
  }
  const n = settledOnTests.length;
  return {
    accounts: s.accounts.size,
    tasks,
    markets,
    volume,
    fees,
    priceBrier: n ? priceSe / n : null,
    baseRateBrier: n ? baseSe / n : null,
    calibration70to80: { count: cal.count, passRate: cal.count ? cal.passed / cal.count : null },
    medianSpreadAtClose: median(spreads),
    medianTradersPerMarket: median(traders),
    // Time from submission to tradable: 0 without a baseline check, the baseline's duration with one (D2).
    medianMsToTradable: median(msToTradable),
  };
}

export interface AgentMarket {
  packet: Packet;
  book: { yes: BookLevel[]; no: BookLevel[] };
  quote: Quote;
  position: { yes: number; no: number; yesCost: number; noCost: number } | null;
  openOrders: Order[];
  canTrade: boolean;
  conflict: string | null;
}

/** Every open market with packet, book and the caller's position (GET /api/agent/markets). */
export function agentMarkets(engine: Engine, accountId: string): AgentMarket[] {
  const account = engine.account(accountId);
  if (!account) throw new Error(`no account ${accountId}`);
  const out: AgentMarket[] = [];
  for (const m of engine.state.markets.values()) {
    if (m.status !== 'open') continue;
    const task = engine.task(m.taskId)!;
    if (!engine.canSeeTask(account, task)) continue;
    const executor = engine.state.executors.get(m.executorId)!;
    const pos = engine.position(m.id, accountId);
    const conflict = engine.conflictReason(account, task, executor);
    out.push({
      packet: packet(engine, m.id),
      book: bookLevels(engine, m.id),
      quote: quote(engine, m.id),
      position: pos ? { yes: pos.yes, no: pos.no, yesCost: pos.yesCost, noCost: pos.noCost } : null,
      openOrders: [...engine.state.orders.values()].filter((o) => o.market === m.id && o.account === accountId && o.status === 'open'),
      canTrade: conflict === null,
      conflict,
    });
  }
  return out;
}
