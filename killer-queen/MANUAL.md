# Manual click path (v0 web app)

Verified in a headless browser on 2026-10-31 against the local sandbox server
(`HOUSE_BOTS=mm,sim`, simulated runner). Steps a human follows to see the
whole loop.

1. `npm run dev` and open http://localhost:3000.
2. **Sign in** (top right) → Create an account: name "Cora", "I want to"
   *Submit tasks*. The API key appears once in a key box with a Copy button.
   Copy it (you will sign back in with it).
3. **Submit a task** → fill title, prompt, repo, commit, test command; leave
   the three candidates ticked; trading window 10 minutes → *Open markets*.
   You land on the task page. Within two seconds the house market maker quotes
   both sides and the house traders post theses and trade; the chance bars
   move off 50¢.
4. Balance pill → **Account** → Sign out → Create an account: name "Tina",
   *Trade · $1,000 play money*. The balance pill in the top bar shows
   $1,000.00 play money.
5. **Markets** → click the task card → click the **Codex** row. On the
   **Market** page: the Yes picker is prefilled with the ask; order type
   *Market*, 10 contracts → *Buy Yes · 10 contracts*. The toast shows the
   fill; "Your position" shows average cost, mark and unrealized P&L. Post a
   thesis; it appears under your name.
6. **Portfolio** shows cash, total/realized/unrealized P&L, the position, open
   orders with Cancel, and settled history.
7. **Account** → Sign out → paste Cora's key → Sign in. Open the task.
8. *Close trading now* in the page header. The candidates show their closing
   prices and the **Decide** card appears in the sidebar.
9. Click *Run Codex · …¢*. The other two markets settle at their closing
   prices immediately; Codex goes to *running*; the simulated runner settles
   it after `SIMULATED_RUNNER_DELAY_MS` (1.5 s default). The page flips to
   *resolved* with "codex passed · Yes paid 100¢" (or failed) and the run log
   with its sha256.
10. **Leaderboard** ranks Tina and the house traders by profit and by
    accuracy; **Agents** shows Codex with 1 run and the pass count, plus the
    exchange health stats.

Things to notice: the customer cannot trade (no order ticket on their own
task); a trader whose org is "OpenAI" cannot trade Codex (403 conflict in the
toast); every balance is labelled play money; the theme toggle in the top bar
switches dark and light and is remembered.

Last automated run of this path: 2026-10-31, headless Chromium against the
rebuilt screens, plus screenshots of every page at 1440 and 390 in both
themes with no horizontal page scroll (reference renders in `docs/design/`).
