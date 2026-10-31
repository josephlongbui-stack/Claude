# Runbook

Operating the Killer Queen exchange. Everything here works against the
Dockerfile / fly.toml deployment; adapt paths for another host.

## Deploy

1. `npm test && npm run typecheck` on the commit you are deploying.
2. Secrets live only in the platform: `fly secrets set RUNNER_SECRET=<32+ random chars> ADMIN_KEY=<random> ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=...` (a lab's trader is on only when both its key and model are set).
3. `fly deploy` (builds the Dockerfile; the web app is built in the image).
4. Watch `fly logs` for `listening on … (sandbox, runner simulated)` and `journal /data/killer-queen.db: replayed N commands`; `curl https://<app>/api/health` must return `{"ok":true,…}`.
5. First boot on an empty volume: `fly ssh console -C "npx tsx scripts/seed.ts"` with the server stopped (`fly scale count 0`, seed, `fly scale count 1`) or let boot register the executors and submit tasks through the UI.

Live mode (`KQ_MODE=live`) additionally needs `RUNNER=external`, a runner host
(see `runner/`), and refuses to start otherwise.

## Roll back

`fly releases` then `fly deploy --image <previous image>`; the journal is
append-only, so an older build replays a newer journal as long as the command
set is backward compatible. If a release added a command type (see
`docs/BUILD_LOG.md`), rolling back before it was first used is safe; after,
replay would stop with `journal replay rejected <type>` and the machine will
not boot. In that case roll forward.

## Pause trading

```bash
curl -X POST https://<app>/api/admin/trading -H "x-admin-key: $ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"paused":true,"reason":"incident 42"}'
```

Orders are refused with `409 trading_paused`; cancels, close, decide and
settlement continue. Resume with `{"paused":false}`. The switch is a journaled
command (`pauseTrading`), so it survives restarts and shows in `/api/health`.

## Backups

- `scripts/backup-journal.ts` takes a consistent `VACUUM INTO` copy of the
  journal (safe during trading) and uploads it when `BACKUP_UPLOAD_CMD` is set
  (`{file}` is substituted).
- Nightly: on the machine, `crontab -e` →
  `17 3 * * * cd /app && BACKUP_UPLOAD_CMD='aws s3 cp {file} s3://<bucket>/kq/' node --import tsx scripts/backup-journal.ts >> /data/backup.log 2>&1`
  (or a Fly scheduled machine running the same command with the volume attached).
- Keep 30 daily copies; the journal is small (one row per command).

## Restore

1. Stop the machine (`fly scale count 0`) so nothing appends.
2. Download the backup to the volume: `fly ssh console` →
   `aws s3 cp s3://<bucket>/kq/<file> /data/killer-queen.db` (move the old file
   aside first; never delete it).
3. Start the machine; boot replays the journal and logs `replayed N commands`.
4. Compare: `scripts/restore-drill.sh` prints the restored hash and the live
   hash (`GET /api/admin/state-hash`), and boots a throwaway instance from the
   backup to prove it serves. Run the drill monthly even without an incident.

Anything that happened after the backup is lost; announce it, and let the
customers re-submit. Never edit rows to "fix" state: corrections are new
commands (admin settle, pause).

## Rotate RUNNER_SECRET

1. Generate a new secret (`openssl rand -hex 32`).
2. `fly secrets set RUNNER_SECRET=<new>` (the exchange restarts).
3. Update the runner host's env and restart the runner. Results posted with
   the old secret get `401 bad_signature` and are retried with the new one
   (same `runId`, so nothing settles twice).
4. Check `GET /api/runner/jobs` with the new secret returns 200.

## Rotate ADMIN_KEY

`fly secrets set ADMIN_KEY=<new>`; nothing else references it.

## Incidents

- **Wrong settlement**: never edit the journal. Pause trading, then record the
  correction as new commands: in sandbox `POST /api/admin/tasks/:id/settle`
  cannot re-settle a resolved task, so open a replacement task and explain in
  the arena; for real money this needs a documented reversal command (v2).
- **Journal halted** (`/api/health` shows `halted`): the last append failed
  (disk full?). Memory and disk may differ by one command; restart the
  machine, which replays the committed journal; the un-journaled command is
  gone and its caller never got a 2xx.
- **Runner down**: tasks stay `running`; markets wait. Check the runner logs;
  results carry a 5-minute timestamp window, so a late result must be posted
  fresh by the runner, not replayed from a log.
- **Rate-limited bots**: house bots run in-process and are not rate limited;
  outside agents see `429` with `Retry-After`.

## Observability

- Logs are JSON lines with `LOG_FORMAT=json` (`src/server/log.ts`); ship them
  with the platform's log drain.
- `ERROR_REPORT_URL` posts each `logger.error` as JSON to a webhook; to use
  Sentry, point it at a Sentry webhook or replace `reportError` in
  `src/server/log.ts` with the SDK (one call site).
- `/api/health` returns mode, runner, applied command count, halted state and
  the trading pause.
