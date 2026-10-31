# Spec decisions

Answers to docs/SPEC_REVIEW.md plus every call made where the product spec is
silent. Each decision is a testable rule; "Status" says whether code enforces it
today and which test proves it. Decisions marked *runner* or *v1* are adopted
but land in a later phase (see docs/ROADMAP.md).

## Answers to the ten gaps

- **D1 Protected paths.** *Adopted; runner (Phase 2).* A task carries
  `protectedPaths: string[]` (default: `[]`, which the runner expands to the
  repo's test directories, test files and test-runner config). After the agent
  exits, the runner restores every protected path from the pinned commit,
  records any attempted change in the run log, then runs the test command. Rule:
  an agent that edits a protected path cannot turn a failing test into a pass.
  Status: field exists on the task (v0); enforcement is runner work.
- **D2 Baseline.** *Adopted; runner (Phase 2).* Before a task's markets open the
  runner runs the test command 3 times at the pinned commit with no agent. Any
  pass rejects the task as `trivial`; mixed results reject it as `flaky`; 3 fails
  admit it and the packet shows `baseline: failing 3/3`. Status: not enforced
  in v0 (the simulated runner has no repo); v0 markets open at creation.
- **D3 Network.** *Adopted; runner (Phase 2).* Per-agent egress allowlist:
  package registries plus that agent's model API host, nothing else. Agent API
  keys are per-run, spend-capped and redacted from logs. Status: runner work.
- **D4 Versions.** *Adopted; enforced in v0.* `upsertExecutor` requires a
  non-empty `version` that is not `latest` (case-insensitive), rejected with
  code `version_required`. `createTask` snapshots each candidate's version into
  `task.candidateVersions[executorId]`; packets show that frozen version.
  Executor records (`chosen`, `passed`) are counted per `(id, version)`.
  Status: engine tests `executors.test.ts`.
- **D5 Run limits.** *Adopted; runner (Phase 2).* Default 30 minutes wall-clock
  and a per-run token budget (`RUN_WALL_CLOCK_MS`, `RUN_TOKEN_BUDGET`);
  exceeding either is `failed`, not `infra_error`. Status: runner work.
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
- **D8 Accounts.** *Adopted; sandbox rule enforced in v0.* The faucet is a
  `deposit` command with `reason: "faucet"`; it is rejected with code
  `faucet_cooldown` if the account's last faucet is less than 24 hours before
  the command's `at`. Faucet amount is `STARTING_CASH_CENTS`. v1 adds one
  faucet per verified person, per-device and per-email limits and flagged
  accounts off the leaderboard. Status: engine test `accounts.test.ts`.
- **D9 Signed results.** *Adopted; v0 accepts the spec's body too.* The runner
  posts JSON `{ taskId, runId, outcome, log, timestamp }` with header
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
