# Killer Queen — Coding Prompt Pack

For **Claude Code** (and Cursor, if you run a slice here).  
Companion to `Killer Queen — Product Doc.pdf`.  
Written by Cursor so Claude does not invent architecture that fights the spec.

**Stack recommendation:** follow the product doc exactly — TypeScript on Node 22.13+, `tsx`, Express 4 + zod, append-only SQLite journal via `node:sqlite`, Preact + esbuild, Node built-in test runner. Do not pick Python/Go unless Joseph explicitly overrides. A reference implementation of this spec already exists in TypeScript; this pack rebuilds it in ordered slices.

---

## How you and Claude use this

1. Paste **Block A (global rules)** into Claude Code once at the start of the project (or pin it as `CLAUDE.md`).
2. Paste **one numbered prompt at a time**. Never dump Prompt 04 while Prompt 03 is unfinished.
3. After each prompt, Claude must print the **DONE WHEN** checklist. You only paste the next prompt when every box is true.
4. If a **permutation** applies, paste the matching branch *instead of* the default prompt, not in addition to it.
5. Cursor’s job later is implementation inside the repo. Claude’s job with this pack is to *build the code in slices*. Do not ask Claude to rewrite the product doc.

### Stop rule (put this in every session)

> Finish only the current prompt. Do not scaffold later folders “while you are here.” Do not start the web app during the engine prompts. Do not add bots during the matching-engine prompts. If you notice a later prompt’s work, write one line in `PROGRESS.md` and stop.

### After every prompt

Claude updates `PROGRESS.md`:

```
## Prompt NN — <title>
Status: DONE | BLOCKED
Files touched:
Tests added:
DONE WHEN: (copy the checklist, mark each)
Notes / deviations from product doc:
Next prompt: NN+1 (or permutation X)
```

You read `PROGRESS.md`. If Status is DONE, paste the next prompt.

---

## Block A — Global rules (paste once)

```
You are building Killer Queen, a Kalshi-style play-money exchange where humans and AI agents trade Yes/No contracts on whether a coding agent will pass a task’s tests.

Read and obey:
- The product doc (Killer Queen — Product Doc).
- This prompt pack. Current slice only.

Non-negotiable:
- All money is integer cents. A contract pays 100¢. Prices are 1–99¢.
- Every state change is one of ten journaled commands: createAccount, deposit, upsertExecutor, createTask, placeOrder, cancelOrder, comment, closeTask, decide, settle.
- The engine validates a command completely before mutating. Reject = no side effects.
- Order and fill ids come from a counter so journal replay rebuilds identical state.
- Invariant: sum(cash + locked) over accounts + sum(escrow) over markets == total deposits. Always.
- Positions are always net: never Yes and No at once on the same market. Buying the other side redeems pairs for 100¢ immediately.
- A Yes bid at p matches a No bid at (100 − p) or better. Fill price is the resting order’s price.
- Takers pay 1¢/contract to the house (role house). Makers and the house market maker pay 0.
- Conflicts: only trader and market-maker accounts trade. Block if account.org makes that coding agent, account.org matches the customer org, or the account submitted the task. Customers never trade their own tasks.
- No self-trades.
- GTC rests; IOC never rests. A market buy is IOC at 99¢. Selling Yes at p is buying No at 100 − p.
- Task status: open → closed → running → resolved, or closed → skipped.
- Unchosen markets settle at closing price (not the test result). Closing price: midpoint of best bid/ask if both exist and spread ≤ 20¢; else last trade; else 50¢. Round to integer cents.
- Chosen market: Yes pays 100 if tests pass else 0; No is the mirror. Escrow must empty exactly.
- Open orders cancel at close; locks return.
- API errors: JSON { "error", "code" } with 4xx.
- API keys stored as SHA-256 hashes only; returned once at create.
- KQ_MODE=sandbox by default. live turns off play money, open signup, and the simulated runner.
- The runner never trades. Simulated runner is for laptop; live mode must refuse to start with it.
- House LLM traders must not trade their own lab’s coding agent (org conflict).
- Tests use node:test. Do not add Jest/Vitest unless I say so.
- Repo layout from the product doc:
  src/engine, src/bots, src/server, src/web, scripts, tests
- TypeScript, Node ≥ 22.13, tsx, Express 4, zod, node:sqlite, Preact, esbuild.

When this slice is done, print the DONE WHEN checklist with pass/fail. Do not start the next slice.
```

---

## Permutation index

Use the **default path** unless Joseph says otherwise.

| ID | When | What changes |
| --- | --- | --- |
| **P-TS** (default) | Normal | TypeScript stack as specified |
| **P-EXISTING** | You already have a TS repo / reference clone | Skip Prompt 00; start at Prompt 01 against existing files. Do not re-init git or rewrite package.json unless broken |
| **P-NO-LLM** | No Anthropic/OpenAI/Gemini keys | Prompt 12 becomes stub adapters + tests only; house bots = `mm,sim` |
| **P-HTTP-BOTS** | You want bots as a separate process from day one | After Prompt 10, use Prompt 11B instead of 11 |
| **P-WEB-FIRST** | You need a clickable demo before bots | After Prompt 09, jump to Prompt 13, then return to 10–12. Engine and API must already work |
| **P-V1-NOW** | Skip arena polish | After Prompt 16, start V1 prompts. Do not mix V1 into v0 slices |

If two permutations conflict, stop and ask Joseph. Do not guess.

---

## Suggested Claude Code session cuts

Paste 1–2 prompts per session. Natural session boundaries:

| Session | Prompts | Outcome |
| --- | --- | --- |
| 1 | 00–01 | Repo + types |
| 2 | 02–03 | Accounts + matching |
| 3 | 04–05 | Task lifecycle + views |
| 4 | 06 | Property tests (slow, keep isolated) |
| 5 | 07–08 | Journal + HTTP |
| 6 | 09 | Simulated runner + settle path |
| 7 | 10–12 | House bots |
| 8 | 13–14 | Web app + E2E |
| 9 | 15–16 | Boot, restart, demo seed |
| 10+ | V1-01… | Only after v0 DONE WHEN on Prompt 16 |

---

# V0 prompts

## Prompt 00 — Scaffold

**Paste after:** Block A.  
**Do not paste if:** permutation P-EXISTING.

```
PROMPT 00 — Scaffold Killer Queen v0

Create the repo at the current working directory (or ./killer-queen if this folder is not empty).

Do:
- git init if needed
- package.json: name killer-queen, type module, engines.node >= 22.13
- scripts: "dev", "test", "build:web", "start"
- tsconfig for NodeNext / strict
- folders: src/engine src/bots src/server src/web scripts tests
- .env.example with every variable from the product doc:
  KQ_MODE=sandbox
  RUNNER=simulated
  RUNNER_SECRET=
  DB_PATH=data/killer-queen.db
  STARTING_CASH_CENTS=100000
  HOUSE_BOTS=mm,sim,llm
  ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY
  ANTHROPIC_MODEL OPENAI_MODEL GEMINI_MODEL
  ADMIN_KEY
- README with how to run tests and the server
- PROGRESS.md with Prompt 00 in progress
- .gitignore: node_modules, data/, dist/, .env

Do not implement the engine, API, or web UI.
Add one smoke test that asserts 1+1=2 so `npm test` works.

DONE WHEN:
- [ ] npm test exits 0
- [ ] folder layout matches the product doc
- [ ] .env.example lists every config key
- [ ] no matching, no HTTP server, no Preact app yet

STOP. Wait for Prompt 01.
```

---

## Prompt 01 — Types and commands

**Paste after:** Prompt 00 DONE.

```
PROMPT 01 — Domain types and command union

Implement TypeScript types only (plus tiny helpers). No matching yet.

Entities (fields from the product doc):
- Account: id, name, kind (human|agent|system), role (trader|customer|admin|market_maker|house), org, keyHash, cash, locked, deposited
- CodingAgent / Executor: id, name, org, version, plus chosen/passed counters for packets
- Task: id, customer, title, prompt, repo, commit, testCommand, candidateAgents, status, closesAt, autoDecide, minimumChance, chosenAgent, passed, runLog
- Market: id (`${taskId}:${executorId}`), status, closingPrice, settlementPrice, outcome, lastPrice, volume, openInterest, escrow
- Order: id, market, account, side (yes|no), price, quantity, filled, status, tif (gtc|ioc), lockedRemaining
- Fill, Position, Comment as specified

Commands (discriminated union). Each command has a type tag and payload:
createAccount, deposit, upsertExecutor, createTask, placeOrder, cancelOrder, comment, closeTask, decide, settle

EngineResult:
- ok: { state patches or events }
- err: { code: string, error: string } with no mutation

Add:
- cents helpers (assert integer, clamp price 1–99)
- sha256 helper for API keys (node:crypto)
- id/counter types: nextOrderId, nextFillId as functions of engine state, not Date.now or random

Unit tests:
- price 0 and 100 are invalid
- market id format
- command union is exhaustive in a switch (helper that throws on never)

DONE WHEN:
- [ ] types compile
- [ ] tests for cents/price/market id pass
- [ ] no order book logic exists yet

STOP. Wait for Prompt 02.
```

---

## Prompt 02 — Accounts, deposits, executors

**Paste after:** Prompt 01 DONE.

```
PROMPT 02 — Account state machine

Implement in-memory Engine that applies:
- createAccount
- deposit
- upsertExecutor

Rules:
- New trader/agent in sandbox starts with STARTING_CASH_CENTS (pass in as config; default 100000). Record it as deposited.
- createAccount returns the raw API key once; engine stores only SHA-256 hash.
- kind/role/org as specified. One house fee account (role house) created at boot (Prompt 15 will call this; for now allow a seedHouse() helper used by tests).
- deposit increases cash and deposited.
- upsertExecutor is idempotent on id; org+version matter for conflict rules later.
- Reject unknown commands with a code, no throw for expected validation errors.

Tests:
- createAccount then authenticate by hashing the returned key
- duplicate account id rejected
- deposit insufficient/negative rejected with no change
- cash/locked/deposited integers only

DONE WHEN:
- [ ] those commands work
- [ ] invariant holds (no markets yet, so cash+locked == deposited)
- [ ] no placeOrder yet

STOP. Wait for Prompt 03.
```

---

## Prompt 03 — Matching, netting, fees, conflicts

**Paste after:** Prompt 02 DONE.  
This is the hardest v0 slice. Keep it isolated.

```
PROMPT 03 — Central limit order book

Implement placeOrder and cancelOrder against in-memory books.

Book: per market, Yes bids and No bids. A Yes ask is a No bid from the other side.

Exact rules from the product doc:

1. Lock. Buy n at p locks n * (p + fee). Fee is 1¢ if taker (unknown until match — lock the max: n * (p + 1) for trader buys; market maker fee 0). If you cannot implement fee-on-taker lock perfectly yet, lock n*(p+1) for non-MM traders and refund unused fee lock on rest/cancel. Document the choice in PROGRESS.md. Insufficient funds → reject, no change.

2. Cross. Incoming Yes bid at p matches resting No bids with price >= (100-p), highest price first, then oldest. Incoming No matches Yes the same way.

3. Price. Fill at the resting order’s price. Taker pays (100 - restingPrice) for the complementary side and is refunded the difference vs its limit lock.

4. Create contracts. Each fill: market.escrow += 100 * qty; both sides get positions; volume and lastPrice update; openInterest = escrow/100.

5. Net. If an account holds Yes and No, redeem min(Yes,No) pairs for 100¢ each immediately. Realized P&L = 100 - avg cost of the two sides (define avg cost from Yes cost / No cost fields). Positions always net.

6. No self-trades. Skip own resting orders; do not match them.

7. TIF. GTC rests leftover. IOC cancels leftover (never rests). Market buy = IOC buy Yes at 99. Selling Yes at p = buying No at (100-p). If the seller has no Yes, reject (or treat as opening No — product says “Selling Yes is the same as buying No”. Implement: action buy|sell in the command; sell Yes => buy No at 100-p, and if they hold Yes it will net).

8. Fees. Taker 1¢/contract to house account. Maker 0. House MM 0. Fee does not go into escrow.

9. Conflicts. Reject if account role is not trader or market_maker; if account.org === executor.org for that market; if account.org === customer.org; if account.id === task.customerId.

Also: cancelOrder by owner only; unlock remaining; filled orders cannot be cancelled.

You will need a minimal createTask/createMarket in tests (can be a test-only seedMarket() that inserts an open market without the full task state machine). Keep seedMarket in tests or a test util, not as a public command, unless it is easier to implement a stub createTask that only opens markets. If you stub createTask, it must still be the real command shape so Prompt 04 can fill it in.

Tests that must pass (from the product doc):
- Yes bid and No bid summing to ≥ 100¢ match at the resting price; fees and locks exact
- Non-crossing orders rest; quotes reflect them
- Buying the other side nets into cash with correct realized profit
- Conflict rules block the agent’s maker and the customer
- Insufficient funds and bad prices rejected with no side effects
- IOC never rests
- No self-trade

DONE WHEN:
- [ ] all tests above pass
- [ ] invariant holds after each test
- [ ] close/decide/settle are still unimplemented

STOP. Wait for Prompt 04.
```

---

## Prompt 04 — Task lifecycle: close, decide, settle

**Paste after:** Prompt 03 DONE.

```
PROMPT 04 — createTask, comment, closeTask, decide, settle

createTask:
- Customer account required (role customer)
- Opens one market per candidate executor
- Status open, closesAt = now + default 10 minutes (config TRADING_WINDOW_MS=600000; tests should pass a closesAt or a clock)
- Inject a Clock interface { now(): number } so tests are deterministic. No Date.now sprinkled in the engine.

comment:
- Trader posts thesis + optional stated probability 1–99
- Cannot comment if conflict-blocked from that market

closeTask:
- Customer or clock/auto: status closed
- Cancel all open orders, return locks
- Record closingPrice per market using:
  if bestBid and bestAsk exist AND (bestAsk-bestBid) <= 20: round((bestBid+bestAsk)/2)
  else if last trade exists: lastPrice
  else 50
- Markets that will not be chosen stay closed until settle; they do not go to running

decide:
- Payload { executorId } or null to skip
- If null: status skipped; later settle unchosen rules for all, or settle immediately at close prices — implement: skip means no runner; all markets settle at closing price in this command or a follow-up settle. Prefer: decide(null) marks skipped and settles all markets at closing price in the same command (document in PROGRESS.md).
- If executorId: status running, chosenAgent set; only that market waits for settle-on-result; others remain closed with closingPrice already set

settle:
- For chosen market: outcome pass/fail from payload; Yes gets 100 or 0; No the mirror; escrow empties
- For every other market: Yes holders get closingPrice, No holders get 100-closingPrice; escrow empties
- Pay into cash; positions go to 0; record settlementPrice and outcome
- Unchosen markets must not use the test result

Tests:
- Close, decide and settle pay the right amounts, including unchosen markets
- Escrow empty after settle
- Invariant after close and after settle
- Skip path
- Cannot trade after close
- Cannot decide twice

DONE WHEN:
- [ ] those tests pass
- [ ] Clock is injectable
- [ ] no HTTP, no SQLite yet

STOP. Wait for Prompt 05.
```

---

## Prompt 05 — Views: quotes, portfolio, leaderboard, stats, packets

**Paste after:** Prompt 04 DONE.

```
PROMPT 05 — Read models

Pure functions over engine state. No new commands.

Implement:
- quote(market): yesBid, yesAsk, noBid, noAsk, lastPrice, volume, openInterest, chance (yesAsk or last/mid — pick mid if both sides, else last, else 50). Document the chance formula; product uses Yes price as P(pass).
- taskView(taskId): task + every market quote + recommendation = highest Yes price among candidates (or none)
- portfolio(accountId): cash, locked, positions, open orders, settled history, P&L
- leaderboard: humans and agents side by side, rank by profit and by accuracy (Brier on positions vs outcomes where settled on tests; skip unchosen-at-close if too messy — document). At minimum: rank by realized + unrealized P&L
- executor records: chosen, passed, per version
- taskPacket(marketId): exact JSON shape from the product doc (marketId, title, prompt, repo, commit, testCommand, executor, closesAt, quote, lastPrice)

Tests:
- packet shape matches the documented example fields
- recommendation picks the highest-priced agent
- portfolio reflects netting
- leaderboard includes both human and agent accounts

DONE WHEN:
- [ ] views are deterministic from state
- [ ] no HTTP yet

STOP. Wait for Prompt 06.
```

---

## Prompt 06 — Money conservation and random orders

**Paste after:** Prompt 05 DONE.  
Keep this in its own session. It will catch Prompt 03/04 bugs.

```
PROMPT 06 — Invariant tests

Add tests/engine-invariants.test.ts (or similar):

1. After every step of 1,500 random orders, money is conserved:
   sum(cash+locked) + sum(escrow) === sum(deposited)
2. Positions never hold Yes and No at once
3. Escrow === 100 * openInterest
4. No negative cash/locked
5. After close+settle (pass and fail and skip), invariant still holds and all escrow is 0

Random generator must be seeded (fixed seed in CI) so failures reproduce.
Log the seed on failure.

Do not weaken the engine to make the test pass. Fix the engine.

DONE WHEN:
- [ ] 1500-order random test passes on a fixed seed
- [ ] pass/fail/skip settlement cases included
- [ ] runtime is acceptable (< ~10s)

STOP. Wait for Prompt 07.
```

---

## Prompt 07 — SQLite journal and replay

**Paste after:** Prompt 06 DONE.

```
PROMPT 07 — Append-only journal

src/server/journal.ts using node:sqlite (Node built-in). DB_PATH from config.

Behavior:
- append(command) is atomic with engine.apply
- On boot, replay all commands in order into a fresh engine
- Replay rebuilds identical order ids, fill ids, cash, books, positions
- Journal is the audit trail; do not update-in-place engine rows as source of truth

Suggested table: commands(seq INTEGER PK, type TEXT, json TEXT, ts INTEGER)

Tests:
- Replaying the journal rebuilds identical state (serialize comparable snapshot)
- Crash between append and in-memory apply cannot happen: apply in memory first then append, OR write-ahead with checksum — pick apply-then-append in a single function applyAndJournal, and document that a crash after apply before append loses the command (acceptable for v0) OR wrap both in a pattern tests can reason about. Prefer: serialize command to sqlite in the same function that applies, in one place so HTTP handlers never call engine.apply directly.

No HTTP yet except you may add a tiny helper used by later prompts.

DONE WHEN:
- [ ] replay test passes
- [ ] engine tests still pass
- [ ] node:sqlite only (not better-sqlite3 unless node:sqlite is painful — if you switch, document why)

STOP. Wait for Prompt 08.
```

---

## Prompt 08 — HTTP API and config

**Paste after:** Prompt 07 DONE.

```
PROMPT 08 — Express API

src/server: config from env (zod), boot engine+journal, routes from the product doc.

Auth: Authorization: Bearer <api key>. Lookup by SHA-256.

Implement now:
POST /api/accounts
GET /api/me
GET /api/portfolio
GET /api/tasks
GET /api/tasks/:id
GET /api/markets/:id
GET /api/agent/markets
POST /api/orders
DELETE /api/orders/:id
POST /api/markets/:id/comments
POST /api/tasks
POST /api/tasks/:id/close
POST /api/tasks/:id/decide
POST /api/wallet/faucet  (sandbox only; deposit 100000; reject in live)
GET /api/leaderboard
GET /api/stats
GET /api/executors

Stub for next prompt (401 unless you implement empty lists):
GET /api/runner/jobs
POST /api/runner/results

Errors: { error, code } 4xx. Validation via zod.

Do not implement bots or web UI.
Do not implement real identity checks.

HTTP tests (node:test + fetch against listen(0)):
- customer creates task, trader places orders, quotes move
- unauthorized 401
- faucet works in sandbox
- conflict rejected over HTTP

DONE WHEN:
- [ ] listed routes exist
- [ ] HTTP tests pass
- [ ] runner routes still stub/empty

STOP. Wait for Prompt 09.
```

---

## Prompt 09 — Simulated runner and signed settle

**Paste after:** Prompt 08 DONE.

```
PROMPT 09 — Runner protocol

Config RUNNER=simulated | external, RUNNER_SECRET.

GET /api/runner/jobs
- Authorization: Bearer RUNNER_SECRET
- Returns tasks in status running that need a result

POST /api/runner/results
- Header x-kq-signature: sha256=<hex HMAC-SHA256 of raw body with RUNNER_SECRET>
- Body { taskId, passed, log }
- 401 on bad signature
- Applies settle command

Simulated runner (src/server/runners/simulated.ts):
- When a task is decided, immediately (or on a short queue) produce a deterministic result
- Determinism: hash(taskId + prompt + executorId) → pass if last hex nibble even, else fail — OR use a test-only override in the task. Document it. Tests must be able to force pass/fail.
- Publish a fake log string
- Must not run in KQ_MODE=live; boot refuses if live && RUNNER=simulated

Tests:
- End to end over HTTP: customer, humans trade, decide, signed result settles chosen market; unchosen get close price
- Bad HMAC 401 and market still running
- live + simulated runner refuses to start

DONE WHEN:
- [ ] signed settle works
- [ ] E2E HTTP test from the product doc list is green for the customer/trader/runner path
- [ ] no house bots yet

STOP. Wait for Prompt 10 (default) or Prompt 13 if permutation P-WEB-FIRST.
```

---

## Prompt 10 — House market maker

**Paste after:** Prompt 09 DONE (or after 13 if P-WEB-FIRST already did web).

```
PROMPT 10 — House market maker bot

src/bots/marketMaker.ts

Rules from product doc:
- Starts from its own estimate of pass chance (for v0: executor historical pass rate, else 50)
- After each trade, move 40% of the way toward the new last trade price
- Quote 4¢ either side of fair value, 30 contracts per side
- Shift quotes 1¢ for every 60 contracts of inventory
- Stop adding to a side at 1,200 contracts inventory
- Inventory cap per market; customer fee pays for that risk (no extra code beyond cap)
- Uses market_maker role so fees are 0
- Quotes from the moment the market opens
- HOUSE_BOTS includes mm

Call path for v0: in-process client that applies commands (house bots call the engine directly). Also expose the same logic callable later over HTTP.

Tests:
- After createTask, both sides have quotes
- After a trade, fair value moves 40% toward last price (assert with a fixture)
- Inventory skew moves quotes
- Cap stops increasing a side at 1200

DONE WHEN:
- [ ] MM tests pass
- [ ] books are two-sided on a fresh task
- [ ] heuristic/LLM traders not started yet

STOP. Wait for Prompt 11 (or 11B if P-HTTP-BOTS).
```

---

## Prompt 11 — Heuristic house traders (default)

**Paste after:** Prompt 10 DONE.  
**Skip if:** P-HTTP-BOTS → use 11B.

```
PROMPT 11 — Simulated agent traders

src/bots/simTrader.ts

Each sim trader:
- Reads the task packet once
- Posts a thesis with probability + rationale (heuristic rationale string is fine)
- Buys when fair value beats the best quote by ≥ 4¢, size = 2.5% of cash * edge_in_cents/some_scale (product: 2.5% of cash scaled by the edge)
- Else rests bids 3¢ either side of fair value
- Trades at most 3 times per market
- Fair value: a cheap heuristic from packet signals (test command length, executor pass rate). Keep it deterministic.

HOUSE_BOTS includes sim.

Tests:
- Posts a comment
- Does not exceed 3 actions per market
- Respects org conflict (sim trader org must not match executor org)

DONE WHEN:
- [ ] tests pass
- [ ] still no LLM API calls

STOP. Wait for Prompt 12. If P-NO-LLM, paste Prompt 12-STUB instead.
```

---

## Prompt 11B — Bots over HTTP (permutation)

**Paste instead of Prompt 11 if P-HTTP-BOTS.** Then still do Prompt 12.

```
PROMPT 11B — House bots as HTTP clients

Same economic behavior as Prompt 11, but every order and comment goes through the HTTP API with the bot’s API key.
Add tests: bots trade over HTTP without breaking the books (product doc).
Keep MM in-process OR also HTTP — pick HTTP for both if you take this permutation, so there is one client.

DONE WHEN:
- [ ] HTTP bot tests pass
- [ ] invariant still holds

STOP. Wait for Prompt 12.
```

---

## Prompt 12 — LLM trader adapters

**Paste after:** Prompt 11 or 11B DONE.  
**If P-NO-LLM, use 12-STUB.**

```
PROMPT 12 — LLM house traders

src/bots/llm/*.ts

Adapters must:
- Anthropic Messages API, OpenAI Chat Completions, Gemini generateContent
- Force model reply JSON { "probability", "rationale" }
- Model ids from ANTHROPIC_MODEL, OPENAI_MODEL, GEMINI_MODEL
- Only enable a lab’s trader if that lab’s API key is set
- Org = the lab, so they never trade that lab’s coding agent
- Same trade rules as sim traders (edge 4¢, 2.5% cash * edge, rest 3¢, max 3 trades, post thesis first)
- HOUSE_BOTS includes llm

Tests (no live network):
- LLM adapters build the right request and parse the reply
- Invalid JSON / missing probability → skip trading, no throw that kills the process
- Conflict: Anthropic-org trader cannot order on a Claude executor market

Do not call real APIs in tests. Fixture the HTTP layer.

DONE WHEN:
- [ ] adapter tests pass
- [ ] missing keys mean that lab’s trader is off

STOP. Wait for Prompt 13 (skip if P-WEB-FIRST already completed 13).
```

```
PROMPT 12-STUB — No LLM keys

Implement adapter interfaces and tests with fixtures only.
HOUSE_BOTS default in .env.example becomes mm,sim
Parsing tests still required so turning keys on later is one prompt.

STOP. Wait for Prompt 13.
```

---

## Prompt 13 — Preact web app

**Paste after:** Prompt 12 DONE (or after 09 if P-WEB-FIRST).

```
PROMPT 13 — Kalshi-style web app

src/web + scripts/build-web (esbuild, one script)

Screens:
1. Sign up / create account (sandbox) — human trader or customer
2. Task list with quotes, chance, volume, recommendation
3. Task detail: packet, one book per candidate, trades, theses
4. Order ticket: buy Yes / buy No, limit price, quantity
5. Portfolio: cash, locked, positions, P&L
6. Leaderboard
7. Customer: submit task form (prompt, repo, commit, test command, candidate agents, auto-decide / min chance)
8. Customer: close trading, decide agent or skip
9. Settlement: pass/fail + log

UX: dark, dense, exchange-like. Live poll every 1s is fine for v0 (no websockets required).

Wire to the real API. Build into public/ and serve from Express.

No design-system rabbit hole. No auth providers.

DONE WHEN:
- [ ] npm run build:web produces a bundle
- [ ] a human can complete submit → trade → decide → see settlement in the UI against the local server
- [ ] you cannot fully automate the browser; add a short MANUAL.md click-path. Cursor will verify in a browser later.

STOP. Wait for Prompt 14.
```

---

## Prompt 14 — Full E2E HTTP suite + restart

**Paste after:** Prompt 13 DONE.

```
PROMPT 14 — Product-doc acceptance tests that are still missing

Add/confirm:
- State survives a server restart (journal replay; positions and books match)
- Bots trade over HTTP without breaking the books (if still only in-process, add one HTTP bot smoke or document leftover — prefer a real test)
- LLM adapters tests already exist
- Money conservation still passes
- End to end over HTTP: customer, humans and agents trade, runner settles with a signed result

npm test must be the single command.

DONE WHEN:
- [ ] the product doc list “Automated tests that pass today” is all green, except items explicitly V1
- [ ] list any missing test by name in PROGRESS.md

STOP. Wait for Prompt 15.
```

---

## Prompt 15 — Boot sequence, house accounts, clocks, live guard

**Paste after:** Prompt 14 DONE.

```
PROMPT 15 — Production-shaped boot

src/server/boot.ts:
- Load config
- If KQ_MODE=live && RUNNER=simulated → throw and exit
- Open journal, replay
- Ensure house fee account, MM account, sim trader accounts, LLM trader accounts (if keys)
- Start bot loops (setInterval is fine; do not overlap ticks)
- Start simulated runner loop if configured
- Auto-close tasks when clock.now() >= closesAt
- Auto-decide if task.autoDecide: pick highest Yes price if >= minimumChance, else skip
- Listen HTTP
- Graceful SIGINT: finish in-flight journal write

Tests:
- auto-close fires in tests with fake clock
- auto-decide picks highest quote
- live+simulated refused

DONE WHEN:
- [ ] npm run dev brings up a tradable venue
- [ ] restart restores state

STOP. Wait for Prompt 16.
```

---

## Prompt 16 — Demo seed and v0 freeze

**Paste after:** Prompt 15 DONE.

```
PROMPT 16 — Arena seed (play-money demo)

scripts/seed.ts (or boot in sandbox):
- Upsert executors: claude-code, codex, gemini-cli with orgs Anthropic / OpenAI / Google and a version string
- Create 3 public demo tasks with fake but realistic packets (cart API tests, flake fix, small feature)
- Optional: import is V1; do not scrape GitHub live
- Document how a trader hits faucet and how an external agent uses GET /api/agent/markets + POST /api/orders

Write AGENT_TRADER.md: the packet schema, auth, conflict rules, rate-limit note (none in v0).

Freeze v0:
- README lists what is in / out of v0 from the product doc
- PROGRESS.md Prompt 16 DONE
- Print remaining V1 backlog (do not implement)

DONE WHEN:
- [ ] fresh clone: npm install, npm test, npm run dev, seed, UI loads
- [ ] v0 out-of-scope list matches the product doc (identity, surveillance, container runner, GitHub app, importer, rate limits, journal snapshots/Postgres)

STOP. Do not start V1 until Joseph pastes V1-01.
```

---

# V1 appendix (after v0 freeze)

Paste these only after Prompt 16. One at a time.

## V1-01 — Rate limits per API key

```
V1-01 — Rate limits

Per API key limits (choose and document): 30 orders/min, 5 task creates/min, 60 GET/min.
429 with { error, code: "rate_limited" }.
Tests for window behavior.
Do not add Redis; in-memory per process is enough.

STOP after tests pass.
```

## V1-02 — Trade surveillance stubs

```
V1-02 — Surveillance (required before any real money; stub now)

Log and flag:
- account trading a conflict market (should already reject; alert if it ever succeeds)
- wash-like: same beneficial owner both sides (best-effort: same org both sides of a fill)
- price spike > 20¢ in < 10s with thin book
- runner result arriving before decide

Admin endpoint GET /api/admin/alerts with ADMIN_KEY.
No auto-bans in this prompt.

STOP after tests pass.
```

## V1-03 — Container runner service

```
V1-03 — External runner

Separate process. Poll GET /api/runner/jobs. For each job:
- fresh container, network only to package registries
- clone repo, checkout commit
- run agent CLI from config templates (claude -p, codex exec, etc.)
- run testCommand with timeout; exit 0 = pass
- POST signed results

Live mode requires this. Simulated runner must not start.

Laptop: docker compose with a stub image is OK.
Do not claim hardening is done. Add a SANDBOX.md threat list (network exfil, prompt injection writing tests, secrets in repo).

STOP. Do not implement GitHub app in this prompt.
```

## V1-04 — GitHub app task submit

```
V1-04 — GitHub app (v1 customer path)

App posts a task from a PR: prompt from PR body, repo, head commit, test command from workflow or config file.
Opens markets. When decided, runner uses that commit.
Permission: only the installing org’s customer account can decide.
No trading from the GitHub identity.

STOP after a documented install + one fixture test.
```

## V1-05 — Public arena importer

```
V1-05 — Importer

Turn open-source issues that have tests into public arena tasks.
Start with a manual YAML/JSON feed, not full GitHub scrape.
Idempotent on source URL.

STOP.
```

## V1-06 — Identity and live mode gates

```
V1-06 — Live mode product gates (not real KYC vendor)

When KQ_MODE=live:
- POST /api/accounts without admin provision → 403
- faucet → 404
- simulated runner → process refuses to boot
- document that real identity/payments need a lawyer + vendor; do not fake KYC

STOP.
```

## V1-07 — Journal snapshots / Postgres note

```
V1-07 — Snapshot every N commands so replay stays fast.

Still append-only. Snapshot is a serialized engine blob + seq number.
Do not migrate to Postgres in this prompt unless replay of 10k commands is already slow; if you do, keep the same command log semantics.

STOP.
```

---

## Mapping: product “tests that pass today” → prompts

| Product test | Prompt |
| --- | --- |
| Yes+No ≥ 100¢ match at rest price; fees/locks exact | 03 |
| Non-crossing rest; quotes | 03 |
| Buying other side nets; realized profit | 03 |
| Conflicts block maker and customer | 03 |
| Insufficient funds / bad prices, no side effects | 03 |
| IOC never rests | 03 |
| Close, decide, settle including unchosen | 04 |
| Money conserved after 1,500 random orders | 06 |
| Journal replay identical state | 07 |
| E2E HTTP customer/humans/agents/runner | 09 + 14 |
| State survives restart | 14–15 |
| Bots trade over HTTP without breaking books | 11B or 14 |
| LLM adapters request/parse | 12 |

## Mapping: “not in v0” → do not put in Prompts 00–16

Identity checks, real payments, trade surveillance, container runner, GitHub app, issue importer, rate limits, journal snapshots/Postgres.

---

## What Cursor vs Claude should own

| Artifact | Owner |
| --- | --- |
| Product definition, research, GTM | Claude (already) |
| This coding prompt pack | Cursor (this file) |
| Engine correctness, tests, invariants | Whoever is in the repo — prefer Cursor for matching-engine bugs |
| UI pixel polish, browser verification | Cursor |
| LLM trader prompt wording | Claude, then Cursor wires adapters |
| Legal / CFTC | Neither model; lawyer before dollars |

If Claude Code drifts from the ten commands, integer cents, or settlement rules, stop the slice and paste:

```
Revert the last slice’s architecture drift. Re-read Block A and the product matching/settlement section. Do not add extra commands or float dollars. Re-run npm test.
```

---

## One-line start

First message to Claude Code in an empty folder:

1. Attach the product PDF and this file.  
2. Paste **Block A**.  
3. Paste **Prompt 00**.  
4. Wait for DONE WHEN.  
5. Paste **Prompt 01**.

Do not paste Prompts 00–16 in one message.
