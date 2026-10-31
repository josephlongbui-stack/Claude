# Killer Queen design system

## The idea

Killer Queen should feel like a precise instrument: a trading screen crossed with a test
report. Calm, dense and exact everywhere, with boldness spent in exactly two places: the odds
rail, which shows every agent's chance on one line, and the settlement moment, when the tests
run and the market pays.

Audience: engineers who use coding agents every day, people who build AI agents, and
engineering teams deciding which agent to run. They read numbers fast and distrust decoration.

Light mode is the default. Dark mode is a full second theme, not an inverted afterthought.

## Colour

Light

| Token | Hex | Use |
| --- | --- | --- |
| --canvas | #F1F3F6 | Page background |
| --surface | #FFFFFF | Panels, tables, the ticket |
| --surface-sunken | #E9ECF1 | Inputs, table header, code blocks |
| --ink | #15181E | Primary text, primary buttons |
| --ink-2 | #4A5261 | Secondary text |
| --ink-3 | #6B7385 | Tertiary text, placeholders (14px and up only) |
| --rule | #DDE1E8 | Hairlines, table row dividers |
| --rule-strong | #C3C9D3 | Panel borders, input borders |
| --yes | #00875A | Yes, passed, price up |
| --yes-tint | #E3F5EE | Yes backgrounds |
| --no | #C8295F | No, failed, price down |
| --no-tint | #FBE7EE | No backgrounds |
| --warn | #B25E00 | Closing soon, flaky, infra error |
| --warn-tint | #FFF1DD | Warning backgrounds |
| --focus | #2F6BFF | Focus ring only |

Dark

| Token | Hex |
| --- | --- |
| --canvas | #0E1116 |
| --surface | #161A21 |
| --surface-sunken | #1D222B |
| --ink | #E8EBF0 |
| --ink-2 | #A9B1BE |
| --ink-3 | #8590A0 |
| --rule | #2A303A |
| --rule-strong | #3A414D |
| --yes | #2FC28A |
| --yes-tint | #10261E |
| --no | #FF5C8F |
| --no-tint | #2B1520 |
| --warn | #F0A23B |
| --warn-tint | #2A1D0B |
| --focus | #6E9BFF |

Rules
- There is no brand gradient and no brand purple. The brand is ink plus the two outcome colours.
- Yes and No are always paired with a word or a sign, never colour alone.
- Price up is --yes with ▲, price down is --no with ▼, unchanged is --ink-3 with no arrow.
- Primary buttons are --ink on --surface text. Yes and No trade buttons use their colour.

## Type

Families (one superfamily, three roles)
- IBM Plex Sans 400/500/600: all interface text.
- IBM Plex Sans Condensed 500/600: large numerals (20px and up) and the wordmark.
- IBM Plex Mono 400/500: only content that is code: prompt, repo, commit, test command, run
  logs, API keys. Never for labels, never for small data.

Every number uses tabular figures (font-variant-numeric: tabular-nums).

Scale (size / line height, px)

| Token | Size | Use |
| --- | --- | --- |
| --t-caption | 12 / 16 | Axis labels, footnotes |
| --t-dense | 13 / 18 | Table cells, book ladder |
| --t-ui | 14 / 20 | Default interface text |
| --t-body | 16 / 24 | Prompts, theses, explanations |
| --t-h3 | 20 / 26, 600 | Panel titles |
| --t-h2 | 24 / 30, 600 | Task titles on the task page |
| --t-h1 | 32 / 36, 600 | Page titles (rare) |
| --t-num-m | 20 / 24 condensed 600 | Prices in tables |
| --t-num-l | 44 / 44 condensed 600 | Prices on the task page |
| --t-num-xl | 72 / 72 condensed 600 | The market page's chance |

Letter spacing -0.01em at 24px and up, 0 below. No all-caps anywhere. Line length under 75
characters for any paragraph.

## Space, shape, depth

- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.
- Radius: 4 for inputs, buttons and pills; 8 for panels and sheets; 0 for table rows inside
  a panel. Fully round only for avatars and status dots.
- Panels have a 1px --rule-strong border and no shadow.
- Shadow only on things that float above the page (menus, sheets, toasts, the mobile ticket):
  0 8px 24px rgba(16,24,40,.12), 0 1px 2px rgba(16,24,40,.08).
- Icons: one set (Lucide), 16px and 20px, 1.5px stroke. No emoji anywhere.

## Layout

Desktop: content max 1280px, 24px gutters, left-aligned. Mobile: 16px gutters, single column.

App shell

```
+----------------------------------------------------------------------------------+
| Killer Queen   Arena  Portfolio  Leaderboard  Agents       Play money  $1,000.00 (o)|
+----------------------------------------------------------------------------------+
```

Arena: one table grouped by task. No cards.

```
Arena                                    [Closing soon] Most traded  New  Settled

Task                                    Agent             Chance  Change  Volume  Closes
---------------------------------------------------------------------------------------
Reject negative quantities in the       Claude Code 2.4   74¢     ▲ 3      981    6:42
cart API                                Codex 0.98        69¢     ▲ 7    1,204
harbor-labs/shop-api  58b0ce4           Gemini CLI 1.9    41¢     ▼ 5      310
---------------------------------------------------------------------------------------
Fix timezone drift in invoice exports   ...
```

Each agent row links to its market and has compact "Yes 74¢" and "No 27¢" buttons at the end.

Task page

```
Reject negative quantities in the cart API                        Closes in 6:42
harbor-labs/shop-api   58b0ce4   pytest tests/api/test_cart.py    Baseline failing 3 of 3

 1¢ |-----------------|----------------|----------------|-----------------| 99¢
                          Gemini CLI 41¢          Codex 69¢   Claude Code 74¢

Agent             Chance  Bid / ask  Volume  Traders  Record
Claude Code 2.4   74¢     73 / 75      981      14    Passed 9 of 13
...

Prompt
+------------------------------------------------------------------------------+
| POST /cart/items accepts quantity -3 ... (mono, full text, expandable)        |
+------------------------------------------------------------------------------+
```

Market page: packet left (320), chart and book centre, ticket right (320, sticky).

```
+ Packet -----------+  + -------------------------------------+  + Ticket -------+
| Codex 0.98        |  | 69¢   69% chance Codex passes  ▲ 7    |  | Buy | Sell    |
| Passed 8 of 12    |  |                                       |  | Yes 69¢ No 32¢|
| Prompt (mono)     |  |   price history, step line, 1-99 axis |  | Contracts 10  |
| Repo / commit     |  |                                       |  | Limit 69¢     |
| Test command      |  +---------------------------------------+  | Cost $6.90    |
| Baseline          |  | Order book: Yes bids | price | No bids |  | Pays $10.00   |
+-------------------+  +---------------------------------------+  | [Buy Yes 69¢] |
                        Theses   Trades                            +---------------+
```

On 390 wide: chance and chart first, then a sticky "Buy Yes / Buy No" bar that opens the
ticket as a sheet, then the packet, book, theses and trades.

Portfolio: a plain summary line (cash, locked, open value, realized P&L, no stat cards), then
positions, open orders and settled history tables.

## Signature: the odds rail

One horizontal axis from 1¢ to 99¢ per task, with a hairline track and quiet ticks at 25, 50
and 75. Each candidate agent is a marker at its Yes price: a 2px vertical tick, the agent name
and price in --t-dense above it, and a thin bar behind it from its best bid to its best ask.
The highest-priced agent's marker is solid --ink; the rest are --ink-2. Labels never overlap:
when two are close, the later one moves to a second row with a short leader line. Prices move
with a spring (stiffness 300, damping 30). After settlement the chosen agent's marker moves to
99¢ in --yes or 1¢ in --no; unchosen markers turn --ink-3 and read "Settled at 54¢". Screen
readers get a list: "Claude Code, 74 cents. Codex, 69 cents. Gemini CLI, 41 cents."

## The one animation: settlement

The only unprompted motion in the app. When a task resolves while someone is watching:
1. The settlement panel opens under the chart (200ms).
2. The last 12 lines of the run log stream in, sped up (600ms total).
3. A strip of cells, one per test, fills --yes or --no from left to right (400ms).
4. A stamp lands: "Passed" or "Failed", with "Yes paid 100¢" or "Yes paid 0¢" (200ms).
5. The viewer's position counts into their cash (400ms).
Reduced motion: final state, no animation. Arriving on a settled market: final state.

Everything else moves only in answer to the person: menus open, sheets slide, a fill gives a
brief highlight of the changed row. No entrance animations, no hover lift.

## Components

Button (primary, secondary, quiet, yes, no; sizes 32 and 40), PriceCell, ChangeCell,
AgentRow, OddsRail, OrderTicket, BookLadder, PacketView, StatusPill (open, closing soon,
closed, running, passed, failed, settled at close, skipped), Countdown, TopBar, Table header
and row, Tabs, Input, Select, EmptyState, Skeleton, Toast, SettlementPanel, Avatar with an
agent mark for AI traders.

## States

Every screen designs these where they apply: loading (skeleton shaped like the content),
empty, thin book (one side only), no trades yet, closing in under a minute (Countdown turns
--warn), closed waiting for decision, running, settled passed, settled failed, settled at
closing price, skipped, offline, server error.

## Words

- Sentence case everywhere. No all-caps labels, no eyebrow labels over headings.
- Buttons say what happens and keep the same name through the flow: "Buy Yes at 69¢", then a
  toast "Bought 10 Yes at 69¢".
- Prices are "69¢"; chance is "69% chance"; money is "$6.90"; play money is labelled once in the
  top bar and in the footer.
- Errors say what happened and what to do: "Not enough play money. You need $6.90 and have
  $4.10." They never apologise.
- Empty states invite an action: "No positions yet. Pick an agent in the Arena to make your
  first trade."
- Say "agent" for the coding agent and "trader" for whoever trades. Use the spec's words:
  task, market, packet, thesis, closing price.

## Accessibility

WCAG 2.2 AA contrast for every text and token pair; visible 2px --focus ring with 2px offset;
44px touch targets on mobile; every price, change and chart has a text equivalent; full
keyboard use of the ticket; respects prefers-reduced-motion and 200% text zoom.

## Never

- Gradients, gradient text, glows, glass effects on content, purple or indigo brand colour.
- Rows of identical rounded cards with soft shadows; "stat cards" with a big number, a label and
  an icon.
- Emoji, mixed icon sets, illustrations or stock imagery.
- ALL-CAPS or tracked-out labels, eyebrow labels, "A · B · C" meta strings, "→" on buttons or
  links, one highlighted word in a heading.
- Centred marketing heroes inside the app.
- Browser-default form controls, native alert or confirm dialogs.
- Fake-looking data: "Test", "lorem", "user123", round numbers everywhere, empty charts.
- Raw JSON, ids, "undefined", "NaN", "null" or stack traces in the UI.
- Fade-up entrances on sections, hover lift on rows, spinners as the only loading state.
- Any colour, size or spacing value that isn't a token.

## Ship checklist

A screen ships when every answer is yes.
1. Does it use only tokens (lint:styles passes)?
2. Is the most important number the most prominent thing on the screen?
3. Are tables real tables, with numbers right-aligned and tabular?
4. Is every state from "States" designed and reachable?
5. Does every string follow "Words"?
6. Does it hold up at 390 wide with no horizontal scroll and nothing clipped?
7. Does it pass axe with zero violations in light and dark?
8. Does nothing on it appear in the "Never" list?
9. Would a designer at a top fintech company ship it as is?
