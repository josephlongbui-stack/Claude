# Design system

Killer Queen looks like an exchange: dense, numeric, calm. The number people
care about (the Yes price, the chance) is the biggest thing on any screen.
Nothing is decorated; every colour means something and never means it alone.

## Principles

1. **Numbers first.** Every price, quantity and balance uses tabular numerals
   (`.num`, `.price`) so columns line up and values do not jump when they
   update. Packets, ids, commands and logs are monospace (`.mono`).
2. **Colour never alone.** Yes is green, No is red, warnings are amber, but each
   state also says its name in text (pills carry the word, outcomes print
   "passed"/"failed", the ticket's button says BUY YES). Colour-blind and
   screen-reader users get the same information.
3. **Every state designed.** Loading (Skeleton), empty (EmptyState), error
   (ErrorState with retry), thin book (ladder warning), no trades, pending
   baseline, open, closed with the decide step, running, resolved, skipped,
   rejected, cancelled. The kitchen sink (`#/kitchen-sink`) shows all of them.
4. **Dark by default, light by choice.** Tokens are defined once for dark and
   once for light; the OS preference applies unless the header toggle pins a
   theme (`data-theme` on `<html>`, remembered per browser).
5. **Dense but reachable.** 13 px body, 30 px minimum control height, 16 px
   gutters, three columns at 1280+, one column under 900, no horizontal page
   scroll at 390 (wide tables scroll inside `.scroll-x`).
6. **Honest money.** Every balance carries "play money · no cash value".

## Tokens (`src/web/styles.css`)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | #0b0e13 | #f6f7f9 | page |
| `--panel` / `--panel-2` | #12161d / #181d26 | #ffffff / #eef1f5 | cards, hover rows, buttons |
| `--line` | #232a35 | #d9dee6 | borders, table rules |
| `--text` / `--muted` | #e6e9ef / #8a93a3 | #141821 / #5d6676 | text |
| `--yes` / `--yes-bg` | #2fbf71 | #1f9d5a | Yes side, pass |
| `--no` / `--no-bg` | #e4574f | #c9403a | No side, fail, errors |
| `--accent` | #6ea8fe | #2f6fe4 | links, primary buttons, sparkline |
| `--warn` | #f0b429 | #b7780a | pending, running, thin book |
| `--focus` | #9cc2ff | #2f6fe4 | focus ring |
| `--font` / `--mono` | system sans / system mono | | type |
| `--fs0…--fs4` | 11 / 13 / 15 / 17 / 22 px | | type scale |
| `--s1…--s5` | 4 / 8 / 12 / 16 / 24 px | | spacing |
| `--r1…--r3` | 4 / 6 / 10 px | | radii |

Contrast: text on panel ≥ 7:1 in both themes; muted ≥ 4.5:1; Yes/No on
their tinted backgrounds ≥ 4.5:1.

## Components (`src/web/components/index.tsx`)

| Component | Shows | States |
| --- | --- | --- |
| `Pill` | a status word | pending, open, closed, running, resolved, settled, skipped, rejected, cancelled, passed, failed |
| `PriceCell` | a price in cents, tabular | plain, Yes, No, big (the chance), missing (—) |
| `AgentRow` | one candidate: id, org, version, record, chance, bid/ask, volume, traders, outcome and chosen pills | pending, open, closed, running, settled (chosen/unchosen), cancelled |
| `OrderBookLadder` | Yes bids and No bids with depth bars | full, thin (warning), empty open, cleared after close |
| `OrderTicket` | side, action, type, price, quantity, lock preview, submit | open, signed out, closed, pending/cancelled (blocked reason) |
| `PacketView` | prompt (optional), repo@commit, test command, executor record, baseline, closes | compact / full |
| `ThesisList` | theses with stated probability and time, optional form | with form, read-only, empty |
| `Sparkline` | Yes price per trade as an SVG line with an area fill | ≥ 2 trades, no trades |
| `Skeleton` | loading placeholder | n lines |
| `EmptyState` / `ErrorState` | message, hint, action / message, retry | |

Rules: components take data from the API only; no mock data in screens; every
control has a label (`<label for>`, `aria-label`, `aria-pressed` on toggles);
every interactive element an end-to-end test touches has a `data-testid`.

## Screens

Arena (filter all/open/done, tasks table), Task (packet, candidates, decision
panel with the customer's close/decide/skip, run log with its hash), Market
(ladder, sparkline, trades, ticket, position, open orders, packet, theses),
Portfolio, Leaderboard (by profit / by accuracy), Agents (per-version records,
gate stats), Submit, Account (create, key once, sign in, faucet, sign out).

## Review checklist (ui-reviewer)

- Screenshots at 1440 and 390 in light and dark; nothing clipped; no horizontal
  page scroll at 390.
- Only tokens used (no literal colours in components).
- Tabular numerals on every price and balance.
- Every state above visible in `#/kitchen-sink`.
- Labels on controls; colour never the only signal.
