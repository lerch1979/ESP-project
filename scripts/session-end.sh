#!/usr/bin/env bash
# session-end.sh — prompt for a handoff summary and prepend it to SESSION_LOG.md.
# Run after wrapping up. Does NOT auto-commit; suggests the command instead.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG="SESSION_LOG.md"
if [[ ! -f "$LOG" ]]; then
  echo "SESSION_LOG.md not found at repo root. Aborting."
  exit 1
fi

read_block() {
  # Read multi-line input until a line containing only "."
  local prompt="$1"
  echo
  echo "$prompt"
  echo "  (end with a single '.' on its own line; blank = skip)"
  local line content=""
  while IFS= read -r line; do
    [[ "$line" == "." ]] && break
    content+="$line"$'\n'
  done
  printf '%s' "$content"
}

TIMESTAMP="$(date '+%Y-%m-%d %H:%M')"
DATE="$(date '+%Y-%m-%d')"

DID=$(read_block "WHAT WAS DONE in this session?")
NEXT=$(read_block "WHAT'S NEXT (priority order)?")
BUGS=$(read_block "BUGS / TODOs discovered?")
DECISIONS=$(read_block "ARCHITECTURAL DECISIONS made?")
CTX=$(read_block "CONTEXT for next session?")

NEW_BLOCK=$(cat <<EOF

## SESSION $TIMESTAMP

### WHAT WAS DONE
${DID:-_(none recorded)_}
### WHAT'S NEXT
${NEXT:-_(none recorded)_}
### BUGS / TODOs DISCOVERED
${BUGS:-_(none)_}
### ARCHITECTURAL DECISIONS
${DECISIONS:-_(none)_}
### CONTEXT FOR NEXT SESSION
${CTX:-_(see PROJECT_STATE.md)_}

---
EOF
)

# Insert after the header section (after the first "---" line)
TMP="$(mktemp)"
awk -v block="$NEW_BLOCK" '
  /^---$/ && !done {
    print
    print block
    done = 1
    next
  }
  { print }
' "$LOG" > "$TMP"
mv "$TMP" "$LOG"

echo
echo "Appended new entry at top of $LOG."
echo
echo "Suggested commands to commit:"
echo "  git add SESSION_LOG.md PROJECT_STATE.md"
echo "  git diff --cached SESSION_LOG.md"
echo "  git commit -m \"docs: session log $DATE\""
echo
echo "Done."
