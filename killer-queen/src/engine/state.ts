import { sha256 } from './money.js';
import type { EngineState } from './types.js';

export function createState(): EngineState {
  return {
    accounts: new Map(),
    executors: new Map(),
    tasks: new Map(),
    markets: new Map(),
    orders: new Map(),
    fills: [],
    positions: new Map(),
    positionsByMarket: new Map(),
    comments: [],
    books: new Map(),
    counters: { account: 0, task: 0, order: 0, fill: 0, comment: 0, seq: 0 },
    totals: { deposited: 0 },
    usedRunIds: new Set(),
    clientKeys: new Map(),
    trading: { paused: false, reason: '', since: null },
    applied: 0,
  };
}

/** Canonical JSON: sorted object keys, Maps and Sets as sorted entries. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Map) {
    return [...value.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, normalize(v)]);
  }
  if (value instanceof Set) {
    return [...value].map((v) => normalize(v)).sort();
  }
  if (Array.isArray(value)) return value.map(normalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = normalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

/** The comparable part of the state: everything except the derived book index. */
export function snapshot(state: EngineState): string {
  const { books: _books, positionsByMarket: _idx, ...rest } = state;
  return canonicalJson(rest);
}

export function stateHash(state: EngineState): string {
  return sha256(snapshot(state));
}
