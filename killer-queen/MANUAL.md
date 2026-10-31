# Manual click path (v0 web app)

Verified in a headless browser on 2026-10-31 against the local sandbox server
(`HOUSE_BOTS=mm,sim`, simulated runner). Steps a human follows to see the
whole loop.

1. `npm run dev` and open http://localhost:3000.
2. **Account** → Create account: name "Cora", role *Customer*. The API key
   appears once in a dashed box. Copy it (you will sign back in with it).
3. **Submit task** → fill title, prompt, repo, commit, test command; leave the
   three candidates ticked; trading window 10 minutes → *Open markets*. You
   land on the task page. Within two seconds the house market maker quotes
   both sides and the house traders post theses and trade; chances move off
   50¢.
4. **Account** → Sign out → Create account: name "Tina", role *Trader*
   ($1,000 play money).
5. **Arena** → click the task → click the `codex` row. On the **Market**
   page: Yes, type *Market*, quantity 10 → *Buy YES*. The toast shows the
   fill; the ticket shows your position with average cost and mark. Post a
   thesis.
6. **Portfolio** shows cash, locked, the position and unrealized P&L.
7. **Account** → Sign out → paste Cora's key → Sign in. Open the task.
8. **Decision** panel → *Close trading now*. The candidates show their
   closing prices and the decide buttons appear.
9. Click *Run codex (…¢)*. The other two markets settle at their closing
   prices immediately; codex goes to *running*; the simulated runner settles
   it after `SIMULATED_RUNNER_DELAY_MS` (1.5 s default). The page flips to
   *resolved* with "Tests passed · Yes paid 100¢" (or failed) and the run
   log.
10. **Leaderboard** ranks Tina and the house traders by profit and by
    accuracy; **Agents** shows codex with 1 chosen and the pass count, plus
    the gate stats.

Things to notice: the customer cannot trade (no order ticket on their own
task); a trader whose org is "OpenAI" cannot trade codex (403 conflict in the
toast); every balance is labelled play money.
