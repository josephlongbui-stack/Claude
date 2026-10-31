#!/usr/bin/env bash
# Restore drill: boot a fresh instance from the latest backup and compare its state hash with the live exchange.
#   KQ_URL=https://killer-queen.fly.dev ADMIN_KEY=... BACKUP_DOWNLOAD_CMD='aws s3 cp s3://bucket/kq/latest.db {file}' scripts/restore-drill.sh
# Without BACKUP_DOWNLOAD_CMD it uses the newest file in ./backups.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
file="$work/restore.db"
if [ -n "${BACKUP_DOWNLOAD_CMD:-}" ]; then
  cmd=${BACKUP_DOWNLOAD_CMD//\{file\}/$file}
  echo "downloading: $cmd"; eval "$cmd"
else
  latest=$(ls -t backups/*.db 2>/dev/null | head -1 || true)
  [ -n "$latest" ] || { echo "no backups/*.db and no BACKUP_DOWNLOAD_CMD" >&2; exit 2; }
  cp "$latest" "$file"; echo "using $latest"
fi
restored=$(npx tsx scripts/state-hash.ts --db "$file")
echo "restored: $restored"
if [ -n "${KQ_URL:-}" ] && [ -n "${ADMIN_KEY:-}" ]; then
  live=$(curl -fsS -H "x-admin-key: $ADMIN_KEY" "$KQ_URL/api/admin/state-hash")
  echo "live:     $live"
  rh=$(echo "$restored" | sed -E 's/.*"hash":"([0-9a-f]+)".*/\1/'); lh=$(echo "$live" | sed -E 's/.*"hash":"([0-9a-f]+)".*/\1/')
  ra=$(echo "$restored" | sed -E 's/.*"applied":([0-9]+).*/\1/'); la=$(echo "$live" | sed -E 's/.*"applied":([0-9]+).*/\1/')
  if [ "$rh" = "$lh" ]; then echo "OK: restored state matches live ($ra commands)"; else echo "DIFFERS: restored has $ra commands, live has $la (expected if trading continued since the backup; re-run right after a backup to compare exactly)"; fi
fi
# Boot a throwaway instance from the restored journal to prove it serves.
DB_PATH="$file" KQ_MODE=sandbox RUNNER=simulated HOUSE_BOTS= LOG_LEVEL=silent node --import tsx -e '
  const { boot } = await import("./src/server/boot.ts");
  const b = await boot({ listen: 0, timers: false });
  const h = await (await fetch(b.url + "/api/health")).json();
  console.log("fresh instance from backup:", JSON.stringify(h));
  await b.stop();
'
