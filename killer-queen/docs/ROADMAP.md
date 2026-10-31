# Roadmap

Phases and gates from the product spec. Each feature is a testable acceptance
statement; a box is ticked only when a named automated test (or a recorded
manual check for UI) proves it.

## v0 · Play-money exchange (weeks 1–6)

Order book, house market maker and agent traders, sandbox runner, web app and
API. Public arena on open-source tasks that have tests.

**Gate:** 500 settled runs, closing prices at least 10% more accurate (Brier)
than the agents' historical pass rates.

### Engine
- [ ] A Yes bid and a No bid summing to 100¢ or more match at the resting
      price; fees and locks are exact to the cent.
- [ ] Non-crossing orders rest and quotes reflect them.
- [ ] Buying the other side nets into cash with the right realized profit.
- [ ] Conflict rules block the agent's maker org and the customer (and staff).
- [ ] Insufficient funds and bad prices are rejected without side effects
      (state hash unchanged).
- [ ] Immediate-or-cancel orders never rest; a market buy is IOC at 99.
- [ ] Close, decide and settle pay the right amounts, including unchosen
      markets; escrow is 0 after settlement.
- [ ] Money is conserved after every step of 1,500 random orders; positions
      are always net; escrow = 100 × open interest.
- [ ] Replaying the journal rebuilds identical state (same state hash).
- [ ] Every rule in docs/INVARIANTS.md is checked after every command in the
      property test.

### Server
- [ ] Every route in the spec's HTTP API table exists with zod validation and
      `{ error, code }` errors.
- [ ] End to end over HTTP: customer submits, humans and agents trade, the
      runner settles with a signed result.
- [ ] Bad HMAC gets 401 and the market stays running.
- [ ] State survives a server restart.
- [ ] Live mode refuses to boot with the simulated runner.
- [ ] Faucet works in sandbox and is refused in live.
- [ ] Trading windows auto-close on schedule; auto-decide picks the highest
      chance when asked.

### Bots
- [ ] The house market maker quotes both sides of every market from creation,
      4¢ around fair value, 30 per side, 1¢ skew per 60 inventory, cap 1,200.
- [ ] After a trade the market maker's fair value moves 40% toward the trade.
- [ ] Heuristic traders post a thesis, buy on a ≥ 4¢ edge sized at 2.5% of cash
      scaled by the edge, otherwise rest 3¢ either side, at most 3 trades.
- [ ] Bots trade over HTTP without breaking the books.
- [ ] LLM adapters build the right request for Anthropic, OpenAI and Gemini
      and parse `{ probability, rationale }`; bad replies skip trading without
      crashing; a lab's trader never trades that lab's agent.

### Web (acceptance checklist per screen, used by prompt 3.3)
- [ ] **Arena** (task list): every open task with per-candidate chance, volume,
      recommendation; states: loading, empty, closed, running, settled.
- [ ] **Task**: packet, one book per candidate, trades, theses; customer sees
      close and decide/skip controls; states: open, closed (decide step),
      running, resolved/skipped, error.
- [ ] **Market**: ladder, order ticket (buy Yes/No, limit or market, price,
      quantity), recent trades, theses, position; thin-book and no-trades
      states.
- [ ] **Portfolio**: cash, locked, positions with unrealized P&L, open orders
      (cancel), settled history; "Play money - no cash value" beside balances.
- [ ] **Leaderboard**: humans and agents side by side, by profit and by
      accuracy.
- [ ] **Agent records**: executors with chosen/passed per version.
- [ ] **Submit task**: prompt, repo, commit, test command, candidates,
      auto-decide, minimum chance; validation errors shown inline.
- [ ] **API keys**: create account, key shown once, copy; sign-out.
- [ ] A human can complete submit → trade → decide → see settlement against
      the local server (docs/MANUAL.md click path).

### Operations
- [ ] Journal in WAL mode, synchronous=FULL; a command is acknowledged only
      after its row commits.
- [ ] Gate metrics in `/api/stats`: Brier of closing prices, calibration of
      70–80¢ markets, median spread at close, median distinct traders per
      market, time to tradable market, settled count.
- [ ] Deploy: Dockerfile, persistent volume for the journal, nightly backup and
      restore drill (prompt 3.6).

## v1 · Design partners

GitHub app, container runner, trade surveillance, rate limits. 10 teams get free
checks in exchange for weekly feedback.

**Gate:** first paid checks, and legal review of the real-money path complete.

- [ ] Container runner: fresh non-root container per job, CPU/memory/process
      limits, egress allowlist, spend-capped keys redacted from logs (D3, D5).
- [ ] Protected paths restored before tests run; an agent that edits a test
      still fails (D1).
- [ ] Baseline check: 3 runs at the pinned commit must all fail; trivial and
      flaky tasks are rejected (D2).
- [ ] Signed results carry runId and timestamp; replays and stale results are
      refused (D9).
- [ ] Rate limits per API key: 429 with `code: rate_limited`.
- [ ] Surveillance alerts: wash trading, spoofing, closing-price pressure,
      conflicted-org trading, unusual win rates; admin queue; nothing
      auto-banned.
- [ ] Accounts: one faucet per verified person, device/email caps, flagged
      accounts off the leaderboard (D8).
- [ ] GitHub app: install, submit from issue or PR comment, odds posted as a
      check run; minimum scopes documented.
- [ ] Private tasks: unvetted accounts, the public API and the event stream
      never receive a private packet.
- [ ] Arena importer: closed issues whose fixing PR changed tests become tasks
      at the parent commit; only tasks that fail before and pass after.

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
