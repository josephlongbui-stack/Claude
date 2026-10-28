import type { EventRecord } from '../types';

/**
 * Demonstration of tamper-evident logging with SHA-256 hash chaining via the
 * browser Web Crypto API. This is NOT a production forensic system: records
 * live in local browser storage and the chain only proves that the local copy
 * has not been altered since it was written.
 */
export const GENESIS_HASH = '0'.repeat(64);

export type EventDraft = Omit<EventRecord, 'prevHash' | 'hash'>;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  // Skip undefined values so the canonical form is identical before and after JSON persistence.
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function canonicalize(record: EventDraft, prevHash: string): string {
  return stableStringify({ ...record, prevHash });
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API not available');
  const data = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeHash(record: EventDraft, prevHash: string): Promise<string> {
  return sha256Hex(canonicalize(record, prevHash));
}

export async function appendToChain(chain: EventRecord[], draft: EventDraft): Promise<EventRecord> {
  const prevHash = chain.length ? chain[chain.length - 1].hash : GENESIS_HASH;
  const hash = await computeHash(draft, prevHash);
  return { ...draft, prevHash, hash };
}

export async function buildChain(drafts: EventDraft[]): Promise<EventRecord[]> {
  const chain: EventRecord[] = [];
  for (const d of drafts) chain.push(await appendToChain(chain, d));
  return chain;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAt?: number;
  brokenId?: string;
  reason?: string;
}

export async function verifyChain(records: EventRecord[], anchor: string = GENESIS_HASH): Promise<ChainVerification> {
  let prev = anchor;
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    if (r.prevHash !== prev) {
      return { valid: false, checked: i + 1, brokenAt: i, brokenId: r.id, reason: `Record ${r.id} links to ${r.prevHash.slice(0, 12)}… but previous hash is ${prev.slice(0, 12)}…` };
    }
    const { hash, prevHash, ...draft } = r;
    const expected = await computeHash(draft as EventDraft, prevHash);
    if (expected !== hash) {
      return { valid: false, checked: i + 1, brokenAt: i, brokenId: r.id, reason: `Record ${r.id} content does not match its stored hash (${hash.slice(0, 12)}…)` };
    }
    prev = hash;
  }
  return { valid: true, checked: records.length };
}
