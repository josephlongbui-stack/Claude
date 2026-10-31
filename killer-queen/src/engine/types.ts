/**
 * Killer Queen domain types. All money is integer cents. A contract pays
 * 100¢; prices run 1–99¢. Every state change is one of ten commands.
 */

export type Cents = number;

export type AccountKind = 'human' | 'agent' | 'system';
export type AccountRole = 'trader' | 'customer' | 'admin' | 'market_maker' | 'house';
export type Side = 'yes' | 'no';
export type Tif = 'gtc' | 'ioc';
export type OrderStatus = 'open' | 'filled' | 'cancelled';
export type TaskStatus = 'pending' | 'open' | 'closed' | 'running' | 'resolved' | 'skipped' | 'rejected';
export type MarketStatus = 'pending' | 'open' | 'closed' | 'running' | 'settled' | 'cancelled';
export type BaselineRun = 'passed' | 'failed';
export type RejectReason = 'trivial' | 'flaky';
/** What the runner reports for the chosen market. */
export type RunOutcome = 'passed' | 'failed' | 'infra_error';
/** How a market was settled. */
export type MarketOutcome = RunOutcome | 'unchosen' | 'skipped';
export type DepositReason = 'signup' | 'faucet' | 'admin' | 'seed';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  role: AccountRole;
  org: string;
  /** SHA-256 hex of the API key, or null for accounts without a key. */
  keyHash: string | null;
  cash: Cents;
  locked: Cents;
  deposited: Cents;
  createdAt: number;
  lastFaucetAt: number | null;
  /** Identity limits (D8, 5.2): hashes of the sign-up email and device, and the verified person behind the account. */
  emailHash: string | null;
  deviceHash: string | null;
  personId: string | null;
  /** Flagged by surveillance review: off the leaderboard until an admin clears it. */
  flagged: boolean;
  /** Vetted traders may see and trade private tasks (5.4). */
  vetted: boolean;
  /** Closed by the owner (store requirement): anonymised, key revoked, no trading, off the leaderboard. */
  closed: boolean;
}

export interface Executor {
  id: string;
  name: string;
  org: string;
  version: string;
}

export interface Task {
  id: string;
  customer: string;
  title: string;
  prompt: string;
  repo: string;
  commit: string;
  testCommand: string;
  candidateAgents: string[];
  /** Executor version frozen at creation (D4). */
  candidateVersions: Record<string, string>;
  protectedPaths: string[];
  status: TaskStatus;
  createdAt: number;
  /** When markets opened (after the baseline, or at creation). */
  openedAt: number | null;
  tradingWindowMs: number;
  closesAt: number;
  closedAt: number | null;
  decidedAt: number | null;
  resolvedAt: number | null;
  autoDecide: boolean;
  /** Minimum chance (1–99) the recommended agent needs for auto-decide to run it. */
  minimumChance: number;
  chosenAgent: string | null;
  passed: boolean | null;
  outcome: RunOutcome | null;
  runLog: string | null;
  runLogSha256: string | null;
  runId: string | null;
  /** Baseline check (D2): null until the runner reports; results must all fail to open the markets. */
  baseline: { results: BaselineRun[]; log: string; logSha256: string; runId: string | null; at: number } | null;
  rejectedReason: RejectReason | null;
  /** Sandbox-only override for the simulated runner (D20). Never in packets. */
  forceOutcome: 'pass' | 'fail' | null;
  /** Sandbox-only: make the simulated baseline come back trivial or flaky. Never in packets. */
  forceBaseline: RejectReason | null;
  /** Where an imported task came from (issue URL); unique per source for idempotent imports. */
  source: string | null;
  /** Private tasks (5.4): packet and markets visible only to the customer, admins, the house and vetted traders. */
  visibility: 'public' | 'private';
}

export interface Market {
  /** `${taskId}:${executorId}` */
  id: string;
  taskId: string;
  executorId: string;
  status: MarketStatus;
  closingPrice: number | null;
  /** Spread at close (ask − bid) when both sides existed, for the liquidity metric. */
  closingSpread: number | null;
  settlementPrice: number | null;
  outcome: MarketOutcome | null;
  lastPrice: number | null;
  volume: number;
  openInterest: number;
  escrow: Cents;
}

export interface Order {
  id: string;
  market: string;
  account: string;
  side: Side;
  price: number;
  quantity: number;
  filled: number;
  status: OrderStatus;
  tif: Tif;
  /** Cents still locked for the unfilled part: remaining × (price + feeRate). */
  lockedRemaining: Cents;
  /** 1 for traders, 0 for the house market maker (D13). */
  feeRate: 0 | 1;
  createdAt: number;
  cancelledAt: number | null;
  cancelReason: 'user' | 'close' | 'ioc' | null;
  /** Monotonic placement sequence; oldest first within a price level. */
  seq: number;
}

export interface Fill {
  id: string;
  market: string;
  yesAccount: string;
  noAccount: string;
  yesPrice: number;
  quantity: number;
  takerSide: Side;
  takerOrder: string;
  makerOrder: string;
  fee: Cents;
  at: number;
}

export interface ClosedPosition {
  yes: number;
  no: number;
  yesCost: Cents;
  noCost: Cents;
  settlementPrice: number;
  outcome: MarketOutcome;
}

export interface Position {
  market: string;
  account: string;
  yes: number;
  no: number;
  yesCost: Cents;
  noCost: Cents;
  realized: Cents;
  fees: Cents;
  payout: Cents;
  /** Snapshot of the position at settlement, for history and accuracy. */
  closed: ClosedPosition | null;
}

export interface Comment {
  id: string;
  market: string;
  account: string;
  text: string;
  probability: number | null;
  at: number;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

interface Stamped {
  /** Milliseconds since epoch, set by the Venue from its clock (D12). */
  at: number;
}

export interface CreateAccountCommand extends Stamped {
  type: 'createAccount';
  id?: string;
  name: string;
  kind: AccountKind;
  role: AccountRole;
  org: string;
  keyHash: string | null;
  /** Play money credited at creation; recorded as a deposit. */
  startingCash: Cents;
  emailHash?: string | null;
  deviceHash?: string | null;
  personId?: string | null;
  vetted?: boolean;
}

/** Owner-initiated deletion: cancels open orders, revokes the key, anonymises the name. Positions settle normally. */
export interface CloseAccountCommand extends Stamped {
  type: 'closeAccount';
  account: string;
  /** The owner, or an admin acting on a request. */
  by?: string | null;
}

/** Admin review (5.2/5.4): flag or clear an account, attach a verified person, vet for private tasks. */
export interface ReviewAccountCommand extends Stamped {
  type: 'reviewAccount';
  account: string;
  flagged?: boolean;
  vetted?: boolean;
  personId?: string | null;
  reason?: string;
  by?: string | null;
}

export interface DepositCommand extends Stamped {
  type: 'deposit';
  account: string;
  amount: Cents;
  reason: DepositReason;
}

export interface UpsertExecutorCommand extends Stamped {
  type: 'upsertExecutor';
  id: string;
  name: string;
  org: string;
  version: string;
}

export interface CreateTaskCommand extends Stamped {
  type: 'createTask';
  id?: string;
  customer: string;
  title: string;
  prompt: string;
  repo: string;
  commit: string;
  testCommand: string;
  candidateAgents: string[];
  closesAt?: number;
  tradingWindowMs?: number;
  autoDecide?: boolean;
  minimumChance?: number;
  protectedPaths?: string[];
  forceOutcome?: 'pass' | 'fail' | null;
  forceBaseline?: RejectReason | null;
  /** D2: start `pending` and wait for a baseline result before the markets open. */
  requireBaseline?: boolean;
  source?: string | null;
  visibility?: 'public' | 'private';
}

export interface PlaceOrderCommand extends Stamped {
  type: 'placeOrder';
  id?: string;
  account: string;
  market: string;
  side: Side;
  action: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price?: number;
  quantity: number;
  tif?: Tif;
  /** Caller-supplied idempotency key (D27): a second order with the same key is rejected. */
  clientKey?: string;
}

export interface CancelOrderCommand extends Stamped {
  type: 'cancelOrder';
  account: string;
  orderId: string;
}

export interface CommentCommand extends Stamped {
  type: 'comment';
  id?: string;
  account: string;
  market: string;
  text: string;
  probability?: number | null;
}

export interface CloseTaskCommand extends Stamped {
  type: 'closeTask';
  taskId: string;
  /** Account closing early (customer or admin), or null for the clock. */
  by?: string | null;
}

export interface DecideCommand extends Stamped {
  type: 'decide';
  taskId: string;
  executorId: string | null;
  by?: string | null;
}

export interface SettleCommand extends Stamped {
  type: 'settle';
  taskId: string;
  outcome: RunOutcome;
  log: string;
  runId?: string | null;
}

/** Baseline result (D2): three agent-free test runs at the pinned commit. */
export interface BaselineCommand extends Stamped {
  type: 'baseline';
  taskId: string;
  results: BaselineRun[];
  log: string;
  runId?: string | null;
}

/** Admin switch (D26): while paused, no new orders rest or fill; cancels and settlement continue. */
export interface PauseTradingCommand extends Stamped {
  type: 'pauseTrading';
  paused: boolean;
  reason?: string;
  /** Admin account, or null when the admin key was used. */
  by?: string | null;
}

export type Command =
  | CreateAccountCommand
  | DepositCommand
  | UpsertExecutorCommand
  | CreateTaskCommand
  | PlaceOrderCommand
  | CancelOrderCommand
  | CommentCommand
  | CloseTaskCommand
  | DecideCommand
  | SettleCommand
  | PauseTradingCommand
  | BaselineCommand
  | ReviewAccountCommand
  | CloseAccountCommand;

export type CommandType = Command['type'];

export const COMMAND_TYPES: readonly CommandType[] = [
  'createAccount',
  'deposit',
  'upsertExecutor',
  'createTask',
  'placeOrder',
  'cancelOrder',
  'comment',
  'closeTask',
  'decide',
  'settle',
  'pauseTrading',
  'baseline',
  'reviewAccount',
  'closeAccount',
] as const;

/** A command as callers build it: the Venue stamps `at` when missing. */
export type CommandInput = { [K in Command['type']]: Omit<Extract<Command, { type: K }>, 'at'> & { at?: number } }[Command['type']];

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export interface CommandResults {
  createAccount: { account: Account };
  deposit: { account: Account };
  upsertExecutor: { executor: Executor; created: boolean };
  createTask: { task: Task; markets: Market[] };
  placeOrder: { order: Order; fills: Fill[] };
  cancelOrder: { order: Order; refunded: Cents };
  comment: { comment: Comment };
  closeTask: { task: Task; markets: Market[]; cancelledOrders: number };
  decide: { task: Task; settled: Market[] };
  settle: { task: Task; market: Market };
  pauseTrading: { paused: boolean; reason: string };
  baseline: { task: Task; opened: boolean; rejectedReason: RejectReason | null };
  reviewAccount: { account: Account };
  closeAccount: { account: Account; cancelledOrders: number };
}

export type EngineOk<T extends CommandType = CommandType> = { ok: true; seq: number; data: CommandResults[T] };
export type EngineErr = { ok: false; code: string; error: string };
export type EngineResult<T extends CommandType = CommandType> = EngineOk<T> | EngineErr;

export interface Book {
  yes: Order[];
  no: Order[];
}

export interface EngineState {
  accounts: Map<string, Account>;
  executors: Map<string, Executor>;
  tasks: Map<string, Task>;
  markets: Map<string, Market>;
  orders: Map<string, Order>;
  fills: Fill[];
  /** keyed `${market}|${account}` */
  positions: Map<string, Position>;
  /** accounts with a position per market */
  positionsByMarket: Map<string, Set<string>>;
  comments: Comment[];
  /** open orders per market, each side sorted by price desc then seq asc */
  books: Map<string, Book>;
  counters: { account: number; task: number; order: number; fill: number; comment: number; seq: number };
  totals: { deposited: Cents };
  usedRunIds: Set<string>;
  /** `${account}|${clientKey}` → order id (D27). */
  clientKeys: Map<string, string>;
  trading: { paused: boolean; reason: string; since: number | null };
  /** Number of commands applied so far. */
  applied: number;
}

export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
