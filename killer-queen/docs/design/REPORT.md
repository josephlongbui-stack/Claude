# States, words, numbers and accessibility (D8)

Checked against `docs/DESIGN_SYSTEM.md` sections "States", "Words" and
"Accessibility" on the rebuilt screens, with `scripts/a11y-sweep.cjs`
(axe-core 4.10 through Playwright on every route in light and dark, a reflow
check at 320 and 720 px, and a keyboard walk through the order ticket).

## States

Every state below has a designed screen, reachable on the route named or in
`#/kitchen-sink`.

| State | Where | How it looks |
| --- | --- | --- |
| Loading | every route | Skeletons shaped like the content: table rows, the market page (chance, line, chart, book rows), the portfolio summary |
| Empty | Arena tabs, Portfolio tables, Leaderboard, Agents, Theses, Trades | Title, one line of hint, and a way forward ("Pick an agent in the Arena…") |
| Thin book | Market, kitchen sink | One-sided book with the amber note and "no asks" / "no bids" in the spread row |
| No trades yet | Market, kitchen sink | Dashed empty chart with "No trades yet. The first trade starts the price history."; the book says the first limit order sets the price |
| Closing in under a minute | Arena, Task, Market | Countdown turns amber below 60 s; the status pill reads "Closing soon" |
| Closed, waiting for a decision | Task, Market, Arena "In progress" | "Closed at 64¢, waiting for the customer to pick an agent"; the customer sees "Pick the agent to run" |
| Running | Task, Market, Arena | "Running" pill; "Codex is running in the sandbox…" |
| Settled passed / failed | Task, Market, Arena "Settled", Portfolio | Stamp, log tail, one cell per test, what paid; the rail shows "passed"/"failed" at 99¢/1¢ |
| Settled at the closing price | Task, Market, Portfolio | "Settled at 54¢" pill and rail note; the hero explains the customer ran a different agent |
| No result (infrastructure error) | Task, Market, kitchen sink | Amber "No result" with the closing-price settlement explained |
| Skipped | Task, Arena | "Skipped" pill; "The customer skipped the run. Every market settled at its closing price." |
| Baseline check / rejected | Task, Market, Arena | "Baseline check" pill and note; rejected tasks show the reason and the baseline log |
| Offline | any route | "You are offline. Prices will update when the connection is back." with Try again (a failed fetch with no response) |
| Server error | any route | "The exchange did not answer" with what it said and Try again; a crash shows "This page stopped working" with Reload |
| Not enough play money | ticket | Inline "Not enough play money. You need $6.30 and have $4.10."; the submit reads "Not enough play money" and is disabled |
| Signed out | Arena, Market, Portfolio, Submit | One line and "Start trading with $1,000 in play money"; pages that need an account say so |
| Not found | `#/anything` | "There is nothing at this address" with Go to the Arena |

## Words

Every string in `src/web` was read against the "Words" rules.

- Sentence case throughout; no all-caps labels, no eyebrow labels.
- Buttons say what happens and keep their name: "Buy Yes at 61¢" → toast
  "Bought 10 Yes at 61¢"; "Submit task"; "Create account with $1,000 in play
  money"; "Close trading now"; "Run Codex (64¢)"; "Skip the run"; "Add $1,000
  in play money"; "Delete account" then "Press again to delete for good".
- Errors say what happened and what to do, never apologise:
  `words()` in `src/web/screens/Market.tsx` rewrites every API code
  ("Not enough play money. You need $6.90 and have $4.10.", "Too many requests
  in a minute. Wait a moment and try again.", "Your session ended. Sign in
  again.").
- Jargon: "Brier" is explained under the leaderboard and the agents page;
  "Bid / ask" and "Average cost" are spelled out; "agent" is the coding agent,
  "trader" is whoever trades; the spec's words (task, market, packet, thesis,
  closing price) are used as is.
- Fixed in this pass: "Avg cost" → "Average cost"; "Anthropic · current
  version 2.1.0" → "Anthropic, current version 2.1.0" (no dot separators
  anywhere in the UI); an executor id no longer appears where a name belongs.

## Numbers

- Prices are "61¢"; chance is "61% chance"; money is "$6.90" and "$1,000.00"
  with thousands separators (`dollars`, `count` in `src/web/ui/Price.tsx`).
- Changes carry a sign and an arrow ("▲ 3", "▼ 5", "0").
- Every number is tabular (`font-variant-numeric` on the root) and right-
  aligned in tables (`.r`).
- A result is never colour alone: "Passed", "Failed", "No result", "Settled
  at 54¢", "+$5.10", "−$0.75".

## Accessibility

- **axe-core** (wcag2a, wcag2aa, wcag21aa, wcag22aa, best-practice) on 18
  routes × 2 themes: **0 violations**. Fixed on the way: 62 findings across 7
  rules (empty table header for the trade column, no `h1` on any page, panel
  and section headings skipping a level, two unnamed `aside` landmarks on the
  market page, `span` inside `dl`, a scrollable log that could not take
  focus, and settlement stamp text sampled mid-animation because the
  animation ran for a market the viewer had not watched settle, which was a
  real bug: the transition is now tracked per task and market).
- **Contrast**: every text token on every surface and tint is at least
  4.5:1 in both themes (light `--yes` 4.55–6.3:1, `--no` 5.3–6.2:1, `--warn`
  4.8–5.7:1, `--ink-3` 4.7–5.6:1; dark outcome colours 5.8–7.8:1 on their
  tints). The brief's original light `--yes`, `--warn` and `--ink-3` were
  below 4.5:1 on the tints and the sunken surface and were adjusted in D4.
- **Reflow / 200% zoom**: no horizontal scroll on any route at 720 px (1440
  at 200%) or 320 px (WCAG 1.4.10); the narrowest screens hide the Brier and
  Passed columns and tighten cell padding under 360 px.
- **Keyboard**: the ticket's tab order is Buy, Sell, Yes, No, Contracts,
  Limit price, Fill now, Buy button; Space picks a side and toggles the
  checkbox; Enter in Contracts submits ("Bought 3 No at 49¢"). Every row link,
  tab, button and field has a visible 2 px focus ring.
- **Screen readers**: prices read as "61 cents"; agent links read as "Codex,
  69 cents, 69 percent chance to pass, up 7"; the odds rail and the chart
  carry text alternatives; the book is a real table with a caption; status is
  always a word.
- **Reduced motion**: the rail jumps instead of gliding and the settlement
  shows its final state at once.
- **Touch**: controls are 44 px tall on phones.

Left open: the kitchen sink (dev only) is not held to the 320 px reflow rule;
the `prefers-contrast` media query is not handled; no screen-reader test with
a real assistive technology was run on this host.

# Fresh-eyes review (D9)

`design-critic` reviewed every screen in `docs/design/after` at 1440 and 390,
light and dark, with no memory of the build. Each round's blockers were fixed
before the next.

## Round 1: 9 blockers, all fixed

| # | Blocker | Fix |
| --- | --- | --- |
| B1 | Wrong screenshots (Arena showed Account; signed-out Arena showed an error; Submit showed the trader gate) | `scripts/design-shots.cjs` reloads on every route (a hash-only change is a same-document navigation) and uses a customer account for Submit; it now also captures closed, running, skipped, rejected and pending tasks, an unchosen market and the 404 |
| B2 | Arena rules broke at the Closes column and under the last group; stray partial rules on phones | Table rules moved from the bottom to the top of each row (`src/web/ui/table.css`), the Closes cell is per row, and on phones the rules belong to the row, not the cells (`agentrow.css`) |
| B3 | Task page showed the agents' current versions, not the frozen ones | `taskView` now uses `candidateVersions` (D4) through `executorAt` in `src/engine/views.ts`; test "task and packet show the version frozen at task creation…" |
| B4 | "Passed 3 of 6 runs on this version" was the overall record; packet "Settled" time was the trading close | Per-version record from `byVersion` everywhere the version is named (packet, task table, Submit checkboxes); the packet row is "Trading closed", the result panel carries the settled time |
| B5 | "55% chance Claude Code passes 0 today" | A zero change shows nothing; a non-zero one reads ", ▲ 3 today" |
| B6 | Run log clipped at the panel edge | `.settle-log` wraps with a hanging indent instead of scrolling sideways |
| B7 | Raw run id on the task page | Removed; the result section says "Signed by the runner"; the log hash is in the API, not on the page |
| B8 | Identical theses from several traders, the stated % repeated in the text, a "weak record" thesis at 69% | Thesis templates rewritten (`src/server/seedDemo.ts`): 15 per side, each used once per market, record-aware (`when`), bulls state above the price and bears below, the number posted once as the probability; the three house traders each phrase the shared heuristic in their own voice (`src/bots/simTrader.ts`) |
| B9 | Browser validation bubbles on Submit | `noValidate` and the app's own field errors in its own words, focus on the first bad field |

Risks from round 1 also fixed: the selected tab no longer looks like a focus
ring (the old boxed tab style was removed from `base.css`); filter tabs wrap on
phones instead of clipping; the rail's axis labels have room below the track
and leaders end exactly at their label; settled tasks drop the dead Bid/ask
column; the "Passed" pill sits under the name on phones; book depth bars stop
short of the panel edge; a settled market without a position shows a "Settled"
summary (closing price, settlement, volume, traders, times) instead of an empty
ticket; "Gate metrics from the product spec", "v0 gate" and "Sandbox accounts"
are gone; the empty Arena says markets open when the baseline check confirms
the tests fail; the Submit button is "Submit task"; Submit placeholders became
help text; the candidates fieldset has its margin back; a customer sees
"Customer" in the top bar and no play-money balance; the Portfolio's cash is
the hero figure and "Realized" names the fees it is net of; positions read
"12 Yes" in one column so market names have room on phones; the leaderboard's
own row is grey, not green; AI traders have the agent avatar in theses too;
Agents versions are no longer mono; the two not-found pages are one component;
only the Arena link is highlighted on the Arena, only "Submit a task" on
Submit.

Not changed, on purpose:

- A passed market settles at 100¢ but the rail's axis ends at 99¢ (the brief's
  axis); the marker carries the word "passed" rather than a number.
- Leader lines are diagonals when several labels crowd one price; the layout
  keeps labels readable first.
- On phones the packet is the last section of a market, after the theses, as
  the brief's phone order has it.
- The house traders ("House trader 1–3", org "Killer Queen Sim") rank where
  their play-money profit puts them; they are named as the house and are part
  of the exchange by design.

## Round 2: 6 blockers, all fixed

| # | Blocker | Fix |
| --- | --- | --- |
| B1 | Phone market pages hid the settled summary and the only link to the task; the packet came after the theses | Under 720 px the market grid is one column in the brief's order (chance and chart, result, your side, the summary column, the packet, then the book and theses) by making the centre column `display: contents` and ordering its pieces; the summary column is shown on phones |
| B2 | Rail on phones: stray leader stubs under the legend, a lower-row label across another pin, 8 pins as one block with the legend touching the axis | Leader geometry is measured from the DOM (the track's offset and each label's or number's bottom) instead of CSS-value arithmetic; the lower row must stay clear of every pin or the label ends at its pin, else the legend takes over (`placeLower`, tested); legend pins are hairlines and the legend starts below the axis labels |
| B3 | Footer floated mid-page on every short page | The mount `#app` is the flex column the footer's auto margin pushes against |
| B4 | House traders re-posted the same thesis after every restart | `GET /api/agent/markets` says whether the caller has already posted (`commented`); the house trader honours it, so one thesis per market per bot, across restarts |
| B5 | Screenshot and axe harness accounts stayed on the demo leaderboard | Both scripts close their accounts when they finish (D35: off the leaderboard, anonymised); the demo was reseeded |
| B6 | On task pages the chance was not the most prominent number | The candidates table shows the chance at `--t-num-l` (44 px) |

Risks from round 2 also fixed: leaders are `--ink-3` so they can be seen; the
task page's status pill is left-aligned on phones; the notice panel under the
candidates table has its own margin; the chart has a time axis (first and
last trade); the ticket sheet is a dialog (focus moves in, Escape closes,
focus returns); signed-out visitors get one "Start trading with $1,000 in play
money" bar on phone markets instead of Buy buttons that fail; the "Settled"
summary tells a signed-in trader "You held nothing in this market"; the
leaderboard's name cell keeps "AI agent" beside the name; the Portfolio
summary is four pairs with "Play money" as the hero and no stray note; open
orders show the amount they lock; phone rows carry what hidden columns said
(record and volume on tasks, volume on the Arena with "Closes in", average
cost and mark on positions); the calibration figure shows its count ("3 of
3"); disabled buttons are legible (sunken surface, no opacity) and the armed
"Delete account" turns red; the top bar drops "Sign in" on the sign-in page;
the Submit two-column gaps match single-column spacing; the prose measure is
70 characters and the prompt block 100; the run log wraps at separators.

Not changed, on purpose or deferred:

- Offline replaces the page with "You are offline" and Try again rather than
  keeping the last prices on screen (deferred: needs a cached snapshot).
- "Report" on a thesis posts at once with a toast; no confirm or undo yet.
- The chart marks the last trade, not the settlement price; the rail and the
  hero carry the settlement.
- "Closing soon" lists every open task soonest first; the name stays.
- At 390 the Leaderboard hides Organization, Realized and Right, and the task
  table hides Bid/ask, Volume, Traders and Record as columns (the phone row
  line carries record and volume).
- The right column below "Your position" on a 1440 open market is empty while
  the theses run on; the three-column layout is the brief's.
