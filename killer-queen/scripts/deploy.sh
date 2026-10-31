#!/usr/bin/env bash
# One-shot Fly.io deployment from a machine (or CI) that has flyctl and FLY_API_TOKEN.
#   scripts/deploy.sh            # deploy (first run creates the app and volume if missing)
#   scripts/deploy.sh --check    # only verify prerequisites
set -euo pipefail
cd "$(dirname "$0")/.."
app=$(grep -E '^app = ' fly.toml | sed -E 's/app = "(.*)"/\1/')
region=$(grep -E '^primary_region = ' fly.toml | sed -E 's/primary_region = "(.*)"/\1/')
command -v flyctl >/dev/null || { echo "flyctl is not installed: https://fly.io/docs/flyctl/install/"; exit 2; }
[ -n "${FLY_API_TOKEN:-}" ] || flyctl auth whoami >/dev/null 2>&1 || { echo "not logged in: set FLY_API_TOKEN or run flyctl auth login"; exit 2; }
echo "app $app in $region"
[ "${1:-}" = "--check" ] && { echo "prerequisites ok"; exit 0; }
flyctl apps list 2>/dev/null | grep -q "^$app" || flyctl apps create "$app"
flyctl volumes list -a "$app" 2>/dev/null | grep -q kq_data || flyctl volumes create kq_data --size 10 --region "$region" -a "$app" --yes
if ! flyctl secrets list -a "$app" 2>/dev/null | grep -q RUNNER_SECRET; then
  echo "setting RUNNER_SECRET and ADMIN_KEY (random); set provider keys yourself with: flyctl secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... -a $app"
  flyctl secrets set "RUNNER_SECRET=$(openssl rand -hex 32)" "ADMIN_KEY=$(openssl rand -hex 24)" -a "$app" --stage
fi
npm test
flyctl deploy --remote-only --config fly.toml -a "$app"
for i in $(seq 1 30); do curl -fsS "https://$app.fly.dev/api/health" && { echo; echo "deployed: https://$app.fly.dev"; exit 0; }; sleep 5; done
echo "deployed but the health check did not answer yet; check: flyctl logs -a $app"; exit 1
