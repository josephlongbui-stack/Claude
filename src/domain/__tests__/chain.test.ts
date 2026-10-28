import { describe, expect, it } from 'vitest';
import { buildChain, verifyChain, GENESIS_HASH, type EventDraft } from '../evidence/chain';
import { eventsToCsv, eventsToJson } from '../evidence/export';

const draft = (n: number): EventDraft => ({ id: `EVT-${n}`, seq: n, ts: `2026-10-28T10:00:0${n}Z`, simMs: n * 1000, rideId: 'vortex', type: 'phase', severity: 'info', title: `Event ${n}`, detail: 'detail', evidenceRef: `SIM-A-${n}`, scenarioId: 'A' });

describe('SHA-256 hash chain (demonstration)', () => {
  it('builds a chain anchored at genesis and verifies it', async () => {
    const chain = await buildChain([draft(1), draft(2), draft(3)]);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain[2].hash).toHaveLength(64);
    const v = await verifyChain(chain);
    expect(v.valid).toBe(true);
    expect(v.checked).toBe(3);
  });
  it('detects deliberate modification of a record', async () => {
    const chain = await buildChain([draft(1), draft(2), draft(3)]);
    const tampered = chain.map((r, i) => (i === 1 ? { ...r, detail: 'edited after the fact' } : r));
    const v = await verifyChain(tampered);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(1);
    expect(v.brokenId).toBe('EVT-2');
  });
  it('detects a broken link', async () => {
    const chain = await buildChain([draft(1), draft(2)]);
    const broken = [chain[0], { ...chain[1], prevHash: 'f'.repeat(64) }];
    const v = await verifyChain(broken);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(1);
  });
  it('is deterministic for identical content', async () => {
    const a = await buildChain([draft(1), draft(2)]);
    const b = await buildChain([draft(1), draft(2)]);
    expect(a[1].hash).toBe(b[1].hash);
  });
  it('exports CSV and JSON with simulation disclaimers', async () => {
    const chain = await buildChain([draft(1)]);
    expect(eventsToCsv(chain)).toContain('SIMULATION');
    expect(eventsToCsv(chain).split('\n')).toHaveLength(3);
    expect(JSON.parse(eventsToJson(chain)).records).toHaveLength(1);
  });
});
