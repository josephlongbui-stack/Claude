/**
 * Demo exchange (D2): a believable 14-day sandbox built only from engine
 * commands, so design work, demos and screenshots have real-looking data.
 * Sandbox only. Tasks carry `source: "demo-seed/<slug>"`, which is how the
 * server knows a journal holds demo data (the "Demo data" badge). The journal
 * replays like any other; nothing here writes state directly.
 */
import { type Clock, type RunOutcome, type Venue } from '../engine/index.js';
import { newApiKey } from './auth.js';
import { ensureHouseAccounts, MM_ACCOUNT_ID } from './boot.js';
import type { Config } from './config.js';
import { DEFAULT_EXECUTORS } from './seed.js';

export const DEMO_SOURCE_PREFIX = 'demo-seed/';
export interface SettableClock extends Clock {
  set(t: number): void;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const ORGS = [
  { slug: 'harbor-labs', org: 'Harbor Labs', customer: 'Mara Okonkwo' },
  { slug: 'northwind', org: 'Northwind Payments', customer: 'Tomás Herrera' },
  { slug: 'tidepool', org: 'Tidepool Systems', customer: 'Jun Sato' },
  { slug: 'quill-ledger', org: 'Quill & Ledger', customer: 'Anneke de Vries' },
  { slug: 'meridian-health', org: 'Meridian Health', customer: 'Devika Nair' },
  { slug: 'lantern-robotics', org: 'Lantern Robotics', customer: 'Owen Blackwood' },
] as const;
type OrgSlug = (typeof ORGS)[number]['slug'];

type Framework = 'pytest' | 'vitest' | 'go' | 'cargo';
type TaskState = 'resolved' | 'skipped' | 'running' | 'closed' | 'open';

interface DemoTask {
  slug: string;
  org: OrgSlug;
  repo: string;
  title: string;
  prompt: string;
  commit: string;
  framework: Framework;
  testCommand: string;
  tests: string[];
  /** index into `tests` that fails before the fix (and after, when the run fails) */
  failing: number;
  agents: string[];
  state: TaskState;
  outcome?: RunOutcome;
  chosen?: string;
  /** when the task was created, in ms before `now` */
  createdAgo: number;
  /** trading window; for open tasks the end is `closesIn` after `now` instead */
  window: number;
  closesIn?: number;
  autoDecide?: boolean;
  /** relative trading activity */
  pop: number;
}

const TASKS: DemoTask[] = [
  {
    slug: 'cart-negative-quantity', org: 'harbor-labs', repo: 'ledger-api', commit: '58b0ce4', framework: 'pytest',
    title: 'Reject negative quantities in the cart API',
    prompt: 'POST /cart/items accepts quantity -3 and stores it, which later crashes checkout with a negative subtotal. Validate quantity as a positive integer in the request schema and return 422 with the JSON body { "error": "quantity must be a positive integer" }. Add tests for 0, -1 and non-integers (1.5, "2") in tests/api/test_cart.py. Do not change the response shape for valid requests, and keep the existing 404 for unknown SKUs.',
    testCommand: 'pytest tests/api/test_cart.py', tests: ['test_adds_item', 'test_rejects_zero_quantity', 'test_rejects_negative_quantity', 'test_rejects_fractional_quantity', 'test_rejects_string_quantity', 'test_unknown_sku_404', 'test_subtotal_after_add'], failing: 2,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'resolved', outcome: 'passed', chosen: 'codex', createdAgo: 13.6 * DAY, window: 26 * HOUR, pop: 1.2,
  },
  {
    slug: 'invoice-timezone-drift', org: 'harbor-labs', repo: 'ledger-api', commit: '9d41f0a', framework: 'pytest',
    title: 'Fix timezone drift in invoice exports',
    prompt: 'Invoices exported between 23:00 and 00:00 UTC land in the next day\'s export because export_day() converts issued_at to the server\'s local time. Treat issued_at as UTC end to end and group by the customer\'s billing timezone stored on the account. The regression test in tests/exports/test_daily.py builds three invoices at 22:59, 23:30 and 00:10 UTC for a customer in America/Los_Angeles and expects them in one export. Keep the CSV column order unchanged.',
    testCommand: 'pytest tests/exports/test_daily.py', tests: ['test_groups_by_billing_timezone', 'test_midnight_boundary_utc', 'test_csv_column_order', 'test_empty_day', 'test_dst_transition'], failing: 1,
    agents: ['claude-code', 'gemini-cli'], state: 'resolved', outcome: 'failed', chosen: 'claude-code', createdAgo: 12.9 * DAY, window: 20 * HOUR, pop: 0.9,
  },
  {
    slug: 'webhook-backoff', org: 'northwind', repo: 'payments-core', commit: 'c3a7e12', framework: 'go',
    title: 'Retry webhook delivery with exponential backoff',
    prompt: 'Webhook deliveries in internal/webhooks retry immediately five times and then give up, which hammers customers during their own outages. Replace the loop with exponential backoff starting at 2 seconds, doubling to a 5-minute cap, with full jitter, and stop after 24 hours. Make the sleeper injectable so tests use a fake clock. Deliveries that get a 2xx stop retrying; 4xx other than 408 and 429 stop immediately. Tests in internal/webhooks/retry_test.go cover the schedule and the stop conditions.',
    testCommand: 'go test ./internal/webhooks/...', tests: ['TestBackoffSchedule', 'TestJitterWithinBounds', 'TestStopsAfter24h', 'TestStopsOn2xx', 'TestStopsOn4xxExcept408And429', 'TestFakeClockInjection'], failing: 0,
    agents: ['claude-code', 'codex'], state: 'resolved', outcome: 'passed', chosen: 'claude-code', createdAgo: 12.4 * DAY, window: 30 * HOUR, pop: 1.0,
  },
  {
    slug: 'refund-idempotency', org: 'northwind', repo: 'payments-core', commit: '7fe2b9d', framework: 'go',
    title: 'Idempotency keys for refund requests',
    prompt: 'POST /v1/refunds creates a second refund when a client retries after a timeout. Accept an Idempotency-Key header, store the first response for 24 hours keyed by (account, key), and return it verbatim on a retry with the same body. A retry with a different body for the same key gets 422. Use the existing store interface in internal/idempotency; do not add a new table. Tests in internal/refunds/idempotency_test.go cover replay, body mismatch and expiry.',
    testCommand: 'go test ./internal/refunds/...', tests: ['TestReplayReturnsFirstResponse', 'TestBodyMismatch422', 'TestKeyExpiresAfter24h', 'TestKeysScopedPerAccount', 'TestConcurrentRetries'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'resolved', outcome: 'passed', chosen: 'codex', createdAgo: 11.7 * DAY, window: 24 * HOUR, pop: 1.1,
  },
  {
    slug: 'flaky-retry-test', org: 'tidepool', repo: 'queue-worker', commit: 'a91f3d2', framework: 'vitest',
    title: 'Fix the flaky retry test in the queue worker',
    prompt: 'tests/worker/retry.test.ts fails about one run in five with "expected 3 attempts, got 2". The worker uses setTimeout for backoff and the test uses real timers. Make the backoff injectable through a scheduler interface, use fake timers in the test, and keep the production default of exponential backoff starting at 200 ms. The whole file must pass 20 times in a row.',
    testCommand: 'npx vitest run tests/worker/retry.test.ts', tests: ['retries three times before giving up', 'waits 200ms then 400ms then 800ms', 'does not retry on a validation error', 'stops when the job is cancelled'], failing: 0,
    agents: ['codex', 'gemini-cli'], state: 'resolved', outcome: 'failed', chosen: 'gemini-cli', createdAgo: 11.2 * DAY, window: 18 * HOUR, pop: 0.8,
  },
  {
    slug: 'graceful-shutdown', org: 'tidepool', repo: 'queue-worker', commit: '4b8d0e1', framework: 'vitest',
    title: 'Graceful shutdown drains in-flight jobs',
    prompt: 'On SIGTERM the worker exits immediately and in-flight jobs are retried by the next instance, which double-sends emails. Stop taking new jobs on SIGTERM, wait up to 30 seconds for in-flight handlers to finish, then exit 0. If a handler is still running at 30 seconds, log the job id and exit 1. Tests in tests/worker/shutdown.test.ts use fake timers and a fake queue.',
    testCommand: 'npx vitest run tests/worker/shutdown.test.ts', tests: ['stops polling after SIGTERM', 'waits for in-flight jobs', 'exits 1 after the 30s grace period', 'exits 0 when idle'], failing: 1,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'resolved', outcome: 'passed', chosen: 'claude-code', createdAgo: 10.5 * DAY, window: 22 * HOUR, pop: 0.9,
  },
  {
    slug: 'iso-durations', org: 'quill-ledger', repo: 'ledgerd', commit: 'e60c2a7', framework: 'cargo',
    title: 'Parse ISO 8601 durations in budget rules',
    prompt: 'Budget rules accept "30d" and "1y" but the API spec says ISO 8601 durations like P30D, P1Y2M and PT36H. Add a parser in src/rules/duration.rs that handles date and time components, rejects fractional values and negative durations, and keeps the legacy short forms behind the existing feature flag. Property-test round trips through Display. Tests live in src/rules/duration.rs under #[cfg(test)].',
    testCommand: 'cargo test --package ledgerd rules::duration', tests: ['parses_date_components', 'parses_time_components', 'rejects_fractions', 'rejects_negative', 'legacy_short_forms_behind_flag', 'display_round_trip'], failing: 0,
    agents: ['claude-code', 'codex'], state: 'resolved', outcome: 'passed', chosen: 'codex', createdAgo: 9.8 * DAY, window: 28 * HOUR, pop: 0.7,
  },
  {
    slug: 'round-half-even', org: 'quill-ledger', repo: 'ledgerd', commit: '1a9f7c3', framework: 'cargo',
    title: 'Round half-even in multi-currency totals',
    prompt: 'Totals that convert through a second currency round half-up at each step, so a statement can be off by one minor unit from the bank\'s figure. Round only once, at the end, using banker\'s rounding, and carry the intermediate values as rust_decimal with 9 places. The fixtures in tests/fixtures/statements/*.json hold 40 statements with the bank\'s expected totals. Do not change the public Money type.',
    testCommand: 'cargo test --package ledgerd totals', tests: ['statement_fixtures_match_bank', 'single_rounding_step', 'half_even_at_boundary', 'intermediate_precision_9_places', 'money_type_unchanged'], failing: 0,
    agents: ['claude-code', 'gemini-cli'], state: 'resolved', outcome: 'failed', chosen: 'claude-code', createdAgo: 9.1 * DAY, window: 24 * HOUR, pop: 0.8,
  },
  {
    slug: 'double-booking', org: 'meridian-health', repo: 'scheduler', commit: 'b2d4e86', framework: 'pytest',
    title: 'Prevent double booking across time zones',
    prompt: 'Two clinics in different time zones can book the same practitioner for overlapping slots because availability is checked in each clinic\'s local time. Normalise slots to UTC before the overlap check in scheduling/availability.py and add a unique constraint on (practitioner_id, start_utc). The tests in tests/scheduling/test_overlap.py include a booking that straddles a DST change in Europe/London.',
    testCommand: 'pytest tests/scheduling/test_overlap.py', tests: ['test_overlap_across_timezones', 'test_dst_straddle', 'test_adjacent_slots_allowed', 'test_unique_constraint', 'test_existing_bookings_unaffected'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'resolved', outcome: 'passed', chosen: 'gemini-cli', createdAgo: 8.3 * DAY, window: 26 * HOUR, pop: 1.0,
  },
  {
    slug: 'ring-buffer-backfill', org: 'lantern-robotics', repo: 'telemetry', commit: 'd7c1b54', framework: 'go',
    title: 'Backfill missing frames in the telemetry ring buffer',
    prompt: 'When a robot reconnects after a gap, frames that arrived out of order are dropped by the ring buffer instead of being slotted into their sequence position. Accept frames up to 2,000 sequence numbers behind the head, fill them in place, and count anything older as lost. Expose the lost count on the existing metrics struct. Tests in internal/ring/backfill_test.go replay a captured 90-second outage.',
    testCommand: 'go test ./internal/ring/...', tests: ['TestBackfillInPlace', 'TestDropsOlderThan2000', 'TestLostCounter', 'TestReplayCapturedOutage', 'TestHeadAdvances'], failing: 0,
    agents: ['claude-code', 'codex'], state: 'resolved', outcome: 'infra_error', chosen: 'codex', createdAgo: 7.6 * DAY, window: 20 * HOUR, pop: 0.6,
  },
  {
    slug: 'reminder-rate-limit', org: 'meridian-health', repo: 'scheduler', commit: '3e9a0f8', framework: 'pytest',
    title: 'Rate-limit the appointment reminder sender',
    prompt: 'The reminder job sends every due SMS at once at 08:00, which trips the provider\'s limit of 50 messages a second and drops the rest. Send through a token bucket at 40 a second with a 100-message burst, and retry 429s after the Retry-After header. Reminders that are still unsent after 15 minutes are logged with their appointment ids. Tests in tests/reminders/test_rate_limit.py use a fake provider and a fake clock.',
    testCommand: 'pytest tests/reminders/test_rate_limit.py', tests: ['test_sends_at_40_per_second', 'test_burst_of_100', 'test_retries_after_header', 'test_logs_unsent_after_15_minutes', 'test_all_sent_eventually'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'resolved', outcome: 'passed', chosen: 'claude-code', createdAgo: 6.4 * DAY, window: 24 * HOUR, pop: 1.1,
  },
  {
    slug: 'fleet-csv-export', org: 'lantern-robotics', repo: 'fleet-console', commit: '0c5d9b2', framework: 'vitest',
    title: 'Add CSV export for fleet utilisation',
    prompt: 'The utilisation report in the fleet console only renders as a table. Add an Export CSV button that streams the same rows (robot id, site, hours active, hours charging, hours idle, faults) with a header row and RFC 4180 quoting. Reuse the report query; do not add a second data path. Tests in src/reports/csv.test.ts cover quoting, an empty report and a 10,000-row report.',
    testCommand: 'npx vitest run src/reports/csv.test.ts', tests: ['quotes commas and quotes', 'emits a header on an empty report', 'streams 10,000 rows', 'matches the table columns'], failing: 2,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'skipped', createdAgo: 8.9 * DAY, window: 24 * HOUR, pop: 0.5,
  },
  {
    slug: 'audit-log-append-only', org: 'harbor-labs', repo: 'ledger-api', commit: 'f41c8e9', framework: 'pytest',
    title: 'Migrate the audit log to append-only tables',
    prompt: 'audit_events has UPDATE and DELETE grants and two code paths that use them. Create audit_events_v2 with insert-only grants, migrate rows in batches of 5,000, switch readers behind the AUDIT_V2 flag, and remove the two mutating code paths. The migration must be resumable. Tests in tests/audit/test_migration.py run the migration twice and compare row counts and checksums.',
    testCommand: 'pytest tests/audit/test_migration.py', tests: ['test_migration_resumable', 'test_row_counts_match', 'test_checksums_match', 'test_insert_only_grants', 'test_flag_switches_readers'], failing: 3,
    agents: ['claude-code', 'codex'], state: 'skipped', createdAgo: 5.2 * DAY, window: 24 * HOUR, pop: 0.6,
  },
  {
    slug: 'iban-check-digits', org: 'northwind', repo: 'payments-core', commit: '8ab3f71', framework: 'go',
    title: 'Validate IBAN check digits on payout creation',
    prompt: 'Payouts to an IBAN with bad check digits are accepted and bounce two days later. Validate the mod-97 check digits and the country-specific length table in internal/payouts/iban.go at creation time, returning 422 with the field name. Keep the existing allowlist of countries. Tests in internal/payouts/iban_test.go use the public test vectors for 20 countries.',
    testCommand: 'go test ./internal/payouts/...', tests: ['TestMod97Vectors', 'TestCountryLengths', 'TestRejectsBadCheckDigits', 'TestAllowlistUnchanged', 'TestErrorNamesField'], failing: 2,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'running', chosen: 'codex', createdAgo: 2.3 * DAY, window: 36 * HOUR, pop: 1.0,
  },
  {
    slug: 'push-dedupe', org: 'tidepool', repo: 'notify', commit: '6d2e4c0', framework: 'vitest',
    title: 'Dedupe push notifications within a 30-second window',
    prompt: 'When a document changes three times in a row, the user gets three pushes. Collapse pushes for the same (user, document) within 30 seconds into one, delivered at the end of the window with the latest title. Keep the first push immediate if there has been none in the last 5 minutes. Tests in src/push/dedupe.test.ts use fake timers.',
    testCommand: 'npx vitest run src/push/dedupe.test.ts', tests: ['sends the first push immediately', 'collapses pushes within 30s', 'uses the latest title', 'separate documents are not merged'], failing: 1,
    agents: ['claude-code', 'codex'], state: 'running', chosen: 'claude-code', createdAgo: 1.9 * DAY, window: 30 * HOUR, pop: 0.9,
  },
  {
    slug: 'budget-period-overlap', org: 'quill-ledger', repo: 'ledgerd', commit: '2f7b6a4', framework: 'cargo',
    title: 'Reject budgets whose periods overlap',
    prompt: 'Two budgets for the same category can cover the same month, and the report double-counts spend. Reject a new or edited budget whose [start, end) overlaps an existing budget in the same category with a 409 and the conflicting budget id. Periods that touch at the boundary are allowed. Tests live in tests/budgets/overlap.rs.',
    testCommand: 'cargo test --package ledgerd --test overlap', tests: ['rejects_overlap_same_category', 'allows_touching_periods', 'allows_other_category', 'conflict_names_budget_id', 'edit_can_keep_own_period'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'closed', createdAgo: 1.4 * DAY, window: 30 * HOUR, pop: 0.9,
  },
  {
    slug: 'slot-conflict-409', org: 'meridian-health', repo: 'scheduler', commit: 'c9e1d27', framework: 'pytest',
    title: 'Return 409 when a slot is taken between read and write',
    prompt: 'Booking reads the slot, checks it, then writes; two requests in the same 50 ms both succeed. Use the database\'s unique constraint and translate the integrity error into a 409 with the taken slot in the body, instead of the current 500. Keep the response for a normal booking unchanged. Tests in tests/scheduling/test_conflict.py run two bookings concurrently with a thread pool.',
    testCommand: 'pytest tests/scheduling/test_conflict.py', tests: ['test_concurrent_bookings_one_wins', 'test_loser_gets_409', 'test_409_body_names_slot', 'test_normal_booking_unchanged'], failing: 1,
    agents: ['claude-code', 'gemini-cli'], state: 'closed', createdAgo: 1.2 * DAY, window: 26 * HOUR, pop: 0.8,
  },
  {
    slug: 'telemetry-zstd', org: 'lantern-robotics', repo: 'telemetry', commit: 'ab4e5f0', framework: 'go',
    title: 'Compress telemetry batches with zstd before upload',
    prompt: 'Batches upload as raw JSON and the cellular bill tripled. Compress each batch with zstd level 3 before upload, set Content-Encoding, and keep the uncompressed path behind a flag for old gateways. The uploader must fall back to uncompressed if the gateway answers 415. Tests in internal/upload/compress_test.go check the header, the fallback and the size reduction on a captured batch.',
    testCommand: 'go test ./internal/upload/...', tests: ['TestSetsContentEncoding', 'TestFallbackOn415', 'TestSizeReduction', 'TestFlagKeepsRawPath'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'closed', createdAgo: 1.1 * DAY, window: 22 * HOUR, pop: 0.7,
  },
  {
    slug: 'cursor-pagination', org: 'harbor-labs', repo: 'ledger-api', commit: '5e0b1d9', framework: 'pytest',
    title: 'Paginate the transactions endpoint with a cursor',
    prompt: 'GET /transactions uses offset pagination and page 400 takes nine seconds. Switch to a keyset cursor on (posted_at, id), encoded as an opaque base64 string, with a next_cursor field in the response and a 400 for a malformed cursor. Keep limit at 100 by default and 500 at most. The old offset parameter keeps working for one release and logs a deprecation warning. Tests in tests/api/test_transactions_pagination.py walk 1,250 rows forward.',
    testCommand: 'pytest tests/api/test_transactions_pagination.py', tests: ['test_walks_all_rows', 'test_cursor_is_opaque', 'test_malformed_cursor_400', 'test_limit_cap_500', 'test_offset_deprecated_warning', 'test_stable_under_inserts'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'open', createdAgo: 20 * HOUR, window: 0, closesIn: 2 * DAY + 3 * HOUR, pop: 1.0,
  },
  {
    slug: 'dead-letter-after-five', org: 'tidepool', repo: 'queue-worker', commit: '93c7a1e', framework: 'vitest',
    title: 'Cap retries per job and dead-letter after five',
    prompt: 'Poison jobs retry forever and block the queue. After five failed attempts move the job to a dead-letter queue with the last error and the attempt timestamps, and emit a metric. Operators can requeue from the dead-letter queue through the existing admin command. Tests in tests/worker/dead-letter.test.ts cover the cap, the payload and the requeue.',
    testCommand: 'npx vitest run tests/worker/dead-letter.test.ts', tests: ['moves to dead-letter after five attempts', 'records last error and timestamps', 'emits a metric', 'requeue puts it back once'], failing: 0,
    agents: ['claude-code', 'codex'], state: 'open', createdAgo: 14 * HOUR, window: 0, closesIn: 18 * HOUR + 24 * MIN, pop: 0.9,
  },
  {
    slug: 'payout-dry-run', org: 'northwind', repo: 'payments-core', commit: '4d8f2c6', framework: 'go',
    title: 'Add a dry-run flag to the payout batch command',
    prompt: 'Operators run the payout batch blind. Add --dry-run to cmd/payouts that prints each payout, the total per currency and any validation error, without writing or calling the bank. The output must be identical in shape to the real run. Tests in cmd/payouts/dry_run_test.go compare the dry-run output to a golden file and assert that the bank client was never called.',
    testCommand: 'go test ./cmd/payouts/...', tests: ['TestDryRunGolden', 'TestDryRunNeverCallsBank', 'TestTotalsPerCurrency', 'TestValidationErrorsListed'], failing: 1,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'open', createdAgo: 9 * HOUR, window: 0, closesIn: 6 * HOUR + 11 * MIN, pop: 0.8,
  },
  {
    slug: 'health-migration-status', org: 'quill-ledger', repo: 'ledgerd', commit: '71e3c0b', framework: 'cargo',
    title: 'Expose a health endpoint with migration status',
    prompt: 'The load balancer sends traffic to a node that is still running migrations. Add GET /healthz that returns 200 only when migrations are current and the database answers within 200 ms, and 503 with the pending migration names otherwise. No authentication. Tests in tests/healthz.rs use a test database with one pending migration.',
    testCommand: 'cargo test --package ledgerd --test healthz', tests: ['ok_when_current', 'lists_pending_migrations', 'db_timeout_is_503', 'no_auth_required'], failing: 1,
    agents: ['claude-code', 'codex'], state: 'open', createdAgo: 5 * HOUR, window: 0, closesIn: 3 * HOUR + 2 * MIN, pop: 0.7,
  },
  {
    slug: 'clinic-holidays', org: 'meridian-health', repo: 'scheduler', commit: 'e2b7a93', framework: 'pytest',
    title: 'Honour clinic holidays in availability search',
    prompt: 'Availability search offers slots on days a clinic is closed, because holidays are stored per clinic but the search only reads practitioner calendars. Exclude a clinic\'s holiday dates from its slots, including half-day closures stored with a time range. Tests in tests/scheduling/test_holidays.py cover a full day, a half day and a holiday that falls on a weekend.',
    testCommand: 'pytest tests/scheduling/test_holidays.py', tests: ['test_full_day_closure', 'test_half_day_closure', 'test_weekend_holiday', 'test_other_clinic_unaffected'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'open', createdAgo: 3 * DAY + 2 * HOUR, window: 0, closesIn: 90_000, pop: 1.2,
  },
  {
    slug: 'vehicles-sort-order', org: 'lantern-robotics', repo: 'fleet-console', commit: 'b8d61f4', framework: 'vitest',
    title: 'Fix the sort order of the vehicles table',
    prompt: 'Sorting the vehicles table by battery sorts lexically, so 9% comes after 85%. Sort numeric columns numerically, keep text columns locale-aware, and keep the sort when the table refreshes. Tests in src/fleet/table.test.tsx render 30 vehicles and check the order after each header click.',
    testCommand: 'npx vitest run src/fleet/table.test.tsx', tests: ['sorts battery numerically', 'sorts names with locale compare', 'keeps the sort across refresh', 'toggles direction on second click'], failing: 0,
    agents: ['claude-code', 'codex', 'gemini-cli'], state: 'open', createdAgo: 2 * DAY + 5 * HOUR, window: 0, closesIn: 115_000, pop: 0.9,
  },
];

const HUMANS: [string, string][] = [
  ['Priya Raman', ''], ['Luca Moretti', 'Indie'], ['Hannah Weiss', ''], ['Diego Alvarez', 'Pelican Research'], ['Mei-Lin Chou', ''],
  ['Samuel Adeyemi', 'Northstar Quant'], ['Ingrid Solberg', ''], ['Rafael Costa', 'Indie'], ['Aisha Khan', ''], ['Noah Lindqvist', 'Sable Capital'],
  ['Yara Haddad', ''], ['Ethan Park', ''], ['Chiara Russo', 'Oakline'], ['Kwame Mensah', ''], ['Sofia Petrova', 'Pelican Research'],
  ['Arjun Mehta', ''], ['Elin Johansson', 'Indie'], ['Mateo Rivera', ''], ['Zanele Dube', ''], ['Felix Brandt', 'Northstar Quant'],
  ['Nadia Rahman', ''], ['Oliver Grant', 'Sable Capital'], ['Lena Fischer', ''], ['Hiro Tanaka', ''], ['Camille Dubois', 'Oakline'],
  ['Isaac Oyelaran', ''], ['Greta Lindgren', ''],
];
const AGENTS: [string, string][] = [
  ['Delphi Forecaster', 'Delphi Labs'], ['Argus Signal', 'Northstar Quant'], ['quantling', ''], ['Basil v2', 'Pelican Research'],
  ['Oracle of Oakline', 'Oakline'], ['Pelican Prior', 'Pelican Research'], ['Northstar Sigma', 'Northstar Quant'], ['Kestrel Model', ''],
  ['Hedgehog', 'Sable Capital'], ['Sable Alpha', 'Sable Capital'], ['Vega Line', ''], ['Marginal Mike', 'Delphi Labs'], ['Cinder Watch', ''],
];

const EXECUTOR_PREVIOUS: Record<string, string> = { 'claude-code': '2.0.9', codex: '0.46.1', 'gemini-cli': '0.13.2' };

/* Thesis templates; {agent} {org} {fw} {k} {n} {repo} {commit}. `only` keeps task-specific lines on matching tasks;
   `when` checks the agent's record (k passed of n). The stated probability is posted as a number, never repeated in the text. */
interface Thesis {
  text: string;
  only?: RegExp;
  when?: (rec: { k: number; n: number }) => boolean;
}
const THESES_YES: Thesis[] = [
  { text: 'The prompt names the file, the schema and the error body. {agent} handles this shape well.', only: /schema|422|body/i },
  { text: 'Narrow test file, no new dependency, clear acceptance criteria. {agent} has passed {k} of {n} runs here.', when: (r) => r.n >= 2 && r.k / r.n >= 0.5 },
  { text: '{fw} with fake timers is bread and butter for {agent}. The only real risk is the clock plumbing.', only: /fake timers|fake clock/i },
  { text: 'Read the repo: the change is one module and the tests already describe the contract. Buying Yes.' },
  { text: 'Commit {commit} is recent and the test command is scoped to one file. I expect a pass.' },
  { text: '{agent} tends to over-edit, but protected paths restore the tests, so that risk is gone.' },
  { text: 'Baseline fails cleanly 3 of 3, so the tests are deterministic. That is most of the battle.' },
  { text: 'A similar task on {repo} passed last week with the same agent.' },
  { text: 'Golden-file comparison, but the shape is fully specified in the prompt. {agent} is careful with output formats.', only: /golden/i },
  { text: 'A unique constraint plus an error translation is a well-trodden path.', only: /unique constraint|integrity/i },
  { text: 'Small diff, one test file, and the failing assertions are listed in the prompt. Hard to see how this misses.' },
  { text: 'There is a lockfile and a Makefile, so no time lost on setup. Yes.' },
  { text: 'Ran the prompt through {agent} on a fork and it passed first time. Not betting the house, but Yes.' },
  { text: 'The house maker opened this too low. {agent} has had a good month on {fw} tasks.' },
  { text: 'Nothing in the prompt needs the network or a secret, which is where sandbox runs usually die.' },
];
const THESES_NO: Thesis[] = [
  { text: 'Time zones and DST in one prompt. Agents get the boundary case wrong more often than not.', only: /time ?zone|DST/i },
  { text: 'The fixture set is large and the tolerance is one minor unit. Rounding tasks fail quietly.', only: /round/i },
  { text: '"20 times in a row" is a flakiness bar, not a logic bar. {agent} will fix the obvious race and miss the second one.', only: /20 times/i },
  { text: 'A migration and a flag in one change: too many moving parts for a single run. Selling.', only: /migrat/i },
  { text: '{agent} on {fw} has a weak record here: {k} of {n}.', when: (r) => r.n >= 2 && r.k / r.n < 0.5 },
  { text: 'Identical output shape to the real run; golden-file tests punish small drift.', only: /golden|identical/i },
  { text: 'Concurrency test with a thread pool. These pass locally and fail in the sandbox.', only: /concurren|thread pool/i },
  { text: 'Good prompt, but the repo has a custom test harness the agent has to discover first.' },
  { text: 'Retry schedules with jitter are easy to get subtly wrong and the test checks exact bounds.', only: /backoff|retry|retries/i },
  { text: 'Streaming plus RFC 4180 quoting; the 10,000-row case will time out or miss an edge.', only: /CSV|RFC 4180/i },
  { text: 'The prompt leaves the fallback behaviour vague and the test is strict about it.' },
  { text: 'Two files to change and the second one is not named in the prompt. I have seen {agent} stop after the first.' },
  { text: 'Thirty minutes is tight for a repo this size; the agent spends half of it reading. Leaning No.' },
  { text: 'The market is pricing the agent, not the task, and this task has a nasty edge case in the last assertion.' },
  { text: 'No version pin on the test runner in {repo}. One dependency drift and the run goes red for the wrong reason.' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const iso = (t: number) => new Date(t).toISOString();

function baselineLog(t: DemoTask, at: number): string {
  const lines = [`[baseline] ${iso(at)} clone github.com/${t.org}/${t.repo} @ ${t.commit}`];
  for (let run = 1; run <= 3; run++) {
    lines.push(`[baseline] run ${run}/3: $ ${t.testCommand}`);
    lines.push(...testOutput(t, 'failed', run * 97));
    lines.push(`[baseline] run ${run}/3 failed (exit 1)`);
  }
  lines.push('[baseline] 3 of 3 runs failed at the pinned commit; markets open');
  return lines.join('\n');
}

function testOutput(t: DemoTask, outcome: 'passed' | 'failed', salt: number): string[] {
  const out: string[] = [];
  const fails = outcome === 'failed' ? new Set([t.failing]) : new Set<number>();
  const dur = (i: number) => ((((salt * 31 + i * 17) % 900) + 40) / 1000).toFixed(2);
  if (t.framework === 'pytest') {
    const file = t.testCommand.split(' ').pop()!;
    t.tests.forEach((name, i) => out.push(`${file}::${name} ${fails.has(i) ? 'FAILED' : 'PASSED'}`));
    for (const i of fails) out.push(`FAILED ${file}::${t.tests[i]} - AssertionError: expected 422, got 201`);
    out.push(`${fails.size ? `${fails.size} failed, ` : ''}${t.tests.length - fails.size} passed in ${dur(1)}s`);
  } else if (t.framework === 'vitest') {
    const file = t.testCommand.split(' ').pop()!;
    t.tests.forEach((name, i) => out.push(`${fails.has(i) ? '×' : '✓'} ${file} > ${name} ${Math.round(Number(dur(i)) * 1000)}ms`));
    out.push(`Test Files  ${fails.size ? '1 failed' : '1 passed'} (1)`);
    out.push(`     Tests  ${fails.size ? `${fails.size} failed | ` : ''}${t.tests.length - fails.size} passed (${t.tests.length})`);
  } else if (t.framework === 'go') {
    const pkg = t.testCommand.replace('go test ', '').replace('...', '').replace(/\/$/, '');
    t.tests.forEach((name, i) => out.push(`--- ${fails.has(i) ? 'FAIL' : 'PASS'}: ${name} (${dur(i)}s)`));
    out.push(fails.size ? `FAIL\t${pkg}\t${dur(9)}s` : `ok  \t${pkg}\t${dur(9)}s`);
  } else {
    t.tests.forEach((name, i) => out.push(`test ${name} ... ${fails.has(i) ? 'FAILED' : 'ok'}`));
    out.push(`test result: ${fails.size ? 'FAILED' : 'ok'}. ${t.tests.length - fails.size} passed; ${fails.size} failed; 0 ignored; finished in ${dur(3)}s`);
  }
  return out;
}

function runLog(t: DemoTask, agent: { id: string; name: string; version: string }, outcome: RunOutcome, at: number): string {
  const lines = [`[runner] ${iso(at)} job run:${t.slug} container kq-run-${t.commit} started (non-root, 2 cpu, 4 GiB, egress allowlist)`, `[runner] clone github.com/${t.org}/${t.repo} @ ${t.commit}`];
  if (outcome === 'infra_error') {
    lines.push('[runner] clone failed: connection reset by peer (attempt 1 of 3)', '[runner] clone failed: connection reset by peer (attempt 2 of 3)', '[runner] clone failed: connection reset by peer (attempt 3 of 3)', '[runner] infrastructure error after 3 attempts; no agent was run; the market settles at its closing price');
    return lines.join('\n');
  }
  const edited = t.framework === 'pytest' ? 'src/' : t.framework === 'go' ? 'internal/' : 'src/';
  lines.push(`[agent] ${agent.name} ${agent.version} started with the task prompt`, `[agent] read ${t.testCommand.split(' ').pop()}`, `[agent] edited ${edited}${t.slug.replace(/-/g, '_')}.${t.framework === 'pytest' ? 'py' : t.framework === 'go' ? 'go' : t.framework === 'cargo' ? 'rs' : 'ts'}`, `[agent] ran ${t.testCommand} (${outcome === 'passed' ? 'all green' : 'one failure remains'})`, `[agent] exited 0 after ${(7 + (t.title.length % 9))}m${(t.commit.charCodeAt(0) % 60).toString().padStart(2, '0')}s`, '[runner] protected paths restored from the pinned commit: no changes', `[runner] $ ${t.testCommand}`);
  lines.push(...testOutput(t, outcome, t.commit.length + t.tests.length));
  lines.push(outcome === 'passed' ? '[runner] tests passed (exit 0)' : '[runner] tests failed (exit 1)');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

export interface DemoSummary {
  tasks: Record<TaskState, number>;
  traders: number;
  agentTraders: number;
  trades: number;
  theses: number;
  commands: number;
}

export interface DemoOptions {
  config: Config;
  /** End of the simulated 14 days (ms since epoch). */
  now: number;
  seed?: number;
}

/** Build the demo exchange through the venue; the clock is moved through the 14 days as it goes. */
export function seedDemoExchange(venue: Venue, clock: SettableClock, opts: DemoOptions): DemoSummary {
  if (opts.config.mode !== 'sandbox') throw new Error('the demo seed runs only in sandbox mode');
  if (venue.engine.state.tasks.size > 0) throw new Error('the demo seed needs an empty exchange');
  const r = rng(opts.seed ?? 20261031);
  const usedTheses = new Map<string, Set<Thesis>>();
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const now = opts.now;
  const start = now - 14 * DAY;
  let commands = 0;
  let trades = 0;
  let theses = 0;
  venue.onApplied((cmd) => {
    commands += 1;
    if (cmd.type === 'comment') theses += 1;
  });
  let last = start;
  const at = (t: number) => {
    const tt = Math.max(last, Math.round(t));
    last = tt;
    clock.set(tt);
  };
  at(start);

  ensureHouseAccounts(venue, opts.config);
  for (const e of DEFAULT_EXECUTORS) must(venue.apply({ type: 'upsertExecutor', id: e.id, name: e.name, org: e.org, version: EXECUTOR_PREVIOUS[e.id] ?? e.version }));

  const customers: Record<string, string> = {};
  for (const o of ORGS) {
    const id = `cust-${o.slug}`;
    must(venue.apply({ type: 'createAccount', id, name: o.customer, kind: 'human', role: 'customer', org: o.org, keyHash: newApiKey().hash, startingCash: 0 }));
    customers[o.slug] = id;
  }
  interface Trader { id: string; kind: 'human' | 'agent'; lastFaucet: number }
  const traders: Trader[] = [];
  const addTrader = (name: string, org: string, kind: 'human' | 'agent', i: number) => {
    const id = `${kind === 'agent' ? 'bot' : 'tr'}-${String(i).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    at(start + int(1, 3 * 24 * 60) * MIN);
    must(venue.apply({ type: 'createAccount', id, name, kind, role: 'trader', org, keyHash: newApiKey().hash, startingCash: opts.config.startingCashCents }));
    traders.push({ id, kind, lastFaucet: last });
  };
  // Interleave creation dates so the leaderboard is not in sign-up order.
  const roster: [string, string, 'human' | 'agent'][] = [...HUMANS.map(([n, o]) => [n, o, 'human'] as [string, string, 'human']), ...AGENTS.map(([n, o]) => [n, o, 'agent'] as [string, string, 'agent'])];
  roster.sort(() => r() - 0.5);
  roster.forEach(([n, o, k], i) => addTrader(n, o, k, i + 1));
  last = start; // creation times were spread; trading events are sorted below anyway

  const ensureCash = (tr: Trader, t: number) => {
    const acc = venue.engine.account(tr.id)!;
    if (acc.cash < 30_000 && t - tr.lastFaucet >= DAY + MIN) {
      const res = venue.apply({ type: 'deposit', account: tr.id, amount: opts.config.startingCashCents, reason: 'faucet' });
      if (res.ok) tr.lastFaucet = t;
    }
  };
  const twoTraders = (): [Trader, Trader] => {
    const a = pick(traders);
    let b = pick(traders);
    while (b === a) b = pick(traders);
    return [a, b];
  };
  const record = (execId: string) => {
    let n = 0;
    let k = 0;
    for (const t of venue.engine.state.tasks.values()) if (t.chosenAgent === execId && t.passed !== null) { n += 1; if (t.passed) k += 1; }
    return { n, k };
  };

  interface Ev { at: number; run: () => void }
  const events: Ev[] = [];
  const push = (t: number, run: () => void) => events.push({ at: t, run });

  // Executor versions bump mid-way, so records exist per version.
  push(start + 8 * DAY + 3 * HOUR, () => {
    for (const e of DEFAULT_EXECUTORS) must(venue.apply({ type: 'upsertExecutor', ...e }));
  });

  const taskIds: Record<string, string> = {};
  const lastPrice: Record<string, number> = {};
  for (const t of TASKS) {
    const created = now - t.createdAgo;
    const baselineAt = created + int(2, 6) * MIN + int(0, 59) * 1000;
    const closesAt = t.state === 'open' ? now + (t.closesIn ?? HOUR) : baselineAt + t.window;
    const window = t.state === 'open' ? closesAt - baselineAt : t.window;
    const customer = customers[t.org]!;
    push(created, () => {
      const res = must(venue.apply({ type: 'createTask', customer, title: t.title, prompt: t.prompt, repo: `github.com/${t.org}/${t.repo}`, commit: t.commit, testCommand: t.testCommand, candidateAgents: t.agents, tradingWindowMs: window, autoDecide: t.autoDecide ?? false, minimumChance: 55, requireBaseline: true, source: `${DEMO_SOURCE_PREFIX}${t.slug}` }));
      taskIds[t.slug] = (res as { task: { id: string } }).task.id;
    });
    push(baselineAt, () => {
      must(venue.apply({ type: 'baseline', taskId: taskIds[t.slug]!, results: ['failed', 'failed', 'failed'], log: baselineLog(t, baselineAt), runId: `base_${t.commit}${int(1000, 9999)}` }));
    });
    const tradeEnd = Math.min(closesAt, now) - (t.state === 'open' ? 20_000 : 30_000);
    for (const execId of t.agents) {
      const mid = () => `${taskIds[t.slug]}:${execId}`;
      const prior = 44 + int(0, 18) + (execId === 'claude-code' ? 4 : execId === 'codex' ? 2 : 0);
      const isChosen = t.chosen === execId;
      const target = t.state === 'resolved' && isChosen ? (t.outcome === 'passed' ? int(68, 86) : t.outcome === 'failed' ? int(22, 44) : int(45, 62)) : t.state === 'running' && isChosen ? int(60, 78) : int(30, 76);
      const n = Math.max(8, Math.round(t.pop * int(14, 40)));
      let wobble = 0;
      const times: number[] = [];
      for (let i = 0; i < n; i++) times.push(baselineAt + 45_000 + (tradeEnd - baselineAt - 60_000) * Math.pow(r(), 0.85));
      times.sort((a, b) => a - b);
      times.forEach((tm, i) => {
        const frac = n === 1 ? 1 : i / (n - 1);
        wobble = clamp(wobble + (r() - 0.5) * 4, -9, 9);
        const price = clamp(Math.round(prior + (target - prior) * frac + wobble), 5, 95);
        push(tm, () => {
          const [maker, taker] = twoTraders();
          ensureCash(maker, tm);
          ensureCash(taker, tm);
          const q = r() < 0.12 ? int(25, 64) : int(2, 24);
          const takerBuysYes = r() < 0.55;
          const m = mid();
          const r1 = venue.apply({ type: 'placeOrder', account: maker.id, market: m, side: takerBuysYes ? 'no' : 'yes', action: 'buy', orderType: 'limit', price: takerBuysYes ? 100 - price : price, quantity: q });
          if (!r1.ok) return;
          const r2 = venue.apply({ type: 'placeOrder', account: taker.id, market: m, side: takerBuysYes ? 'yes' : 'no', action: 'buy', orderType: 'limit', price: takerBuysYes ? price : 100 - price, quantity: q, tif: 'ioc' });
          const fills = r2.ok ? (r2.data as { fills: unknown[] }).fills.length : 0;
          if (fills === 0) {
            venue.apply({ type: 'cancelOrder', account: maker.id, orderId: (r1.data as { order: { id: string } }).order.id });
            return;
          }
          trades += 1;
          lastPrice[m] = price;
        });
        if (r() < 0.14 + (i === 0 ? 0.5 : 0)) {
          push(tm + int(20, 400) * 1000, () => {
            const tr = pick(traders);
            const m = mid();
            const p = lastPrice[m] ?? price;
            const bullish = p >= 50 ? r() < 0.7 : r() < 0.35;
            const exec = DEFAULT_EXECUTORS.find((e) => e.id === execId)!;
            const rec = record(execId);
            // A bull states more than the price, a bear less; the number is posted once, as the probability.
            const stated = clamp(bullish ? p + int(2, 12) : p - int(3, 15), 3, 97);
            const fits = (x: Thesis) => (!x.only || x.only.test(`${t.title} ${t.prompt}`)) && (!x.when || x.when(rec));
            const used = usedTheses.get(m) ?? new Set<Thesis>();
            usedTheses.set(m, used);
            const all = (bullish ? THESES_YES : THESES_NO).filter(fits);
            const fresh = all.filter((x) => !used.has(x));
            const tpl = pick(fresh.length ? fresh : all);
            used.add(tpl);
            const text = tpl.text
              .replace('{agent}', exec.name).replace('{org}', exec.org).replace('{fw}', t.framework).replace('{repo}', `${t.org}/${t.repo}`).replace('{commit}', t.commit)
              .replace('{k}', String(rec.k)).replace('{n}', String(Math.max(rec.n, 1)));
            venue.apply({ type: 'comment', account: tr.id, market: m, text, probability: r() < 0.22 ? null : stated });
          });
        }
      });
      // Resting orders at the end: a 1–6¢ spread around the last price.
      push(tradeEnd + 5_000, () => {
        const m = mid();
        const p = lastPrice[m] ?? prior;
        const bidOff = int(0, 3);
        const askOff = Math.max(1, int(1, 3) + (bidOff === 0 ? 0 : 0));
        const levels: [number, number, 'yes' | 'no'][] = [];
        for (let k = 0; k < 3; k++) {
          const yb = p - bidOff - [0, 2, 5][k]!;
          const nb = 100 - (p + askOff + [0, 2, 5][k]!);
          if (yb >= 2) levels.push([yb, int(6, 58), 'yes']);
          if (nb >= 2) levels.push([nb, int(6, 58), 'no']);
        }
        levels.forEach(([price, q, side], k) => {
          const who = k < 2 ? MM_ACCOUNT_ID : pick(traders).id;
          if (who !== MM_ACCOUNT_ID) ensureCash(traders.find((x) => x.id === who)!, tradeEnd);
          venue.apply({ type: 'placeOrder', account: who, market: m, side, action: 'buy', orderType: 'limit', price, quantity: q });
        });
      });
    }
    if (t.state !== 'open') {
      push(closesAt, () => must(venue.apply({ type: 'closeTask', taskId: taskIds[t.slug]!, by: null })));
      if (t.state === 'closed') continue;
      const decidedAt = t.state === 'running' ? now - int(9, 38) * MIN : closesAt + int(5, 45) * MIN;
      push(decidedAt, () => must(venue.apply({ type: 'decide', taskId: taskIds[t.slug]!, executorId: t.state === 'skipped' ? null : t.chosen!, by: t.autoDecide ? null : customer })));
      if (t.state === 'resolved') {
        const settledAt = decidedAt + int(4, 21) * MIN + int(0, 59) * 1000;
        push(settledAt, () => {
          const exec = DEFAULT_EXECUTORS.find((e) => e.id === t.chosen)!;
          const version = venue.engine.task(taskIds[t.slug]!)!.candidateVersions[t.chosen!] ?? exec.version;
          must(venue.apply({ type: 'settle', taskId: taskIds[t.slug]!, outcome: t.outcome!, log: runLog(t, { ...exec, version }, t.outcome!, settledAt), runId: `run_${t.commit}${int(1000, 9999)}` }));
        });
      }
    }
  }

  events.sort((a, b) => a.at - b.at);
  for (const ev of events) {
    at(ev.at);
    ev.run();
  }
  clock.set(now);

  const tasks: Record<TaskState, number> = { resolved: 0, skipped: 0, running: 0, closed: 0, open: 0 };
  for (const t of venue.engine.state.tasks.values()) if (t.status in tasks) tasks[t.status as TaskState] += 1;
  return { tasks, traders: traders.length, agentTraders: traders.filter((t) => t.kind === 'agent').length, trades, theses, commands };
}

function must<T extends { ok: boolean }>(res: T): T extends { ok: true; data: infer D } ? D : never {
  if (!res.ok) {
    const e = res as unknown as { code: string; error: string };
    throw new Error(`demo seed: ${e.code} ${e.error}`);
  }
  return (res as unknown as { data: unknown }).data as never;
}

/** True when the journal holds the demo exchange (any demo-seeded task). */
export function hasDemoData(engine: Venue['engine']): boolean {
  for (const t of engine.state.tasks.values()) if (t.source?.startsWith(DEMO_SOURCE_PREFIX)) return true;
  return false;
}
