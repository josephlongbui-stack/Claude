# Killer Queen — Claude Code prompt series

How to use this file:

1. Make an empty folder for the repo, `git init`, and put two files in it:
   - this file, as `KILLER_QUEEN_PROMPTS.md`
   - your product doc PDF, as `docs/source/Killer_Queen_Product_Doc.pdf`
2. Open the folder in Cursor. Open Cursor's terminal and start Claude Code with
   `claude --permission-mode bypassPermissions` (you've consented to every action; see
   `docs/AUTONOMY.md` once prompt 0.0 creates it). Run it in a dev container or a machine
   that holds only sandbox keys.
3. Paste the prompts below **in order, one per session**. Type `/clear` between prompts.
   Prompt 0.0 creates every supporting file from the "Setup files" section at the bottom.
4. Prompt 0.2 or 0.2-alt: use 0.2 if you have the reference implementation (put it in
   `reference/` first); use 0.2-alt if you don't.
5. Prompts marked "run once per screen" are templates: replace `<Screen>` each time.

---

## Phase 0 — Set up

### 0.0 Bootstrap the repo

```text
Read KILLER_QUEEN_PROMPTS.md, section "Setup files". Create every file listed there with exactly the content given, make the four hook scripts executable, and create empty folders docs/design, docs/decisions, docs/plans, src, tests, scripts, runner, sdk, mobile, data (data/ gitignored). Then convert docs/source/Killer_Queen_Product_Doc.pdf into docs/PRODUCT_SPEC.md, keeping every rule, number, formula, table, API route, config variable and test name exactly; list anything you could not read at the end of the file. Commit with message "bootstrap".
```

### 0.1 Spec and decisions

```text
Read @docs/PRODUCT_SPEC.md, @docs/SPEC_REVIEW.md and @docs/SPEC_DECISIONS.md. PRODUCT_SPEC.md was converted from the PDF in docs/source/; compare them and restore any rule, number, formula or table that was lost. SPEC_DECISIONS.md proposes an answer to each of the ten gaps in SPEC_REVIEW.md: check each for contradictions with the spec and for ways to game it, tighten it into a testable rule, and mark it adopted. Then write docs/ROADMAP.md: the spec's v0-v3 phases and gates, with each feature's acceptance criteria as testable statements. No code.
```

### 0.2 Bring in the reference implementation

```text
If the reference implementation from the spec is in reference/ or already in src/, put it in the spec's layout (src/engine, src/bots, src/server, src/web, scripts, tests) without changing behaviour, install, and run every test. Record each of the spec's 13 tests as pass or fail in docs/BUILD_LOG.md. If there is no reference implementation, run prompt 0.2-alt instead. Then write docs/ARCHITECTURE.md from the code as it is: every command, where it is validated and applied, how the journal is written and replayed, how bots reach the engine, and every difference from docs/PRODUCT_SPEC.md listed as an issue.
```

### 0.2-alt Build v0 from the spec (only if no reference implementation exists)

```text
Build v0 from @docs/PRODUCT_SPEC.md and @docs/SPEC_DECISIONS.md in the spec's layout and stack: Node 22.13+, tsx, Express 4 + zod, node:sqlite journal, Preact + esbuild, node:test. In order, each test-first, committing after each: (1) engine state and the ten commands, passing the spec's 13 tests; (2) journal and replay; (3) every route in the spec's HTTP API table; (4) house market maker and heuristic agent traders with the spec's parameters; (5) LLM adapters for Anthropic, OpenAI and Gemini with model IDs from env; (6) simulated runner with HMAC-signed results; (7) a minimal Preact web app. Use the engine-command and new-endpoint skills. Then write docs/ARCHITECTURE.md from the code.
```

### 0.3 Invariants

```text
Write or update docs/INVARIANTS.md: every money and fairness rule from the spec and SPEC_DECISIONS as a numbered, testable statement (conservation, escrow equals 100 cents times open interest, net positions, locks, settlement empties escrow, rejected commands change nothing, deterministic replay, conflict rules, signed settlement only, durability). For each, name the test that proves it today or write "none".
```

---

## Phase 1 — Harden the exchange

### 1.1 Invariant harness

```text
Create tests/helpers/invariants.ts: assertInvariants(state) for every rule in @docs/INVARIANTS.md that can be checked from state, and stateHash(state), stable across runs. Call assertInvariants after every command in every engine test and in the random-order run. Add fast-check property tests that generate random sequences of all ten commands (KQ_PROP_RUNS sets the count; default 200, nightly 20000). Write the tests first and run them; fix any invariant the current code breaks with the smallest change. exchange-auditor reviews.
```

### 1.2 Determinism and the golden journal

```text
Audit src/engine for anything that can make replay differ from live: clock reads, randomness, network, floats on money, order-dependent iteration, ids not from the counter. Fix each so time and ids arrive in commands. Add a replay test (replaying the journal of a random run reproduces the live stateHash) and a golden journal in tests/golden/ with its expected hash. A changed hash fails the build until the expected value is updated in the same commit with a reason in docs/BUILD_LOG.md.
```

### 1.3 Spec decisions in the engine

```text
Implement the engine side of @docs/SPEC_DECISIONS.md, one engine-command change at a time: round-half-up closing price, concrete agent versions on tasks and packets, the infra-failure outcome (the chosen market settles at its closing price with a reason), and conflict checks for staff and runner operators. Tests first for each. exchange-auditor reviews.
```

### 1.4 Journal durability

```text
Make the journal crash-safe: acknowledge a command only after its row commits; SQLite in WAL mode with synchronous=FULL; on boot, detect and report a truncated or corrupt tail, never skip it silently. Tests: inject a crash between apply and commit, restart, and prove acknowledged state survives and unacknowledged state is absent.
```

### 1.5 API hardening

```text
Harden every route: zod on bodies, params and queries; consistent { error, code }; API keys checked by SHA-256 hash in constant time; per-key rate limits (in-process token bucket, configurable); body size limits; no stack traces in responses; an Idempotency-Key header on POST /api/orders so a retry never places two orders; an admin pause-trading switch that is itself a journaled command. HTTP tests for each, plus a fuzz test that sends random invalid bodies to every route and asserts the state hash is unchanged.
```

---

## Phase 2 — The runner

### 2.1 Runner protocol, server side

```text
Write docs/RUNNER_PROTOCOL.md from the spec and SPEC_DECISIONS: job types (baseline, run), job states, the signed result (taskId, runId, outcome: passed | failed | infra_error, logSha256, timestamp), HMAC rules and clock-skew window, retries, timeouts. Update src/server to match: constant-time signature check, results accepted only for a task in running with an unused runId, the log hash journaled. Tests first. runner-auditor reviews.
```

### 2.2 Runner service

```text
Create runner/ as its own package: it polls GET /api/runner/jobs, executes through a ContainerDriver interface, and posts signed results. Ship FakeDriver for tests and DockerDriver. Agent command templates live in runner/agents.json with a pinned CLI version per agent; look up each CLI's current non-interactive flags (claude -p, codex exec, gemini) in its docs instead of guessing. Contract tests run against a local exchange in sandbox mode with FakeDriver.
```

### 2.3 Sandbox and test integrity

```text
Implement DockerDriver per @docs/SPEC_DECISIONS.md: a fresh container per job, non-root, CPU, memory and process limits, an egress allowlist (package registries plus the chosen agent's API host), the agent's key injected as a spend-capped key and redacted from logs, wall-clock and token limits. After the agent exits, restore protected paths from the pinned commit, record attempted changes, then run the test command with its time limit. Fixture-repo tests: an agent that edits a test to force a pass still fails; an agent over its time limit fails; a log containing a key is redacted. runner-auditor reviews.
```

### 2.4 Baseline check

```text
Add the baseline job: before a task's markets open, run its test command 3 times at the pinned commit with no agent. Any pass rejects the task as trivial; mixed results reject it as flaky. The packet shows "baseline: failing 3/3". Fixture-repo tests for each case.
```

### 2.5 Arena importer

```text
Build scripts/import-arena.ts: from a list of public GitHub repos, find closed issues whose fixing PR added or changed tests. Create a task at the PR's parent commit with the issue text as the prompt, the PR's test files as protected paths, and a test command limited to them. Keep only tasks whose tests fail before the fix and pass with the PR applied. Dry run by default; respect GitHub rate limits; public data only.
```

---

## Phase 3 — The arena (v0 gate)

### 3.1 Live updates

```text
Add a server-sent events endpoint that streams book, trade and task-status changes for each market, driven from journaled commands, with resume by last event id. The web and mobile apps use it instead of polling. Tests: a client that disconnects and reconnects receives every event exactly once, in order.
```

### 3.2 Web design system

```text
Read @docs/DESIGN_SYSTEM.md and every image in docs/design/; if there are none, follow the design principles in DESIGN_SYSTEM.md. Build src/web tokens (colour for light and dark, type with tabular numerals and a mono face for packets, spacing, radii) and components: PriceCell, AgentRow, OrderBookLadder, OrderTicket, PacketView, ThesisList, Sparkline, Skeleton, EmptyState. A dev-only /kitchen-sink route shows every component in every state. Screenshot it with Playwright MCP in light and dark at 1440 and 390 px wide, fix anything clipped or misaligned, then run ui-reviewer and fix its BLOCKERS.
```

### 3.3 Web screens (run once per screen: Arena, Task with the customer's decide step, Market, Portfolio, Leaderboard, Agent records, Submit task, API keys)

```text
Build the <Screen> screen in src/web from the <Screen> parts of @docs/PRODUCT_SPEC.md and @docs/DESIGN_SYSTEM.md and docs/design/<screen>.png if it exists, using the new-screen skill. Data only from the API and the event stream. Design the thin-book, no-trades, closed, running, settled and error states. Acceptance: the <Screen> checklist in docs/ROADMAP.md. Screenshot with Playwright MCP, list every difference from the design, fix them, run ui-reviewer.
```

### 3.4 Agent SDK and hackathon kit

```text
Create sdk/: a typed TypeScript client for every route in the spec's HTTP API, with types derived from the server's zod schemas so they can't drift; retries that reuse idempotency keys; and an outside-agent template that reads /api/agent/markets, asks an LLM for a probability, and places orders within position limits. Write sdk/README.md as the hackathon quickstart: from zero to a trading agent in 15 minutes. Test the template against a local sandbox exchange.
```

### 3.5 Gate metrics

```text
Implement the spec's v0 gate metrics in /api/stats and an admin page: Brier score of closing Yes prices vs. each agent's historical pass rate, decision lift, calibration of markets closing at 70-80 cents, median spread at close, median distinct traders per market, time from submission to tradable market, settled-market count. Compute everything from the journal so it can be recomputed at any time. Unit-test each metric against hand-computed fixtures.
```

### 3.6 Deploy, backups and runbook

```text
Prepare deployment for the public arena: a Dockerfile and fly.toml (one machine, a persistent volume for the journal, HTTPS, secrets from the environment, health check), Sentry and structured logs, and the runner on a separate host. Add a nightly journal backup to object storage and scripts/restore-drill.sh, which boots a fresh instance from the latest backup and compares state hashes. Write docs/RUNBOOK.md: deploy, roll back, restore, rotate RUNNER_SECRET, pause trading. Don't deploy to production; if credentials are missing, log what is needed in docs/BUILD_LOG.md.
```

---

## Phase 4 — The App Store app

### 4.1 Expo app

```text
Create mobile/ with create-expo-app on SDK 58 (template default@sdk-58), TypeScript, Expo Router native tabs: Markets, Portfolio, Leaderboard, Profile. Use the client from sdk/. Human sign-in per @docs/SPEC_DECISIONS.md (email magic link or passkey), with Sign in with Apple if Google sign-in is offered. Development builds and EAS profiles (development, preview, production). Done when typecheck passes, and on a Mac, when each tab is screenshotted with the Expo MCP on the iOS simulator and an Android emulator.
```

### 4.2 Mobile design system

```text
Port the web tokens to mobile/src/ui: same colours, tabular numerals, mono for packets, Dynamic Type, Reduce Motion. Components: PriceCell, AgentRow, OrderTicket (with a success haptic on fill), BookLadder, PacketView, Skeleton, EmptyState, plus a dev-only kitchen-sink route. Liquid Glass only on navigation chrome. Screenshot in light, dark and the largest text size where a simulator is available; run ui-reviewer.
```

### 4.3 Mobile screens (run once per screen: Markets, Task, Market and ticket, Portfolio, Leaderboard, Profile with account deletion)

```text
Build the <Screen> screen in mobile/ with the new-screen skill: data from the sdk client and the event stream only, every market state designed, testIDs on every element a Maestro flow touches, accessibility labels on every price and chart. Show "Play money - no cash value" wherever a balance appears. Acceptance: the <Screen> checklist in docs/ROADMAP.md.
```

### 4.4 Store readiness

```text
Create docs/STORE_SUBMISSION.md and make the app pass it: moderation for theses (filter, report, block, published contact), in-app account deletion that anonymises the account and revokes its keys, consent before any task content goes to third-party AI, no path from play money to anything of value, privacy labels and Play data-safety answers derived from what the code actually sends (list every SDK), age-rating answers with reasoning, review notes explaining play money, and a seeded reviewer demo account.
```

### 4.5 Release pipeline

```text
Set up eas.json build and submit profiles, TestFlight and a Google Play closed-testing track, Sentry for crashes with release health, and Maestro flows (sign up, place an order, see it in Portfolio, watch a seeded task settle, delete the account) running in CI. Don't submit to either store; list in docs/BUILD_LOG.md what needs the owner's developer accounts.
```

---

## Phase 5 — v1, design partners

### 5.1 Trade surveillance

```text
Build surveillance from the journal: alerts for wash trading between linked accounts, spoofing (large orders cancelled before fills), last-minute closing-price pressure on unchosen markets, trading by conflicted orgs, and unusual win rates. An admin queue shows each alert with its evidence. Nothing is auto-banned. Tests replay crafted journals that must and must not trigger each alert.
```

### 5.2 Accounts and identity limits

```text
Limit the faucet to one per verified person, cap accounts per device and email, and keep flagged accounts off the leaderboard until reviewed. Agent API keys stay tied to a verified owner, as the spec says. Tests for each rule, including attempts to get around them.
```

### 5.3 GitHub app

```text
Build the v1 GitHub app: a customer installs it on a repo, then submits a task from an issue or PR comment; it opens the markets and posts the live odds back as a check run. Request the minimum permission scopes and document each. Tests use recorded GitHub webhooks.
```

### 5.4 Private tasks

```text
Add private tasks: the customer controls the packet, and only vetted traders see and trade the markets. Prove with tests that unvetted accounts, the public API and the event stream never receive a private packet.
```

---

## Phase 6 — Keep it running

### 6.1 Load test

```text
Load-test POST /api/orders and the event stream with autocannon against a production-like build. Record throughput and p99 latency in docs/BUILD_LOG.md, find the first bottleneck, fix it, and measure again.
```

### 6.2 Monthly maintenance

```text
Upgrade Node, Expo, agent CLI versions and LLM model IDs to current releases, reading each changelog for breaking changes; run every suite; update runner/agents.json and the environment-variable docs. Agent version changes start new track records, as the spec requires.
```

### 6.3 Incident drill

```text
Run a drill: simulate a wrong settlement in a staging copy, then correct it only with new journaled commands, never by editing rows. Restore from last night's backup and compare state hashes. Write what was slow or unclear into docs/RUNBOOK.md.
```

---

## Setup files

Prompt 0.0 creates each file below with exactly this content.

### `CLAUDE.md`

```markdown
@AGENTS.md
@docs/SPEC_DECISIONS.md
@docs/INVARIANTS.md
@docs/AUTONOMY.md
```

### `AGENTS.md`

```markdown
# Killer Queen

A Kalshi-style play-money exchange where people and AI agents trade Yes/No
contracts on whether a coding agent's task will pass its tests, before anyone
runs it. Prices 1-99 cents; a winning contract pays 100 cents. A separate runner
settles every market. Play money has no cash value.

## Read when relevant
- Rules, data model, HTTP API, bots, runner: docs/PRODUCT_SPEC.md
- Answers to spec gaps and later decisions: docs/SPEC_DECISIONS.md
- Money and fairness rules as tests: docs/INVARIANTS.md
- How the code fits together: docs/ARCHITECTURE.md, docs/RUNNER_PROTOCOL.md
- UI work: docs/DESIGN_SYSTEM.md and the images in docs/design/
- Current phase and gates: docs/ROADMAP.md; plans in progress: docs/plans/
- Build progress and anything skipped: docs/BUILD_LOG.md

## Map
- src/engine: exchange state machine, views, scoring, Venue service. Pure.
- src/bots: house market maker, house agent traders, LLM adapters
- src/server: Express routes, config, SQLite journal, boot
- src/web: Preact web app (esbuild)
- tests/: node:test suites (engine, property, replay, golden, HTTP)
- runner/: separate service; runs agents and tests in containers
- sdk/: typed API client + outside-agent template
- mobile/: Expo SDK 58 app for human traders

## Commands
- npm test             # every suite; must pass before "done"
- npm run typecheck
- npm run dev          # KQ_MODE=sandbox, RUNNER=simulated
- npm run build:web

## Non-negotiables
1. Money is integer cents. No floats; every rounding follows a written rule.
2. Every state change is one journaled command. Validate completely before
   changing anything; a rejected command changes nothing.
3. src/engine is deterministic: no Date.now(), Math.random(), network, or
   order-dependent Map/Set/object iteration. Time and ids arrive in commands.
4. After any engine change, every rule in docs/INVARIANTS.md holds after every
   command in the property tests, and journal replay matches the live state hash.
5. Never edit or delete journal rows or anything in data/. Corrections are new
   commands.
6. Only the runner decides results, via a signed result for a running task.
7. Conflict rules are absolute: the customer, the agent's maker org, staff and
   runner operators never trade the affected market.
8. Nothing may convert, transfer, or redeem play money.
9. Secrets (RUNNER_SECRET, provider keys, API keys) never reach logs, task
   packets, or runner output. API keys are stored only as SHA-256 hashes.

## How we work
- The owner has approved fully autonomous work in this repo (docs/AUTONOMY.md).
  Never wait for permission or approval. When the spec is silent, make the most
  reasonable call, record it in docs/SPEC_DECISIONS.md, and keep going.
- Multi-file change: plan first and save the plan to docs/plans/NNN-slug.md;
  tick it off as you go.
- Engine, settlement, fees, runner: write failing tests first, run them to see
  them fail for the right reason, then implement.
- Before "done": npm test + typecheck. exchange-auditor reviews engine diffs,
  runner-auditor reviews runner diffs, UI changes come with screenshots. Fix
  every BLOCKER they report.
- If something can't be finished (missing account, hardware, credentials),
  write it in docs/BUILD_LOG.md with what's needed and move on.
- Agent CLI flags, model IDs and Expo APIs change often: look them up, never
  guess. Model IDs come from environment variables, as the spec says.
- New dependency: note why, its size and license in the commit. The engine
  takes none it doesn't need.

## Style
- TypeScript strict; zod at every HTTP boundary; errors are { error, code }
  with a 4xx status.
- Use the spec's words: task, market, executor, order, fill, position, escrow,
  closing price, packet, thesis.

## Git
- Branch per phase, small commits. Never commit .env, data/, or keys.
```

### `docs/AUTONOMY.md`

```markdown
# Autonomy and consent

Joseph Bui, October 30, 2026: "I accept and allow everything." Claude Code may take
every action in this repo without asking, until the app is built.

What this means for every session:
- Never stop to wait for approval or permission.
- When the spec is silent, choose the most reasonable option, record it in
  docs/SPEC_DECISIONS.md, and continue.
- When something truly needs the owner (developer accounts, payment, legal
  review, production credentials), record exactly what is needed in
  docs/BUILD_LOG.md and continue with everything else.
- Tests, invariants and the auditor subagents replace human approval as the
  gate for "done". Never weaken a test to make it pass.
```

### `docs/SPEC_REVIEW.md`

```markdown
# Spec review: ten gaps

1. Agents can edit the tests. The executor works inside the repo and can change
   test files or config until the command exits 0.
2. Tests that already pass. If the test command passes at the pinned commit
   before any agent runs, every agent "passes".
3. Sandbox network. The spec allows only package registries, but agent CLIs must
   reach their own model APIs.
4. "latest" agent versions. The packet example says "latest"; track records are
   per version.
5. No run limits. Only tests have a time limit; a stuck agent blocks settlement.
6. Infrastructure failures. A crashed container or rate-limited API would make
   Yes holders lose to infrastructure.
7. Closing-price rounding and pressure. round() of a half cent is undefined;
   thin books near close can be pushed.
8. Multiple accounts. Free faucet per account lets two accounts trade with each
   other to set prices or farm the leaderboard.
9. Signed results. The HMAC covers the body but no timestamp or run id.
10. Name and "$" on iOS. Trademark risk on the name; "$1,000" on an "exchange"
    reads as real-money gambling to App Review.
```

### `docs/SPEC_DECISIONS.md`

```markdown
# Spec decisions

Proposed answers to docs/SPEC_REVIEW.md, adopted for the unattended build.
Prompt 0.1 tightens each into a testable rule.

- D1 Protected paths. Each task lists protected paths (default: test
  directories, test files and test-runner config). After the agent exits, the
  runner restores them from the pinned commit, logs any attempted change, then
  runs the test command.
- D2 Baseline. Before trading opens, the runner runs the test command 3 times at
  the pinned commit. It must fail all 3; a pass rejects the task as trivial,
  mixed results reject it as flaky.
- D3 Network. Per-agent egress allowlist: package registries plus that agent's
  model API host. Agent API keys are scoped and spend-capped.
- D4 Versions. A task freezes each candidate's concrete CLI version and model ID
  at creation. "latest" is rejected. Track records are per version.
- D5 Run limits. Default 30 minutes wall-clock and a token budget per run.
  Exceeding either counts as a fail.
- D6 Infrastructure errors. Retry twice; then the chosen market settles at its
  closing price with outcome infra_error, which does not count in the agent's
  record.
- D7 Closing price. Mid rounds half up to the nearest cent:
  floor((bid + ask + 1) / 2). From v1, surveillance flags large moves in the
  final minute.
- D8 Accounts. Sandbox: faucet once per account per 24 hours. v1: one faucet per
  verified person, limits per device and email, flagged accounts off the
  leaderboard until reviewed.
- D9 Signed results. Body: taskId, runId, outcome (passed | failed |
  infra_error), log, timestamp. Signature: sha256= HMAC-SHA256 of the raw body
  under RUNNER_SECRET, compared in constant time; timestamp within 5 minutes;
  runId single-use; accepted only for a task in running.
- D10 Name and iOS. Trademark search before any store submission. The iOS app
  labels balances "Play money - no cash value", sells no play money, offers no
  prizes.
- D11 Human sign-in. Email magic link or passkeys issue a session. Sign in with
  Apple on iOS if Google sign-in is offered.
```

### `docs/INVARIANTS.md`

```markdown
# Invariants

1. Conservation: sum of every account's cash and locked plus all market escrow
   equals total deposits, after every command.
2. Escrow: each market's escrow equals 100 cents times its open interest.
3. Net positions: no account holds Yes and No in the same market.
4. Locks: an account's locked funds equal the sum over its open orders of
   remaining quantity times (price + fee rate).
5. Settlement: escrow empties exactly; open orders are cancelled and unlocked at
   close.
6. Rejection is free: a rejected command leaves the state hash unchanged.
7. Determinism: replaying the journal produces a byte-identical state hash.
8. Conflicts: no order from the customer, the agent's maker org, staff or runner
   operators ever rests or fills.
9. Signed settlement: the chosen market settles only from a valid signed result
   for a task in running.
10. Durability: a command is acknowledged only after its journal row commits.
```

### `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(git *)", "Bash(docker *)"
    ],
    "deny": ["Read(**/.env*)", "Edit(/data/**)", "Bash(rm -rf /*)"]
  },
  "hooks": {
    "SessionStart": [{ "hooks": [
      { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.sh" }] }],
    "PreToolUse": [{ "matcher": "Edit|Write", "hooks": [
      { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect.sh" }] }],
    "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [
      { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/check.sh", "timeout": 120 }] }],
    "Stop": [{ "hooks": [
      { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-tests.sh", "timeout": 900 }] }]
  }
}
```

### `.claude/hooks/protect.sh`

```bash
#!/usr/bin/env bash
# Block edits to secrets, journal data and lockfiles.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.env|*.env.*|*/data/*|*.db|*.db-wal|*/package-lock.json)
    echo "Blocked: $f is protected (secrets, journal data or lockfile)." >&2; exit 2;;
esac
exit 0
```

### `.claude/hooks/check.sh`

```bash
#!/usr/bin/env bash
# After a TypeScript edit, typecheck the package that owns the file.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in *.ts|*.tsx) ;; *) exit 0;; esac
d=$(dirname "$f")
while [ "$d" != "/" ] && [ ! -f "$d/package.json" ]; do d=$(dirname "$d"); done
[ -f "$d/tsconfig.json" ] || exit 0
out=$(cd "$d" && npx tsc --noEmit 2>&1) || { echo "$out" | tail -30 >&2; exit 2; }
exit 0
```

### `.claude/hooks/stop-tests.sh`

```bash
#!/usr/bin/env bash
# Don't let Claude finish with failing tests.
input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active')" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0
git diff --quiet HEAD 2>/dev/null && exit 0
out=$(npm test 2>&1) || { echo "Tests failing; fix before finishing:" >&2; echo "$out" | tail -40 >&2; exit 2; }
exit 0
```

### `.claude/hooks/session-start.sh`

```bash
#!/usr/bin/env bash
cd "$CLAUDE_PROJECT_DIR" || exit 0
echo "Branch: $(git branch --show-current 2>/dev/null), uncommitted files: $(git status --porcelain 2>/dev/null | wc -l)"
ls -t docs/plans/*.md 2>/dev/null | head -1 | sed 's/^/Latest plan: /'
tail -5 docs/BUILD_LOG.md 2>/dev/null
```

### `.claude/agents/exchange-auditor.md`

```markdown
---
name: exchange-auditor
description: Reviews every change to src/engine, src/bots, fees, settlement or the journal against docs/INVARIANTS.md. Use proactively before reporting such work done.
tools: Read, Grep, Glob, Bash
model: opus
---
You audit an exchange engine. You never edit files.

Read docs/INVARIANTS.md and docs/SPEC_DECISIONS.md, then the diff
(git diff HEAD~1 or main...HEAD). For each invariant report PASS or FAIL with
file:line evidence. Then check for:
- Date.now(), Math.random(), network calls, or order-dependent iteration
  inside src/engine
- any state change before validation has finished
- float arithmetic or division on money
- a fee, lock or escrow amount computed in two different places
- conflict rules missing on any order path, including house bots
- a new command that is not journaled, replay-tested and in the golden journal
Run npm test, then the property tests with KQ_PROP_RUNS=20000, and report.
End with BLOCKERS (must fix) and RISKS (should fix). No praise.
```

### `.claude/agents/runner-auditor.md`

```markdown
---
name: runner-auditor
description: Reviews every change to runner/ and the runner endpoints for isolation, secret handling, test integrity and signatures. Use proactively before reporting runner work done.
tools: Read, Grep, Glob, Bash
model: opus
---
You audit the service that decides market results. You never edit files.
Check: fresh container per job; non-root; resource limits; egress allowlist;
agent keys never in logs (grep the log redaction); protected paths restored from
the pinned commit before tests run; baseline check before trading opens; HMAC
over the raw body with constant-time compare, timestamp window and single-use
runId; results accepted only for tasks in running; the runner never trades.
Run the runner tests. End with BLOCKERS and RISKS. No praise.
```

### `.claude/agents/security-reviewer.md`

```markdown
---
name: security-reviewer
description: Reviews API routes, auth, API keys, rate limits, admin endpoints and what task packets expose. Use before shipping any new route.
tools: Read, Grep, Glob
model: opus
---
You review security. You never edit files. For every route: who can call it,
how the caller is authenticated, zod validation on body/params/query, conflict
checks, rate limits, error messages that leak nothing, secrets never returned.
API keys stored only as SHA-256 hashes. End with BLOCKERS and RISKS. No praise.
```

### `.claude/agents/ui-reviewer.md`

```markdown
---
name: ui-reviewer
description: Compares screenshots of web or mobile screens with docs/design/ and docs/DESIGN_SYSTEM.md. Use after any UI change.
tools: Read, Grep, Glob, Bash
model: sonnet
---
You review UI. You never edit files. Take or read screenshots of the changed
screens (Playwright MCP for web, Expo MCP for mobile). Check: matches the design
image; only design tokens used; every state designed (thin book, no trades,
closed, running, settled, error, loading); tabular numerals for prices; colour
never the only signal; labels for screen readers; nothing clipped at 390 px or
at the largest text size. End with BLOCKERS and RISKS. No praise.
```

### `.claude/agents/docs-researcher.md`

```markdown
---
name: docs-researcher
description: Looks up current documentation (agent CLIs, model provider APIs, Expo, libraries) and returns a short cited summary. Use instead of guessing versions, flags or model IDs.
tools: Read, WebFetch, WebSearch
model: haiku
---
Find the official, current documentation for the question. Return at most 300
words: the answer, exact names/flags/versions, and the URL of each page used.
Say clearly when the docs are ambiguous.
```

### `.claude/skills/engine-command/SKILL.md`

```markdown
---
name: engine-command
description: Recipe for adding or changing an exchange command (createTask, placeOrder, settle and the rest). Use for any change to how the engine changes state.
---
1. In the plan, write the command in the spec's terms: inputs, every
   validation rule, every effect on cash, locks, escrow and positions.
2. Tests first: happy path; each rejection leaves the state hash unchanged;
   conflicts; a property test mixing the new command with all others under
   assertInvariants.
3. Validation runs completely before any change. Apply effects only after
   validation passes.
4. Time and ids come from the command or the engine counter, never the clock.
5. Add the command to the journal, a replay test, and the golden journal;
   explain the new golden hash in docs/BUILD_LOG.md.
6. Expose it over HTTP only through the new-endpoint skill.
7. Run npm test, then the exchange-auditor subagent; fix every BLOCKER.
```

### `.claude/skills/new-endpoint/SKILL.md`

```markdown
---
name: new-endpoint
description: Recipe for adding or changing an HTTP route in src/server. Use for any API change.
---
1. zod schema for body, params and query; reject unknown fields.
2. Authenticate (Bearer API key, runner secret, or admin key) and check role.
3. Conflict check for anything that trades or comments.
4. Call the Venue service; never touch engine state directly.
5. Errors are { error, code } with a 4xx status; no stack traces.
6. HTTP test for success, each auth failure and each validation failure.
7. Update the sdk types and the spec's API table in docs/PRODUCT_SPEC.md if the
   contract changed (record why in docs/SPEC_DECISIONS.md).
```

### `.claude/skills/new-screen/SKILL.md`

```markdown
---
name: new-screen
description: Recipe for building or reworking a web or mobile screen. Use whenever a task creates or substantially changes a screen.
---
1. Read docs/DESIGN_SYSTEM.md and the matching image in docs/design/ if any.
2. Data only from the API and the event stream; no mock data in screens.
3. Design every state: loading, empty, thin book, no trades, closed, running,
   settled, error.
4. Tokens only; tabular numerals for prices; mono for packets.
5. Accessibility: labels on every control, price and chart; colour never alone.
6. testIDs (mobile) / data-testid (web) on everything an end-to-end test touches.
7. Screenshot (Playwright MCP for web, Expo MCP for mobile), compare with the
   design, fix, then run the ui-reviewer subagent.
```

### `.claude/skills/ship/SKILL.md`

```markdown
---
name: ship
description: Final checks, roadmap update, commit and PR for the current work.
disable-model-invocation: true
---
1. npm test and npm run typecheck; stop and fix on any failure.
2. Tick finished items in docs/ROADMAP.md and the current docs/plans/ file.
3. Append a dated line to docs/BUILD_LOG.md: what changed, what's left.
4. Commit with a clear message; if a GitHub remote exists, push and open a PR
   with gh.
```

### `.mcp.json`

```json
{
  "mcpServers": {
    "playwright": { "type": "stdio", "command": "npx", "args": ["@playwright/mcp@latest"] },
    "expo": { "type": "http", "url": "https://mcp.expo.dev/mcp" }
  }
}
```

### `.gitignore`

```gitignore
node_modules/
dist/
data/
*.db
*.db-wal
*.db-shm
.env
.env.*
!.env.example
CLAUDE.local.md
.claude/settings.local.json
.claude/worktrees/
mobile/.expo/
mobile/ios/
mobile/android/
```

### `docs/BUILD_LOG.md`

```markdown
# Build log

Newest first. Each prompt appends what it did, what it decided, and anything
blocked (with exactly what the owner needs to provide).
```
