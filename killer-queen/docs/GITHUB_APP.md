# GitHub app (v1 customer path)

A customer installs the Killer Queen GitHub app on a repository, then opens
markets from an issue or pull request by commenting `/kq task`. The exchange
posts the odds back as a check run on the PR and finishes the check when the
chosen agent's run settles. The app never trades: the only things it does on
the exchange are create a task, close it and decide it, as the customer account
mapped to the installation.

## Commands (issue or PR comments)

| Comment | Effect |
| --- | --- |
| `/kq task [--test "<command>"] [--agents a,b] [--minutes N] [--private]` | Opens one market per candidate agent at the PR head commit (or the default branch head for an issue). Prompt = title + body. Defaults: `GITHUB_DEFAULT_TEST_COMMAND`, `GITHUB_DEFAULT_AGENTS`, 10 minutes. `--private` makes the task visible only to vetted traders. |
| `/kq decide <agent>` / `/kq decide skip` | Closes trading if still open, then decides. Only the installation that submitted the task may decide. |
| anything else after `/kq` | Replies with usage. |

One task per issue/PR URL (`task.source`); a second `/kq task` is refused.
Bot comments are ignored; deliveries are de-duplicated by `X-GitHub-Delivery`.

## Install

1. Create a GitHub App (Settings → Developer settings → GitHub Apps → New):
   - Webhook URL: `https://<exchange>/api/github/webhook`, secret = `GITHUB_WEBHOOK_SECRET`.
   - Permissions (the minimum, see below). Subscribe to events: **Issue comment**.
   - Generate a private key; store the PEM in `GITHUB_PRIVATE_KEY` (newlines may be `\n`-escaped).
2. Install the app on the customer's repositories. Note the installation id
   (from the install URL or the `installation.id` in any delivery).
3. Create the customer account on the exchange (`POST /api/admin/accounts`
   with a `personId`, or sign-up in sandbox) and map it:
   `GITHUB_INSTALLATIONS={"<installation id>":"<customer account id>"}`.
   Restart; the log shows `github app <id>: N installation(s)`.
4. Set `PUBLIC_URL` so comments and check runs link to the right place.

## Minimum permission scopes and why

| Permission | Level | Needed for |
| --- | --- | --- |
| Metadata | Read | mandatory for every app |
| Issues | Read & write | read `issue_comment` events, post the reply comment with the task link and odds |
| Pull requests | Read | `GET /repos/{o}/{r}/pulls/{n}` for the PR head commit |
| Contents | Read | `GET /repos/{o}/{r}/commits/{branch}` for an issue's default-branch head |
| Checks | Write | create and update the "Killer Queen odds" check run on the PR head |

No `Administration`, no `Workflows`, no user-level permissions. The app
authenticates as itself with an RS256 JWT (`iss` = app id, 10-minute expiry)
and exchanges it for a one-hour installation token
(`POST /app/installations/{id}/access_tokens`), cached until expiry.

## Security

- Every delivery is verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw
  body, constant-time compare) before the body is read. Wrong signature → 401.
- The installation id in the payload (signed by GitHub) is the identity; the
  commenting user is not trusted for anything. Mapping installation →
  customer is operator config, never derived from the payload.
- Check-run state lives in memory; after a restart, odds stop updating for
  tasks created before the restart (the exchange state itself is unaffected).

Sources: GitHub docs on validating webhook deliveries
(docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries) and
installation tokens
(docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
Check runs: `POST /repos/{owner}/{repo}/check-runs`, `PATCH …/check-runs/{id}`
(Checks REST API).
