# Build log

Newest first. Each prompt appends what it did, what it decided, and anything
blocked (with exactly what the owner needs to provide).

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
