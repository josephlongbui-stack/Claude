# Design system

Killer Queen looks like an exchange, not a demo: calm surfaces, one accent,
numbers that line up, and the number people care about (the chance, in cents)
as the largest thing on any screen. Nothing is decorated; every colour means
something and never means it alone. Reference renders are in `docs/design/`
(markets, task and market pages at 1440 and 390, dark and light).

## Principles

1. **Numbers first.** Every price, quantity and balance is set in the body
   face with tabular, lining numerals (`.num`, `.price`), so columns align and
   values do not jump when they update. Monospace is reserved for things that
   are literally code: commits, commands, prompts, logs, keys (`.code`,
   `.chip`, `.prompt`, `.log`, `.key-box`).
2. **Colour never alone.** Yes is green, No is red, warnings are amber, but
   each state also says its name in text: pills carry the word, outcomes print
   "passed" or "failed", the ticket's button says "Buy Yes · 10 contracts".
3. **Every state designed.** Loading (`Skeleton`), empty (`EmptyState`),
   error (`ErrorState` with retry), thin book, no trades, pending baseline,
   open, closed with the decide step, running, resolved, skipped, rejected,
   cancelled, corrected. `#/kitchen-sink` shows all of them.
4. **Dark by default, light by choice.** Tokens are defined once for dark and
   once for light; the OS preference applies unless the top-bar toggle pins a
   theme (`data-theme` on `<html>`, remembered per browser).
5. **One layout rhythm.** 1200 px content width, 16 px grid gap, cards with a
   head and a body, two-column `split` pages with a sticky sidebar at
   1000 px and up, single column below. No horizontal page scroll at 390;
   wide tables scroll inside `.table-wrap`.
6. **Honest money.** Every balance carries "play money · no cash value": the
   top-bar balance pill, the Portfolio and Account headers, the footer.

## Tokens (`src/web/styles.css`)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` / `--bg-2` | #0b0d11 / #0f1218 | #f6f7f9 / #f0f2f5 | page, prompt and log wells |
| `--panel` / `--panel-2` | #141821 / #1b2029 | #ffffff / #f3f5f8 | cards, buttons, hover rows |
| `--line` / `--line-2` | #252b36 / #2e3542 | #e4e7ed / #d5dae3 | borders, table rules, inputs |
| `--text` / `--text-2` | #e9ecf2 / #c3c9d6 | #121622 / #2f3646 | text |
| `--muted` / `--faint` | #8b93a7 / #5f6878 | #5f6878 / #9aa3b5 | secondary text, hints |
| `--yes`, `--yes-bg` | #2ebd6b | #1f9d58 | Yes side, pass |
| `--no`, `--no-bg` | #ef5a52 | #d8463f | No side, fail, errors |
| `--accent`, `--accent-bg` | #7aa2ff | #2f63e9 | primary button, links, sparkline, closed states |
| `--warn`, `--warn-bg` | #f2b02d | #b7780a | pending, running, thin book |
| `--focus` | #9cc2ff | #2f63e9 | focus ring |
| `--font` | Inter, then the system sans | | all text |
| `--mono` | ui-monospace, SF Mono, Menlo, Consolas | | code only |
| `--fs-xs … --fs-3xl` | 11 / 12.5 / 14 / 16 / 20 / 26 / 34 px | | type scale |
| `--s-1 … --s-10` | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px | | spacing |
| `--r-sm / --r-md / --r-lg / --r-pill` | 6 / 10 / 14 / 999 px | | radii |

Contrast: text on panel ≥ 7:1 in both themes; muted ≥ 4.5:1; Yes/No on
their tinted backgrounds ≥ 4.5:1. The mobile app's `mobile/src/ui/tokens.ts`
carries the same palette.

## Layout classes

| Class | Purpose |
| --- | --- |
| `.topbar`, `.brand`, `.nav`, `.balance`, `.icon-btn` | sticky top bar: mark + name, primary nav, theme toggle, balance pill (or Sign in) |
| `.page-head` + `h1` + `.sub` | page title row with an optional control on the right (segmented filter, primary action) |
| `.card`, `.card-head`, `.card-body(.tight)`, `.card.flush` | the only container; `flush` lets tables and rows run edge to edge |
| `.grid.grid-2/3/4` | equal columns; 4 → 2 at 1000 px, 2 and 3 → 1 at 640 px, 4 → 2 at 640 px |
| `.split` + `.side` | 2:1 main/sidebar; sidebar sticky; `.trade-first` puts the sidebar first on phones |
| `.stat` | KPI card: `.label`, `.value`, `.hint` |
| `.row(.between/.wrap)`, `.stack`, `.grow`, `.ellipsis` | flex helpers |
| `.table-wrap`, `tr.click`, `th.r / td.r` | tables; right-aligned numeric columns |
| `.empty(.error)`, `.skeleton`, `.callout(.info/.warn/.yes/.no)`, `.toast(.err)` | states and feedback |

## Controls

`button` / `.btn` (36 px, panel surface), `.primary` (accent), `.ghost`,
`.danger`, `.yes` / `.no` (outlined side pickers, `.on` when selected),
`.fill-yes` / `.fill-no` (the submit), `.block`, `.lg`. `.segmented` for
exclusive filters. Inputs and selects share one 36 px height and the
`--line-2` border; `label` sits above, `.help` below. `.check` for checkbox
rows. `.pill` carries a status word with a dot (`.kind` pills have no dot).

## Components (`src/web/components/index.tsx`)

| Component | Shows | States |
| --- | --- | --- |
| `Card` | title, sub, actions, body; `flush` | |
| `Stat` | label, value, hint | |
| `Segmented` | exclusive options with `aria-pressed` | |
| `Pill` | a status word | pending, open, closed, running, resolved, settled, skipped, rejected, cancelled, passed, failed, private, kind |
| `PriceCell` | a price in cents, tabular | plain, Yes, No, md, big (the chance), missing (—) |
| `ChanceBar` | a 0–100 bar under a candidate | live, muted (not open) |
| `AgentRow` | one candidate: name, org, version, record, chance bar, chance, bid/ask, volume, outcome and chosen pills | pending, open, closed, running, settled (chosen/unchosen), cancelled |
| `OrderBookLadder` | Yes bids and No bids with depth bars | full, thin (warning), empty open, cleared after close |
| `OrderTicket` | Yes/No pickers prefilled with the ask, action, type, price, quantity, lock preview, submit | open, signed out, closed, pending/cancelled (blocked reason) |
| `PacketView` | prompt (optional), repo@commit, test command, executor record, baseline, closes | compact / full |
| `ThesisList` | theses with the poster's name, stated probability and time; optional form | with form, read-only, empty |
| `Sparkline` | Yes price per trade as an SVG line with an area fill | ≥ 2 trades, no trades |
| `Skeleton`, `EmptyState`, `ErrorState` | loading / empty with action / error with retry | |

Rules: components take data from the API only; no mock data in screens; every
control has a label (`<label for>`, `aria-label`, `aria-pressed` on toggles);
every interactive element the end-to-end walk touches keeps its `data-testid`.

## Screens

Markets (`#/`: stats strip, live/settled/all filter, task cards with a chance
bar per candidate and the market's favourite), Task (status, candidates,
packet, result or decide card, how it settles), Market (chance hero, order
book, price, recent trades, theses; ticket, position and open orders, packet
in the sidebar), Portfolio (cash and P&L stats, positions, open orders,
settled history), Leaderboard (by profit / by accuracy), Agents (per-version
records, exchange health), Submit (form with what happens next), Account
(create with the key shown once, sign in, faucet, sign out).

## Review checklist

- Screenshots at 1440 and 390 in light and dark; nothing clipped; no
  horizontal page scroll at 390.
- Only tokens used (no literal colours in components).
- Tabular numerals on every price and balance; monospace only on code.
- Every state above visible in `#/kitchen-sink`.
- Labels on controls; colour never the only signal.
