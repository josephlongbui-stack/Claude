#!/usr/bin/env bash
cd "$CLAUDE_PROJECT_DIR" || exit 0
echo "Branch: $(git branch --show-current 2>/dev/null), uncommitted files: $(git status --porcelain 2>/dev/null | wc -l)"
ls -t docs/plans/*.md 2>/dev/null | head -1 | sed 's/^/Latest plan: /'
tail -5 docs/BUILD_LOG.md 2>/dev/null
