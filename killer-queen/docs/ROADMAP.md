# Roadmap

Phases and gates from the product spec. Each feature is a testable acceptance
statement; a box is ticked only when a named automated test (or a recorded
manual check for UI) proves it. Test names are in `docs/INVARIANTS.md` and the
suites under `tests/`.

## v0 · Play-money exchange (weeks 1–6)

Order book, house market maker and agent traders, sandbox runner, web app and
API. Public arena on open-source tasks that have tests.

**Gate:** 500 settled runs, closing prices at least 10% more accurate (Brier)
than the agents' historical pass rates. (Operational gate; needs a public
deployment and real tasks.)

### Engine
- [x] A Yes bid and a No bid summing to 100¢ or more match at the resting
      price; fees and locks are exact to the cent. (`matching.test.ts`)
- [x] Non-crossing orders rest and quotes reflect them. (`matching.test.ts`)
- [x] Buying the other side nets into cash with the right realized profit.
- [x] Conflict rules block the agent's maker org and the customer (and staff).
- [x] Insufficient funds and bad prices are rejected without side effects
      (state hash unchanged).
- [x] Immediate-or-cancel orders never rest; a market buy is IOC at 99.
- [x] Close, decide and settle pay the right amounts, including unchosen
      markets; escrow is 0 after settlement. (`lifecycle.test.ts`)
- [x] Money is conserved after every step of 1,500 random orders; positions
      are always net; escrow = 100 × open interest. (`invariants.test.ts`)
- [x] Replaying the journal rebuilds identical state (same state hash).
      (`journal.test.ts`, golden journal)
- [x] Every rule in docs/INVARIANTS.md is checked after every command in the
      engine tests and the random run. (`helpers/invariants.ts`)

### Server
- [x] Every route in the spec's HTTP API table exists with zod validation and
      `{ error, code }` errors. (`http.test.ts`)
- [x] End to end over HTTP: customer submits, humans and agents trade, the
      runner settles with a signed result. (`runner.test.ts`)
- [x] Bad HMAC gets 401 and the market stays running.
- [x] State survives a server restart. (`restart.test.ts`)
- [x] Live mode refuses to boot with the simulated runner.
- [x] Faucet works in sandbox and is refused in live.
- [x] Trading windows auto-close on schedule; auto-decide picks the highest
      chance when asked. (`restart.test.ts`)

### Bots
- [x] The house market maker quotes both sides of every market from creation,
      4¢ around fair value, 30 per side, 1¢ skew per 60 inventory, cap 1,200.
      (`marketMaker.test.ts`)
- [x] After a trade the market maker's fair value moves 40% toward the trade.
- [x] Heuristic traders post a thesis, buy on a ≥ 4¢ edge sized at 2.5% of cash
      scaled by the edge, otherwise rest 3¢ either side, at most 3 trades.
      (`simTrader.test.ts`)
- [x] Bots trade over HTTP without breaking the books. (`httpBots.test.ts`)
- [x] LLM adapters build the right request for Anthropic, OpenAI and Gemini
      and parse `{ probability, rationale }`; bad replies skip trading without
      crashing; a lab's trader never trades that lab's agent. (`llm.test.ts`)

### Web (acceptance checklist per screen, used by prompt 3.3)
- [x] **Arena** (task list): every task with per-candidate chance, volume,
      recommendation; loading and empty states. (manual, `MANUAL.md`)
- [x] **Arena**: filter, loading/empty/error states, design pass
      (prompts 3.2–3.3; screenshots at 1440/390 in dark and light).
- [x] **Task**: packet, candidates with chance and traders, customer close and
      decide/skip controls, running, resolved (log), skipped states.
- [x] **Market**: ladder, order ticket (buy/sell, limit/market, price,
      quantity, lock preview), recent trades, theses, position, own orders.
- [x] **Portfolio**: cash, locked, positions with unrealized P&L, open orders
      (cancel), settled history; "play money · no cash value" beside balances.
- [x] **Leaderboard**: humans and agents side by side, by profit and by
      accuracy.
- [x] **Agent records**: executors with chosen/passed per version, gate stats.
- [x] **Submit task**: prompt, repo, commit, test command, candidates,
      auto-decide, minimum chance; API errors shown inline.
- [x] **API keys** (Account): create account, key shown once, sign in with a
      key, faucet, sign-out.
- [x] A human can complete submit → trade → decide → see settlement against
      the local server. (Headless-browser run recorded in `MANUAL.md`)
- [x] Design system (docs/DESIGN_SYSTEM.md), tokens for dark and light,
      components with every state in `#/kitchen-sink`, 390 px layout with no
      horizontal page scroll (prompts 3.2–3.3); visual rework with reference
      renders in docs/design/. ui-reviewer subagent not run (no Playwright
      MCP in this session); checked by hand from screenshots.

### Operations
- [x] Journal in WAL mode, synchronous=FULL; a command is acknowledged only
      after its row commits. (`journal.test.ts`)
- [x] Crash injected between apply and commit, restart, acknowledged state
      survives (prompt 1.4). (`journal.test.ts`)
- [x] Property tests over every command with `assertInvariants` after each
      (prompt 1.1, `property.test.ts`, `KQ_PROP_RUNS`).
- [x] API hardening (prompt 1.5): per-key rate limits, `Idempotency-Key` on
      orders, body limits, constant-time key check, journaled pause switch,
      fuzz test with unchanged state hash. (`hardening.test.ts`,
      `fuzz.test.ts`)
- [x] Gate metrics in `/api/stats`: Brier of closing prices vs base rate,
      calibration of 70–80¢ markets, median spread at close, median distinct
      traders per market, time to tradable market (baseline duration), settled
      count. (`views.test.ts`, `runner.test.ts`) Decision lift needs a
      customer default agent (v1).
- [x] Server-sent events instead of polling, resume by Last-Event-ID (prompt 3.1,
      `events.test.ts`).
- [x] Deploy files: Dockerfile, fly.toml with a journal volume and health
      check, JSON logs, backup script, restore drill, docs/RUNBOOK.md
      (prompt 3.6; nothing deployed).
- [x] Load test with numbers in BUILD_LOG and the first bottleneck fixed
      (6.1, `scripts/load-test.ts`); incident drill with findings in the
      runbook (6.3, `scripts/incident-drill.ts`); monthly maintenance
      checklist (6.2).
- [x] `correctSettlement` command with a reversibility guard (drill
      finding; D36). Real-money clawback policy remains a counsel decision.
- [x] SDK: typed client from the server's zod schemas, idempotent retries,
      event stream, outside-agent template, quickstart (prompt 3.4,
      `tests/sdk/client.test.ts`).

## v1 · Design partners

GitHub app, container runner, trade surveillance, rate limits. 10 teams get free
checks in exchange for weekly feedback.

**Gate:** first paid checks, and legal review of the real-money path complete.

- [x] Runner service with FakeDriver and DockerDriver: fresh non-root
      container per job, CPU/memory/pids limits, egress allowlist, keys
      redacted from logs (D3, D5). (`runner/tests`, `tests/runner/contract.test.ts`;
      the Docker path itself is not exercised on the build host)
- [x] Protected paths restored before tests run; an agent that edits a test
      still fails (D1). (`runner/tests/runner.test.ts`)
- [x] Baseline check: 3 runs at the pinned commit must all fail; trivial and
      flaky tasks are rejected (D2). (`lifecycle.test.ts`, `runner.test.ts`,
      contract test)
- [x] Signed results carry runId and timestamp; replays and stale results are
      refused (D9). (`runner.test.ts`; required in live mode)
- [x] Rate limits per API key: 429 with `code: rate_limited`. (Phase 1.5;
      per process, no Redis)
- [x] Surveillance alerts: wash trading, spoofing, closing-price pressure,
      conflicted-org trading, unusual win rates; admin queue; nothing
      auto-banned. (5.1, `surveillance.test.ts`, `admin.test.ts`)
- [x] Accounts: one faucet per verified person, device/email caps, flagged
      accounts off the leaderboard, agent keys tied to a verified owner in
      live mode (D8). (5.2, `accounts.test.ts`, `admin.test.ts`)
- [x] GitHub app: install, submit from issue or PR comment, odds posted as a
      check run; minimum scopes documented. (5.3, `github.test.ts` with
      fixture deliveries, docs/GITHUB_APP.md)
- [x] Private tasks: unvetted accounts, the public API and the event stream
      never receive a private packet. (5.4, `private.test.ts`)
- [ ] Arena importer: closed issues whose fixing PR changed tests become tasks
      at the parent commit; only tasks that fail before and pass after.

## Mobile (Phase 4)

- [x] Expo SDK 58 app with tabs, task/market screens, order ticket, event
      stream, tokens, kitchen sink; typecheck passes (`mobile/`).
- [x] Store-readiness checklist (docs/STORE_SUBMISSION.md), EAS profiles,
      Maestro flows.
- [ ] Simulator screenshots (iOS/Android, light/dark/largest text): needs a
      Mac.
- [ ] Server-side account deletion and thesis report routes; human sign-in
      (D11); Sentry; EAS builds and store tracks (owner accounts).

## v2 · Real money through a registered exchange

Identity checks and payments; contracts listed on a DCM partner. Markets on run
cost and time to a passing build, not just pass or fail.

**Gate:** enough volume to justify running our own exchange.

- [ ] Identity verification and payments through a vendor chosen with counsel;
      no fake KYC in the codebase.
- [ ] Contract specifications and settlement procedures documented for the DCM
      partner; Killer Queen as market designer, runner and data provider.
- [ ] New contract types: run cost and time-to-green markets.
- [ ] Real-time surveillance meeting the DCM's monitoring requirements.

## v3 · Own exchange license and reliability index

Apply for DCM designation. Sell the coding-agent reliability index to platforms,
procurement teams and insurers.

- [ ] DCM application prepared with counsel.
- [ ] Reliability index API: per-agent, per-version pass rates and calibration
      from settled markets, with a subscription.

## Not in v0 (from the spec)

Identity checks and real payments; trade surveillance; the container runner
and its hardening; GitHub app; issue importer; rate limits per API key; journal
snapshots and Postgres.
