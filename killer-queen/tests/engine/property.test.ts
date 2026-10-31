/**
 * Property tests: random sequences of all commands against a fresh exchange.
 * Every rule in docs/INVARIANTS.md holds after every command; a rejected
 * command never changes the state hash; replaying the accepted commands
 * reproduces the same hash. KQ_PROP_RUNS sets the number of sequences
 * (default 200; nightly 20000).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { Engine, FakeClock, Venue, type Command, type CommandInput } from '../../src/engine/index.js';
import { MemoryJournal } from '../helpers/fixtures.js';
import { assertInvariants, stateHash } from '../helpers/invariants.js';

const RUNS = Number(process.env.KQ_PROP_RUNS ?? 200);

const ACCOUNTS = ['house', 'mm', 'cust', 'alice', 'bob', 'botty', 'staffer', 'nobody'] as const;
/** Weighted toward valid traders so sequences do more than get rejected. */
const ORDER_ACCOUNTS = ['alice', 'alice', 'alice', 'bob', 'bob', 'bob', 'botty', 'botty', 'mm', 'mm', 'staffer', 'cust', 'admin', 'nobody'] as const;
const CUSTOMERS = ['cust', 'cust', 'cust', 'alice', 'admin', 'nobody'] as const;
const BY = [null, null, null, 'cust', 'admin', 'alice'] as const;
const EXECUTORS = ['claude-code', 'codex', 'gemini-cli', 'ghost'] as const;
const CANDIDATES = ['claude-code', 'codex', 'claude-code', 'codex', 'gemini-cli', 'ghost'] as const;
const REASONS = ['signup', 'faucet', 'admin', 'seed', 'bogus'] as const;

/** An intent is a command with its references resolved against the live state at apply time. */
type Intent =
  | { kind: 'createAccount'; id: number; role: number; kindIx: number; org: number; cash: number }
  | { kind: 'deposit'; account: number; amount: number; reason: number }
  | { kind: 'upsertExecutor'; id: number; version: number }
  | { kind: 'createTask'; customer: number; candidates: number[]; window: number; auto: boolean; min: number; force: number; baseline: boolean }
  | { kind: 'placeOrder'; account: number; market: number; side: number; action: number; type: number; price: number; qty: number; ioc: boolean; clientKey: number }
  | { kind: 'cancelOrder'; account: number; order: number }
  | { kind: 'comment'; account: number; market: number; prob: number }
  | { kind: 'closeTask'; task: number; by: number }
  | { kind: 'decide'; task: number; executor: number; by: number }
  | { kind: 'settle'; task: number; outcome: number; runId: number }
  | { kind: 'pauseTrading'; paused: boolean; by: number }
  | { kind: 'baseline'; task: number; results: number; runId: number }
  | { kind: 'reviewAccount'; account: number; flagged: number; vetted: number; by: number }
  | { kind: 'advance'; ms: number };

const intentArb: fc.Arbitrary<Intent> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('createAccount' as const), id: fc.nat(12), role: fc.nat(5), kindIx: fc.nat(3), org: fc.nat(4), cash: fc.oneof(fc.constant(0), fc.constant(100_000), fc.constant(-1), fc.constant(2.5)) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('deposit' as const), account: fc.nat(ACCOUNTS.length - 1), amount: fc.oneof(fc.constant(100_000), fc.constant(1), fc.constant(0), fc.constant(-5), fc.constant(0.5)), reason: fc.nat(REASONS.length - 1) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('upsertExecutor' as const), id: fc.nat(EXECUTORS.length - 1), version: fc.nat(3) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('createTask' as const), customer: fc.nat(CUSTOMERS.length - 1), candidates: fc.array(fc.nat(CANDIDATES.length - 1), { maxLength: 3 }), window: fc.nat(3), auto: fc.boolean(), min: fc.nat(110), force: fc.nat(3), baseline: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('baseline' as const), task: fc.nat(5), results: fc.nat(4), runId: fc.nat(4) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('reviewAccount' as const), account: fc.nat(ACCOUNTS.length - 1), flagged: fc.nat(2), vetted: fc.nat(2), by: fc.nat(BY.length - 1) }) },
  { weight: 25, arbitrary: fc.record({ kind: fc.constant('placeOrder' as const), account: fc.nat(ORDER_ACCOUNTS.length - 1), market: fc.nat(8), side: fc.nat(2), action: fc.nat(2), type: fc.nat(2), price: fc.nat(101), qty: fc.nat(60), ioc: fc.boolean(), clientKey: fc.nat(6) }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('cancelOrder' as const), account: fc.nat(ORDER_ACCOUNTS.length - 1), order: fc.nat(40) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('comment' as const), account: fc.nat(ORDER_ACCOUNTS.length - 1), market: fc.nat(8), prob: fc.nat(101) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('closeTask' as const), task: fc.nat(5), by: fc.nat(BY.length - 1) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('decide' as const), task: fc.nat(5), executor: fc.nat(EXECUTORS.length), by: fc.nat(BY.length - 1) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('settle' as const), task: fc.nat(5), outcome: fc.nat(3), runId: fc.nat(4) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('pauseTrading' as const), paused: fc.boolean(), by: fc.nat(BY.length - 1) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('advance' as const), ms: fc.nat(400_000) }) },
);

function baseVenue(): { venue: Venue; clock: FakeClock; journal: MemoryJournal } {
  const clock = new FakeClock();
  const journal = new MemoryJournal();
  const venue = new Venue({ engine: new Engine(), clock, journal });
  const ok = (r: { ok: boolean }) => assert.ok(r.ok);
  ok(venue.apply({ type: 'createAccount', id: 'house', name: 'House', kind: 'system', role: 'house', org: 'Killer Queen', keyHash: null, startingCash: 0 }));
  ok(venue.apply({ type: 'createAccount', id: 'mm', name: 'MM', kind: 'system', role: 'market_maker', org: 'Killer Queen', keyHash: null, startingCash: 5_000_000 }));
  ok(venue.apply({ type: 'createAccount', id: 'cust', name: 'Cust', kind: 'human', role: 'customer', org: 'Example Org', keyHash: null, startingCash: 0 }));
  ok(venue.apply({ type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000 }));
  ok(venue.apply({ type: 'createAccount', id: 'bob', name: 'Bob', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000 }));
  ok(venue.apply({ type: 'createAccount', id: 'botty', name: 'Botty', kind: 'agent', role: 'trader', org: 'Indie', keyHash: null, startingCash: 100_000 }));
  ok(venue.apply({ type: 'createAccount', id: 'staffer', name: 'Staffer', kind: 'human', role: 'trader', org: 'Anthropic', keyHash: null, startingCash: 100_000 }));
  ok(venue.apply({ type: 'createAccount', id: 'admin', name: 'Admin', kind: 'human', role: 'admin', org: 'Killer Queen', keyHash: null, startingCash: 0 }));
  ok(venue.apply({ type: 'upsertExecutor', id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2.1.0' }));
  ok(venue.apply({ type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' }));
  ok(venue.apply({ type: 'createTask', id: 'tsk_base', customer: 'cust', title: 'base', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['claude-code', 'codex'], tradingWindowMs: 300_000 }));
  return { venue, clock, journal };
}

const pick = <T,>(xs: readonly T[], i: number): T => xs[i % xs.length]!;

/** Turn an intent into a concrete command against the current state (or a time advance). */
function resolve(venue: Venue, clock: FakeClock, it: Intent): CommandInput | null {
  const s = venue.engine.state;
  const tasks = [...s.tasks.keys()];
  const markets = [...s.markets.keys()];
  const orders = [...s.orders.keys()];
  const taskId = (i: number) => (tasks.length && i !== 5 ? pick(tasks, i) : 'tsk_none');
  const marketId = (i: number) => (markets.length && i !== 8 ? pick(markets, i) : 'tsk_none:codex');
  const by = (i: number) => pick(BY, i);
  switch (it.kind) {
    case 'advance':
      clock.advance(it.ms);
      return null;
    case 'createAccount':
      return { type: 'createAccount', id: `acc_p${it.id}`, name: `P${it.id}`, kind: pick(['human', 'agent', 'system', 'robot'] as const, it.kindIx) as never, role: pick(['trader', 'customer', 'admin', 'market_maker', 'house', 'king'] as const, it.role) as never, org: pick(['', 'Anthropic', 'Example Org', 'Indie', 'OpenAI'], it.org), keyHash: null, startingCash: it.cash };
    case 'deposit':
      return { type: 'deposit', account: pick(ACCOUNTS, it.account), amount: it.amount, reason: pick(REASONS, it.reason) as never };
    case 'upsertExecutor':
      return { type: 'upsertExecutor', id: pick(EXECUTORS, it.id), name: 'X', org: pick(['Anthropic', 'OpenAI', 'Google', ''], it.id), version: pick(['1.0', '2.0', 'latest', ''], it.version) };
    case 'createTask':
      return {
        type: 'createTask',
        customer: pick(CUSTOMERS, it.customer),
        title: 't',
        prompt: 'p',
        repo: 'r',
        commit: 'c',
        testCommand: 'npm test',
        candidateAgents: it.candidates.map((c) => pick(CANDIDATES, c)),
        tradingWindowMs: pick([60_000, 300_000, 1, 0], it.window),
        autoDecide: it.auto,
        minimumChance: it.min,
        forceOutcome: pick([null, 'pass', 'fail', 'maybe' as never], it.force),
        requireBaseline: it.baseline,
        visibility: it.min % 7 === 0 ? 'private' : 'public',
      };
    case 'baseline':
      return {
        type: 'baseline',
        taskId: taskId(it.task),
        results: pick([['failed', 'failed', 'failed'], ['passed', 'passed', 'passed'], ['failed', 'passed', 'failed'], ['failed'], ['failed', 'failed', 'bogus' as never]] as const, it.results) as never,
        log: 'baseline log',
        runId: it.runId === 0 ? null : `base-${it.runId}`,
      };
    case 'placeOrder':
      return {
        type: 'placeOrder',
        account: pick(ORDER_ACCOUNTS, it.account),
        market: marketId(it.market),
        side: pick(['yes', 'no'] as const, it.side),
        action: pick(['buy', 'sell'] as const, it.action),
        orderType: pick(['limit', 'market'] as const, it.type),
        price: it.price,
        quantity: it.qty,
        tif: it.ioc ? 'ioc' : 'gtc',
        clientKey: it.clientKey === 0 ? undefined : `ck-${it.clientKey}`,
      };
    case 'cancelOrder': {
      const orderId = orders.length ? pick(orders, it.order) : 'o_none';
      const owner = s.orders.get(orderId)?.account;
      // half the time the owner cancels (valid path), otherwise someone random
      return { type: 'cancelOrder', account: it.account % 2 === 0 && owner ? owner : pick(ORDER_ACCOUNTS, it.account), orderId };
    }
    case 'comment':
      return { type: 'comment', account: pick(ORDER_ACCOUNTS, it.account), market: marketId(it.market), text: 'thesis', probability: it.prob };
    case 'closeTask':
      return { type: 'closeTask', taskId: taskId(it.task), by: by(it.by) };
    case 'decide':
      return { type: 'decide', taskId: taskId(it.task), executorId: it.executor >= EXECUTORS.length ? null : pick(EXECUTORS, it.executor), by: by(it.by) };
    case 'settle':
      return { type: 'settle', taskId: taskId(it.task), outcome: pick(['passed', 'failed', 'infra_error'] as const, it.outcome), log: 'log', runId: it.runId === 0 ? null : `run-${it.runId}` };
    case 'pauseTrading':
      return { type: 'pauseTrading', paused: it.paused, reason: 'test', by: by(it.by) };
    case 'reviewAccount':
      return { type: 'reviewAccount', account: pick(ACCOUNTS, it.account), flagged: it.flagged === 2 ? undefined : it.flagged === 1, vetted: it.vetted === 2 ? undefined : it.vetted === 1, by: by(it.by) };
  }
}

describe(`property: random command sequences (${RUNS} runs)`, () => {
  it('every invariant holds after every command; rejections are free; replay reproduces the hash', () => {
    let applied = 0;
    let rejected = 0;
    fc.assert(
      fc.property(fc.array(intentArb, { minLength: 20, maxLength: 80 }), (intents) => {
        const { venue, clock, journal } = baseVenue();
        // Finish with a close/decide/settle sweep so settlement paths run often.
        const tail: Intent[] = [
          { kind: 'baseline', task: 0, results: 0, runId: 3 },
          { kind: 'baseline', task: 1, results: 0, runId: 2 },
          { kind: 'advance', ms: 700_000 },
          { kind: 'closeTask', task: 0, by: 0 },
          { kind: 'closeTask', task: 1, by: 0 },
          { kind: 'decide', task: 0, executor: 0, by: 0 },
          { kind: 'decide', task: 1, executor: EXECUTORS.length, by: 0 },
          { kind: 'settle', task: 0, outcome: 0, runId: 1 },
        ];
        for (const intent of [...intents, ...tail]) {
          const cmd = resolve(venue, clock, intent);
          if (!cmd) continue;
          const before = stateHash(venue.engine);
          const r = venue.apply(cmd);
          if (r.ok) applied += 1;
          else {
            rejected += 1;
            assert.equal(stateHash(venue.engine), before, `rejected ${cmd.type} (${r.code}) changed the state`);
          }
          assertInvariants(venue.engine, `${cmd.type} ${r.ok ? 'ok' : r.code}`);
        }
        const fresh = new Venue({ engine: new Engine(), clock: new FakeClock(0) });
        for (const c of journal.commands as Command[]) fresh.replay(c);
        assert.equal(stateHash(fresh.engine), stateHash(venue.engine), 'replay hash differs');
      }),
      { numRuns: RUNS, verbose: true },
    );
    assert.ok(applied > RUNS * 8, `too few accepted commands: ${applied}`);
    assert.ok(rejected > 0);
  });
});
