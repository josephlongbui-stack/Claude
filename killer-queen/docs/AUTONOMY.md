# Autonomy and consent

Joseph Bui, October 30, 2026: "I accept and allow everything." Claude Code may take
every action in this repo without asking, until the app is built.

What this means for every session:
- Never stop to wait for approval or permission.
- When the spec is silent, choose the most reasonable option, record it in
  docs/SPEC_DECISIONS.md, and continue.
- When something truly needs the owner (developer accounts, payment, legal
  review, production credentials), record exactly what is needed in
  docs/BUILD_LOG.md and continue with everything else.
- Tests, invariants and the auditor subagents replace human approval as the
  gate for "done". Never weaken a test to make it pass.
