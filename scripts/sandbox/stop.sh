#!/bin/bash
#
# Stops the HR-ERP SANDBOX servers started by start.sh.
# Kills the backend (:3001) and admin (:5173) by recorded PID, falling back to
# whatever is listening on those ports. The sandbox DB is left untouched.

set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT="/Users/lerchbalazs/dev/HR-ERP-PROJECT"
RUN_DIR="$ROOT/.sandbox-run"

say()  { printf "\033[1;33m▸ %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }

printf "\033[1;36m=== Stopping HR-ERP SANDBOX ===\033[0m\n"

# Kill the whole process group of a recorded PID (npm spawns child processes).
kill_pidfile() {
  local f="$1" label="$2"
  [ -f "$f" ] || return 0
  local pid; pid="$(cat "$f" 2>/dev/null)"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    say "Stopping $label (pid $pid)…"
    kill "$pid" 2>/dev/null
    pkill -P "$pid" 2>/dev/null   # children (nodemon/vite)
  fi
  rm -f "$f"
}

# Fallback: kill whatever still listens on a port.
kill_port() {
  local port="$1" label="$2"
  local pids; pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -n -P 2>/dev/null)"
  if [ -n "$pids" ]; then
    say "Freeing port $port ($label)…"
    echo "$pids" | xargs kill 2>/dev/null
  fi
}

kill_pidfile "$RUN_DIR/backend.pid" "backend"
kill_pidfile "$RUN_DIR/admin.pid"   "admin"
sleep 1
kill_port 3001 "backend"
kill_port 5173 "admin"

ok "Sandbox stopped. (Production and the sandbox database are untouched.)"
echo
echo "This window will close in 3 seconds…"
sleep 3
