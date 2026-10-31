# Build log

Newest first. Each prompt appends what it did, what it decided, and anything
blocked (with exactly what the owner needs to provide).

## 2026-10-31 — Design overhaul D8 (states, words, numbers, accessibility)
- `scripts/a11y-sweep.cjs`: axe-core on 18 routes × 2 themes, reflow at 320
  and 720 px, and a keyboard walk through the ticket. Started at 62 findings
  across 7 rules; now 0 violations. Fixes: page titles are `h1`, panel and
  section titles follow in order, the trade column has a hidden header, the
  market page's two asides are named, summary lines are valid `dl`s, the run
  log takes focus, page-level empty states carry the page heading, and the
  settlement animation is reset per task and market (it had run for markets
  the viewer never saw settle, which is also why axe sampled a half-faded
  stamp).
- Offline is its own state: a fetch with no response shows "You are offline"
  with Try again; what the exchange said shows under "The exchange did not
  answer".
- Words: "Avg cost" → "Average cost"; the agents line lost its dot separator.
  Numbers and every state are listed in `docs/design/REPORT.md`, which also
  records the contrast table and what is left open.
- `scripts/design-shots.cjs` captures every route at 1440 and 390 in both
  themes plus signed-out, error and empty views; the after set is in
  `docs/design/after/`.

## 2026-10-31 — Design overhaul D7 (odds rail and settlement)
- Odds rail: the pure layout moved to `src/web/ui/oddsRailLayout.ts`
  (`spread` places colliding labels as a centred group with a minimum gap,
  `layout` uses one row, two rows or a numbered legend, `rowPlan` keeps
  labels on their rows while prices move, `springStep` is the damped spring
  at stiffness 300 and damping 30). Markers glide with the spring on every
  price change; reduced motion jumps. `tests/web/oddsrail.test.ts` checks 2,
  4 and 8 agents at nearly equal prices at 1232 and 358 px (no label overlaps,
  everything inside the rail, pins at their prices), the row fallbacks, the
  edge labels, the spread and the spring's settling.
- Settlement: `SettlementPanel` runs the one orchestrated animation when the
  viewer watched the market settle (the Market and Task screens track the
  unsettled → settled transition): panel opens (200 ms), the log tail streams
  in (600 ms), one cell per test fills (400 ms), the stamp lands (200 ms),
  the viewer's position counts into cash (400 ms); 1.8 s in all. Reduced
  motion and arriving on an already-settled market show the final state at
  once. Found and fixed on the way: settled positions were read from the
  wrong field, so "Held at close" said nothing.
- Recorded with Playwright into `docs/design/after/`: `odds-rail-1440.webm`,
  `odds-rail-390.webm` (prices moved four times in the kitchen sink) and
  `settlement-1440.webm` (a real market settling while a trader watches, on
  the sandbox server). Frames were tiled with ffmpeg at 4–6 fps and checked:
  no overlaps, no clipping, no label hopping between rows.

## 2026-10-31 — Design overhaul D4, D5, D6
- D4 foundation: IBM Plex self-hosted through @fontsource and bundled by
  esbuild (`public/fonts`, latin subsets only); `src/web/styles/tokens.css`
  (light default, dark by OS or toggle), `base.css` (reset, tabular numerals,
  focus ring, restyled selects, checkboxes and number inputs, reduced motion);
  the component library in `src/web/ui` (Icon, Button, PriceCell, ChangeCell,
  Money, StatusPill, Countdown, Avatar, Tabs, Field/Input/Select/Checkbox,
  Panel, Table, EmptyState, Skeleton, Toast, AgentRow, BookLadder, PriceChart,
  PacketView, OrderTicket, OddsRail, SettlementPanel, ThesisList, TradeList,
  TopBar, Footer), each with its own token-only stylesheet; the kitchen sink
  at `#/kitchen-sink` (unlinked) with every state; `npm run lint:styles`
  (colour literals, px sizes, px font sizes and inline sizes are refused
  outside tokens.css) runs as part of `npm test`; the old stylesheet and
  component file are gone. The design-critic agent reviewed the sink and its
  eleven blockers were fixed: the light outcome and tertiary colours now pass
  AA on every surface (`--yes #007A50`, `--no #B81F55`, `--warn #9E5300`,
  `--ink-3 #5F6878`), the order book is a real table, rail labels are spread
  on one row with slanted leaders (two rows, then a numbered legend, when
  they do not fit), the chart draws at its real size, the phone table reflows
  into a grid with 44 px buttons, the "Closes" header sits over its column,
  the ticket shows its low-cash state and a total, the packet clamp no longer
  cuts a line, and the sink's data varies.
- D5 shell: TopBar (wordmark with a Lucide crown, nav, balance labelled play
  money, account avatar, theme toggle, "Demo data" badge; wordmark, balance
  and a menu sheet at 390), per-page titles, meta description, favicon SVG and
  PNG, apple-touch-icon, manifest icons and a build-time Open Graph image
  (`scripts/make-brand-assets.ts`, outputs committed in `src/web/static`;
  the server fills the public URL into the page), designed 404 and error
  pages, the Arena as the signed-out front page with one line and "Start
  trading with $1,000 in play money", a footer with Terms, Contact and the
  no-cash-value line.
- D6 screens: Arena (one table grouped by task; Closing soon, Most traded,
  New, In progress, Settled), Task (title row with countdown or status, meta
  line, odds rail, agent table, decide panel, result panel, prompt), Market
  (packet | chance hero, chart, settlement, book, theses/trades | ticket and
  your position; sticky Buy Yes / Buy No bar and a ticket sheet on phones),
  Portfolio (summary line, three tables), Leaderboard, Agents (per-version
  table plus gate metrics as a summary line), Submit task, Sign in and
  Account (API key shown once, faucet, delete). `quote.change` (last trade
  against the latest trade at least a day older) was added to the market
  view for the Change column. API errors are rewritten in plain words.
  Verified: the headless click path (MANUAL.md) with no page errors, every
  page at 1440 and 390 in light and dark with no horizontal scroll.
- Not done here: Figma (no connection), design-critic rounds on the screens
  (D9), axe (D8).

## 2026-10-31 — Design overhaul D3 (design board)
- No Figma in this session, so the fallback: `src/web/design-board/` is a
  static page drawn only from the new tokens (`src/web/styles/tokens.css`,
  `base.css`, self-hosted IBM Plex via `fonts.css`) with the demo content:
  Arena, Task with the odds rail, Market open and settled, Portfolio.
  Screenshotted at 1440 and 390 in light and dark (`docs/design/board/`),
  critiqued against the Ship checklist three times; the last round has no
  overflow at either width. Decisions recorded in `docs/design/FIGMA.md` and
  appended to `docs/DESIGN_SYSTEM.md`. The build bundles the board at
  `/design-board/` (`npm run build:web`, skip with `--no-board`).

## 2026-10-31 — Design overhaul D-setup, D1, D2
- D-setup: docs/DESIGN_SYSTEM.md replaced with the design overhaul brief
  (IBM Plex, light default, odds rail, settlement animation, Never list, Ship
  checklist); `.claude/agents/design-critic.md`; UI rules in AGENTS.md. No
  Figma connection exists in this session, so D3 uses the brief's design-board
  fallback and D4–D6 compare against the board.
- D1: 64 "before" screenshots in docs/design/before and docs/design/AUDIT.md
  (per-screen failures, style inventory). One mechanical defect found: the
  settled task page scrolls horizontally at 390 (run-log hash line).
- D2: `src/server/seedDemo.ts` + `npm run seed:demo` build a 14-day demo
  exchange through engine commands only: 6 fictional customer orgs, 24 tasks
  in every state (6 open, two closing within two minutes; 3 closed waiting; 2
  running; 11 resolved with passes, fails and one infrastructure error; 2
  skipped), 40 traders (13 AI agents), ~1,500 trades with shaped price
  histories and 1–6¢ spreads, ~250 theses, executor versions bumped mid-way so
  records exist per version. Tasks carry `source: "demo-seed/<slug>"`;
  `/api/health` reports `demo: true` and the top bar shows a "Demo data"
  badge. `tests/server/seedDemo.test.ts` checks the counts, the invariants
  during and after, and that the journal replays to the same state hash.
  Real public tasks via the importer were not used (no network access to
  repositories here).
- Dependencies added for D4 and D8: @fontsource/ibm-plex-sans,
  -sans-condensed, -mono 5.2.6 (OFL-1.1; 3.1, 1.8 and 2.1 MB on disk, only the
  latin 400/500/600 woff2 files ship) and @axe-core/playwright 4.10.2 with
  axe-core 4.10.3 (MPL-2.0, dev only).

## 2026-10-31 — Web app visual rework
- Rebuilt the whole visual layer of `src/web` so it reads as a finished
  exchange rather than a prototype: Inter with tabular numerals (monospace
  only for commits, commands, prompts, logs and keys), one token set for dark
  and light, a sticky top bar with a mark, primary nav, theme toggle and a
  balance pill marked play money, a footer, and one card vocabulary used by
  every screen (`docs/DESIGN_SYSTEM.md`).
- Markets page: stats strip, live/settled/all filter, task cards with a
  chance bar per candidate and the market's favourite. Task page: status,
  candidate rows, packet, result/decide/baseline cards, how it settles.
  Market page: chance hero, order book, price, recent trades, theses; the
  ticket with Yes/No pickers prefilled from the ask, position and open orders
  in the sidebar (first on phones). Portfolio, Leaderboard, Agents, Submit,
  Account and the kitchen sink rebuilt on the same parts.
- Small API change: `GET /api/markets/:id` theses carry `accountName`, so the
  web and mobile apps show the poster's name instead of its account id.
- Mobile tokens now carry the same palette; prices use the body face with
  tabular numerals instead of Menlo.
- Verified: 166 tests, root/runner/mobile typechecks, the headless click path
  (MANUAL.md) on the rebuilt screens, and screenshots of every page at 1440
  and 390 in both themes with no horizontal page scroll; six reference renders
  are in `docs/design/`.

## 2026-10-31 — Real-money rehearsal, push, deployment check
- `tests/server/live-rehearsal.test.ts`: the exchange in KQ_MODE=live (no
  play money, no open sign-up, no faucet, simulated runner refused,
  sandbox-only knobs rejected, results need runId + timestamp), driven end
  to end through the public API and the real runner service with FakeDriver:
  admin-provisioned accounts with personIds, admin deposits standing in for
  payments, baseline → house quotes → trades → close → decide → signed
  settlement → signed correction, conservation and replay hash checked.
  No real money moves anywhere in the codebase; real payments, identity
  verification and the DCM listing remain the v2 gate items.
- Pushed the branch to origin on the owner's instruction.
- Deployment could not run from the build container: Docker client present
  but no daemon, no flyctl, no hosting token. Prepared the path instead:
  `.github/workflows/ci.yml` (tests, typechecks, web build, mobile typecheck
  on every push), `.github/workflows/deploy.yml` (Fly deploy on manual
  dispatch or on main when the FLY_API_TOKEN secret and KQ_DEPLOY variable
  are set), `scripts/deploy.sh` (one-shot deploy from a machine with
  flyctl). Owner action: a Fly account/token, or another host.

## 2026-10-31 — Polish pass
- Re-verified every scope item against the product doc (engine commands,
  journal + golden, API, bots, LLM adapters, simulated runner, web app,
  INVARIANTS, SSE, SDK, runner protocol, surveillance, private tasks, GitHub
  app, load/incident scripts, mobile app): all present and under test.
- `correctSettlement` (15th command, D36) with a reversibility guard;
  runner-signed `kind: "correction"` and sandbox admin route; the incident
  drill now corrects instead of compensating when it can; docs updated.
- Coverage tightened: executor records per version, replay of a journal with
  a rejected command fails loudly, `trading` events and task filters on the
  stream, LLM trader accounts created by boot only with key + model, the
  correction's guards and money flow, a runner-signed correction over HTTP.
- Dead code removed (`fillsBetween`, unused fixture helpers); Market page no
  longer prints a missing timestamp; the task page labels the recommendation
  "pick at close" once trading ended and shows corrections.
- Golden journal regenerated (Task gained `corrections`).
- End-to-end run with seeded tasks and bots found a web bug: the app
  refreshed the account on every event, hit the 120/min read limit and
  treated the 429 as a bad key (signed the user out). Fixed: events are
  coalesced to one refresh per 500 ms, the account refreshes at most every
  2 s, and only a 401 signs out. Click path re-verified after the fix.

## 2026-10-31 — Store readiness follow-ups (account deletion, thesis reports)
- `closeAccount` command (14th) + `POST /api/me/delete`; thesis report route
  and `GET /api/admin/reports`; mobile Profile deletion and Report buttons
  wired. docs/STORE_SUBMISSION.md rows now "code". Golden hash regenerated
  (Account gained `closed`): 15d0f62f….

## 2026-10-31 — Phase 4 (mobile app)
- mobile/: Expo SDK 58 app assembled by hand (the host could not run
  create-expo-app; versions taken from Expo's sdk-58 bundledNativeModules.json
  and the npm registry: expo 58.0.21, react-native 0.88.1, react 19.3.0,
  expo-router 58.0.28, typescript 5.9.3). Expo Router tabs Markets /
  Portfolio / Leaderboard / Profile (standard `Tabs`; the native-tabs API was
  not used unverified), task and market screens, order ticket with a success
  haptic on fills, SSE subscription with resume, SecureStore for the key,
  design tokens ported (dark/light, tabular numerals, mono packets, Dynamic
  Type via default font scaling, Reduce Motion honoured by the skeleton),
  "Play money · no cash value" beside every balance, testIDs and
  accessibility labels, dev-only kitchen-sink route. `npm run typecheck`
  passes in mobile/.
- 4.4 docs/STORE_SUBMISSION.md: product rules, data sent, privacy answers,
  age rating, review notes; partial items marked (server-side report and
  delete routes are follow-ups). 4.5 eas.json profiles, Maestro flows in
  mobile/.maestro (sign up, order, portfolio, settlement, delete account).
- Not done here: iOS/Android simulator screenshots (needs a Mac / Android
  Studio), EAS builds and store submission (owner accounts), human sign-in
  per D11, server-side account deletion and thesis reporting routes,
  Liquid Glass navigation chrome (API not verified), Sentry wiring.

## 2026-10-31 — Phase 6 (6.1 load test, 6.2 maintenance checklist, 6.3 incident drill)
- 6.1 `scripts/load-test.ts` (built-in fetch; the session's policy refused
  running autocannon as fetched external code). Exchange in its own process,
  file journal with WAL + synchronous=FULL, no bots, rate limits off, 32
  workers, 50 traders, 6 s per phase, this build host:
  | phase | req/s | p50 | p95 | p99 |
  | --- | --- | --- | --- | --- |
  | orders, no streams | 1,227 | 22.5 ms | 43.6 ms | 68.2 ms |
  | orders, 200 open event streams | 399 (was 269) | 70 ms | 138 ms | 185 ms |
  | reads (task list + market view) | 845 | 33.7 ms | — | 82.8 ms |
  Microbenchmark: engine + file journal alone does ~9,300 orders/s
  (0.107 ms/order incl. fsync); memory journal ~127k/s; so the HTTP layer,
  not the journal, bounds the no-stream case. First bottleneck found and
  fixed: the event hub serialized every SSE frame once per subscriber; it now
  serializes once per event (`frameOf`), which took the 200-stream case from
  269 to 399 orders/s (356k frames delivered in 6 s). Next bottleneck: the
  socket write fan-out itself (~150 writes per order with 100 subscribers per
  market); coalescing `book` snapshots per market per ~50 ms would cut it but
  changes the exactly-once semantics of book events, so it is deferred.
  (The no-stream figure also rose from 758 because the first run had the
  generator sharing the server's event loop; that was a measurement error,
  not a server change.)
- 6.2 Monthly maintenance checklist in docs/RUNBOOK.md (no upgrades performed
  in this session: versions were installed today).
- 6.3 `scripts/incident-drill.ts`: wrong settlement on a staging copy,
  correction with new commands only (compensation deposits), pause/resume,
  backup, restore, hash match. Findings in docs/RUNBOOK.md: no reversal
  command exists; the track record keeps the wrong outcome; a
  `correctSettlement` command is the follow-up before any real-money phase.

## 2026-10-31 — Phase 5 (5.3 GitHub app)
- `src/server/github.ts`: RS256 app JWT, installation tokens (cached),
  webhook signature verification (constant time), delivery de-dup,
  `/kq task` (PR head or default-branch head, --test/--agents/--minutes/
  --private, reply comment, check run on PRs) and `/kq decide` (only the
  submitting installation; closes then decides), check-run updates on task
  events, no trading path. Config: GITHUB_APP_ID / GITHUB_PRIVATE_KEY /
  GITHUB_WEBHOOK_SECRET / GITHUB_INSTALLATIONS / PUBLIC_URL.
- Fixtures in tests/fixtures/github (hand-written in GitHub's delivery shape;
  record real deliveries from a test installation to replace them).
- docs/GITHUB_APP.md: install steps and the minimum scopes with reasons.
- Owner needs: create the GitHub App, install it, map installation ids to
  customer accounts; check-run state is in memory (restart stops updates for
  earlier tasks; a journaled mapping is a follow-up).

## 2026-10-31 — Phase 5 (5.1 surveillance, 5.2 identity limits, 5.4 private tasks)
- 5.1 `src/engine/surveillance.ts`: alerts derived from state (D32): wash
  trades between linked accounts, spoofing (orders now carry cancelledAt and
  cancelReason), closing-price pressure on unchosen/skipped markets,
  conflicted trades/comments, unusual win rates. `GET /api/admin/alerts`.
  Tests replay crafted sequences that must and must not fire each kind.
- 5.2 Accounts carry emailHash/deviceHash/personId/flagged/vetted; caps of 3
  per email and 5 per device; faucet once per 24 h per verified person across
  accounts; flagged accounts off the leaderboard and off the faucet, never
  auto-banned; `reviewAccount` command (13th) with
  `POST /api/admin/accounts/:id/review`; `POST /api/admin/accounts` provisions
  verified accounts (the only sign-up path in live mode, no play money there).
- 5.4 `visibility: private` on tasks; `Engine.canSeeTask` gates task/market
  routes (optional Bearer viewer, 404 otherwise), task list, agent markets,
  orders/comments (`private_task`) and the event stream (viewer-aware).
- Golden journal hash now 19137381… (Account and Task gained the fields
  above; Order gained cancelledAt/cancelReason). Golden commands unchanged.
- Not done: 5.3 GitHub app (next), 5.2's "verified person" is an admin-set
  id; real identity verification needs a vendor and counsel (v2).

## 2026-10-31 — Phase 3 (3.2/3.3 design system and screen pass)
- docs/DESIGN_SYSTEM.md; tokens for dark and light (OS preference + header
  toggle stored per browser); components in src/web/components (Pill,
  PriceCell, AgentRow, OrderBookLadder with thin-book warning, OrderTicket,
  PacketView, ThesisList, Sparkline, Skeleton, EmptyState, ErrorState);
  Market, Task and Arena rebuilt on them; `#/kitchen-sink` shows every state.
- Screenshots at 1440 and 390, dark and light, for every screen; fixed the
  three tables that overflowed at 390 (scroll inside the panel). The
  click-path walk (MANUAL.md) passes on the rebuilt screens with the
  baseline check on.
- Bug fixed: after the move to server-sent events the signed-in account
  refreshed only every ~50 s; it now refreshes on every event.
- Not run: the ui-reviewer subagent (needs the Playwright MCP from the
  prompt series' .mcp.json); reviewed by hand from the screenshots.

## 2026-10-31 — Phase 3 (3.1 events, 3.4 SDK, 3.5 metrics, 3.6 deploy files)
- 3.1 `src/server/events.ts`: events derived from journaled commands with
  ids `<seq>-<n>`, SSE at GET /api/events with market/task filters, resume
  by Last-Event-ID from a ring buffer (EVENTS_BUFFER_SIZE), `reset` when too
  far behind. Web app uses EventSource (slow poll as fallback).
  `tests/server/events.test.ts` proves a reconnect receives every missed
  event exactly once, in order.
- 3.4 `sdk/`: typed client (request types from `src/server/schemas.ts`, now
  shared with app.ts; response types from engine views), retries reusing the
  Idempotency-Key, SSE resume, agent template, README quickstart;
  `tests/sdk/client.test.ts` runs the loop, a retry that replays instead of
  double-placing, 429 backoff, and the template's limits/conflicts.
- 3.5 Gate metrics were already in /api/stats (v0); medianMsToTradable now
  reflects the baseline (Phase 2). Decision lift still needs a customer
  default agent (not in the data model).
- 3.6 Dockerfile (non-root, volume /data, healthcheck), fly.toml, JSON logs
  (`src/server/log.ts`) + ERROR_REPORT_URL webhook as the Sentry hook point
  (no Sentry SDK dependency added), `scripts/backup-journal.ts` (VACUUM INTO
  + BACKUP_UPLOAD_CMD), `scripts/restore-drill.sh`, `scripts/state-hash.ts`,
  `GET /api/admin/state-hash`, docs/RUNBOOK.md. Not deployed (per
  supervision note and prompt). Owner needs: a Fly app + volume, object
  storage credentials for backups, a Sentry DSN or webhook if wanted.
- Not done: 3.2/3.3 design system and screen pass (next).

## 2026-10-31 — Phase 2: the runner (prompts 2.1–2.5)
- 2.1 docs/RUNNER_PROTOCOL.md (job types baseline/run, job states, signed
  result with logSha256 + timestamp + runId, HMAC rules, skew window,
  retries, limits). Server verifies logSha256 (D30); the engine journals
  sha256(log) for settle and baseline.
- 2.2/2.3 runner/ package (no dependency on src/): ExchangeClient (signed
  posts), Runner loop, ContainerDriver with FakeDriver (tests) and
  DockerDriver (internal network + egress proxy allowlist, non-root, cap-drop,
  limits, protected-path restore, default test-path detection), log
  redaction, runner/agents.json with pinned versions and the CLI flags looked
  up today (gemini marked verify:true, third-party sources only),
  runner/SANDBOX.md threat list. Docker path is NOT exercised here (no Docker
  on the build host); FakeDriver covers the logic.
- 2.4 Baseline check (D2): tasks start pending with BASELINE_CHECK=true; the
  journaled `baseline` command opens or rejects (trivial/flaky); packet shows
  the baseline; simulated runner answers baseline jobs; web shows
  pending/rejected states; medianMsToTradable now measures the baseline.
- 2.5 src/importer/arena.ts + scripts/import-arena.ts: merged PRs that closed
  an issue and changed tests + code become candidates at the PR base commit
  with the test files as protected paths; test command limited to them;
  dry run by default; rate-limit aware; `--verify fake|docker` runs the tests
  at base (must fail) and merge (must pass) through the runner driver; apply
  is idempotent on the issue URL (`task.source`, `duplicate_source`).
- Golden journal hash changed twice: 37053eb6… (Task gained openedAt,
  tradingWindowMs, runLogSha256, baseline, rejectedReason, forceBaseline;
  Market statuses) and then 6081d78c… (Task.source). Golden commands unchanged.
- CLI flag sources: Claude Code docs.anthropic.com cli-reference (-p,
  --output-format, --max-turns, --permission-mode); Codex
  developers.openai.com non-interactive-mode (codex exec --sandbox
  workspace-write, --full-auto deprecated); Gemini CLI: third-party mirrors
  only (-p, --approval-mode yolo) — verify before use.
- Owner actions: build the runner image (`kq-runner`) and egress proxy image,
  decide registries, provision per-run spend-capped provider keys; run
  `docker` on a host with Docker to exercise DockerDriver.

## 2026-10-31 — Phase 1: harden the exchange (prompts 1.1–1.5)
- 1.1 `tests/engine/property.test.ts`: fast-check sequences over every command
  (weighted toward valid traders/markets so most sequences trade), invariants
  after each command, before/after hash on each rejection, replay hash per
  sequence. `KQ_PROP_RUNS` (default 200, ~3 s).
- 1.2 Determinism audit: the only clock read in src/engine is the injected
  `systemClock` default; `tests/engine/determinism.test.ts` fails the build if
  Date.now/Math.random/timers/I/O or server imports appear in src/engine.
- 1.3 Already in v0 (D4 versions, D6 infra_error, D7 half-up, staff/runner
  conflicts); nothing to change.
- 1.4 Crash injection test: a journal sink that throws before commit; restart
  shows acknowledged state present and the unacknowledged command absent.
- 1.5 Rate limits (D28), Idempotency-Key via journaled clientKey (D27),
  64 kB body limit (6 MB for runner logs), constant-time key comparison
  (D29), `pauseTrading` command + admin route (D26), fuzz suite.
- Golden journal hash changed to
  7ad74cb95af087f1e8d24c8b671e5d77962efba496b5b5581c6de78b8e428a6e because
  `EngineState` gained `clientKeys` and `trading` (D26, D27); the 22 golden
  commands are unchanged.
- Per supervision note: commits stay local; nothing pushed after v0.

## 2026-10-31 — 0.2-alt v0 build and 0.3 invariants
- Built v0 from the spec in the spec's stack, test-first, one commit per
  slice: engine (ten commands, matching, netting, settlement, views), SQLite
  journal with replay and a golden journal, Express API (every route in the
  spec table), runner protocol with HMAC + timestamp window + single-use
  runId, simulated runner, boot with auto-close/auto-decide, house market
  maker, heuristic traders, LLM adapters (Anthropic, OpenAI, Gemini), HTTP bot
  client, Preact web app, sandbox seed. 95 tests pass (`npm test`,
  `npm run typecheck`). The web click path was verified in a headless
  browser (MANUAL.md).
- Decisions added while building: D12–D25 in docs/SPEC_DECISIONS.md.
- docs/ARCHITECTURE.md lists every difference from the product spec as an
  issue; docs/INVARIANTS.md names the proving test for each rule (one gap:
  crash injection between apply and commit, prompt 1.4).
- Bug found by the bot tests and fixed in the engine: counter-generated ids
  (`tsk_n`, `acc_n`, `o<n>`, `c<n>`) could collide with explicitly supplied
  ids and overwrite them; counters now skip taken ids (test in
  accounts.test.ts).
- Golden journal hash: 81aff1598d953d97786b3e28d21f619ad73be0e1b46336b5a8374a8e95b0db0f
  (first value; `scripts/make-golden.ts`).
- Owner actions needed:
  1. Copy `.claude/settings.json` from KILLER_QUEEN_PROMPTS.md "Setup files"
     (the cloud session may not write Claude permission settings).
  2. To turn on LLM traders: set a lab's API key AND its model id env var
     (looked up from the provider's docs; not guessed here).
  3. `runner/agents.json` holds the spec's example CLI templates; verify the
     flags against each CLI's docs before the Phase 2 runner uses them.
- Not done (later prompts): fast-check property tests over all ten commands
  (1.1), crash injection (1.4), rate limits and idempotency keys (1.5), SSE
  (3.1), design system (3.2), deploy (3.6).

## 2026-10-31 — 0.0 Bootstrap
- Created the setup files from KILLER_QUEEN_PROMPTS.md "Setup files" and the
  folder layout; converted docs/source/Killer_Queen_Product_Doc.pdf into
  docs/PRODUCT_SPEC.md (link targets recovered from the PDF annotations).
- Project lives in killer-queen/ inside the josephlongbui-stack/Claude repo
  because the repo root was not empty (the coding prompt pack's rule).
- BLOCKED: `.claude/settings.json` (permission allowlist + hook wiring) was not
  written: the cloud session's safety classifier refuses to let Claude write
  its own permission settings. Owner action: copy the `.claude/settings.json`
  block from KILLER_QUEEN_PROMPTS.md "Setup files" into place locally. The hook
  scripts, agents and skills it references are all in .claude/.
- Also kept docs/source/Killer_Queen_Coding_Prompt_Pack.md (the slice-by-slice
  engineering rules) as a second source document.

## 2026-10-31 — 0.1 Spec and decisions
- Cross-checked docs/PRODUCT_SPEC.md against the PDF text: every number, env
  variable and route present (only page numbers differ).
- Tightened D1–D11 into testable rules with status; added D12–D23 for the
  engine calls the spec leaves open (ids/time, fee lock, when unchosen markets
  settle, quote fields, realized P&L, sell/market orders, staff, self-trades,
  simulated runner determinism, journal durability, accuracy, trading window).
- Wrote docs/ROADMAP.md: v0–v3 with gates and per-feature acceptance
  statements, including the per-screen checklists prompt 3.3 refers to.

## 2026-10-31 — D10 Mobile: the design system in React Native
- `mobile/src/ui/tokens.ts` now carries the brief's token names and values
  (light and dark palettes, type scale with IBM Plex family names, spacing
  4–64, radius 4/8, the float shadow) and the `usePalette` / `useReduceMotion`
  hooks (system colour scheme; Reanimated's Reduce Motion).
- Fonts: IBM Plex Sans 400/500/600, Sans Condensed 600 and Mono 400 from the
  `@expo-google-fonts/ibm-plex-*` packages (0.4.1, OFL) through `expo-font`
  ~58.0.11 in `app/_layout.tsx`; the splash stays up until they load.
  `expo-clipboard` ~58.0.4 added for the one-time API key copy.
- Tabs: `expo-router/native-tabs` (`NativeTabs`, `NativeTabs.Trigger`, SF
  Symbols on iOS, Material icons on Android): Arena, Portfolio, Leaderboard,
  Account. No custom tab bar.
- `mobile/src/ui/components.tsx` rebuilt on the web components' names and
  words: Panel/PanelHead/PanelBody, PageTitle, SectionHead, Button (primary,
  secondary, quiet, yes, no, solid), StatusPill with `taskStatus` /
  `marketStatus`, PriceCell (dense/m/l/xl, tabular, capped Dynamic Type on
  the hero), ChangeCell, Money, Countdown, Avatar, Field/Check, EmptyState,
  FetchError, Skeleton, AgentRow, OddsRail (spring-animated pins over the
  shared `oddsRailLayout.ts`, a hand-kept copy of the web module), BookLadder,
  PriceChart (views, no SVG dependency), PacketView, OrderTicket (Buy/Sell,
  side buttons with the price, Contracts, Limit price, "Fill now at the best
  price", cost/fee/total/pays, low-cash state, success haptic on a fill,
  error haptic on a refusal), TicketSheet (iOS page sheet), StickyBar,
  SettlementPanel (same timing as the web, final state under Reduce Motion),
  ThesisList, useToast, `words()` for API errors.
- Screens rebuilt to the 390 frames: Arena (filter tabs, grouped rows, quick
  Yes/No), Portfolio (cash hero, positions, resting orders, settled),
  Leaderboard (profit/accuracy), Account (sign up, sign in, key shown once,
  faucet, delete with press-again confirm), Task (rail, candidates, customer
  decide panel, result), Market (hero, chart, settlement, position, book,
  theses/trades, packet, sticky Buy Yes/Buy No opening the sheet),
  kitchen-sink. `.maestro` flows updated to the new tab names and test ids.
- `cd mobile && npx tsc --noEmit` passes. Not done here: screenshots on a
  simulator (no Mac or Android emulator on this host) and `expo-glass-effect`
  surfaces beyond the system tab bar; both wait on a Mac. `npx expo install
  --check` after cloning confirms the SDK 58 versions.

## 2026-10-31 — D9 Fresh-eyes review and compare page
- `design-critic` ran twice over docs/design/after (no Figma; the critic read
  every screenshot and probed the running demo with Playwright). Round 1: 9
  blockers; round 2: 6 blockers; every blocker fixed, most risks fixed, the
  rest recorded with reasons in docs/design/REPORT.md ("Fresh-eyes review").
  Round 3 (the last the prompt allows): 5 blockers, fixed before closing;
  what it left is logged in REPORT.md under "Left after three rounds".
- Engine changes made for the review were themselves reviewed by the
  exchange-auditor role (no blockers; its risks fixed in the commit "Engine:
  version strings key per-version records safely"): task views and packets
  show the version frozen at task creation with the record on that version
  (D4), `GET /api/agent/markets` carries `commented`, `upsertExecutor`
  rejects versions that are not plain identifiers.
- `scripts/design-compare.cjs` builds docs/design/compare.html: every screen
  before (D1) and after, 1440 and 390, light and dark. `scripts/design-shots.cjs`
  now reloads per route, uses a customer account for Submit, captures every
  task state and the 404, and closes its accounts afterwards; the a11y sweep
  closes its account too.
- Verified after round 2: 0 axe violations on every route in both themes and
  widths, no horizontal scroll at 390, the browser click path (sign up, trade,
  decide, settle) with no page errors, `npm test` green.
