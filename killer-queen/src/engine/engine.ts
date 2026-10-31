/**
 * The exchange state machine. Pure and deterministic: no clock, no
 * randomness, no I/O. Every command is validated completely before any
 * mutation; a rejected command leaves the state untouched.
 */
import { CONTRACT_VALUE, isCents, isPrice, marketId as makeMarketId, midHalfUp, otherSide } from './money.js';
import { createState } from './state.js';
import {
  COMMAND_TYPES,
  assertNever,
  type Account,
  type Book,
  type CancelOrderCommand,
  type CloseTaskCommand,
  type Command,
  type CommandResults,
  type CommandType,
  type CommentCommand,
  type CreateAccountCommand,
  type CreateTaskCommand,
  type DecideCommand,
  type DepositCommand,
  type EngineErr,
  type EngineOk,
  type EngineResult,
  type EngineState,
  type Executor,
  type Fill,
  type Market,
  type MarketOutcome,
  type Order,
  type PlaceOrderCommand,
  type Position,
  type SettleCommand,
  type Side,
  type Task,
  type Tif,
  type UpsertExecutorCommand,
} from './types.js';

export const DEFAULT_TRADING_WINDOW_MS = 600_000;
export const DEFAULT_MINIMUM_CHANCE = 50;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_ORDER_QUANTITY = 1_000_000;
export const MAX_CLOSING_SPREAD = 20;

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

function err(code: string, error: string): EngineErr {
  return { ok: false, code, error };
}

function reject(code: string, error: string): never {
  throw new EngineError(code, error);
}

function positionKey(market: string, account: string): string {
  return `${market}|${account}`;
}

function sortBook(side: Order[]): void {
  side.sort((a, b) => (b.price - a.price) || (a.seq - b.seq));
}

export interface QuoteSides {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
}

export class Engine {
  readonly state: EngineState;

  constructor(state: EngineState = createState()) {
    this.state = state;
  }

  /** Apply one command. Validation failures return `{ ok: false }` with no mutation. */
  apply<T extends CommandType>(cmd: Extract<Command, { type: T }>): EngineResult<T> {
    if (!cmd || typeof cmd !== 'object') return err('bad_command', 'command must be an object');
    if (!isCents(cmd.at) || cmd.at < 0) return err('bad_command', 'command.at must be a non-negative integer timestamp');
    if (!COMMAND_TYPES.includes(cmd.type)) return err('unknown_command', `unknown command type ${String((cmd as { type?: unknown }).type)}`);
    try {
      const data = this.dispatch(cmd);
      this.state.applied += 1;
      const ok: EngineOk<T> = { ok: true, seq: this.state.applied, data: data as CommandResults[T] };
      return ok;
    } catch (e) {
      if (e instanceof EngineError) return err(e.code, e.message);
      throw e;
    }
  }

  private dispatch(cmd: Command): CommandResults[CommandType] {
    switch (cmd.type) {
      case 'createAccount':
        return this.createAccount(cmd);
      case 'deposit':
        return this.deposit(cmd);
      case 'upsertExecutor':
        return this.upsertExecutor(cmd);
      case 'createTask':
        return this.createTask(cmd);
      case 'placeOrder':
        return this.placeOrder(cmd);
      case 'cancelOrder':
        return this.cancelOrder(cmd);
      case 'comment':
        return this.comment(cmd);
      case 'closeTask':
        return this.closeTask(cmd);
      case 'decide':
        return this.decide(cmd);
      case 'settle':
        return this.settle(cmd);
      default:
        return assertNever(cmd);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Lookups                                                           */
  /* ---------------------------------------------------------------- */

  account(id: string): Account | undefined {
    return this.state.accounts.get(id);
  }

  accountByKeyHash(keyHash: string): Account | undefined {
    for (const a of this.state.accounts.values()) if (a.keyHash === keyHash) return a;
    return undefined;
  }

  houseAccount(): Account | undefined {
    for (const a of this.state.accounts.values()) if (a.role === 'house') return a;
    return undefined;
  }

  market(id: string): Market | undefined {
    return this.state.markets.get(id);
  }

  task(id: string): Task | undefined {
    return this.state.tasks.get(id);
  }

  order(id: string): Order | undefined {
    return this.state.orders.get(id);
  }

  book(marketId: string): Book {
    return this.state.books.get(marketId) ?? { yes: [], no: [] };
  }

  position(marketId: string, accountId: string): Position | undefined {
    return this.state.positions.get(positionKey(marketId, accountId));
  }

  positionsFor(marketId: string): Position[] {
    const ids = this.state.positionsByMarket.get(marketId);
    if (!ids) return [];
    const out: Position[] = [];
    for (const accountId of [...ids].sort()) {
      const p = this.state.positions.get(positionKey(marketId, accountId));
      if (p) out.push(p);
    }
    return out;
  }

  quoteSides(marketId: string): QuoteSides {
    const book = this.book(marketId);
    const yesBid = book.yes[0]?.price ?? null;
    const noBid = book.no[0]?.price ?? null;
    return {
      yesBid,
      yesAsk: noBid === null ? null : CONTRACT_VALUE - noBid,
      noBid,
      noAsk: yesBid === null ? null : CONTRACT_VALUE - yesBid,
    };
  }

  /** D7: mid (half up) if both sides exist and spread ≤ 20, else last trade, else 50. */
  closingPriceFor(market: Market): { price: number; spread: number | null } {
    const q = this.quoteSides(market.id);
    if (q.yesBid !== null && q.yesAsk !== null) {
      const spread = q.yesAsk - q.yesBid;
      if (spread <= MAX_CLOSING_SPREAD) return { price: midHalfUp(q.yesBid, q.yesAsk), spread };
      if (market.lastPrice !== null) return { price: market.lastPrice, spread };
      return { price: 50, spread };
    }
    if (market.lastPrice !== null) return { price: market.lastPrice, spread: null };
    return { price: 50, spread: null };
  }

  /** Why an account may not trade a market, or null if it may (D18). */
  conflictReason(account: Account, task: Task, executor: Executor): string | null {
    if (account.role !== 'trader' && account.role !== 'market_maker') {
      return `role ${account.role} may not trade`;
    }
    if (account.id === task.customer) return 'the customer cannot trade its own task';
    const customer = this.state.accounts.get(task.customer);
    if (account.org !== '') {
      if (executor.org !== '' && account.org === executor.org) {
        return `org ${account.org} makes ${executor.id}`;
      }
      if (customer && customer.org !== '' && account.org === customer.org) {
        return `org ${account.org} is the customer's org`;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  private createAccount(c: CreateAccountCommand): CommandResults['createAccount'] {
    const s = this.state;
    if (typeof c.name !== 'string' || c.name.trim() === '') reject('bad_name', 'name is required');
    if (!['human', 'agent', 'system'].includes(c.kind)) reject('bad_kind', `unknown kind ${String(c.kind)}`);
    if (!['trader', 'customer', 'admin', 'market_maker', 'house'].includes(c.role)) reject('bad_role', `unknown role ${String(c.role)}`);
    if (typeof c.org !== 'string') reject('bad_org', 'org must be a string');
    if (c.keyHash !== null && (typeof c.keyHash !== 'string' || !/^[0-9a-f]{64}$/.test(c.keyHash))) {
      reject('bad_key_hash', 'keyHash must be a SHA-256 hex digest or null');
    }
    if (!isCents(c.startingCash) || c.startingCash < 0) reject('bad_amount', 'startingCash must be a non-negative integer');
    if (c.id !== undefined && (typeof c.id !== 'string' || c.id === '')) reject('bad_id', 'id must be a non-empty string');
    if (c.id !== undefined && s.accounts.has(c.id)) reject('duplicate_id', `account ${c.id} already exists`);
    if (c.keyHash !== null && this.accountByKeyHash(c.keyHash)) reject('duplicate_key', 'an account with that key already exists');
    if (c.role === 'house' && this.houseAccount()) reject('duplicate_house', 'there is already a house account');

    const id = c.id ?? `acc_${++s.counters.account}`;
    const account: Account = {
      id,
      name: c.name.trim(),
      kind: c.kind,
      role: c.role,
      org: c.org,
      keyHash: c.keyHash,
      cash: c.startingCash,
      locked: 0,
      deposited: c.startingCash,
      createdAt: c.at,
      lastFaucetAt: null,
    };
    s.accounts.set(id, account);
    s.totals.deposited += c.startingCash;
    return { account };
  }

  private deposit(c: DepositCommand): CommandResults['deposit'] {
    const s = this.state;
    const account = s.accounts.get(c.account);
    if (!account) reject('account_not_found', `no account ${c.account}`);
    if (!isCents(c.amount) || c.amount <= 0) reject('bad_amount', 'amount must be a positive integer number of cents');
    if (!['signup', 'faucet', 'admin', 'seed'].includes(c.reason)) reject('bad_reason', `unknown reason ${String(c.reason)}`);
    if (c.reason === 'faucet') {
      if (account.role !== 'trader' && account.role !== 'market_maker') reject('forbidden_role', 'only traders use the faucet');
      if (account.lastFaucetAt !== null && c.at - account.lastFaucetAt < FAUCET_COOLDOWN_MS) {
        reject('faucet_cooldown', 'faucet is once per 24 hours');
      }
    }
    account.cash += c.amount;
    account.deposited += c.amount;
    s.totals.deposited += c.amount;
    if (c.reason === 'faucet') account.lastFaucetAt = c.at;
    return { account };
  }

  private upsertExecutor(c: UpsertExecutorCommand): CommandResults['upsertExecutor'] {
    const s = this.state;
    if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(c.id)) {
      reject('bad_id', 'executor id must be lowercase letters, digits, dots, dashes or underscores');
    }
    if (typeof c.name !== 'string' || c.name.trim() === '') reject('bad_name', 'name is required');
    if (typeof c.org !== 'string') reject('bad_org', 'org must be a string');
    if (typeof c.version !== 'string' || c.version.trim() === '' || c.version.trim().toLowerCase() === 'latest') {
      reject('version_required', 'a concrete version is required; "latest" is not allowed (D4)');
    }
    const existing = s.executors.get(c.id);
    const executor: Executor = { id: c.id, name: c.name.trim(), org: c.org, version: c.version.trim() };
    s.executors.set(c.id, executor);
    return { executor, created: !existing };
  }

  private createTask(c: CreateTaskCommand): CommandResults['createTask'] {
    const s = this.state;
    const customer = s.accounts.get(c.customer);
    if (!customer) reject('account_not_found', `no account ${c.customer}`);
    if (customer.role !== 'customer' && customer.role !== 'admin') reject('forbidden_role', 'only customer accounts submit tasks');
    for (const [field, value] of [
      ['title', c.title],
      ['prompt', c.prompt],
      ['repo', c.repo],
      ['commit', c.commit],
      ['testCommand', c.testCommand],
    ] as const) {
      if (typeof value !== 'string' || value.trim() === '') reject('bad_field', `${field} is required`);
    }
    if (!Array.isArray(c.candidateAgents) || c.candidateAgents.length === 0) reject('no_candidates', 'at least one candidate agent is required');
    if (new Set(c.candidateAgents).size !== c.candidateAgents.length) reject('duplicate_candidate', 'candidate agents must be distinct');
    for (const id of c.candidateAgents) if (!s.executors.has(id)) reject('executor_not_found', `no executor ${id}`);
    if (c.id !== undefined && (typeof c.id !== 'string' || c.id === '')) reject('bad_id', 'id must be a non-empty string');
    if (c.id !== undefined && s.tasks.has(c.id)) reject('duplicate_id', `task ${c.id} already exists`);
    if (c.closesAt !== undefined && (!isCents(c.closesAt) || c.closesAt <= c.at)) reject('bad_closes_at', 'closesAt must be after the command time');
    if (c.tradingWindowMs !== undefined && (!isCents(c.tradingWindowMs) || c.tradingWindowMs <= 0)) reject('bad_window', 'tradingWindowMs must be positive');
    const minimumChance = c.minimumChance ?? DEFAULT_MINIMUM_CHANCE;
    if (!isPrice(minimumChance)) reject('bad_minimum_chance', 'minimumChance must be 1–99');
    if (c.forceOutcome !== undefined && c.forceOutcome !== null && c.forceOutcome !== 'pass' && c.forceOutcome !== 'fail') {
      reject('bad_force_outcome', 'forceOutcome must be pass, fail or null');
    }
    if (c.protectedPaths !== undefined && (!Array.isArray(c.protectedPaths) || c.protectedPaths.some((p) => typeof p !== 'string'))) {
      reject('bad_protected_paths', 'protectedPaths must be strings');
    }

    const id = c.id ?? `tsk_${++s.counters.task}`;
    const candidateVersions: Record<string, string> = {};
    for (const execId of c.candidateAgents) candidateVersions[execId] = s.executors.get(execId)!.version;
    const task: Task = {
      id,
      customer: c.customer,
      title: c.title.trim(),
      prompt: c.prompt,
      repo: c.repo.trim(),
      commit: c.commit.trim(),
      testCommand: c.testCommand.trim(),
      candidateAgents: [...c.candidateAgents],
      candidateVersions,
      protectedPaths: c.protectedPaths ? [...c.protectedPaths] : [],
      status: 'open',
      createdAt: c.at,
      closesAt: c.closesAt ?? c.at + (c.tradingWindowMs ?? DEFAULT_TRADING_WINDOW_MS),
      closedAt: null,
      decidedAt: null,
      resolvedAt: null,
      autoDecide: c.autoDecide ?? false,
      minimumChance,
      chosenAgent: null,
      passed: null,
      outcome: null,
      runLog: null,
      runId: null,
      forceOutcome: c.forceOutcome ?? null,
    };
    s.tasks.set(id, task);
    const markets: Market[] = [];
    for (const execId of task.candidateAgents) {
      const market: Market = {
        id: makeMarketId(id, execId),
        taskId: id,
        executorId: execId,
        status: 'open',
        closingPrice: null,
        closingSpread: null,
        settlementPrice: null,
        outcome: null,
        lastPrice: null,
        volume: 0,
        openInterest: 0,
        escrow: 0,
      };
      s.markets.set(market.id, market);
      s.books.set(market.id, { yes: [], no: [] });
      s.positionsByMarket.set(market.id, new Set());
      markets.push(market);
    }
    return { task, markets };
  }

  private placeOrder(c: PlaceOrderCommand): CommandResults['placeOrder'] {
    const s = this.state;
    const account = s.accounts.get(c.account);
    if (!account) reject('account_not_found', `no account ${c.account}`);
    const market = s.markets.get(c.market);
    if (!market) reject('market_not_found', `no market ${c.market}`);
    const task = s.tasks.get(market.taskId)!;
    const executor = s.executors.get(market.executorId)!;
    const conflict = this.conflictReason(account, task, executor);
    if (conflict) reject('conflict', conflict);
    if (market.status !== 'open' || task.status !== 'open') reject('market_closed', `market ${market.id} is ${market.status}`);
    if (c.side !== 'yes' && c.side !== 'no') reject('bad_side', 'side must be yes or no');
    if (c.action !== 'buy' && c.action !== 'sell') reject('bad_action', 'action must be buy or sell');
    if (c.orderType !== 'limit' && c.orderType !== 'market') reject('bad_type', 'type must be limit or market');
    if (!isCents(c.quantity) || c.quantity < 1 || c.quantity > MAX_ORDER_QUANTITY) reject('bad_quantity', 'quantity must be a positive integer');
    if (c.tif !== undefined && c.tif !== 'gtc' && c.tif !== 'ioc') reject('bad_tif', 'tif must be gtc or ioc');
    if (c.id !== undefined && (typeof c.id !== 'string' || c.id === '')) reject('bad_id', 'id must be a non-empty string');
    if (c.id !== undefined && s.orders.has(c.id)) reject('duplicate_id', `order ${c.id} already exists`);

    // D17: sell side s at p == buy other side at 100 − p; market == IOC at 99 for the side bought.
    let side: Side = c.action === 'sell' ? otherSide(c.side) : c.side;
    let price: number;
    let tif: Tif;
    if (c.orderType === 'market') {
      price = 99;
      tif = 'ioc';
    } else {
      if (!isPrice(c.price)) reject('bad_price', 'price must be an integer from 1 to 99');
      price = c.action === 'sell' ? CONTRACT_VALUE - c.price : c.price;
      tif = c.tif ?? 'gtc';
    }
    const feeRate: 0 | 1 = account.role === 'market_maker' ? 0 : 1;
    const house = this.houseAccount();
    if (feeRate > 0 && !house) reject('no_house_account', 'the house fee account does not exist');
    const lock = c.quantity * (price + feeRate);
    if (account.cash < lock) reject('insufficient_funds', `need ${lock}¢ but only ${account.cash}¢ available`);

    // ---- mutate ----
    const id = c.id ?? `o${++s.counters.order}`;
    const order: Order = {
      id,
      market: market.id,
      account: account.id,
      side,
      price,
      quantity: c.quantity,
      filled: 0,
      status: 'open',
      tif,
      lockedRemaining: lock,
      feeRate,
      createdAt: c.at,
      seq: ++s.counters.seq,
    };
    account.cash -= lock;
    account.locked += lock;
    s.orders.set(id, order);

    const fills = this.match(order, account, market, house ?? null, c.at);

    if (order.filled < order.quantity) {
      if (tif === 'gtc') {
        const book = s.books.get(market.id)!;
        book[side].push(order);
        sortBook(book[side]);
      } else {
        this.releaseLock(order, account);
        order.status = 'cancelled';
      }
    } else {
      order.status = 'filled';
    }
    return { order, fills };
  }

  private releaseLock(order: Order, account: Account): void {
    account.cash += order.lockedRemaining;
    account.locked -= order.lockedRemaining;
    order.lockedRemaining = 0;
  }

  private match(order: Order, taker: Account, market: Market, house: Account | null, at: number): Fill[] {
    const s = this.state;
    const book = s.books.get(market.id)!;
    const oppSide = otherSide(order.side);
    const opp = book[oppSide];
    const fills: Fill[] = [];
    const done: Order[] = [];
    for (const resting of opp) {
      if (order.filled === order.quantity) break;
      if (order.price + resting.price < CONTRACT_VALUE) break; // sorted by price desc: nothing further crosses
      if (resting.account === order.account) continue; // D19: skip own orders
      const maker = s.accounts.get(resting.account)!;
      const q = Math.min(order.quantity - order.filled, resting.quantity - resting.filled);
      const r = resting.price;
      const takerPays = CONTRACT_VALUE - r;
      const yesPrice = resting.side === 'yes' ? r : takerPays;

      // Taker: release q×(limit+fee); pay q×takerPays to escrow, q×fee to the house, refund the rest.
      const takerRelease = q * (order.price + order.feeRate);
      taker.locked -= takerRelease;
      order.lockedRemaining -= takerRelease;
      taker.cash += q * (order.price - takerPays);
      const fee = q * order.feeRate;
      if (fee > 0) house!.cash += fee;

      // Maker: release q×(price+fee); pay q×price to escrow, fee part back to cash.
      const makerRelease = q * (r + resting.feeRate);
      maker.locked -= makerRelease;
      resting.lockedRemaining -= makerRelease;
      maker.cash += q * resting.feeRate;

      market.escrow += CONTRACT_VALUE * q;
      market.openInterest += q;
      market.volume += q;
      market.lastPrice = yesPrice;
      order.filled += q;
      resting.filled += q;
      if (resting.filled === resting.quantity) {
        resting.status = 'filled';
        done.push(resting);
      }

      const takerPos = this.ensurePosition(market.id, taker.id);
      const makerPos = this.ensurePosition(market.id, maker.id);
      this.addContracts(takerPos, order.side, q, q * takerPays);
      takerPos.fees += fee;
      this.addContracts(makerPos, resting.side, q, q * r);
      this.net(takerPos, taker, market);
      this.net(makerPos, maker, market);

      const fill: Fill = {
        id: `f${++s.counters.fill}`,
        market: market.id,
        yesAccount: order.side === 'yes' ? taker.id : maker.id,
        noAccount: order.side === 'no' ? taker.id : maker.id,
        yesPrice,
        quantity: q,
        takerSide: order.side,
        takerOrder: order.id,
        makerOrder: resting.id,
        fee,
        at,
      };
      s.fills.push(fill);
      fills.push(fill);
    }
    if (done.length) book[oppSide] = opp.filter((o) => !done.includes(o));
    return fills;
  }

  private ensurePosition(marketId: string, accountId: string): Position {
    const s = this.state;
    const key = positionKey(marketId, accountId);
    let pos = s.positions.get(key);
    if (!pos) {
      pos = { market: marketId, account: accountId, yes: 0, no: 0, yesCost: 0, noCost: 0, realized: 0, fees: 0, payout: 0, closed: null };
      s.positions.set(key, pos);
      s.positionsByMarket.get(marketId)!.add(accountId);
    }
    return pos;
  }

  private addContracts(pos: Position, side: Side, qty: number, cost: number): void {
    if (side === 'yes') {
      pos.yes += qty;
      pos.yesCost += cost;
    } else {
      pos.no += qty;
      pos.noCost += cost;
    }
  }

  /** D16: redeem matched pairs for 100¢ each at once. */
  private net(pos: Position, account: Account, market: Market): void {
    const k = Math.min(pos.yes, pos.no);
    if (k === 0) return;
    const removedYes = k === pos.yes ? pos.yesCost : Math.floor((pos.yesCost * k) / pos.yes);
    const removedNo = k === pos.no ? pos.noCost : Math.floor((pos.noCost * k) / pos.no);
    pos.yes -= k;
    pos.no -= k;
    pos.yesCost -= removedYes;
    pos.noCost -= removedNo;
    pos.realized += CONTRACT_VALUE * k - removedYes - removedNo;
    account.cash += CONTRACT_VALUE * k;
    market.escrow -= CONTRACT_VALUE * k;
    market.openInterest -= k;
  }

  private cancelOrder(c: CancelOrderCommand): CommandResults['cancelOrder'] {
    const s = this.state;
    const account = s.accounts.get(c.account);
    if (!account) reject('account_not_found', `no account ${c.account}`);
    const order = s.orders.get(c.orderId);
    if (!order) reject('order_not_found', `no order ${c.orderId}`);
    if (order.account !== account.id && account.role !== 'admin') reject('forbidden', 'only the owner cancels an order');
    if (order.status !== 'open') reject('order_not_open', `order ${order.id} is ${order.status}`);
    const owner = s.accounts.get(order.account)!;
    const refunded = order.lockedRemaining;
    this.removeFromBook(order);
    this.releaseLock(order, owner);
    order.status = 'cancelled';
    return { order, refunded };
  }

  private removeFromBook(order: Order): void {
    const book = this.state.books.get(order.market);
    if (!book) return;
    book[order.side] = book[order.side].filter((o) => o.id !== order.id);
  }

  private comment(c: CommentCommand): CommandResults['comment'] {
    const s = this.state;
    const account = s.accounts.get(c.account);
    if (!account) reject('account_not_found', `no account ${c.account}`);
    const market = s.markets.get(c.market);
    if (!market) reject('market_not_found', `no market ${c.market}`);
    const task = s.tasks.get(market.taskId)!;
    const executor = s.executors.get(market.executorId)!;
    const conflict = this.conflictReason(account, task, executor);
    if (conflict) reject('conflict', conflict);
    if (typeof c.text !== 'string' || c.text.trim() === '') reject('bad_text', 'text is required');
    if (c.text.length > 4000) reject('bad_text', 'text is too long (max 4000)');
    const probability = c.probability ?? null;
    if (probability !== null && !isPrice(probability)) reject('bad_probability', 'probability must be 1–99');
    if (c.id !== undefined && s.comments.some((x) => x.id === c.id)) reject('duplicate_id', `comment ${c.id} already exists`);
    const comment = { id: c.id ?? `c${++s.counters.comment}`, market: market.id, account: account.id, text: c.text.trim(), probability, at: c.at };
    s.comments.push(comment);
    return { comment };
  }

  private closeTask(c: CloseTaskCommand): CommandResults['closeTask'] {
    const s = this.state;
    const task = s.tasks.get(c.taskId);
    if (!task) reject('task_not_found', `no task ${c.taskId}`);
    if (c.by !== undefined && c.by !== null) {
      const by = s.accounts.get(c.by);
      if (!by) reject('account_not_found', `no account ${c.by}`);
      if (by.id !== task.customer && by.role !== 'admin') reject('forbidden', 'only the customer closes a task early');
    }
    if (task.status !== 'open') reject('task_not_open', `task ${task.id} is ${task.status}`);

    task.status = 'closed';
    task.closedAt = c.at;
    const markets: Market[] = [];
    let cancelledOrders = 0;
    for (const execId of task.candidateAgents) {
      const market = s.markets.get(makeMarketId(task.id, execId))!;
      const { price, spread } = this.closingPriceFor(market); // from the book before cancelling
      market.closingPrice = price;
      market.closingSpread = spread;
      const book = s.books.get(market.id)!;
      for (const order of [...book.yes, ...book.no]) {
        const owner = s.accounts.get(order.account)!;
        this.releaseLock(order, owner);
        order.status = 'cancelled';
        cancelledOrders += 1;
      }
      book.yes = [];
      book.no = [];
      market.status = 'closed';
      markets.push(market);
    }
    return { task, markets, cancelledOrders };
  }

  private decide(c: DecideCommand): CommandResults['decide'] {
    const s = this.state;
    const task = s.tasks.get(c.taskId);
    if (!task) reject('task_not_found', `no task ${c.taskId}`);
    if (c.by !== undefined && c.by !== null) {
      const by = s.accounts.get(c.by);
      if (!by) reject('account_not_found', `no account ${c.by}`);
      if (by.id !== task.customer && by.role !== 'admin') reject('forbidden', 'only the customer decides');
    }
    if (task.status !== 'closed') reject('task_not_closed', `task ${task.id} is ${task.status}; decide needs closed`);
    if (c.executorId !== null && !task.candidateAgents.includes(c.executorId)) reject('not_a_candidate', `${c.executorId} is not a candidate on ${task.id}`);

    const settled: Market[] = [];
    task.decidedAt = c.at;
    if (c.executorId === null) {
      task.status = 'skipped';
      task.resolvedAt = c.at;
      for (const execId of task.candidateAgents) {
        const market = s.markets.get(makeMarketId(task.id, execId))!;
        this.settleMarket(market, market.closingPrice!, 'skipped');
        settled.push(market);
      }
    } else {
      task.status = 'running';
      task.chosenAgent = c.executorId;
      for (const execId of task.candidateAgents) {
        const market = s.markets.get(makeMarketId(task.id, execId))!;
        if (execId === c.executorId) {
          market.status = 'running';
        } else {
          this.settleMarket(market, market.closingPrice!, 'unchosen');
          settled.push(market);
        }
      }
    }
    return { task, settled };
  }

  private settle(c: SettleCommand): CommandResults['settle'] {
    const s = this.state;
    const task = s.tasks.get(c.taskId);
    if (!task) reject('task_not_found', `no task ${c.taskId}`);
    if (task.status !== 'running') reject('task_not_running', `task ${task.id} is ${task.status}; settle needs running`);
    if (c.outcome !== 'passed' && c.outcome !== 'failed' && c.outcome !== 'infra_error') reject('bad_outcome', 'outcome must be passed, failed or infra_error');
    if (typeof c.log !== 'string') reject('bad_log', 'log must be a string');
    const runId = c.runId ?? null;
    if (runId !== null) {
      if (typeof runId !== 'string' || runId === '') reject('bad_run_id', 'runId must be a non-empty string');
      if (s.usedRunIds.has(runId)) reject('run_id_used', `runId ${runId} was already used`);
    }
    const market = s.markets.get(makeMarketId(task.id, task.chosenAgent!))!;

    const price = c.outcome === 'passed' ? CONTRACT_VALUE : c.outcome === 'failed' ? 0 : market.closingPrice!;
    this.settleMarket(market, price, c.outcome);
    task.status = 'resolved';
    task.resolvedAt = c.at;
    task.outcome = c.outcome;
    task.passed = c.outcome === 'infra_error' ? null : c.outcome === 'passed';
    task.runLog = c.log;
    task.runId = runId;
    if (runId !== null) s.usedRunIds.add(runId);
    return { task, market };
  }

  /** Pay every position at `price` for Yes (100 − price for No); escrow must reach exactly 0. */
  private settleMarket(market: Market, price: number, outcome: MarketOutcome): void {
    const s = this.state;
    for (const pos of this.positionsFor(market.id)) {
      const account = s.accounts.get(pos.account)!;
      const payout = pos.yes * price + pos.no * (CONTRACT_VALUE - price);
      account.cash += payout;
      market.escrow -= payout;
      pos.payout += payout;
      pos.realized += payout - pos.yesCost - pos.noCost;
      pos.closed = { yes: pos.yes, no: pos.no, yesCost: pos.yesCost, noCost: pos.noCost, settlementPrice: price, outcome };
      pos.yes = 0;
      pos.no = 0;
      pos.yesCost = 0;
      pos.noCost = 0;
    }
    if (market.escrow !== 0) {
      throw new Error(`escrow for ${market.id} did not empty: ${market.escrow}`);
    }
    market.openInterest = 0;
    market.status = 'settled';
    market.settlementPrice = price;
    market.outcome = outcome;
  }
}
