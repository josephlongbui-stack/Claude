import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Engine, FakeClock, Venue, stateHash, type Command } from '../../src/engine/index.js';
import { Journal, openVenue } from '../../src/server/journal.js';
import { buy, must, rng } from '../helpers/fixtures.js';
import { assertInvariants } from '../helpers/invariants.js';

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'kq-journal-'));
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function populate(venue: Venue, clock: FakeClock): string[] {
  must(venue, { type: 'createAccount', id: 'house', name: 'House', kind: 'system', role: 'house', org: 'KQ', keyHash: null, startingCash: 0 });
  must(venue, { type: 'createAccount', id: 'cust', name: 'Cust', kind: 'human', role: 'customer', org: 'C', keyHash: null, startingCash: 0 });
  for (const id of ['a', 'b', 'c']) must(venue, { type: 'createAccount', id, name: id, kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000 });
  must(venue, { type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '1' });
  must(venue, { type: 'upsertExecutor', id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2' });
  const t = must(venue, { type: 'createTask', customer: 'cust', title: 't', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex', 'claude-code'] });
  const rand = rng(7);
  const markets = t.markets.map((m) => m.id);
  for (let i = 0; i < 200; i++) {
    clock.advance(10);
    venue.apply({
      type: 'placeOrder',
      account: ['a', 'b', 'c'][i % 3]!,
      market: markets[i % 2]!,
      side: rand() < 0.5 ? 'yes' : 'no',
      action: 'buy',
      orderType: 'limit',
      price: 1 + Math.floor(rand() * 99),
      quantity: 1 + Math.floor(rand() * 20),
      tif: rand() < 0.3 ? 'ioc' : 'gtc',
    });
  }
  must(venue, { type: 'comment', account: 'a', market: markets[0]!, text: 'thesis', probability: 55 });
  return markets;
}

describe('journal', () => {
  it('replaying the journal rebuilds identical state (ids, cash, books, positions)', () => {
    const path = join(dir, 'replay.db');
    const clock = new FakeClock();
    const first = openVenue(path, clock);
    assert.equal(first.replayed, 0);
    const markets = populate(first.venue, clock);
    const liveHash = stateHash(first.venue.engine.state);
    const liveOrders = first.venue.engine.state.orders.size;
    assert.ok(liveOrders > 100);
    assert.equal(first.journal.length, first.venue.engine.state.applied);
    first.journal.close();

    const second = openVenue(path, new FakeClock(0));
    assert.equal(second.replayed, first.journal.length);
    assert.equal(stateHash(second.venue.engine.state), liveHash);
    assertInvariants(second.venue.engine, 'after replay');
    assert.deepEqual(second.venue.engine.book(markets[0]!).yes.map((o) => o.id), first.venue.engine.book(markets[0]!).yes.map((o) => o.id));
    // The replayed venue keeps appending with the right sequence.
    const t = must(second.venue, { type: 'closeTask', taskId: 'tsk_1' });
    assert.equal(t.task.status, 'closed');
    assert.equal(second.journal.length, second.venue.engine.state.applied);
    second.journal.close();

    const third = openVenue(path);
    assert.equal(third.venue.engine.task('tsk_1')!.status, 'closed');
    assert.equal(stateHash(third.venue.engine.state), stateHash(second.venue.engine.state));
    third.journal.close();
  });

  it('rejected commands are never journaled; journaled rows carry the original timestamp', () => {
    const path = join(dir, 'reject.db');
    const clock = new FakeClock(5_000);
    const { venue, journal } = openVenue(path, clock);
    must(venue, { type: 'createAccount', id: 'x', name: 'x', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    const r = venue.apply({ type: 'deposit', account: 'x', amount: -1, reason: 'admin' });
    assert.equal(r.ok, false);
    assert.equal(journal.length, 1);
    const rows = journal.readAll();
    assert.equal(rows[0]!.at, 5_000);
    assert.equal(rows[0]!.type, 'createAccount');
    journal.close();
  });

  it('a sequence gap or corrupt row is reported, never skipped', () => {
    const path = join(dir, 'corrupt.db');
    const j = new Journal(path);
    j.append(1, { type: 'createAccount', at: 1, name: 'x', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    assert.throws(() => j.append(3, { type: 'deposit', at: 2, account: 'acc_1', amount: 1, reason: 'admin' }), /sequence gap/);
    j.db.exec("INSERT INTO commands (seq, type, json, ts) VALUES (2, 'deposit', '{not json', 2)");
    assert.throws(() => j.readAll(), /not valid JSON/);
    j.close();
  });

  it('a failed append halts the venue (D21)', () => {
    const engine = new Engine();
    const venue = new Venue({
      engine,
      clock: new FakeClock(),
      journal: {
        append() {
          throw new Error('disk full');
        },
      },
    });
    assert.throws(() => venue.apply({ type: 'createAccount', name: 'x', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 }), /disk full/);
    assert.match(venue.isHalted ?? '', /disk full/);
    const r = venue.apply({ type: 'createAccount', name: 'y', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'venue_halted');
  });

  it('WAL mode and synchronous=FULL are set', () => {
    const j = new Journal(join(dir, 'pragma.db'));
    assert.equal((j.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
    assert.equal(Number((j.db.prepare('PRAGMA synchronous').get() as { synchronous: number }).synchronous), 2);
    j.close();
  });
});

describe('golden journal', () => {
  it('a fixed command sequence hashes to the recorded value (update tests/golden/expected.json with a reason in BUILD_LOG)', async () => {
    const { readFileSync } = await import('node:fs');
    const golden = JSON.parse(readFileSync(new URL('../golden/journal.json', import.meta.url), 'utf8')) as { commands: Command[]; hash: string };
    const venue = new Venue({ engine: new Engine(), clock: new FakeClock(0) });
    for (const c of golden.commands) venue.replay(c);
    assert.equal(stateHash(venue.engine.state), golden.hash);
  });
});
