---
name: ship
description: Final checks, roadmap update, commit and PR for the current work.
disable-model-invocation: true
---
1. npm test and npm run typecheck; stop and fix on any failure.
2. Tick finished items in docs/ROADMAP.md and the current docs/plans/ file.
3. Append a dated line to docs/BUILD_LOG.md: what changed, what's left.
4. Commit with a clear message; if a GitHub remote exists, push and open a PR
   with gh.
