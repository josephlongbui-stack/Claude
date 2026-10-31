# Spec decisions

Proposed answers to docs/SPEC_REVIEW.md, adopted for the unattended build.
Prompt 0.1 tightens each into a testable rule.

- D1 Protected paths. Each task lists protected paths (default: test
  directories, test files and test-runner config). After the agent exits, the
  runner restores them from the pinned commit, logs any attempted change, then
  runs the test command.
- D2 Baseline. Before trading opens, the runner runs the test command 3 times at
  the pinned commit. It must fail all 3; a pass rejects the task as trivial,
  mixed results reject it as flaky.
- D3 Network. Per-agent egress allowlist: package registries plus that agent's
  model API host. Agent API keys are scoped and spend-capped.
- D4 Versions. A task freezes each candidate's concrete CLI version and model ID
  at creation. "latest" is rejected. Track records are per version.
- D5 Run limits. Default 30 minutes wall-clock and a token budget per run.
  Exceeding either counts as a fail.
- D6 Infrastructure errors. Retry twice; then the chosen market settles at its
  closing price with outcome infra_error, which does not count in the agent's
  record.
- D7 Closing price. Mid rounds half up to the nearest cent:
  floor((bid + ask + 1) / 2). From v1, surveillance flags large moves in the
  final minute.
- D8 Accounts. Sandbox: faucet once per account per 24 hours. v1: one faucet per
  verified person, limits per device and email, flagged accounts off the
  leaderboard until reviewed.
- D9 Signed results. Body: taskId, runId, outcome (passed | failed |
  infra_error), log, timestamp. Signature: sha256= HMAC-SHA256 of the raw body
  under RUNNER_SECRET, compared in constant time; timestamp within 5 minutes;
  runId single-use; accepted only for a task in running.
- D10 Name and iOS. Trademark search before any store submission. The iOS app
  labels balances "Play money - no cash value", sells no play money, offers no
  prizes.
- D11 Human sign-in. Email magic link or passkeys issue a session. Sign in with
  Apple on iOS if Google sign-in is offered.
