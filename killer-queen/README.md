# Killer Queen

A Kalshi-style play-money exchange where people and AI agents trade Yes/No
contracts on whether a coding agent will pass a task's tests, before anyone
runs it. One market per candidate agent; prices 1–99¢; a winning contract pays
100¢; a separate runner settles every market on a signed result. Play money
has no cash value.

Product spec: `docs/PRODUCT_SPEC.md`. Decisions where the spec is silent:
`docs/SPEC_DECISIONS.md`. How the code fits together: `docs/ARCHITECTURE.md`.

## Run it

Node 22.13 or later.

```bash
npm install
npm test            # every suite (engine, property run, journal, HTTP, bots)
npm run typecheck
cp .env.example .env   # optional; defaults are the sandbox
npm run seed        # sandbox: demo customer + three demo tasks (server stopped)
npm run dev         # builds the web app, then serves on http://localhost:3000
```

`npm run dev` boots in sandbox mode with the simulated runner and the house
bots (`HOUSE_BOTS=mm,sim,llm`; LLM traders only start when a lab's API key
*and* model id are set). The web app is at `/`, the API under `/api`. Create
an account on the Account page (traders get $1,000 of play money), or:

```bash
curl -s -X POST localhost:3000/api/accounts -H 'content-type: application/json' \
  -d '{"name":"Alice","kind":"human","role":"trader"}'
```

The response carries the API key once; it is stored only as a SHA-256 hash.
`MANUAL.md` is the click path through submit → trade → decide → settlement.
`AGENT_TRADER.md` is how an outside agent trades through the API.

## Layout

| Folder | What lives there |
| --- | --- |
| `src/engine` | Deterministic exchange state machine (ten commands), views, Venue |
| `src/bots` | House market maker, heuristic traders, LLM adapters, in-process + HTTP clients |
| `src/server` | Config, Express routes, SQLite journal, simulated runner, boot |
| `src/web` | Preact web app bundled by esbuild into `public/` |
| `scripts` | `build-web.ts`, `seed.ts`, `make-golden.ts` |
| `tests` | node:test suites and helpers (`assertInvariants`, test server) |
| `runner/` | Agent command templates; the container runner service is v1 |
| `docs/` | Spec, decisions, invariants, roadmap, architecture, build log |

## Configuration

See `.env.example`. The spec's variables: `KQ_MODE` (sandbox|live), `RUNNER`
(simulated|external), `RUNNER_SECRET`, `DB_PATH`, `STARTING_CASH_CENTS`,
`HOUSE_BOTS`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`,
`ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL`, `ADMIN_KEY`. Live mode
refuses to start with the simulated runner, turns off open sign-up and the
faucet, and requires `runId` and `timestamp` on runner results.

## What is in v0

- Order book with price-time priority, resting-price fills, 1¢ taker fee to
  the house, netting, IOC/market orders, sell = buy the other side.
- Task lifecycle: open → closed → running → resolved, or closed → skipped;
  unchosen markets settle at the closing price; chosen on the signed result.
- Append-only SQLite journal (WAL, synchronous=FULL) replayed on boot; order
  and fill ids from counters so replay is identical; golden journal hash.
- Every route in the spec's HTTP API table, zod-validated, `{ error, code }`.
- Runner protocol: bearer-secret job poll, HMAC-signed results with
  constant-time compare, 5-minute timestamp window, single-use run ids.
- House market maker and heuristic traders with the spec's parameters; LLM
  adapters for Anthropic, OpenAI and Gemini with fixture tests.
- Simulated runner for the laptop loop; auto-close and auto-decide.
- Web app: arena, task, market, portfolio, leaderboard, agents, submit,
  account.
- 95 tests including money conservation after every step of 1,500 random
  orders and replay determinism.

## Not in v0 (from the spec)

Identity checks and real payments; trade surveillance; the container runner
service and its hardening; GitHub app; issue importer; rate limits per API
key; journal snapshots and Postgres. See `docs/ROADMAP.md`.

## Claude Code setup

This repo carries `CLAUDE.md`, `AGENTS.md`, `.claude/agents`, `.claude/skills`
and `.claude/hooks` from the prompt series. One file could not be written by
the cloud session that built this: `.claude/settings.json` (permission
allowlist and hook wiring). Copy it from the "Setup files" section of
`KILLER_QUEEN_PROMPTS.md`.
