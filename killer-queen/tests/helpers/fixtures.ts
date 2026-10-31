import assert from 'node:assert/strict';
import { FakeClock, Venue, sha256, type Command, type CommandInput, type CommandType, type EngineOk, type EngineResult } from '../../src/engine/index.js';
import { assertInvariants, stateHash } from './invariants.js';

export const START_CASH = 100_000;

/** Apply through the venue, assert success, assert invariants, return data. */
export function must<T extends CommandType>(venue: Venue, input: Extract<CommandInput, { type: T }>): EngineOk<T>['data'] {
  const r: EngineResult<T> = venue.apply(input);
  if (!r.ok) throw new Error(`${input.type} rejected: ${r.code} ${r.error}`);
  assertInvariants(venue.engine, input.type);
  return r.data;
}

/** Apply and assert rejection with the given code, and that nothing changed. */
export function mustReject(venue: Venue, input: CommandInput, code: string): void {
  const before = stateHash(venue.engine);
  const r = venue.apply(input);
  assert.equal(r.ok, false, `${input.type} should have been rejected with ${code}`);
  if (!r.ok) assert.equal(r.code, code, `${input.type} rejected with ${r.code} (${r.error}), expected ${code}`);
  assert.equal(stateHash(venue.engine), before, `rejected ${input.type} changed state`);
  assertInvariants(venue.engine, `rejected ${input.type}`);
}

export interface Fixture {
  venue: Venue;
  clock: FakeClock;
  keys: Record<string, string>;
  taskId: string;
  markets: string[];
  log: Command[];
}

/** A recording journal: collects commands so a test can replay them. */
export class MemoryJournal {
  readonly commands: Command[] = [];
  append(_seq: number, command: Command): void {
    this.commands.push(structuredClone(command));
  }
}

export function makeVenue(clock = new FakeClock()): { venue: Venue; clock: FakeClock; journal: MemoryJournal } {
  const journal = new MemoryJournal();
  const venue = new Venue({ clock, journal });
  return { venue, clock, journal };
}

export function apiKey(name: string): { raw: string; hash: string } {
  const raw = `kq_test_${name}_${'x'.repeat(16)}`;
  return { raw, hash: sha256(raw) };
}

/**
 * House account, market maker, customer, traders (alice, bob, carol = human,
 * botty = agent), executors claude-code (Anthropic), codex (OpenAI),
 * anthropic-staffer (org Anthropic), customer-colleague (org Example Org).
 */
export function seedExchange(opts: { withTask?: boolean; closesIn?: number } = {}): Fixture {
  const { venue, clock, journal } = makeVenue();
  const keys: Record<string, string> = {};
  const acct = (id: string, name: string, kind: 'human' | 'agent' | 'system', role: 'trader' | 'customer' | 'admin' | 'market_maker' | 'house', org: string, cash: number) => {
    const k = apiKey(id);
    keys[id] = k.raw;
    must(venue, { type: 'createAccount', id, name, kind, role, org, keyHash: k.hash, startingCash: cash });
  };
  acct('house', 'House', 'system', 'house', 'Killer Queen', 0);
  acct('mm', 'House market maker', 'system', 'market_maker', 'Killer Queen', 100_000_000);
  acct('cust', 'Example customer', 'human', 'customer', 'Example Org', 0);
  acct('alice', 'Alice', 'human', 'trader', '', START_CASH);
  acct('bob', 'Bob', 'human', 'trader', '', START_CASH);
  acct('carol', 'Carol', 'human', 'trader', '', START_CASH);
  acct('botty', 'Botty', 'agent', 'trader', 'Indie Bots', START_CASH);
  acct('anthropic-staffer', 'Anthropic staffer', 'human', 'trader', 'Anthropic', START_CASH);
  acct('colleague', 'Customer colleague', 'human', 'trader', 'Example Org', START_CASH);
  acct('admin', 'Admin', 'human', 'admin', 'Killer Queen', 0);
  must(venue, { type: 'upsertExecutor', id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2.1.0' });
  must(venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' });
  let taskId = '';
  let markets: string[] = [];
  if (opts.withTask !== false) {
    const r = must(venue, {
      type: 'createTask',
      id: 'tsk_1',
      customer: 'cust',
      title: 'Reject negative quantities in the cart API',
      prompt: 'POST /cart/items accepts quantity -3 ... add tests for 0, -1 and non-integers.',
      repo: 'github.com/example-org/shop-api',
      commit: '58b0ce4',
      testCommand: 'pytest tests/api/test_cart.py',
      candidateAgents: ['claude-code', 'codex'],
      tradingWindowMs: opts.closesIn ?? 600_000,
    });
    taskId = r.task.id;
    markets = r.markets.map((m) => m.id);
  }
  return { venue, clock, keys, taskId, markets, log: journal.commands };
}

export function buy(venue: Venue, account: string, market: string, side: 'yes' | 'no', price: number, quantity: number, tif: 'gtc' | 'ioc' = 'gtc') {
  return must(venue, { type: 'placeOrder', account, market, side, action: 'buy', orderType: 'limit', price, quantity, tif });
}

/** Deterministic PRNG (mulberry32) so random tests reproduce. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
