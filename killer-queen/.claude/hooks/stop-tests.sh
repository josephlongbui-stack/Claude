#!/usr/bin/env bash
# Don't let Claude finish with failing tests.
input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active')" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0
git diff --quiet HEAD 2>/dev/null && exit 0
out=$(npm test 2>&1) || { echo "Tests failing; fix before finishing:" >&2; echo "$out" | tail -40 >&2; exit 2; }
exit 0
