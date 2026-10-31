import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FAUCET_COOLDOWN_MS, leaderboard, sha256 } from '../../src/engine/index.js';
import { apiKey, buy, makeVenue, must, mustReject, seedExchange } from '../helpers/fixtures.js';

describe('accounts, deposits, executors', () => {
  it('createAccount stores only the key hash and the key authenticates by hashing', () => {
    const { venue } = makeVenue();
    const k = apiKey('alice');
    const { account } = must(venue, { type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: k.hash, startingCash: 100_000 });
    assert.equal(account.keyHash, k.hash);
    assert.equal(JSON.stringify(venue.engine.state).includes(k.raw), false);
    assert.equal(venue.engine.accountByKeyHash(sha256(k.raw))?.id, 'alice');
    assert.equal(venue.engine.accountByKeyHash(sha256('wrong')), undefined);
    assert.equal(account.cash, 100_000);
    assert.equal(account.deposited, 100_000);
    assert.equal(account.locked, 0);
  });

  it('counter ids skip ids that were supplied explicitly', () => {
    const f = seedExchange(); // tsk_1 exists with an explicit id
    const t = must(f.venue, { type: 'createTask', customer: 'cust', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex'] });
    assert.equal(t.task.id, 'tsk_2');
    assert.equal(f.venue.engine.task('tsk_1')!.title, 'Reject negative quantities in the cart API');
    must(f.venue, { type: 'createAccount', id: 'acc_1', name: 'x', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    const a = must(f.venue, { type: 'createAccount', name: 'y', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    assert.equal(a.account.id, 'acc_2');
    must(f.venue, { type: 'placeOrder', id: 'o1', account: 'alice', market: f.markets[0]!, side: 'yes', action: 'buy', orderType: 'limit', price: 10, quantity: 1 });
    const o = must(f.venue, { type: 'placeOrder', account: 'alice', market: f.markets[0]!, side: 'yes', action: 'buy', orderType: 'limit', price: 10, quantity: 1 });
    assert.equal(o.order.id, 'o2');
  });

  it('engine assigns counter ids when none is given', () => {
    const { venue } = makeVenue();
    const a = must(venue, { type: 'createAccount', name: 'A', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    const b = must(venue, { type: 'createAccount', name: 'B', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    assert.equal(a.account.id, 'acc_1');
    assert.equal(b.account.id, 'acc_2');
  });

  it('duplicate account id and duplicate key are rejected with no change', () => {
    const { venue } = makeVenue();
    const k = apiKey('alice');
    must(venue, { type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: k.hash, startingCash: 1 });
    mustReject(venue, { type: 'createAccount', id: 'alice', name: 'Alice 2', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 1 }, 'duplicate_id');
    mustReject(venue, { type: 'createAccount', id: 'alice2', name: 'Alice 2', kind: 'human', role: 'trader', org: '', keyHash: k.hash, startingCash: 1 }, 'duplicate_key');
    mustReject(venue, { type: 'createAccount', id: 'bad', name: 'Bad', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 10.5 }, 'bad_amount');
    mustReject(venue, { type: 'createAccount', id: 'bad', name: '', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 }, 'bad_name');
    mustReject(venue, { type: 'createAccount', id: 'bad', name: 'x', kind: 'robot' as never, role: 'trader', org: '', keyHash: null, startingCash: 0 }, 'bad_kind');
  });

  it('only one house account', () => {
    const { venue } = makeVenue();
    must(venue, { type: 'createAccount', id: 'house', name: 'House', kind: 'system', role: 'house', org: '', keyHash: null, startingCash: 0 });
    mustReject(venue, { type: 'createAccount', id: 'house2', name: 'House', kind: 'system', role: 'house', org: '', keyHash: null, startingCash: 0 }, 'duplicate_house');
  });

  it('deposit increases cash and deposited; non-positive or fractional amounts are rejected', () => {
    const { venue } = makeVenue();
    must(venue, { type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    const { account } = must(venue, { type: 'deposit', account: 'alice', amount: 2500, reason: 'admin' });
    assert.equal(account.cash, 2500);
    assert.equal(account.deposited, 2500);
    assert.equal(venue.engine.state.totals.deposited, 2500);
    mustReject(venue, { type: 'deposit', account: 'alice', amount: 0, reason: 'admin' }, 'bad_amount');
    mustReject(venue, { type: 'deposit', account: 'alice', amount: -5, reason: 'admin' }, 'bad_amount');
    mustReject(venue, { type: 'deposit', account: 'alice', amount: 1.5, reason: 'admin' }, 'bad_amount');
    mustReject(venue, { type: 'deposit', account: 'nobody', amount: 5, reason: 'admin' }, 'account_not_found');
    mustReject(venue, { type: 'deposit', account: 'alice', amount: 5, reason: 'gift' as never }, 'bad_reason');
  });

  it('faucet is once per 24 hours per trader (D8)', () => {
    const { venue, clock } = makeVenue();
    must(venue, { type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    must(venue, { type: 'createAccount', id: 'cust', name: 'Cust', kind: 'human', role: 'customer', org: '', keyHash: null, startingCash: 0 });
    must(venue, { type: 'deposit', account: 'alice', amount: 100_000, reason: 'faucet' });
    mustReject(venue, { type: 'deposit', account: 'alice', amount: 100_000, reason: 'faucet' }, 'faucet_cooldown');
    clock.advance(FAUCET_COOLDOWN_MS - 1);
    mustReject(venue, { type: 'deposit', account: 'alice', amount: 100_000, reason: 'faucet' }, 'faucet_cooldown');
    clock.advance(1);
    must(venue, { type: 'deposit', account: 'alice', amount: 100_000, reason: 'faucet' });
    assert.equal(venue.engine.account('alice')!.cash, 200_000);
    mustReject(venue, { type: 'deposit', account: 'cust', amount: 100_000, reason: 'faucet' }, 'forbidden_role');
  });

  it('cash, locked and deposited stay integers and conservation holds with no markets', () => {
    const f = seedExchange({ withTask: false });
    let sum = 0;
    for (const a of f.venue.engine.state.accounts.values()) {
      assert.ok(Number.isInteger(a.cash) && Number.isInteger(a.locked) && Number.isInteger(a.deposited));
      assert.equal(a.cash + a.locked, a.deposited);
      sum += a.deposited;
    }
    assert.equal(sum, f.venue.engine.state.totals.deposited);
  });

  it('commands with a bad timestamp or unknown type are rejected', () => {
    const { venue } = makeVenue();
    const r1 = venue.engine.apply({ type: 'deposit', account: 'x', amount: 1, reason: 'admin', at: 1.5 });
    assert.equal(r1.ok, false);
    const r2 = venue.engine.apply({ type: 'explode', at: 1 } as never);
    assert.equal(r2.ok, false);
  });
});

describe('executors (D4)', () => {
  it('upsertExecutor is idempotent on id and needs a concrete version', () => {
    const { venue } = makeVenue();
    const a = must(venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' });
    assert.equal(a.created, true);
    const b = must(venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.49.0' });
    assert.equal(b.created, false);
    assert.equal(venue.engine.state.executors.size, 1);
    assert.equal(venue.engine.state.executors.get('codex')!.version, '0.49.0');
    mustReject(venue, { type: 'upsertExecutor', id: 'gemini-cli', name: 'Gemini CLI', org: 'Google', version: 'latest' }, 'version_required');
    mustReject(venue, { type: 'upsertExecutor', id: 'gemini-cli', name: 'Gemini CLI', org: 'Google', version: '' }, 'version_required');
    mustReject(venue, { type: 'upsertExecutor', id: 'Bad Id', name: 'x', org: '', version: '1' }, 'bad_id');
  });

  it('createTask freezes each candidate version; a later upsert does not change the packet', () => {
    const f = seedExchange();
    must(f.venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.99.0' });
    const task = f.venue.engine.task(f.taskId)!;
    assert.equal(task.candidateVersions['codex'], '0.48.0');
    assert.equal(task.candidateVersions['claude-code'], '2.1.0');
  });
});

describe('identity limits and review (5.2)', () => {
  it('caps accounts per email and per device, and a new email on a capped device still fails', () => {
    const { venue } = makeVenue();
    const mk = (id: string, emailHash: string | null, deviceHash: string | null) =>
      venue.apply({ type: 'createAccount', id, name: id, kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0, emailHash, deviceHash });
    const e = 'e'.repeat(64);
    const d = 'd'.repeat(64);
    for (let i = 0; i < 3; i++) assert.equal(mk(`e${i}`, e, null).ok, true);
    const r = mk('e3', e, null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'too_many_accounts');
    for (let i = 0; i < 5; i++) assert.equal(mk(`d${i}`, `${i}`.repeat(64), d).ok, true);
    const r2 = mk('d5', 'f'.repeat(64), d); // fresh email, capped device
    assert.equal(r2.ok, false);
    assert.equal(mk('free', null, null).ok, true, 'no hashes: no caps (sandbox agents)');
    mustReject(venue, { type: 'createAccount', id: 'bad', name: 'b', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0, emailHash: 'nope' }, 'bad_hash');
  });

  it('one faucet per verified person across all of their accounts; flagged accounts cannot faucet', () => {
    const { venue, clock } = makeVenue();
    must(venue, { type: 'createAccount', id: 'p-a', name: 'a', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0, personId: 'person-1' });
    must(venue, { type: 'createAccount', id: 'p-b', name: 'b', kind: 'agent', role: 'trader', org: '', keyHash: null, startingCash: 0, personId: 'person-1' });
    must(venue, { type: 'createAccount', id: 'other', name: 'o', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0, personId: 'person-2' });
    must(venue, { type: 'deposit', account: 'p-a', amount: 100_000, reason: 'faucet' });
    mustReject(venue, { type: 'deposit', account: 'p-b', amount: 100_000, reason: 'faucet' }, 'faucet_cooldown');
    must(venue, { type: 'deposit', account: 'other', amount: 100_000, reason: 'faucet' });
    clock.advance(FAUCET_COOLDOWN_MS);
    must(venue, { type: 'deposit', account: 'p-b', amount: 100_000, reason: 'faucet' });
    mustReject(venue, { type: 'deposit', account: 'p-a', amount: 100_000, reason: 'faucet' }, 'faucet_cooldown');
    must(venue, { type: 'createAccount', id: 'admin', name: 'admin', kind: 'human', role: 'admin', org: '', keyHash: null, startingCash: 0 });
    must(venue, { type: 'reviewAccount', account: 'other', flagged: true, reason: 'wash trade alert', by: 'admin' });
    clock.advance(FAUCET_COOLDOWN_MS);
    mustReject(venue, { type: 'deposit', account: 'other', amount: 100_000, reason: 'faucet' }, 'account_flagged');
  });

  it('review: only admins; flagged accounts leave the leaderboard until cleared; vetting and person attach are journaled', () => {
    const f = seedExchange();
    const m = f.markets[0]!;
    buy(f.venue, 'alice', m, 'no', 40, 10);
    buy(f.venue, 'bob', m, 'yes', 60, 10);
    mustReject(f.venue, { type: 'reviewAccount', account: 'alice', flagged: true, by: 'bob' }, 'forbidden');
    mustReject(f.venue, { type: 'reviewAccount', account: 'alice', by: 'admin' }, 'nothing_to_review');
    mustReject(f.venue, { type: 'reviewAccount', account: 'ghost', flagged: true, by: 'admin' }, 'account_not_found');
    assert.ok(leaderboard(f.venue.engine).some((r) => r.id === 'alice'));
    must(f.venue, { type: 'reviewAccount', account: 'alice', flagged: true, reason: 'spoofing', by: 'admin' });
    assert.ok(!leaderboard(f.venue.engine).some((r) => r.id === 'alice'));
    // flagged accounts still trade (nothing is auto-banned)
    buy(f.venue, 'alice', m, 'no', 10, 1);
    must(f.venue, { type: 'reviewAccount', account: 'alice', flagged: false, vetted: true, personId: 'person-9', by: null });
    const a = f.venue.engine.account('alice')!;
    assert.equal(a.flagged, false);
    assert.equal(a.vetted, true);
    assert.equal(a.personId, 'person-9');
    assert.ok(leaderboard(f.venue.engine).some((r) => r.id === 'alice'));
  });
});
