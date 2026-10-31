# Invariants

Every money and fairness rule as a numbered, testable statement, with the test
that proves it today. `assertInvariants` is `tests/helpers/invariants.ts`; the
fixture helpers `must`/`mustReject` call it after every command in every engine
and bot test, the random run calls it after every one of 1,500 orders, and
`tests/engine/property.test.ts` calls it after every command of `KQ_PROP_RUNS`
random sequences over all eleven commands (with a before/after hash on every
rejection and a replay-hash check per sequence).

1. **Conservation.** Sum of every account's cash and locked plus all market
   escrow equals total deposits, after every command.
   Proof: `assertInvariants` (conservation block), run after every command;
   `tests/engine/invariants.test.ts` "holds after every step and after close +
   decide + settle (pass)" and the fail/skip/infra_error cases.
2. **Escrow.** Each market's escrow equals 100 cents times its open interest,
   and open interest equals the sum of Yes positions and the sum of No
   positions.
   Proof: `assertInvariants` (per-market block); `tests/engine/matching.test.ts`
   "a Yes bid and a No bid summing to 100¢ or more match…" checks the exact
   amounts.
3. **Net positions.** No account holds Yes and No in the same market.
   Proof: `assertInvariants`; `tests/engine/matching.test.ts` "buying the other
   side nets into cash with the right realized profit" and "selling Yes at p
   is buying No at 100 − p".
4. **Locks.** An account's locked funds equal the sum over its open orders of
   remaining quantity times (price + fee rate); non-open orders lock nothing.
   Proof: `assertInvariants` (locks block); `tests/engine/matching.test.ts`
   "cancelOrder refunds the remaining lock" and "house market maker pays no
   fee and locks only the price".
5. **Settlement.** Escrow empties exactly; open orders are cancelled and
   unlocked at close; a settled market has no resting orders.
   Proof: `tests/engine/lifecycle.test.ts` "close cancels open orders, returns
   locks…", "decide settles unchosen markets…", "skip settles every market…",
   "infra_error settles the chosen market at the closing price";
   `tests/engine/invariants.test.ts` asserts escrow 0 and locked 0 after each
   finish; the engine throws if escrow does not reach 0.
6. **Rejection is free.** A rejected command leaves the state hash unchanged.
   Proof: `mustReject` in `tests/helpers/fixtures.ts` compares `stateHash`
   before and after for every rejection test (accounts, executors, matching,
   conflicts, lifecycle, createTask validation); `tests/engine/matching.test.ts`
   "a rejected order leaves the state hash unchanged"; sampled every 10th step
   of the random run.
7. **Determinism.** Replaying the journal produces a byte-identical state hash.
   Proof: `tests/engine/invariants.test.ts` "replaying the recorded commands
   into a fresh engine rebuilds the identical state hash";
   `tests/server/journal.test.ts` "replaying the journal rebuilds identical
   state" and the golden journal test; `tests/server/restart.test.ts` "state
   survives a server restart".
8. **Conflicts.** No order or comment from the customer, the customer's org,
   the agent's maker org, staff (customer, admin, house roles) or runner
   operators (who have no account) ever rests or fills.
   Proof: `tests/engine/matching.test.ts` "conflict rules" (both commands, each
   party); `tests/server/http.test.ts` "conflicts are rejected over HTTP with
   403"; `tests/server/fuzz.test.ts`; `tests/bots/simTrader.test.ts` "respects
   conflicts";
   `tests/bots/llm.test.ts` "an Anthropic-org trader cannot order on a Claude
   Code market".
9. **Signed settlement.** The chosen market settles only from a valid signed
   result for a task in running (or the sandbox admin route), with a fresh
   runId and a timestamp inside the window.
   Proof: `tests/server/runner.test.ts` "end to end…" (bad HMAC 401 and the
   market stays running; unsigned 401; stale timestamp 401; reused runId 409);
   `tests/engine/lifecycle.test.ts` rejects `settle` unless running;
   `tests/server/http.test.ts` "admin hand-settle needs the admin key".
10. **Durability.** A command is acknowledged only after its journal row
    commits; a failed append halts the venue; the journal is WAL with
    synchronous=FULL; a gap or corrupt row is reported, never skipped.
    Proof: `tests/server/journal.test.ts` "a failed append halts the venue",
    "WAL mode and synchronous=FULL are set", "a sequence gap or corrupt row is
    reported"; `tests/server/restart.test.ts`; crash injected between apply
    and commit: `tests/server/journal.test.ts` "acknowledged state survives a
    restart; the unacknowledged command is absent".
11. **Integer cents.** Cash, locked, deposited, escrow, prices and quantities
    are safe integers; prices 1–99.
    Proof: `assertInvariants`; `tests/engine/money.test.ts`;
    `tests/engine/accounts.test.ts` "deposit … fractional amounts are rejected";
    `tests/engine/matching.test.ts` "insufficient funds and bad prices are
    rejected without side effects".
12. **Books.** Each side of a book is sorted by price descending then
    sequence ascending and holds exactly the market's open orders; non-open
    markets have empty books.
    Proof: `assertInvariants` (book block);
    `tests/engine/matching.test.ts` "non-crossing orders rest … price priority
    then time".
13. **Pause switch.** While `state.trading.paused`, no order is accepted;
    cancels and settlement continue; the switch is journaled.
    Proof: `tests/engine/lifecycle.test.ts` "while paused no order is
    accepted…"; `tests/server/hardening.test.ts` "admin pause-trading is a
    journaled command…".
14. **Idempotent orders.** One `clientKey` per account places at most one
    order, across restarts.
    Proof: `tests/engine/lifecycle.test.ts` "a second order with the same
    client key is rejected…"; `tests/server/hardening.test.ts`
    "Idempotency-Key: a retry never places two orders, survives a restart".
15. **Private tasks stay private.** No route, list, stream or command hands a
    private task's packet, id or events to anyone but the customer, admins,
    house accounts and vetted traders.
    Proof: `tests/server/private.test.ts` (engine gate, every read route, agent
    markets, orders/comments, the event stream, leaderboard);
    `tests/engine/property.test.ts` mixes private tasks into random sequences.
16. **Identity limits.** At most 3 accounts per email hash and 5 per device
    hash; one faucet per 24 h per verified person across all their accounts;
    flagged accounts are off the leaderboard and cannot faucet but are never
    auto-banned.
    Proof: `tests/engine/accounts.test.ts` "identity limits and review";
    `tests/server/admin.test.ts`.
17. **Surveillance is reproducible.** Alerts are a pure function of state
    (and so of the journal); the same journal yields the same alerts.
    Proof: `tests/engine/surveillance.test.ts` (each alert kind must and must
    not fire; determinism and stable ids).

