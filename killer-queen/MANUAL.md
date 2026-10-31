# Manual click path (v0 web app)

Verified in a headless browser on 2026-10-31 against the local sandbox server
(`HOUSE_BOTS=mm,sim`, simulated runner). Steps a human follows to see the
whole loop.

1. `npm run dev` and open http://localhost:3000.
2. **Sign in** (top right) → Create an account: name "Cora", "I want to"
   *Submit tasks* → *Create customer account*. You land on Account; the API key
   appears once with a Copy button. Copy it (you will sign back in with it).
3. **Submit a task** (in the nav for customers) → title, prompt, repo, commit,
   test command; leave the three candidates ticked; trading window 10 minutes
   → *Submit task and open 3 markets*. You land on the task page; the baseline
   check runs, then the odds rail and the agent table fill as the house market
   maker quotes and the house traders post theses and trade.
4. Avatar → **Account** → Sign out → Create an account: name "Tina", *Trade
   with $1,000 in play money*. The top bar shows "Play money $1,000.00".
5. **Arena** → click the task title → click **Codex** in the agent table (or
   a *Yes 61¢* button straight from the Arena). On the **Market** page the
   ticket is prefilled with the ask: tick *Fill now at the best price*, 10
   contracts → *Buy Yes at the best price*. The toast says what was bought and
   at what price; "Your position" shows average cost, mark and unrealized.
   Post a thesis; it appears under your name.
6. **Portfolio** shows cash, locked, open positions, realized and total P&L,
   the position, open orders with Cancel, and settled history.
7. **Account** → Sign out → paste Cora's key → Sign in. Open the task.
8. *Close trading now* in the page header. The agent table shows closing
   prices and the **Pick the agent to run** panel appears.
9. Click *Run Codex (…¢)*. The other two markets settle at their closing
   prices at once; Codex goes to *Running*; the simulated runner settles it
   after `SIMULATED_RUNNER_DELAY_MS` (1.5 s default). The result panel shows
   the log tail, one cell per test, the Passed or Failed stamp and what it
   paid; the log sha256 sits under it.
10. **Leaderboard** ranks Tina and the house traders by profit and by
    accuracy; **Agents** shows Codex with 1 run on its version, plus the gate
    metrics.

Things to notice: the customer cannot trade (no order ticket on their own
task); a trader whose org is "OpenAI" cannot trade Codex (403 conflict in the
toast); play money is labelled in the top bar and the footer; the theme
toggle in the top bar switches dark and light and is remembered; on a phone
the nav lives in the menu sheet and the market page has a sticky Buy Yes /
Buy No bar that opens the ticket as a sheet.

Last automated run of this path: 2026-10-31, headless Chromium against the
design-overhaul screens (D6), with no page errors, plus screenshots of every
page at 1440 and 390 in both themes with no horizontal page scroll.
