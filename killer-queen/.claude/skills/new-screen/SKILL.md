---
name: new-screen
description: Recipe for building or reworking a web or mobile screen. Use whenever a task creates or substantially changes a screen.
---
1. Read docs/DESIGN_SYSTEM.md and the matching image in docs/design/ if any.
2. Data only from the API and the event stream; no mock data in screens.
3. Design every state: loading, empty, thin book, no trades, closed, running,
   settled, error.
4. Tokens only; tabular numerals for prices; mono for packets.
5. Accessibility: labels on every control, price and chart; colour never alone.
6. testIDs (mobile) / data-testid (web) on everything an end-to-end test touches.
7. Screenshot (Playwright MCP for web, Expo MCP for mobile), compare with the
   design, fix, then run the ui-reviewer subagent.
