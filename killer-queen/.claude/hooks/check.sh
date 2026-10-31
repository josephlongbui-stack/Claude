#!/usr/bin/env bash
# After a TypeScript edit, typecheck the package that owns the file.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in *.ts|*.tsx) ;; *) exit 0;; esac
d=$(dirname "$f")
while [ "$d" != "/" ] && [ ! -f "$d/package.json" ]; do d=$(dirname "$d"); done
[ -f "$d/tsconfig.json" ] || exit 0
out=$(cd "$d" && npx tsc --noEmit 2>&1) || { echo "$out" | tail -30 >&2; exit 2; }
exit 0
