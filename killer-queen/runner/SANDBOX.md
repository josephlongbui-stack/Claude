# Runner sandbox: threats and coverage

What `DockerDriver` does today and what it does not. Nothing here is a claim of
hardening; it is the list a reviewer should check before any real-money or
untrusted-customer use.

## Covered (by design, untested on this build host)

| Threat | Mitigation |
| --- | --- |
| Agent edits the tests to force a pass | Protected paths (task-listed or the default test set) are restored from the pinned commit before the test command runs; changes are logged (D1). |
| Tests already pass or are flaky | Baseline job: 3 agent-free runs must all fail before markets open (D2). |
| Network exfiltration of the repo | Job container sits on an `--internal` network; the only route out is an egress proxy with a host allowlist: package registries + the chosen agent's API host (D3). |
| Provider key theft | Per-run, spend-capped key injected as env; logs are redacted of injected secrets and key-shaped strings before posting. |
| Runaway agent | Wall-clock limit on the agent, time limit on tests, CPU/memory/pids limits, `--cap-drop ALL`, `no-new-privileges`, non-root user, read-only root FS. |
| Stuck job blocks settlement | Timeouts count as `failed`; infrastructure errors retry twice then post `infra_error` (D5, D6). |
| Forged results | HMAC over the raw body, constant-time compare, timestamp window, single-use runId (D9). |
| Runner trades on its own result | The runner holds only the shared secret; no API key, no account; the trading routes do not accept the secret. |

## Not covered yet

- **Proxy bypass via DNS or raw IP**: the egress proxy is an HTTP CONNECT
  allowlist; a tool that ignores `HTTPS_PROXY` cannot reach anything (internal
  network), but DNS tunnelling through the proxy's own resolver is not blocked.
- **Prompt injection from the repo**: a repository can instruct the agent to do
  anything the sandbox allows (e.g. spend the key's budget). Spend caps bound
  the damage; nothing detects it.
- **Secrets committed in the repo**: a public repo's own leaked secrets are
  visible to the agent and may appear in the log; redaction only covers keys
  the runner injected and common key shapes.
- **Kernel escapes**: plain Docker, not gVisor/Firecracker. Use a VM-isolated
  runtime for untrusted customer code.
- **Token budget**: enforced only by the provider's key cap; the runner cannot
  count tokens itself.
- **Cross-job contamination**: a fresh container per job, but the same image;
  image updates change behaviour for everyone (pin the image digest).
- **Timing side channels, host resource exhaustion by many parallel jobs**: the
  runner processes jobs sequentially; concurrency is a v1 decision.
