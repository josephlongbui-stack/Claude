# Build log

Newest first. Each prompt appends what it did, what it decided, and anything
blocked (with exactly what the owner needs to provide).

## 2026-10-31 — 0.2-alt v0 build and 0.3 invariants
- Built v0 from the spec in the spec's stack, test-first, one commit per
  slice: engine (ten commands, matching, netting, settlement, views), SQLite
  journal with replay and a golden journal, Express API (every route in the
  spec table), runner protocol with HMAC + timestamp window + single-use
  runId, simulated runner, boot with auto-close/auto-decide, house market
  maker, heuristic traders, LLM adapters (Anthropic, OpenAI, Gemini), HTTP bot
  client, Preact web app, sandbox seed. 95 tests pass (`npm test`,
  `npm run typecheck`). The web click path was verified in a headless
  browser (MANUAL.md).
- Decisions added while building: D12–D25 in docs/SPEC_DECISIONS.md.
- docs/ARCHITECTURE.md lists every difference from the product spec as an
  issue; docs/INVARIANTS.md names the proving test for each rule (one gap:
  crash injection between apply and commit, prompt 1.4).
- Bug found by the bot tests and fixed in the engine: counter-generated ids
  (`tsk_n`, `acc_n`, `o<n>`, `c<n>`) could collide with explicitly supplied
  ids and overwrite them; counters now skip taken ids (test in
  accounts.test.ts).
- Golden journal hash: 81aff1598d953d97786b3e28d21f619ad73be0e1b46336b5a8374a8e95b0db0f
  (first value; `scripts/make-golden.ts`).
- Owner actions needed:
  1. Copy `.claude/settings.json` from KILLER_QUEEN_PROMPTS.md "Setup files"
     (the cloud session may not write Claude permission settings).
  2. To turn on LLM traders: set a lab's API key AND its model id env var
     (looked up from the provider's docs; not guessed here).
  3. `runner/agents.json` holds the spec's example CLI templates; verify the
     flags against each CLI's docs before the Phase 2 runner uses them.
- Not done (later prompts): fast-check property tests over all ten commands
  (1.1), crash injection (1.4), rate limits and idempotency keys (1.5), SSE
  (3.1), design system (3.2), deploy (3.6).

## 2026-10-31 — 0.0 Bootstrap
- Created the setup files from KILLER_QUEEN_PROMPTS.md "Setup files" and the
  folder layout; converted docs/source/Killer_Queen_Product_Doc.pdf into
  docs/PRODUCT_SPEC.md (link targets recovered from the PDF annotations).
- Project lives in killer-queen/ inside the josephlongbui-stack/Claude repo
  because the repo root was not empty (the coding prompt pack's rule).
- BLOCKED: `.claude/settings.json` (permission allowlist + hook wiring) was not
  written: the cloud session's safety classifier refuses to let Claude write
  its own permission settings. Owner action: copy the `.claude/settings.json`
  block from KILLER_QUEEN_PROMPTS.md "Setup files" into place locally. The hook
  scripts, agents and skills it references are all in .claude/.
- Also kept docs/source/Killer_Queen_Coding_Prompt_Pack.md (the slice-by-slice
  engineering rules) as a second source document.

## 2026-10-31 — 0.1 Spec and decisions
- Cross-checked docs/PRODUCT_SPEC.md against the PDF text: every number, env
  variable and route present (only page numbers differ).
- Tightened D1–D11 into testable rules with status; added D12–D23 for the
  engine calls the spec leaves open (ids/time, fee lock, when unchosen markets
  settle, quote fields, realized P&L, sell/market orders, staff, self-trades,
  simulated runner determinism, journal durability, accuracy, trading window).
- Wrote docs/ROADMAP.md: v0–v3 with gates and per-feature acceptance
  statements, including the per-screen checklists prompt 3.3 refers to.
