#!/usr/bin/env bash
# Block edits to secrets, journal data and lockfiles.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.env|*.env.*|*/data/*|*.db|*.db-wal|*/package-lock.json)
    echo "Blocked: $f is protected (secrets, journal data or lockfile)." >&2; exit 2;;
esac
exit 0
