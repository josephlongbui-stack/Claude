# Build log

Newest first. Each prompt appends what it did, what it decided, and anything
blocked (with exactly what the owner needs to provide).

## 2026-10-31 — Store readiness follow-ups (account deletion, thesis reports)
- `closeAccount` command (14th) + `POST /api/me/delete`; thesis report route
  and `GET /api/admin/reports`; mobile Profile deletion and Report buttons
  wired. docs/STORE_SUBMISSION.md rows now "code". Golden hash regenerated
  (Account gained `closed`): 15d0f62f….

## 2026-10-31 — Phase 4 (mobile app)
- mobile/: Expo SDK 58 app assembled by hand (the host could not run
  create-expo-app; versions taken from Expo's sdk-58 bundledNativeModules.json
  and the npm registry: expo 58.0.21, react-native 0.88.1, react 19.3.0,
  expo-router 58.0.28, typescript 5.9.3). Expo Router tabs Markets /
  Portfolio / Leaderboard / Profile (standard `Tabs`; the native-tabs API was
  not used unverified), task and market screens, order ticket with a success
  haptic on fills, SSE subscription with resume, SecureStore for the key,
  design tokens ported (dark/light, tabular numerals, mono packets, Dynamic
  Type via default font scaling, Reduce Motion honoured by the skeleton),
  "Play money · no cash value" beside every balance, testIDs and
  accessibility labels, dev-only kitchen-sink route. `npm run typecheck`
  passes in mobile/.
- 4.4 docs/STORE_SUBMISSION.md: product rules, data sent, privacy answers,
  age rating, review notes; partial items marked (server-side report and
  delete routes are follow-ups). 4.5 eas.json profiles, Maestro flows in
  mobile/.maestro (sign up, order, portfolio, settlement, delete account).
- Not done here: iOS/Android simulator screenshots (needs a Mac / Android
  Studio), EAS builds and store submission (owner accounts), human sign-in
  per D11, server-side account deletion and thesis reporting routes,
  Liquid Glass navigation chrome (API not verified), Sentry wiring.

## 2026-10-31 — Phase 6 (6.1 load test, 6.2 maintenance checklist, 6.3 incident drill)
- 6.1 `scripts/load-test.ts` (built-in fetch; the session's policy refused
  running autocannon as fetched external code). Exchange in its own process,
  file journal with WAL + synchronous=FULL, no bots, rate limits off, 32
  workers, 50 traders, 6 s per phase, this build host:
  | phase | req/s | p50 | p95 | p99 |
  | --- | --- | --- | --- | --- |
  | orders, no streams | 1,227 | 22.5 ms | 43.6 ms | 68.2 ms |
  | orders, 200 open event streams | 399 (was 269) | 70 ms | 138 ms | 185 ms |
  | reads (task list + market view) | 845 | 33.7 ms | — | 82.8 ms |
  Microbenchmark: engine + file journal alone does ~9,300 orders/s
  (0.107 ms/order incl. fsync); memory journal ~127k/s; so the HTTP layer,
  not the journal, bounds the no-stream case. First bottleneck found and
  fixed: the event hub serialized every SSE frame once per subscriber; it now
  serializes once per event (`frameOf`), which took the 200-stream case from
  269 to 399 orders/s (356k frames delivered in 6 s). Next bottleneck: the
  socket write fan-out itself (~150 writes per order with 100 subscribers per
  market); coalescing `book` snapshots per market per ~50 ms would cut it but
  changes the exactly-once semantics of book events, so it is deferred.
  (The no-stream figure also rose from 758 because the first run had the
  generator sharing the server's event loop; that was a measurement error,
  not a server change.)
- 6.2 Monthly maintenance checklist in docs/RUNBOOK.md (no upgrades performed
  in this session: versions were installed today).
- 6.3 `scripts/incident-drill.ts`: wrong settlement on a staging copy,
  correction with new commands only (compensation deposits), pause/resume,
  backup, restore, hash match. Findings in docs/RUNBOOK.md: no reversal
  command exists; the track record keeps the wrong outcome; a
  `correctSettlement` command is the follow-up before any real-money phase.

## 2026-10-31 — Phase 5 (5.3 GitHub app)
- `src/server/github.ts`: RS256 app JWT, installation tokens (cached),
  webhook signature verification (constant time), delivery de-dup,
  `/kq task` (PR head or default-branch head, --test/--agents/--minutes/
  --private, reply comment, check run on PRs) and `/kq decide` (only the
  submitting installation; closes then decides), check-run updates on task
  events, no trading path. Config: GITHUB_APP_ID / GITHUB_PRIVATE_KEY /
  GITHUB_WEBHOOK_SECRET / GITHUB_INSTALLATIONS / PUBLIC_URL.
- Fixtures in tests/fixtures/github (hand-written in GitHub's delivery shape;
  record real deliveries from a test installation to replace them).
- docs/GITHUB_APP.md: install steps and the minimum scopes with reasons.
- Owner needs: create the GitHub App, install it, map installation ids to
  customer accounts; check-run state is in memory (restart stops updates for
  earlier tasks; a journaled mapping is a follow-up).

## 2026-10-31 — Phase 5 (5.1 surveillance, 5.2 identity limits, 5.4 private tasks)
- 5.1 `src/engine/surveillance.ts`: alerts derived from state (D32): wash
  trades between linked accounts, spoofing (orders now carry cancelledAt and
  cancelReason), closing-price pressure on unchosen/skipped markets,
  conflicted trades/comments, unusual win rates. `GET /api/admin/alerts`.
  Tests replay crafted sequences that must and must not fire each kind.
- 5.2 Accounts carry emailHash/deviceHash/personId/flagged/vetted; caps of 3
  per email and 5 per device; faucet once per 24 h per verified person across
  accounts; flagged accounts off the leaderboard and off the faucet, never
  auto-banned; `reviewAccount` command (13th) with
  `POST /api/admin/accounts/:id/review`; `POST /api/admin/accounts` provisions
  verified accounts (the only sign-up path in live mode, no play money there).
- 5.4 `visibility: private` on tasks; `Engine.canSeeTask` gates task/market
  routes (optional Bearer viewer, 404 otherwise), task list, agent markets,
  orders/comments (`private_task`) and the event stream (viewer-aware).
- Golden journal hash now 19137381… (Account and Task gained the fields
  above; Order gained cancelledAt/cancelReason). Golden commands unchanged.
- Not done: 5.3 GitHub app (next), 5.2's "verified person" is an admin-set
  id; real identity verification needs a vendor and counsel (v2).

## 2026-10-31 — Phase 3 (3.2/3.3 design system and screen pass)
- docs/DESIGN_SYSTEM.md; tokens for dark and light (OS preference + header
  toggle stored per browser); components in src/web/components (Pill,
  PriceCell, AgentRow, OrderBookLadder with thin-book warning, OrderTicket,
  PacketView, ThesisList, Sparkline, Skeleton, EmptyState, ErrorState);
  Market, Task and Arena rebuilt on them; `#/kitchen-sink` shows every state.
- Screenshots at 1440 and 390, dark and light, for every screen; fixed the
  three tables that overflowed at 390 (scroll inside the panel). The
  click-path walk (MANUAL.md) passes on the rebuilt screens with the
  baseline check on.
- Bug fixed: after the move to server-sent events the signed-in account
  refreshed only every ~50 s; it now refreshes on every event.
- Not run: the ui-reviewer subagent (needs the Playwright MCP from the
  prompt series' .mcp.json); reviewed by hand from the screenshots.

## 2026-10-31 — Phase 3 (3.1 events, 3.4 SDK, 3.5 metrics, 3.6 deploy files)
- 3.1 `src/server/events.ts`: events derived from journaled commands with
  ids `<seq>-<n>`, SSE at GET /api/events with market/task filters, resume
  by Last-Event-ID from a ring buffer (EVENTS_BUFFER_SIZE), `reset` when too
  far behind. Web app uses EventSource (slow poll as fallback).
  `tests/server/events.test.ts` proves a reconnect receives every missed
  event exactly once, in order.
- 3.4 `sdk/`: typed client (request types from `src/server/schemas.ts`, now
  shared with app.ts; response types from engine views), retries reusing the
  Idempotency-Key, SSE resume, agent template, README quickstart;
  `tests/sdk/client.test.ts` runs the loop, a retry that replays instead of
  double-placing, 429 backoff, and the template's limits/conflicts.
- 3.5 Gate metrics were already in /api/stats (v0); medianMsToTradable now
  reflects the baseline (Phase 2). Decision lift still needs a customer
  default agent (not in the data model).
- 3.6 Dockerfile (non-root, volume /data, healthcheck), fly.toml, JSON logs
  (`src/server/log.ts`) + ERROR_REPORT_URL webhook as the Sentry hook point
  (no Sentry SDK dependency added), `scripts/backup-journal.ts` (VACUUM INTO
  + BACKUP_UPLOAD_CMD), `scripts/restore-drill.sh`, `scripts/state-hash.ts`,
  `GET /api/admin/state-hash`, docs/RUNBOOK.md. Not deployed (per
  supervision note and prompt). Owner needs: a Fly app + volume, object
  storage credentials for backups, a Sentry DSN or webhook if wanted.
- Not done: 3.2/3.3 design system and screen pass (next).

## 2026-10-31 — Phase 2: the runner (prompts 2.1–2.5)
- 2.1 docs/RUNNER_PROTOCOL.md (job types baseline/run, job states, signed
  result with logSha256 + timestamp + runId, HMAC rules, skew window,
  retries, limits). Server verifies logSha256 (D30); the engine journals
  sha256(log) for settle and baseline.
- 2.2/2.3 runner/ package (no dependency on src/): ExchangeClient (signed
  posts), Runner loop, ContainerDriver with FakeDriver (tests) and
  DockerDriver (internal network + egress proxy allowlist, non-root, cap-drop,
  limits, protected-path restore, default test-path detection), log
  redaction, runner/agents.json with pinned versions and the CLI flags looked
  up today (gemini marked verify:true, third-party sources only),
  runner/SANDBOX.md threat list. Docker path is NOT exercised here (no Docker
  on the build host); FakeDriver covers the logic.
- 2.4 Baseline check (D2): tasks start pending with BASELINE_CHECK=true; the
  journaled `baseline` command opens or rejects (trivial/flaky); packet shows
  the baseline; simulated runner answers baseline jobs; web shows
  pending/rejected states; medianMsToTradable now measures the baseline.
- 2.5 src/importer/arena.ts + scripts/import-arena.ts: merged PRs that closed
  an issue and changed tests + code become candidates at the PR base commit
  with the test files as protected paths; test command limited to them;
  dry run by default; rate-limit aware; `--verify fake|docker` runs the tests
  at base (must fail) and merge (must pass) through the runner driver; apply
  is idempotent on the issue URL (`task.source`, `duplicate_source`).
- Golden journal hash changed twice: 37053eb6… (Task gained openedAt,
  tradingWindowMs, runLogSha256, baseline, rejectedReason, forceBaseline;
  Market statuses) and then 6081d78c… (Task.source). Golden commands unchanged.
- CLI flag sources: Claude Code docs.anthropic.com cli-reference (-p,
  --output-format, --max-turns, --permission-mode); Codex
  developers.openai.com non-interactive-mode (codex exec --sandbox
  workspace-write, --full-auto deprecated); Gemini CLI: third-party mirrors
  only (-p, --approval-mode yolo) — verify before use.
- Owner actions: build the runner image (`kq-runner`) and egress proxy image,
  decide registries, provision per-run spend-capped provider keys; run
  `docker` on a host with Docker to exercise DockerDriver.

## 2026-10-31 — Phase 1: harden the exchange (prompts 1.1–1.5)
- 1.1 `tests/engine/property.test.ts`: fast-check sequences over every command
  (weighted toward valid traders/markets so most sequences trade), invariants
  after each command, before/after hash on each rejection, replay hash per
  sequence. `KQ_PROP_RUNS` (default 200, ~3 s).
- 1.2 Determinism audit: the only clock read in src/engine is the injected
  `systemClock` default; `tests/engine/determinism.test.ts` fails the build if
  Date.now/Math.random/timers/I/O or server imports appear in src/engine.
- 1.3 Already in v0 (D4 versions, D6 infra_error, D7 half-up, staff/runner
  conflicts); nothing to change.
- 1.4 Crash injection test: a journal sink that throws before commit; restart
  shows acknowledged state present and the unacknowledged command absent.
- 1.5 Rate limits (D28), Idempotency-Key via journaled clientKey (D27),
  64 kB body limit (6 MB for runner logs), constant-time key comparison
  (D29), `pauseTrading` command + admin route (D26), fuzz suite.
- Golden journal hash changed to
  7ad74cb95af087f1e8d24c8b671e5d77962efba496b5b5581c6de78b8e428a6e because
  `EngineState` gained `clientKeys` and `trading` (D26, D27); the 22 golden
  commands are unchanged.
- Per supervision note: commits stay local; nothing pushed after v0.

## 2026-10-31 — 0.2-alt v0 build and 0.3 invariants
- Built v0 from the spec in the spec's stack, test-first, one commit per
  slice: engine (ten commands, matching, netting, settlement, views), SQLite
  journal with replay and a golden journal, Express API (every route in the
  spec table), runner protocol with HMAC + timestamp window + single-use
  runId, simulated runner, boot with auto-close/auto-decide, house market
  maker, heuristic traders, LLM adapters (Anthropic, OpenAI, Gemini), HTTP bot
  client, Preact web app, sandbox seed. 95 tests pass (`npm test`,
  `npm run typecheck`). The web click path was verified in a headless
  browser (MANUAL.md).
- Decisions added while building: D12–D25 in docs/SPEC_DECISIONS.md.
- docs/ARCHITECTURE.md lists every difference from the product spec as an
  issue; docs/INVARIANTS.md names the proving test for each rule (one gap:
  crash injection between apply and commit, prompt 1.4).
- Bug found by the bot tests and fixed in the engine: counter-generated ids
  (`tsk_n`, `acc_n`, `o<n>`, `c<n>`) could collide with explicitly supplied
  ids and overwrite them; counters now skip taken ids (test in
  accounts.test.ts).
- Golden journal hash: 81aff1598d953d97786b3e28d21f619ad73be0e1b46336b5a8374a8e95b0db0f
  (first value; `scripts/make-golden.ts`).
- Owner actions needed:
  1. Copy `.claude/settings.json` from KILLER_QUEEN_PROMPTS.md "Setup files"
     (the cloud session may not write Claude permission settings).
  2. To turn on LLM traders: set a lab's API key AND its model id env var
     (looked up from the provider's docs; not guessed here).
  3. `runner/agents.json` holds the spec's example CLI templates; verify the
     flags against each CLI's docs before the Phase 2 runner uses them.
- Not done (later prompts): fast-check property tests over all ten commands
  (1.1), crash injection (1.4), rate limits and idempotency keys (1.5), SSE
  (3.1), design system (3.2), deploy (3.6).

## 2026-10-31 — 0.0 Bootstrap
- Created the setup files from KILLER_QUEEN_PROMPTS.md "Setup files" and the
  folder layout; converted docs/source/Killer_Queen_Product_Doc.pdf into
  docs/PRODUCT_SPEC.md (link targets recovered from the PDF annotations).
- Project lives in killer-queen/ inside the josephlongbui-stack/Claude repo
  because the repo root was not empty (the coding prompt pack's rule).
- BLOCKED: `.claude/settings.json` (permission allowlist + hook wiring) was not
  written: the cloud session's safety classifier refuses to let Claude write
  its own permission settings. Owner action: copy the `.claude/settings.json`
  block from KILLER_QUEEN_PROMPTS.md "Setup files" into place locally. The hook
  scripts, agents and skills it references are all in .claude/.
- Also kept docs/source/Killer_Queen_Coding_Prompt_Pack.md (the slice-by-slice
  engineering rules) as a second source document.

## 2026-10-31 — 0.1 Spec and decisions
- Cross-checked docs/PRODUCT_SPEC.md against the PDF text: every number, env
  variable and route present (only page numbers differ).
- Tightened D1–D11 into testable rules with status; added D12–D23 for the
  engine calls the spec leaves open (ids/time, fee lock, when unchosen markets
  settle, quote fields, realized P&L, sell/market orders, staff, self-trades,
  simulated runner determinism, journal durability, accuracy, trading window).
- Wrote docs/ROADMAP.md: v0–v3 with gates and per-feature acceptance
  statements, including the per-screen checklists prompt 3.3 refers to.
