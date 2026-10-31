# Architecture (v0, as built)

One deterministic engine behind one HTTP API, every change journaled, bots
in-process, a separate runner deciding results. This describes the code as it
is on 2026-10-31; differences from `docs/PRODUCT_SPEC.md` are listed at the end.

## Engine (`src/engine`)

Pure TypeScript, no I/O, no clock, no randomness.

- `types.ts`: entities (Account, Executor, Task, Market, Order, Fill, Position,
  Comment), the ten-command union, results, `EngineState`.
- `money.ts`: integer-cents helpers, price validity (1–99), half-up mid (D7),
  `sha256`, `hmacSha256`, constant-time compare, `marketId`.
- `state.ts`: `createState`, canonical JSON (`snapshot`) and `stateHash`.
- `engine.ts`: `Engine.apply(command)`. Each handler validates completely
  (reading only) and throws `EngineError(code)` on any rule; only then does it
  mutate. `apply` converts the throw into `{ ok: false, code, error }`, so a
  rejected command has no side effects. Successes return `{ ok, seq, data }`.
- `views.ts`: read models over state: `quote`, `bookLevels`, `packet`,
  `taskView` (+ recommendation), `marketView`, `portfolio`, `leaderboard`,
  `executorRecords` (per version), `stats` (gate metrics), `agentMarkets`.
- `venue.ts`: `Venue.apply(input)` stamps `at` from an injected `Clock`,
  applies, then calls the journal sink (`append(seq, command)`) and notifies
  listeners. `Venue.replay(command)` re-applies a journaled command verbatim.
  If the journal append throws, the venue halts (refuses every further
  command) because memory and disk would otherwise diverge (D21).

### The ten commands

| Command | Validates | Applies |
| --- | --- | --- |
| `createAccount` | name, kind, role, org, keyHash shape, unique id/key, one house | account with `startingCash` recorded as a deposit |
| `deposit` | account, positive integer, reason; faucet: trader role, 24 h cooldown | cash and deposited up; totals.deposited up |
| `upsertExecutor` | id shape, name, concrete non-"latest" version (D4) | insert or replace |
| `createTask` | customer role, required strings, distinct known candidates, closesAt in the future, minimumChance 1–99 | task (versions frozen) + one open market per candidate with an empty book |
| `placeOrder` | account, market open, conflict (D18), side/action/type, quantity, price, tif, house exists if fee, cash ≥ lock | lock, match (price then time, fills at resting price, taker fee to house, skip own orders), net pairs, rest (gtc) or cancel (ioc) |
| `cancelOrder` | account, order exists, owner or admin, open | remove from book, refund `lockedRemaining` |
| `comment` | account, market, conflict, text, probability 1–99 | append comment |
| `closeTask` | task exists, open, `by` is customer/admin or null | status closed; per market: closing price from the book (D7), then cancel every open order |
| `decide` | task closed, `by` is customer/admin or null, candidate or null | null: skipped, all markets settle at closing price; else chosen market → running, others settle at closing price (D14) |
| `settle` | task running, outcome, log string, unused runId | chosen market pays 100/0 or closing price (infra_error); task resolved |

Ids: `acc_n`, `tsk_n`, `o<n>`, `f<n>`, `c<n>` from engine counters that skip
explicitly supplied ids; replay therefore reproduces them (D12).

### Money flow of one fill

Taker (incoming order at limit `p`, fee rate `f` = 1 for traders, 0 for the
market maker) against a resting order at `r` for `q` contracts: taker pays
`q × (100 − r)` into escrow and `q × f` to the house, and gets
`q × (p − (100 − r))` back from its lock; the maker pays `q × r` into escrow
and gets its `q × f_maker` fee lock back. Escrow rises by exactly `100 × q`.
Netting (D16) redeems matched pairs for 100¢ out of escrow at once.

## Journal (`src/server/journal.ts`)

`node:sqlite`, table `commands(seq INTEGER PRIMARY KEY, type, json, ts)`, WAL
mode, `synchronous=FULL`. `append` requires `seq === last + 1` and inserts in
autocommit, so the row is durable before `Venue.apply` returns to the caller
(invariant 10). `readAll` checks the sequence is gap-free and every row parses;
`openVenue(path)` replays into a fresh engine and returns a journaling venue.
Rows are never updated or deleted; corrections are new commands.

`tests/golden/journal.json` is a fixed 22-command sequence with its expected
state hash; `scripts/make-golden.ts` regenerates it (explain the new hash in
`docs/BUILD_LOG.md`).

## Server (`src/server`)

- `config.ts`: zod over `process.env`; live + simulated → `ConfigError`; live
  needs a 16+ char `RUNNER_SECRET`.
- `auth.ts`: `Authorization: Bearer <key>` → `sha256` → `accountByKeyHash`;
  runner secret and admin key compared in constant time; `newApiKey()` makes
  `kq_` + 48 hex.
- `app.ts`: every route from the spec table (see `README.md`), zod schemas
  with `.strict()`, errors mapped by `statusForCode` (404 not found, 403
  conflict/forbidden, 401 auth, 409 state conflicts, 400 validation). Runner
  results verify `x-kq-signature: sha256=<HMAC of the raw body>`, the 5-minute
  timestamp window, and pass `runId` to the engine for single use (D9).
  Static `public/` is served with an SPA fallback when it exists.
- `runners/simulated.ts`: listens to venue `decide` events, queues the task,
  settles after a delay with the deterministic outcome (D20); `flush()` for
  tests; never trades.
- `seed.ts`: default executors (sandbox boot) and demo tasks (`npm run seed`).
- `boot.ts`: config → `openVenue` (replay) → house + market maker accounts →
  bot factories → simulated runner → `tick()` scheduler (auto-close due
  tasks, auto-decide: highest chance if ≥ `minimumChance`, else skip; then
  each bot once, ticks never overlap) → listen → graceful stop (timers, bots,
  runner, HTTP, journal).
- `main.ts`: `boot({ bots: houseBotFactories() })` with SIGINT/SIGTERM.

## House bots (`src/bots`)

`client.ts` defines `ExchangeClient` (open markets, trades, cash, place,
cancel, comment) with `InProcessClient` (calls the Venue, as the spec says
house bots do) and `HttpClient` (the public API with a key). The same bot
classes run on either:

- `marketMaker.ts`: fair value from the executor pass rate (or 50), 40% drift
  toward every trade in order, quotes `center ± 4`, 30 per side, `center` =
  round(fair) − trunc(inventory / 60), no new quote on a side at 1,200
  inventory; keeps an existing quote if it is at the target price with at
  least half its size left, otherwise cancels and re-quotes.
- `simTrader.ts`: `AgentTrader(name, client, estimator)`: reads the packet
  once through an `Estimator`, posts the thesis, then on each tick buys IOC at
  the best ask when the edge ≥ 4¢ (size per D24), otherwise rests bids 3¢
  either side once; at most 3 actions per market. `HeuristicEstimator` is a
  deterministic packet heuristic with a per-trader jitter.
- `llm/adapters.ts`: `AnthropicAdapter`, `OpenAiAdapter`, `GeminiAdapter`
  build one request each (model id from env) and extract the reply text;
  `parseEstimate` tolerates fences, percent strings and fractions;
  `LlmEstimator` turns any failure into `null` (the trader skips the market).
- `index.ts`: factories keyed by `HOUSE_BOTS`: `mm` (account `mm`, role
  market_maker, org Killer Queen), `sim` (`sim-1..n`, org "Killer Queen
  Sim"), `llm` (`llm-<lab>` with the lab as org, only when key and model are
  set).

## Web (`src/web`)

Preact + hash router, `fetch` against `/api`, API key in `localStorage`,
polls every second. Screens: Account, Arena, Task, Market, Portfolio,
Leaderboard, Agents (+ gate stats), Submit. `scripts/build-web.ts` bundles to
`public/` (gitignored); `npm run dev` builds then serves.

## Tests (`tests`)

`node --test` over `tests/**/*.test.ts` with `tsx`. `helpers/invariants.ts`
checks every state-checkable rule in `docs/INVARIANTS.md`; `helpers/fixtures.ts`
(`must`, `mustReject`, `seedExchange`, seeded PRNG) runs it after every
command; `helpers/server.ts` boots a real server on an ephemeral port with a
fake clock. Suites: engine (money, accounts, executors, matching, conflicts,
lifecycle, views, 1,500-order random run with pass/fail/skip/infra finishes,
replay determinism), server (journal + golden, HTTP, runner protocol, restart
+ scheduler, seed), bots (market maker, traders, LLM adapters, bots over HTTP
and through boot).

## Differences from the product spec (issues)

1. **Runner result body.** Spec: `{ taskId, passed, log }`. Built: that, plus
   optional `outcome` (`passed | failed | infra_error`), `runId` and
   `timestamp` (D9); in live mode the last two are required.
2. **When unchosen markets settle.** Spec says they settle at their closing
   price without saying when; built: inside `decide` (D14). `settle` touches
   only the chosen market.
3. **Faucet.** Spec: "Adds $1,000 of play money"; built: adds
   `STARTING_CASH_CENTS` with a 24-hour cooldown per account (D8).
4. **Closing-price rounding.** Spec: `round(mid)`; built: half rounds up (D7).
5. **Executor versions.** Packet example shows `"latest"`; built rejects it
   and freezes a concrete version per task (D4).
6. **Infrastructure failures.** Not in the spec; built: `infra_error` settles
   at the closing price and does not count in the record (D6).
7. **Admin settle.** Spec only names `ADMIN_KEY`; built:
   `POST /api/admin/tasks/:id/settle` with `x-admin-key`, sandbox only.
8. **Extra fields.** Order carries `feeRate`, `seq`, `lockedRemaining`;
   Market carries `closingSpread`; Position keeps a `closed` snapshot at
   settlement; Task carries `candidateVersions`, `protectedPaths`,
   `forceOutcome` (sandbox-only, hidden from packets), `outcome`, `runId`.
9. **Decision lift metric.** Needs the customer's default agent, which the
   data model does not hold; `/api/stats` reports the other gate metrics.
   Spec's "price history" on `GET /api/markets/:id` is the fill series.
10. **Speed metric.** Markets open inside `createTask`, so submission-to-
    tradable is reported as 0 ms; the baseline check (D2) will change that in
    Phase 2.
11. **Accounts.** Spec: "people sign up in the app with identity checks";
    built sandbox has open sign-up and live mode refuses it until v1 identity
    gates exist. API keys for everyone, no sessions yet (D11 is Phase 4).
12. **Not in v0** (identity, surveillance, container runner, GitHub app,
    importer, rate limits, snapshots/Postgres): not built, as the spec says.
