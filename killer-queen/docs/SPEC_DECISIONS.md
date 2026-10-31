# Spec decisions

Answers to docs/SPEC_REVIEW.md plus every call made where the product spec is
silent. Each decision is a testable rule; "Status" says whether code enforces it
today and which test proves it. Decisions marked *runner* or *v1* are adopted
but land in a later phase (see docs/ROADMAP.md).

## Answers to the ten gaps

- **D1 Protected paths.** *Adopted; enforced in the runner service.* A task
  carries `protectedPaths: string[]` (default: `[]`, which the runner expands
  to the repo's test directories, test files and test-runner config). After
  the agent exits, the runner restores every protected path from the pinned
  commit, records any attempted change in the run log, then runs the test
  command. Rule: an agent that edits a protected path cannot turn a failing
  test into a pass. Status: `runner/tests/runner.test.ts` "an agent that edits
  a test to force a pass still fails"; `DockerDriver.restorePaths` /
  `defaultProtectedPaths` (untested on this host: no Docker).
- **D2 Baseline.** *Adopted; enforced (Phase 2).* With `BASELINE_CHECK=true`
  (the default) a new task starts `pending` and its markets `pending`; nobody
  can order or comment. The runner runs the test command 3 times at the pinned
  commit with no agent and posts a signed `baseline` result. All 3 failing opens
  the markets (`openedAt`, and the trading window starts then); all 3 passing
  rejects the task as `trivial`; a mix rejects it as `flaky`; a rejected task's
  markets are `cancelled` and the packet shows `baseline: failing 3/3` /
  `pending` / `not run`. The simulated runner reports 3 fails after its delay
  (`forceBaseline` overrides it in sandbox tests). Status: engine
  `lifecycle.test.ts` "baseline check", HTTP `runner.test.ts` "baseline over
  HTTP", `tests/runner/contract.test.ts`, service `runner/tests`.
- **D3 Network.** *Adopted; in the runner service.* Per-agent egress allowlist:
  package registries plus that agent's model API host, nothing else
  (`DockerDriver`: internal network + egress proxy with `ALLOW_HOSTS`). Agent
  API keys are injected per run and redacted from logs (`runner/src/redact.ts`,
  tested). Spend caps are the provider key's job. Status: redaction and
  allowlist plumbing tested with FakeDriver; Docker path untested here.
- **D4 Versions.** *Adopted; enforced in v0.* `upsertExecutor` requires a
  non-empty `version` that is not `latest` (case-insensitive), rejected with
  code `version_required`. `createTask` snapshots each candidate's version into
  `task.candidateVersions[executorId]`; packets show that frozen version.
  Executor records (`chosen`, `passed`) are counted per `(id, version)`.
  Status: engine tests `executors.test.ts`.
- **D5 Run limits.** *Adopted; in the runner service.* Default 30 minutes
  wall-clock (`RUN_WALL_CLOCK_MS`), 10 minutes per test run
  (`TEST_TIMEOUT_MS`), token budget via the key's spend cap
  (`RUN_TOKEN_BUDGET` is informational); exceeding either is `failed`, not
  `infra_error`. Status: `runner/tests/runner.test.ts` "over its wall-clock
  limit", "a test timeout is a fail".
- **D6 Infrastructure errors.** *Adopted; engine side enforced in v0.* The
  runner retries an infrastructure failure twice. A result with
  `outcome: infra_error` settles the chosen market at its closing price (Yes
  gets `closingPrice`, No gets `100 - closingPrice`), sets
  `market.outcome = "infra_error"`, and the task is `resolved` with
  `passed = null`. That task does not count toward the executor's `chosen` or
  `passed`. Status: engine test `lifecycle.test.ts` (infra_error case).
- **D7 Closing price.** *Adopted; enforced in v0.* With best Yes bid `b` and best
  Yes ask `a` (ask = 100 − best No bid), if both exist and `a − b ≤ 20` then
  `closingPrice = floor((b + a + 1) / 2)` (half rounds up); else the last trade
  price if any trade happened; else 50. The same formula gives the live
  `chance` on a quote. v1 surveillance flags moves over 20¢ in the final
  minute. Status: engine test `lifecycle.test.ts` (closing price cases).
- **D8 Accounts.** *Adopted; enforced (v0 sandbox rule + Phase 5 limits).* The
  faucet is a `deposit` command with `reason: "faucet"`, rejected with
  `faucet_cooldown` if the last faucet of the account, or of any account of
  the same verified `personId`, is less than 24 hours before `at`; flagged
  accounts cannot faucet (`account_flagged`). Sign-up stores only
  `sha256(email)` and `sha256(device id)`; the engine caps 3 accounts per email
  hash and 5 per device hash (`too_many_accounts`). An admin `reviewAccount`
  command flags/clears an account (flagged accounts stay off the leaderboard,
  keep trading, nothing is auto-banned), vets it for private tasks, or attaches
  a `personId`. In live mode accounts exist only through admin provisioning
  with a `personId`, so agent keys are tied to a verified owner. Status:
  `accounts.test.ts` "identity limits and review", `admin.test.ts`.
- **D9 Signed results.** *Adopted; v0 accepts the spec's body too.* The runner
  posts JSON `{ kind, taskId, runId, outcome | results, log, logSha256, timestamp }` with header
  `x-kq-signature: sha256=<hex HMAC-SHA256 of the raw body under RUNNER_SECRET>`.
  The server compares in constant time, rejects a `timestamp` more than 5
  minutes from its clock, rejects a reused `runId`, and accepts only for a task
  in `running`. Because the product spec's own body is `{ taskId, passed, log }`,
  v0 in sandbox also accepts that shape (`passed` maps to `passed | failed`;
  missing `runId`/`timestamp` skip those two checks). In live mode `runId` and
  `timestamp` are required. Status: HTTP tests `runner.test.ts`.
- **D10 Name and iOS.** *Adopted; owner action before any store submission.*
  Trademark search first. Every balance in the apps is labelled
  "Play money - no cash value"; no purchase of play money; no prizes.
- **D11 Human sign-in.** *Adopted; Phase 4.* Email magic link or passkeys issue
  a session; Sign in with Apple is offered on iOS wherever Google sign-in is.
  v0 uses API keys for everyone (the spec's sandbox rule).

## Engine decisions made while building v0

- **D12 Time and ids.** Every command carries `at` (ms since epoch) set by the
  Venue from an injected clock; the engine never reads a clock. Order, fill,
  comment, task and account ids come from engine counters (`o1`, `f1`, `c1`,
  `tsk_1`, `acc_1`) unless the command supplies an id (tests and seeds do); a
  supplied id must be unused. Replay therefore rebuilds identical ids.
- **D13 Fee lock.** Fee rate is 1¢ per contract for `trader` accounts and 0 for
  `market_maker`. Placing a buy of `n` at `p` locks `n × (p + feeRate)`. The
  fee is charged only on contracts the order takes; the fee part of contracts
  that rest and later fill as maker, or are cancelled, returns to cash at that
  moment. So an open order's `lockedRemaining` is always
  `remaining × (price + feeRate)` (invariant 4).
- **D14 When unchosen markets settle.** `decide` settles every market that was
  not chosen at its closing price in the same command; the chosen market moves
  to `running`. `decide` with `null` (skip) settles all markets at their closing
  prices and marks the task `skipped`. `settle` therefore only ever touches the
  chosen market and requires the task to be `running`.
- **D15 Quote fields.** `yesBid` = best Yes bid, `yesAsk` = 100 − best No bid,
  `noBid` = best No bid, `noAsk` = 100 − best Yes bid (each absent when that
  side is empty). `chance` uses the D7 formula on the live book. A task's
  `recommendation` is the candidate with the highest `chance`, ties broken by
  candidate order; auto-decide runs it if `chance ≥ minimumChance`, else skips.
- **D16 Realized P&L on netting.** Redeeming `k` pairs removes
  `k === yes ? yesCost : floor(yesCost × k / yes)` from Yes cost (same for No)
  and adds `100 × k − removedYesCost − removedNoCost` to `realized`. This is
  bookkeeping only; cash always rises by exactly `100 × k`.
- **D17 Sell and market orders.** `action: sell` on side `s` at `p` is placed as
  a buy of the other side at `100 − p`; any existing position nets (D16).
  `type: market` is immediate-or-cancel at 99 for the side actually bought.
- **D18 Who is staff.** Only `trader` and `market_maker` roles may place orders
  or comment; `customer`, `admin` and `house` are staff for the conflict rule.
  Runner operators authenticate with `RUNNER_SECRET`, never with an account, so
  they cannot trade. An empty `org` never matches anything.
- **D19 Self-trades.** An incoming order skips the same account's resting
  orders and continues down the book; those resting orders stay.
- **D20 Simulated runner determinism.** In sandbox the simulated runner passes
  a task iff the last hex nibble of `sha256(taskId + ":" + executorId)` is even.
  A task created with `forceOutcome: "pass" | "fail"` (sandbox only, rejected in
  live, never shown in packets) overrides that so tests can force both paths.
- **D21 Journal durability (v0).** `Venue.apply` validates and applies in
  memory, then inserts the row and commits before returning, so a caller is
  acknowledged only after the row commits (invariant 10). SQLite runs in WAL
  mode with `synchronous=FULL`. A crash between apply and commit loses nothing
  the caller was told about. If the insert itself fails, the Venue halts and
  refuses every further command so memory and journal cannot diverge.
- **D22 Leaderboard accuracy.** For each account, over markets that settled on
  a test result (`passed`/`failed`) where the account held a net position at
  close: the entry Yes price `p` is the average Yes cost / 100 for Yes holders
  and 1 − average No cost / 100 for No holders; the implied forecast is
  side-aware, `(1 + p) / 2` for a Yes holder and `p / 2` for a No holder (the
  midpoint between the price paid and that side's certainty, so both parties
  to one trade are not scored identically); `brier` is the mean squared error
  of that forecast against the outcome (lower is better) and `hits` counts
  markets where the net side was right. Profit rank uses realized + unrealized
  P&L minus fees, marking open positions at the live `chance`.
- **D23 Trading window.** `createTask` sets `closesAt = at + TRADING_WINDOW_MS`
  (default 600000) unless the command supplies `closesAt`. Boot auto-closes any
  open task whose `closesAt` has passed and then auto-decides it if
  `autoDecide` is set.
- **D24 House trader sizing.** "2.5% of its cash scaled by the edge" means a
  budget of `cash × 0.025 × min(4, edge / 4)` cents at an edge of `edge`
  cents (so a 4¢ edge is 2.5%, 8¢ is 5%, capped at 10%), spent as an
  immediate-or-cancel order at the best ask for `floor(budget / (price + 1))`
  contracts. Resting bids 3¢ either side of fair value use 1% of cash per
  side. Each buy, and each pair of resting bids, counts as one of the three
  actions per market. The house market maker's first estimate is the
  executor's historical pass rate, or 50 with no record; it moves 40% toward
  every trade (including its own fills) in trade order.
- **D25 Executors are registered by the operator.** There is no HTTP route for
  `upsertExecutor`; the product spec lists none. In sandbox, boot registers
  claude-code, codex and gemini-cli when no executors exist, and
  `npm run seed` adds a demo customer and three demo tasks.
- **D26 Pause trading.** An eleventh journaled command, `pauseTrading`
  `{ paused, reason, by }`, is the admin switch prompt 1.5 asks for. While
  paused, `placeOrder` is rejected with `trading_paused`; cancels, comments,
  close, decide and settle continue so money keeps settling. Only an admin
  account (or the admin key, `by: null`) may flip it. This extends the spec's
  ten commands deliberately; the spec's rule "every state change is one
  journaled command" still holds.
- **D27 Idempotent orders.** `placeOrder` takes an optional `clientKey`
  (1–128 chars, unique per account, journaled in `state.clientKeys`). Over
  HTTP it comes from the `Idempotency-Key` header: a retry with the same key
  returns the original order (200, `replayed: true`) instead of placing a
  second one, and this survives restarts because the key is in the journal.
  A rejected order does not consume its key.
- **D28 Rate limits.** In-process token buckets per API key: orders 30/min,
  task creates 5/min, other writes 60/min, authenticated reads 120/min, and
  300/min per IP for public reads and sign-up (`RATE_LIMIT_*_PER_MIN`, 0
  disables). Refill is continuous; a refusal is `429 { code: "rate_limited" }`
  with `Retry-After`. Limits are per process (no Redis), as the v1 note allows.
- **D29 Constant-time key check.** `Authorization: Bearer` keys are hashed and
  compared against every keyed account with `timingSafeEqual`, without an
  early exit, so response time does not depend on how close a guess is. This
  is O(accounts) per request, fine at v0/v1 scale; an index can come later.
- **D30 Log hash.** Every settle and baseline journals `sha256(log)` next to
  the log; a posted `logSha256` that does not match the posted log is refused
  (`400 log_hash_mismatch`) so a published log can be checked against what the
  runner signed. Full protocol: `docs/RUNNER_PROTOCOL.md`.
- **D31 Baseline that cannot run.** If the runner hits infrastructure failures
  on a baseline job after its retries, it posts nothing and the task stays
  `pending` for a later poll; only `run` jobs post `infra_error`.
- **D32 Surveillance is derived, not stored.** `alerts(engine)` recomputes every
  alert from state (so from the journal) on each call: wash trades between
  linked accounts (same org, person, email hash or device hash), spoofing
  (≥ 3 orders of ≥ 100 contracts cancelled by the user within 10 s with no
  fill, per account and market), closing-price pressure (≥ 15¢ move between
  the last trade before the final 60 s and the closing price on a market
  settled unchosen/skipped, naming the takers who benefited), conflicted
  trades/comments (should be impossible), unusual win rates (≥ 90% right over
  ≥ 10 scored markets). Thresholds are options with these defaults. The admin
  queue is `GET /api/admin/alerts`; acting on an alert is a `reviewAccount`
  command. Orders record `cancelledAt` and `cancelReason` (user/close/ioc) for
  this.
- **D33 Private tasks.** `createTask.visibility: "private"` makes the packet
  and markets visible only to the customer, admins, the house accounts (house,
  market maker) and `vetted` traders; everyone else gets 404 on the task and
  market routes, no entry in `/api/tasks` or `/api/agent/markets`, no events
  on the stream (the stream accepts an optional Bearer key to identify the
  viewer), and `private_task` (404) on orders and comments. Leaderboard and
  stats stay aggregate. House traders are not vetted by default, so no packet
  of a private task reaches a third-party model unless an admin vets that
  trader.
- **D34 Live provisioning.** `POST /api/admin/accounts` (admin key) creates
  accounts with a `personId` (and optional vetting); it is the only way to get
  an account in live mode and credits no play money there.

