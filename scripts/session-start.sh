#!/usr/bin/env bash
# session-start.sh — print everything a fresh Claude (or human) needs to know
# to resume work in this repo. Read-only; no side effects.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bar() { printf '\n%s\n' "════════════════════════════════════════════════════════════════════"; }
hdr() { bar; printf '  %s\n' "$1"; bar; }

hdr "PROJECT_STATE.md (first 100 lines)"
if [[ -f PROJECT_STATE.md ]]; then
  head -100 PROJECT_STATE.md
else
  echo "  (PROJECT_STATE.md is missing — check repo root)"
fi

hdr "Latest SESSION_LOG.md entry"
if [[ -f SESSION_LOG.md ]]; then
  # Print from the first "## SESSION" heading down to (but not including) the next one.
  awk '
    /^## SESSION/ { c++; if (c == 1) p = 1; else exit }
    p { print }
  ' SESSION_LOG.md
else
  echo "  (SESSION_LOG.md is missing)"
fi

hdr "git log (last 10)"
git log --oneline -10

hdr "git status"
git status --short || true

hdr "Open TODOs in SESSION_LOG"
if [[ -f SESSION_LOG.md ]]; then
  grep -nE '^\- (TODO|FIXME|⏳|❗)' SESSION_LOG.md || echo "  (none flagged)"
fi

bar
printf '  Ready. Suggested next action: read PROJECT_STATE.md fully, then resume.\n'
bar
