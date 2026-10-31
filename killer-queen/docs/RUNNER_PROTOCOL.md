# Runner protocol

The runner is a separate service, so nobody with a position touches a result
(product spec). It polls the exchange for jobs, executes them in a sandbox,
and posts signed results. The exchange never trusts an unsigned result and the
runner never trades. This document is the contract between `src/server`
(exchange side) and `runner/` (service side); decisions D1–D6 and D9 in
`docs/SPEC_DECISIONS.md` are the source.

## Job types

| Kind | When | What the runner does | Result |
| --- | --- | --- | --- |
| `baseline` | A task was submitted and its status is `pending` (D2) | Clone the repo at the pinned commit, run the test command 3 times with **no agent**, each run under the test time limit | `results: ["failed","failed","failed"]` opens the markets; any other mix rejects the task (`trivial` when all 3 pass, `flaky` when mixed) |
| `run` | The customer (or auto-decide) chose an agent and the task is `running` | Fresh container, clone at the commit, run the chosen agent's CLI with the prompt under the wall-clock and token limits (D5), restore protected paths from the commit (D1), run the test command once under the test time limit | `outcome: passed` (exit 0), `failed` (non-zero, timeout, limit exceeded), or `infra_error` after two retries (D6) |

A task's statuses: `pending → open → closed → running → resolved`, or
`closed → skipped`, or `pending → rejected`. Only `pending` and `running` tasks
appear as jobs. Tasks created without the baseline requirement
(`BASELINE_CHECK=false`, or v0 journals) open immediately.

## Job states (runner side)

`queued → preparing (clone, checkout) → executing (baseline runs or agent) →
testing → posting → done`, or `→ retrying` (infrastructure failure, at most
two retries, same `runId`) `→ infra_error`. The runner keeps this in memory
and in its own log; the exchange only ever sees the final posted result.

## Polling

```
GET /api/runner/jobs
Authorization: Bearer <RUNNER_SECRET>
```

```json
{ "jobs": [
  { "kind": "baseline", "taskId": "tsk_1", "repo": "github.com/org/repo", "commit": "58b0ce4",
    "testCommand": "pytest tests/api/test_cart.py", "protectedPaths": [], "createdAt": 1793400000000 },
  { "kind": "run", "taskId": "tsk_2", "executorId": "codex",
    "executor": { "id": "codex", "name": "Codex", "org": "OpenAI", "version": "0.48.0" },
    "prompt": "...", "repo": "...", "commit": "...", "testCommand": "...", "protectedPaths": [], "decidedAt": 1793400600000 }
] }
```

Poll every few seconds (`RUNNER_POLL_MS`). A job stays listed until its result
is accepted, so a runner must remember which `taskId`s it is already working
on (the service keeps an in-memory set and a per-task lock file). Two runners
sharing one secret would race; v1 runs one runner per exchange.

## Posting a result

```
POST /api/runner/results
content-type: application/json
x-kq-signature: sha256=<hex HMAC-SHA256 of the raw request body under RUNNER_SECRET>
```

Run result body (D9):

```json
{ "kind": "run", "taskId": "tsk_2", "runId": "run_7f3c…", "outcome": "passed",
  "log": "…full log…", "logSha256": "<hex sha256 of log>", "timestamp": 1793401200000 }
```

Baseline result body:

```json
{ "kind": "baseline", "taskId": "tsk_1", "runId": "base_12ab…", "results": ["failed","failed","failed"],
  "log": "…", "logSha256": "<hex>", "timestamp": 1793400100000 }
```

Correction body (D36), when a result turns out to be wrong:

```json
{ "kind": "correction", "taskId": "tsk_2", "runId": "run_9a1…", "outcome": "passed",
  "log": "…re-run log…", "logSha256": "<hex>", "timestamp": 1793402000000, "reason": "runner ran the wrong commit" }
```

Rules the exchange enforces, in order:

1. **Signature.** The header must be `sha256=` + HMAC-SHA256 of the exact raw
   bytes, compared in constant time. Missing or wrong → `401 bad_signature`;
   nothing else is read.
2. **Shape.** zod-validated; unknown fields rejected. `kind` defaults to `run`
   and the product spec's `{ taskId, passed, log }` body is still accepted
   (`passed` maps to `passed | failed`).
3. **Timestamp.** If present, `|server now − timestamp| ≤ 5 minutes`, else
   `401 stale_result`. Required in live mode.
4. **Log hash.** If `logSha256` is present it must equal sha256 of `log`, else
   `400 log_hash_mismatch`. The engine journals sha256(log) alongside the log,
   so the published log can be checked later.
5. **State.** A `run` result needs the task in `running` (else
   `409 task_not_running`); a `baseline` result needs `pending` (else
   `409 task_not_pending`); a `correction` needs `resolved`, a different
   outcome, and every payout recipient still holding its payout (else
   `409 cannot_reverse`, and the operator compensates by hand). `runId`, if present, must be unused across both
   kinds (`409 run_id_used`); required in live mode.

The result is journaled as a `settle` or `baseline` command. A second valid
post for the same task is rejected by state, so retries are safe: post again
with the same `runId` until a 2xx or a 4xx other than a network error.

## Limits and retries (D5, D6)

| Limit | Env (runner) | Default |
| --- | --- | --- |
| Agent wall-clock | `RUN_WALL_CLOCK_MS` | 30 minutes |
| Agent token budget | `RUN_TOKEN_BUDGET` | 2,000,000 (enforced through the provider's spend-capped key; exceeding it is a `failed`) |
| Test command | `TEST_TIMEOUT_MS` | 10 minutes per run |
| Clone and checkout | `PREPARE_TIMEOUT_MS` | 5 minutes |
| Infrastructure retries | `INFRA_RETRIES` | 2 |

Exceeding the agent wall-clock or token budget, or the test timeout, is a
`failed` outcome (the agent had its chance). A container that cannot start, a
clone that cannot complete, a provider outage, or a driver error is an
infrastructure failure: retry up to `INFRA_RETRIES` times, then post
`infra_error`, which settles the chosen market at its closing price and does
not count in the agent's record.

## Sandbox requirements for `run` jobs (D1, D3, D5)

- Fresh container per job, non-root user, CPU/memory/pids limits.
- Network egress only to package registries plus the chosen agent's model API
  host (per-agent allowlist); everything else is refused.
- The agent's provider key is a per-run, spend-capped key injected as an
  environment variable; it never appears in the posted log (the runner redacts
  every secret it injected and every string that looks like a provider key).
- After the agent exits, protected paths (the task's `protectedPaths`, or the
  repo's test directories, test files and test-runner config by default) are
  restored from the pinned commit; any attempted change is listed in the log
  under `protected paths restored`.
- The test command runs after the restore, inside the same container, with
  the network still restricted.

`runner/SANDBOX.md` lists the threats this does and does not cover.

## Clock skew and identity

The runner signs with the shared secret only; there is no runner account and
it cannot call any trading route with it. `RUNNER_SECRET` rotation: set the
new secret on the exchange and the runner at the same time (results in flight
with the old secret get `401` and are retried with the new one). The 5-minute
window tolerates ordinary clock skew; keep both hosts on NTP.
