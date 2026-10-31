/**
 * Sandbox seed data: the three well-known executors (so Submit works on a
 * fresh clone) and, on request, three public demo tasks with realistic
 * packets. Everything goes through the Venue, so it is journaled like any
 * other command. Nothing here scrapes GitHub (the importer is v1).
 */
import type { Venue } from '../engine/index.js';
import { newApiKey } from './auth.js';

export const DEFAULT_EXECUTORS = [
  { id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2.1.0' },
  { id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' },
  { id: 'gemini-cli', name: 'Gemini CLI', org: 'Google', version: '0.14.0' },
] as const;

export function ensureExecutors(venue: Venue): number {
  let created = 0;
  for (const e of DEFAULT_EXECUTORS) {
    if (venue.engine.state.executors.has(e.id)) continue;
    const r = venue.apply({ type: 'upsertExecutor', ...e });
    if (!r.ok) throw new Error(`seed executor ${e.id}: ${r.error}`);
    created += 1;
  }
  return created;
}

export const DEMO_TASKS = [
  {
    title: 'Reject negative quantities in the cart API',
    prompt:
      'POST /cart/items accepts quantity -3 and stores it, which later crashes checkout. Validate quantity as a positive integer in the request schema, return 422 with a JSON error body { "error": "quantity must be a positive integer" }, and add tests for 0, -1 and non-integers (1.5, "2") in tests/api/test_cart.py. Do not change the response shape for valid requests.',
    repo: 'github.com/example-org/shop-api',
    commit: '58b0ce4',
    testCommand: 'pytest tests/api/test_cart.py',
  },
  {
    title: 'Fix the flaky retry test in the queue worker',
    prompt:
      'tests/worker/retry.test.ts fails about one run in five with "expected 3 attempts, got 2". The worker uses setTimeout for backoff and the test uses real timers. Make the backoff injectable (a scheduler interface), use fake timers in the test, and keep the production default (exponential backoff starting at 200 ms). The whole suite must pass 20 times in a row locally.',
    repo: 'github.com/example-org/queue-worker',
    commit: 'a91f3d2',
    testCommand: 'npm test -- tests/worker/retry.test.ts',
  },
  {
    title: 'Add CSV export for the monthly invoice report',
    prompt:
      'Add GET /reports/invoices.csv?month=YYYY-MM that streams the same rows as the existing JSON report (invoice id, customer, issued_at, total_cents, status) as RFC 4180 CSV with a header row. Reuse the report query in internal/reports. Totals must be formatted as decimal dollars with two places. Add tests in internal/reports/csv_test.go covering quoting of commas and quotes in customer names, and an empty month.',
    repo: 'github.com/example-org/billing',
    commit: 'c07e114',
    testCommand: 'go test ./internal/reports/...',
  },
] as const;

export interface SeedResult {
  executorsCreated: number;
  customerId: string;
  customerKey: string | null;
  taskIds: string[];
}

/** Create the demo customer (if missing) and one demo task per entry; returns the customer key when newly created. */
export function seedDemo(venue: Venue, opts: { tradingWindowMs?: number; customerId?: string; requireBaseline?: boolean } = {}): SeedResult {
  const executorsCreated = ensureExecutors(venue);
  const customerId = opts.customerId ?? 'demo-customer';
  let customerKey: string | null = null;
  if (!venue.engine.account(customerId)) {
    const key = newApiKey();
    const r = venue.apply({ type: 'createAccount', id: customerId, name: 'Demo customer', kind: 'human', role: 'customer', org: 'Example Org', keyHash: key.hash, startingCash: 0 });
    if (!r.ok) throw new Error(`seed customer: ${r.error}`);
    customerKey = key.raw;
  }
  const taskIds: string[] = [];
  const existingTitles = new Set([...venue.engine.state.tasks.values()].filter((t) => t.customer === customerId && (t.status === 'open' || t.status === 'pending')).map((t) => t.title));
  for (const t of DEMO_TASKS) {
    if (existingTitles.has(t.title)) continue; // idempotent while the demo task is still open
    const r = venue.apply({
      type: 'createTask',
      customer: customerId,
      ...t,
      candidateAgents: DEFAULT_EXECUTORS.map((e) => e.id),
      tradingWindowMs: opts.tradingWindowMs ?? 30 * 60_000,
      autoDecide: true,
      minimumChance: 55,
      requireBaseline: opts.requireBaseline ?? false,
    });
    if (!r.ok) throw new Error(`seed task "${t.title}": ${r.error}`);
    taskIds.push(r.data.task.id);
  }
  return { executorsCreated, customerId, customerKey, taskIds };
}
