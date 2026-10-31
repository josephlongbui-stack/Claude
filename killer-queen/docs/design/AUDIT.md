# Design audit (D1)

Screenshots of the app as it stands before the overhaul are in
`docs/design/before/`, named `<route>-<width>-<theme>.png`, taken at 1440×900
and 390×844 (full page) in light and dark against the sandbox server with the
demo seed, the house market maker and the house traders running. The set
covers every route, the signed-out views, an empty exchange, an error state and
a settled market. Checked against the "Ship checklist" and the "Never" list in
`docs/DESIGN_SYSTEM.md`. Nothing in the code was changed for this audit.

The one mechanical failure the screenshot run found: **`task-settled-390-*`
scrolls horizontally (538 px wide on a 390 px screen)**, because the run log's
sha256 line (`.help.code` in `src/web/screens/Task.tsx`) and the `.log` block
in `src/web/styles.css` do not wrap.

## Failures that apply to every screen

| Checklist | Finding | Where |
| --- | --- | --- |
| 1 Tokens only | 76 inline `style=` attributes in the screens and components, 14 distinct px values inside them; 46 distinct px values in the stylesheet (153 uses); 34 hex and 16 rgba colours live next to component rules in the one stylesheet. No lint exists. | every `src/web/screens/*.tsx`, `src/web/components/index.tsx`, `src/web/styles.css` |
| 1 Tokens only | Type is Inter, loaded from Google Fonts at runtime, with a system fallback; no IBM Plex, nothing self-hosted. | `src/web/index.html`, `--font` in `styles.css` |
| Never: brand colour | A blue accent (`--accent`) carries links, the primary button, the sparkline, selection and "closed" pills. The brief's brand is ink plus the two outcome colours. | `--accent`, `.primary`, `.pill.closed`, `.sparkline` |
| Never: all-caps | `h3`, the agent-row column labels (CHANCE, BID · ASK, VOLUME) and every table header are uppercase and tracked. Pills carry letter-spacing. | `h3`, `.agent-row .lbl`, `th`, `.pill` in `styles.css` |
| Never: "A · B · C" strings | Meta lines are dot-separated everywhere: "Anthropic · v2.1.0 · 0/0 passed", "chance · 87 traded · 5 traders", "Codex · OpenAI · v0.48.0 · record 0/1", the footer, the balance pill, filter labels ("Live · 3"). | `AgentRow`, `PacketView`, `Market.tsx`, `main.tsx` footer and balance, `Arena.tsx` |
| Never: cards | Rows of identical rounded, bordered cards with shadows are the main layout device (arena, agents). | `.card`, `.task-card`, `.grid` |
| Never: stat cards | Stat cards with a big number, a label and a hint on Arena (4), Portfolio (4) and Agents (4). | `Stat` in `components/index.tsx` |
| Never: browser controls | Selects, checkboxes and number spinners are browser defaults. | `OrderTicket`, `Submit.tsx`, `Account.tsx` |
| Never: arrows | "←" in the market page's back link. | `Market.tsx` |
| Never: dev build | The footer links to the kitchen sink ("Components"); the empty arena tells visitors to "run npm run seed"; executor ids appear as data ("codex", "claude-code", "tsk_1:gemini-cli"). | `main.tsx`, `Arena.tsx`, `Portfolio.tsx`, `Task.tsx` |
| Never: icons | No icon set; a hand-drawn crown mark and two hand-drawn theme icons. | `main.tsx` |
| Default theme | Dark is the default; the brief makes light the default with dark as a full second theme. | `:root` in `styles.css` |
| 4 States | No "closing in under a minute" state, no offline state, no designed server-error or 404 page (the 404 is a bare "No such page"). Skeletons are generic bars, not shaped like the content. | `main.tsx`, `Skeleton` |
| 5 Words | Buttons say "Buy Yes · 10 contracts" rather than "Buy Yes at 69¢"; the fill toast says "Bought 10 YES."; API errors are shown raw with their code, e.g. "insufficient funds (insufficient_funds)"; "Faucet · add $1,000 play money"; the nav says "Markets" where the brief says "Arena". | `OrderTicket`, every `ctx.toast(...)` call, `Account.tsx`, `main.tsx` |
| 7 Accessibility | `--faint` (#5f6878 on #141821) is below 4.5:1 and is used for footer text and thesis timestamps. Tables have no captions. axe has not been run. | `.faint`, `footer`, `.thesis .who` |
| 9 Ship it | No. It reads as a tidy prototype: generic cards, a blue accent, Inter, and no signature element. | |

## Per screen

### Arena (`arena-*`, `signed-out-arena-*`, `empty-arena-*`)
- Task list is a grid of cards, not one table grouped by task (checklist 3; Never: cards). `Arena.tsx`, `.task-card`.
- A strip of four stat cards sits above the list (Never: stat cards). `Stat`.
- No Change, Volume-per-agent or Closes columns and no quick "Yes 74¢ / No 27¢" buttons on agent rows. `Arena.tsx`.
- Repo chips truncate with an ellipsis at narrow widths instead of wrapping.
- Signed out there is only a "Sign in" button; no one-line explanation and no "Start trading with $1,000 in play money" (D5).
- Empty state copy mentions a shell command.

### Task (`task-open-*`, `task-settled-*`)
- No odds rail. Candidates are div rows with uppercase column labels rather than a table with Chance, Bid/ask, Volume, Traders, Record. `AgentRow`, `.agent-row`.
- The status pill sits above a 26 px title; the brief sets 24 px for task titles and puts the countdown on the title line.
- A "How it settles" explainer card fills the sidebar for every visitor.
- Result uses the executor id ("codex failed · No paid 100¢") instead of the name; the sha256 line overflows at 390 (see top).
- No settlement animation; a settled page looks like an open page with the ticket replaced by a callout.

### Market (`market-open-*`, `market-settled-*`, `signed-out-market-*`, `error-market-*`)
- Two-column layout (book and chart left, ticket right) instead of packet (320) | chart and book | ticket (320, sticky). `.split`.
- The chance is 34 px Inter, not 72 px condensed; no "69% chance Codex passes ▲ 7" line and no change at all. `.price.big`.
- Price chart is a smoothed sparkline with no 1–99 axis and no step line. `Sparkline`.
- Order book is two side-by-side tables with uppercase headers; the brief's layout is Yes bids | price | No bids.
- Ticket: browser-default selects for action and type; "Locks $7.00" instead of "Cost $6.90 / Pays $10.00"; the submit says "Buy Yes · 10 contracts".
- Theses show a card header "Theses / 8 posted" and the form above the list; trades and theses are not tabs.
- A settled market shows "0¢" in red as the chance, which reads as a live price rather than a result.
- Error state shows the raw API message under "Something went wrong".

### Portfolio (`portfolio-*`, `signed-out-portfolio-*`)
- Four stat cards for cash and P&L (Never: stat cards); the brief asks for one summary line.
- Open orders show the market id (`tsk_1:gemini-cli`) and positions show executor ids under the title.
- Signed out, the page is a centred empty state with a button.

### Leaderboard (`leaderboard-*`)
- Structure is close (one table, two rankings). Uppercase headers; "#" column; kind pills.

### Agents (`agents-*`)
- A grid of cards plus four "Exchange health" stat cards (Never: cards, stat cards). `Agents.tsx`.
- Records show "—" with no explanation when an agent has no runs.

### Submit task (`submit-*`)
- Browser-default checkboxes and number inputs; two sidebar cards of explanatory copy; a trader sees a centred empty state instead of being told where to go in context.

### Account / API keys / Sign in (`account-*`)
- One screen does three jobs (create, sign in, keys and faucet). The signed-in view has a "Trading through the API" card with inline code, which reads as developer documentation.
- "Faucet · add $1,000 play money" is jargon.

### Kitchen sink (`kitchen-sink-*`)
- Dev-only, but linked from the footer of every page.

### Mobile
- Not screenshotted: no simulator on this host. `mobile/` uses its own hand-written tokens and Menlo for code.

## Inventory of how styles are done today

- **Frameworks:** Preact 11 with hand-written CSS in one file (`src/web/styles.css`, 242 lines, 115 class names, 6 media queries); esbuild bundles the TSX and copies the CSS. No CSS framework, no CSS modules, no lint.
- **Fonts:** Inter 400/500/600 from Google Fonts (runtime request in `index.html`) with the system sans fallback; a mono stack of ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono. Tabular numerals on `.num` and `.price`.
- **Colours:** 34 distinct hex values (59 uses) and 16 rgba values in `styles.css`, defined as `--bg`, `--bg-2`, `--panel`, `--panel-2`, `--line`, `--line-2`, `--text`, `--text-2`, `--muted`, `--faint`, `--yes`/`--yes-2`/`--yes-bg`/`--yes-bg-2`, `--no`/…, `--accent`/`--accent-2`/`--accent-text`/`--accent-bg`, `--warn`/`--warn-bg`, `--focus`, `--shadow`, for dark, light-by-media-query and light-by-attribute (the light block is written twice). No colour literals in TSX.
- **Spacing and size values:** 46 distinct px values in the stylesheet (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 56, 64, 72, 92, 110, 140, 300, 320, 420, 520, 640, 999, 1000, 1200; 153 uses), of which the tokens cover 4, 8, 12, 16, 20, 24, 32, 40 for spacing and 11, 12.5, 14, 16, 20, 26, 34 for type. 76 inline `style=` attributes in TSX carry 14 more distinct px values (5, 6, 8, 10, 12, 16, 18, 20, 24, 32, 48, 84, 140, 160).
- **Type scale:** 7 steps (11, 12.5, 14, 16, 20, 26, 34 px) plus ad-hoc 12, 13, 13.5 px in rules and inline styles.
- **Radii:** 6, 10, 14 px and a pill. **Shadows:** 7 rules (`--shadow` on cards, toasts and sticky bars).
- **Uppercase and tracking:** 3 `text-transform: uppercase` rules, 9 `letter-spacing` rules.
- **Components (16 exports in `src/web/components/index.tsx`):** Pill, PriceCell, ChanceBar, Card, Stat, Segmented, Skeleton, EmptyState, ErrorState, OrderBookLadder, Sparkline, PacketView, chanceOf (helper), AgentRow, ThesisList, OrderTicket. Screens: Arena, Task, Market, Portfolio, Leaderboard, Agents, Submit, Account, KitchenSink (9 files, 1,892 lines of TSX in total with the components and shell).
- **Icons:** none from a set; three inline SVGs (mark, sun, moon).
- **Motion:** skeleton shimmer, 120 ms colour transitions on buttons; reduced-motion disables both.
