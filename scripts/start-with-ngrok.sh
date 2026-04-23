#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-with-ngrok.sh
# One-shot external-testing launcher: brings up backend + admin + mobile +
# ngrok tunnel, then prints the public URL(s) (with QR if qrencode is
# available).
#
# Free ngrok tier: 1 static domain per account. By default we start ONLY the
# `admin` tunnel — the Vite dev server serves the admin UI and proxies
# `/api/*` to the local backend on the same origin, so a single URL covers
# both the UI and the API without CORS work.
#
# To start all 3 tunnels (requires paid ngrok with multiple reserved
# domains — otherwise they collide on the one static domain):
#   NGROK_MODE=all ./scripts/start-with-ngrok.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/hr-erp backend/hr-erp-backend"
ADMIN_DIR="$PROJECT_DIR/hr-erp-admin"
MOBILE_DIR="$PROJECT_DIR/hr-erp-mobile"
LOG_DIR="$PROJECT_DIR/logs/ngrok-session"
mkdir -p "$LOG_DIR"

NGROK_MODE="${NGROK_MODE:-admin}" # admin (default) | all | backend
NGROK_API="http://127.0.0.1:4040/api/tunnels"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

log()  { printf "${BLUE}[start-with-ngrok]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[start-with-ngrok]${NC} %s\n" "$*"; }

port_in_use() { lsof -ti ":$1" >/dev/null 2>&1; }

kill_port() {
  local p=$1
  local pid
  pid=$(lsof -ti ":$p" 2>/dev/null || true)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  # wait up to 3s for release
  for _ in 1 2 3; do port_in_use "$p" || return 0; sleep 1; done
  return 0
}

# ─── 1. Ensure ngrok is installed and authtoken configured ──────────────────
command -v ngrok >/dev/null || { warn "ngrok not in PATH. Install: brew install ngrok"; exit 1; }

NGROK_CFG_MAC="$HOME/Library/Application Support/ngrok/ngrok.yml"
NGROK_CFG_XDG="$HOME/.config/ngrok/ngrok.yml"
if [ ! -f "$NGROK_CFG_MAC" ] && [ ! -f "$NGROK_CFG_XDG" ]; then
  warn "No ngrok config found. Run: ngrok config add-authtoken <YOUR_TOKEN>"
  exit 1
fi

# ─── 2. Start local services (skip if already running on the expected port) ─
start_backend() {
  if port_in_use 3001; then log "Backend already running on :3001"; return; fi
  log "Starting backend on :3001"
  ( cd "$BACKEND_DIR" && nohup node src/server.js > "$LOG_DIR/backend.log" 2>&1 & )
}
start_admin() {
  if port_in_use 5173; then log "Admin UI already running on :5173"; return; fi
  log "Starting admin UI on :5173"
  ( cd "$ADMIN_DIR" && nohup npm run dev > "$LOG_DIR/admin.log" 2>&1 & )
}
start_mobile() {
  if port_in_use 8082; then log "Mobile dev server already running on :8082"; return; fi
  log "Starting mobile (Expo web) on :8082"
  ( cd "$MOBILE_DIR" && nohup npx expo start --web --port 8082 > "$LOG_DIR/mobile.log" 2>&1 & )
}

start_backend
start_admin
[ "$NGROK_MODE" = "all" ] && start_mobile

# Wait for services to accept connections
wait_for_port() {
  local p=$1 name=$2 tries=30
  while (( tries-- )); do port_in_use "$p" && { log "$name up on :$p"; return; }; sleep 1; done
  warn "$name did not come up on :$p (continuing anyway — check $LOG_DIR)"
}
wait_for_port 3001 "backend"
wait_for_port 5173 "admin"
[ "$NGROK_MODE" = "all" ] && wait_for_port 8082 "mobile"

# ─── 3. Start ngrok ─────────────────────────────────────────────────────────
if pgrep -f "ngrok start" >/dev/null; then
  log "ngrok already running — not restarting"
else
  case "$NGROK_MODE" in
    all)     NGROK_ARGS="--all" ;;
    backend) NGROK_ARGS="backend" ;;
    admin)   NGROK_ARGS="admin" ;;
    *) warn "Unknown NGROK_MODE=$NGROK_MODE — falling back to admin"; NGROK_ARGS="admin" ;;
  esac
  log "Starting ngrok ($NGROK_ARGS)"
  nohup ngrok start $NGROK_ARGS --log=stdout > "$LOG_DIR/ngrok.log" 2>&1 &
fi

# ─── 4. Poll :4040 for tunnel URLs ──────────────────────────────────────────
log "Waiting for tunnel URLs…"
URLS_JSON=""
for _ in $(seq 1 30); do
  URLS_JSON=$(curl -s "$NGROK_API" 2>/dev/null || true)
  if echo "$URLS_JSON" | grep -q '"public_url"'; then break; fi
  sleep 1
done

if ! echo "$URLS_JSON" | grep -q '"public_url"'; then
  warn "ngrok did not expose tunnels — check $LOG_DIR/ngrok.log"
  exit 1
fi

# ─── 5. Print URLs (+ QR if possible) ───────────────────────────────────────
printf "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${GREEN}║           HR-ERP external access is live                 ║${NC}\n"
printf "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}\n\n"

NGROK_JSON="$URLS_JSON" python3 <<'PY'
import json, os
data = json.loads(os.environ.get("NGROK_JSON", "{}"))
tunnels = data.get("tunnels", [])
if not tunnels:
    print("(no tunnels)")
else:
    # De-dupe by public_url — on free tier multiple tunnels collapse to one.
    seen = {}
    for t in tunnels:
        url = t["public_url"]
        seen.setdefault(url, []).append((t["name"], t["config"]["addr"]))
    for url, pairs in seen.items():
        names = ", ".join(n for n, _ in pairs)
        addrs = ", ".join(a for _, a in pairs)
        print(f"  {url}")
        print(f"    serves: {names}  ->  {addrs}")
        print()
PY

# QR code — optional
if command -v qrencode >/dev/null 2>&1; then
  FIRST_URL=$(echo "$URLS_JSON" | python3 -c 'import json,sys; t=json.load(sys.stdin)["tunnels"]; print(t[0]["public_url"] if t else "")')
  if [ -n "$FIRST_URL" ]; then
    printf "${DIM}(QR for %s)${NC}\n" "$FIRST_URL"
    qrencode -t ANSIUTF8 "$FIRST_URL"
  fi
else
  printf "${DIM}Tip: brew install qrencode — and this script will print a QR code here.${NC}\n"
fi

printf "\n${DIM}Logs:${NC}\n"
printf "${DIM}  backend: $LOG_DIR/backend.log${NC}\n"
printf "${DIM}  admin:   $LOG_DIR/admin.log${NC}\n"
printf "${DIM}  ngrok:   $LOG_DIR/ngrok.log${NC}\n"
printf "${DIM}Stop everything: ./stop-all.sh (also kills ngrok with pkill -f 'ngrok start')${NC}\n\n"
