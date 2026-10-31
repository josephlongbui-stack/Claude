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
