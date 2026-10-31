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
  "Bought 10 Yes at 61¢"; "Submit task and open 3 markets"; "Create account
  with $1,000 in play money"; "Close trading now"; "Run Codex (64¢)"; "Skip the
  run"; "Add $1,000 in play money"; "Delete account" then "Click again to
  delete for good".
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
