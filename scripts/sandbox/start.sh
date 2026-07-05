#!/bin/bash
#
# One-click SANDBOX launcher for the HR-ERP admin.
#
# Starts the backend (dev:sandbox, port 3001) and the admin SPA (Vite, port
# 5173) against the *synthetic sandbox DB only*, waits until both answer, then
# opens http://localhost:5173 in Chrome. Production is never contacted.
#
# Safe to double-click repeatedly: if a server is already up it is reused, not
# duplicated. Servers run detached (nohup) so you can close the Terminal window
# and they keep running — use "HR-ERP Sandbox – Stop.command" to stop them.
#
# Source of truth lives in the repo; the Desktop .command file just calls this.

set -u

# GUI-launched .command files get a minimal PATH — add the two Homebrew/node
# prefixes we actually need (node in /usr/local/bin, psql in /opt/homebrew/bin).
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT="/Users/lerchbalazs/dev/HR-ERP-PROJECT"
BACKEND_DIR="$ROOT/hr-erp backend/hr-erp-backend"
ADMIN_DIR="$ROOT/hr-erp-admin"
RUN_DIR="$ROOT/.sandbox-run"
DB_NAME="hr_erp_sandbox"
BACKEND_URL="http://localhost:3001/health"
ADMIN_URL="http://localhost:5173"

mkdir -p "$RUN_DIR"

say()  { printf "\033[1;33m▸ %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }
err()  { printf "\033[1;31m✗ %s\033[0m\n" "$1"; }

port_up() { lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1; }

# Poll a URL until it answers (any HTTP status) or we give up.
wait_http() {
  local url="$1" label="$2" tries="${3:-60}"
  for ((i=1; i<=tries; i++)); do
    if curl -s -o /dev/null -m 2 "$url"; then ok "$label ready"; return 0; fi
    sleep 1
  done
  err "$label did not come up after ${tries}s — see logs in $RUN_DIR"
  return 1
}

printf "\033[1;36m=== HR-ERP SANDBOX (synthetic data — production untouched) ===\033[0m\n"

# --- 0. Ensure the sandbox DB exists (first-run bootstrap) ------------------
if ! psql -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  say "Sandbox DB '$DB_NAME' not found — building it (sandbox:reset)…"
  ( cd "$BACKEND_DIR" && npm run sandbox:reset ) || { err "sandbox:reset failed"; read -r -p "Press Enter to close…"; exit 1; }
  ok "Sandbox DB created + seeded"
fi

# --- 1. Backend (dev:sandbox, port 3001) -----------------------------------
if port_up 3001; then
  ok "Backend already running on :3001 (reusing)"
else
  say "Starting backend (dev:sandbox) on :3001…"
  ( cd "$BACKEND_DIR" && nohup npm run dev:sandbox > "$RUN_DIR/backend.log" 2>&1 & echo $! > "$RUN_DIR/backend.pid" )
  wait_http "$BACKEND_URL" "Backend" 60 || { err "Backend failed — tail of log:"; tail -n 25 "$RUN_DIR/backend.log"; read -r -p "Press Enter to close…"; exit 1; }
fi

# --- 2. Admin SPA (Vite, port 5173) ----------------------------------------
if port_up 5173; then
  ok "Admin already running on :5173 (reusing)"
else
  say "Starting admin (Vite) on :5173…"
  ( cd "$ADMIN_DIR" && nohup npm run dev > "$RUN_DIR/admin.log" 2>&1 & echo $! > "$RUN_DIR/admin.pid" )
  wait_http "$ADMIN_URL" "Admin" 60 || { err "Admin failed — tail of log:"; tail -n 25 "$RUN_DIR/admin.log"; read -r -p "Press Enter to close…"; exit 1; }
fi

# --- 3. Open Chrome --------------------------------------------------------
say "Opening $ADMIN_URL in Chrome…"
open -a "Google Chrome" "$ADMIN_URL"

echo
ok "Sandbox is up."
echo "   Admin:    $ADMIN_URL"
echo "   Login:    admin@sandbox.local  /  sandbox123"
echo "   Logs:     $RUN_DIR/{backend,admin}.log"
echo "   To stop:  double-click  \"HR-ERP Sandbox – Stop.command\"  on the Desktop"
echo
echo "You can close this window — the servers keep running in the background."
