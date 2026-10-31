# Progress against the coding prompt pack

The build followed `KILLER_QUEEN_PROMPTS.md` Phase 0 (0.0 → 0.1 → 0.2-alt →
0.3) in one autonomous session on 2026-10-31. This maps the result onto the
slices of `docs/source/Killer_Queen_Coding_Prompt_Pack.md` so either pack can
be used from here. `docs/BUILD_LOG.md` is the running log.

| Prompt | Title | Status | Notes / deviations |
| --- | --- | --- | --- |
| 00 | Scaffold | DONE | Project lives in `killer-queen/` (repo root was not empty). `.claude/settings.json` not written (see BUILD_LOG). |
| 01 | Types and commands | DONE | `src/engine/types.ts`, `money.ts`; tests `tests/engine/money.test.ts`. |
| 02 | Accounts, deposits, executors | DONE | Faucet cooldown (D8), version rule (D4). |
| 03 | Matching, netting, fees, conflicts | DONE | Lock n×(p+fee), fee only on taken contracts (D13); unchosen-at-decide (D14). |
| 04 | Task lifecycle | DONE | `Clock` injected via Venue; `decide(null)` settles all at closing price; infra_error (D6). |
| 05 | Views | DONE | chance = half-up mid / last / 50 (D15); accuracy = side-aware Brier (D22). |
| 06 | Invariant tests | DONE | 1,500 orders, fixed seed (`KQ_SEED`), pass/fail/skip/infra finishes, ~1 s. |
| 07 | SQLite journal | DONE | node:sqlite, WAL + FULL, apply-then-append in `Venue.apply`, halts on append failure (D21), golden journal. |
| 08 | HTTP API | DONE | All routes; admin settle route added. |
| 09 | Simulated runner + signed settle | DONE | HMAC + timestamp window + single-use runId; `forceOutcome` for tests (D20). |
| 10 | House market maker | DONE | Spec parameters; `tests/bots/marketMaker.test.ts`. |
| 11 | Heuristic traders | DONE | Sizing rule D24. |
| 11B | Bots over HTTP | DONE | `HttpClient`; `tests/bots/httpBots.test.ts`. |
| 12 | LLM adapters | DONE | Fixture-tested; a lab's trader is on only with key + model env. |
| 13 | Preact web app | DONE | Verified in a headless browser; `MANUAL.md`. |
| 14 | Full E2E + restart | DONE | All 13 spec tests green (see `docs/ROADMAP.md`). |
| 15 | Boot sequence | DONE | `src/server/boot.ts`; auto-close/auto-decide tested with a fake clock. |
| 16 | Demo seed and v0 freeze | DONE | `npm run seed`, `AGENT_TRADER.md`, README in/out list. |

**Missing tests by name:** none from the spec's list. Not yet written: crash
injection between apply and commit (prompt 1.4), fast-check property tests
over all ten commands (prompt 1.1; the seeded random run covers orders and
cancels).

**V1 backlog (not implemented, from the spec):** rate limits per API key,
trade surveillance, container runner service, GitHub app, arena importer,
identity/live-mode gates, journal snapshots or Postgres. Next prompt in the
series: `KILLER_QUEEN_PROMPTS.md` 1.1.
