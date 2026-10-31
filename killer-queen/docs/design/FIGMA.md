# Design reference (D3): no Figma; design board used

No Figma MCP connection exists in this session (no plugin, no `figma` MCP
server), so the brief's fallback applies: the four screens were designed as a
static page built only from the tokens and type scale in
`docs/DESIGN_SYSTEM.md`, with the demo content from `npm run seed:demo`.

- Source: `src/web/design-board/index.html` and `board.css` (which imports
  `src/web/styles/fonts.css`, `tokens.css` and `base.css`, the same files the
  app uses from D4 on).
- Route: `/design-board/` on any dev server after `npm run build:web` (served
  as a static page next to the app; `--no-board` skips it).
- Frames, screenshot at 1440×900 and 390×844 in light and dark after the third
  round of fixes: `docs/design/board/<frame>-<width>-<theme>.png` for
  `arena`, `task`, `market-open`, `market-settled`, `portfolio` (20 files).
- Every later screen (D6) is compared against these frames instead of a Figma
  frame; the kitchen sink (D4) shows the same components in every state.

## Checklist rounds

Round 1 (desktop fine; phones failed 6 and 8): the top bar did not collapse,
the arena table and the task table were wider than 390, the odds-rail labels
overlapped, chart axis labels were clipped, prompt and log clamps cut a line
in half. Round 2: `.page` zeroed the horizontal gutters, so content touched
the edges and the sticky trade bar overflowed by one gutter; portfolio tables
still too wide. Round 3: no overflow in any frame at either width, fonts
confirmed loaded (IBM Plex Sans 400/500/600, Condensed 600, Mono 400),
countdown amber only under a minute.

## Decisions that differ from or extend DESIGN_SYSTEM.md, and why

1. **Phone top bar** collapses to wordmark, balance and a menu button as the
   brief says; the "Demo data" badge and the theme toggle move into the menu
   sheet so the bar stays one line at 390.
2. **Arena on phones** is still one table, reflowed with CSS grid rows: the
   task line (title, repo, commit) spans the row, then agent | chance |
   change | the two quick buttons stacked. Volume and Closes are hidden
   below 720 px; the countdown moves next to the title on the task page.
3. **Odds rail** labels stack into rows when they would overlap; labels on
   lower rows end at their own pin so a taller pin never crosses them. The
   board does this statically; D7 does it from the live prices.
4. **Chart** is a step line on the full 1–99 axis with hairlines at 1, 25,
   50, 75 and 99 and caption-size labels at the right edge. A flat-looking
   line is the honest picture of a market that barely moved.
5. **Order book** is one three-column grid: Yes bids | Price | No bids, best
   prices nearest the spread row, depth bars in the outcome tints, prices in
   the outcome colour. The brief's layout, made explicit.
6. **Ticket** adds a Fee line between Cost and "Pays if right", because the
   fee is part of what is locked; the submit reads "Buy Yes at 61¢" and the
   side buttons show both prices with the chosen side solid.
7. **Settled market** keeps the three columns: the ticket column becomes
   "Your result" (held, average cost, paid out, profit, link to the
   portfolio) and the settlement panel sits under the chart, with the book
   replaced by one line ("The order book cleared at settlement…").
8. **Portfolio summary** is four label/value pairs in condensed numerals
   (Cash, Locked in orders, Open positions, Realized P&L) with the play-money
   note at the end of the line; no stat cards, no dot separators.
9. **Page titles** use `--t-h2` (24 px); `--t-h1` is reserved for the
   sign-in and error pages. Section titles use `--t-h3`.
10. **Wordmark** is the name in IBM Plex Sans Condensed 600 at 20 px next to
    a Lucide crown (one component, so the name can change after the
    trademark search).
11. **Agent rows** print the name in 500 weight and the bare version in
    `--ink-3`, no "v" prefix; the record reads "Passed 3 of 6".
12. **Change** is "▲ 3" in `--yes`, "▼ 5" in `--no`, "0" in `--ink-3`.
13. **Demo data** is a warn-tint pill in the top bar whenever the journal
    holds the demo seed.
