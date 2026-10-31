import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_EXECUTORS, seedDemo } from '../../src/server/seed.js';
import { makeVenue } from '../helpers/fixtures.js';
import { assertInvariants } from '../helpers/invariants.js';

describe('seed', () => {
  it('creates executors, a demo customer and three open demo tasks, idempotently', () => {
    const { venue } = makeVenue();
    const a = seedDemo(venue);
    assert.equal(a.executorsCreated, DEFAULT_EXECUTORS.length);
    assert.match(a.customerKey!, /^kq_/);
    assert.equal(a.taskIds.length, 3);
    for (const id of a.taskIds) {
      const t = venue.engine.task(id)!;
      assert.equal(t.status, 'open');
      assert.deepEqual(t.candidateAgents, ['claude-code', 'codex', 'gemini-cli']);
      assert.equal(t.autoDecide, true);
    }
    const b = seedDemo(venue);
    assert.equal(b.executorsCreated, 0);
    assert.equal(b.customerKey, null);
    assert.equal(b.taskIds.length, 0);
    assert.equal(venue.engine.state.tasks.size, 3);
    assertInvariants(venue.engine);
  });
});
