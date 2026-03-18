#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# HR-ERP Platform — Start All Services
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/hr-erp backend/hr-erp-backend"
ADMIN_DIR="$PROJECT_DIR/hr-erp-admin"
MOBILE_DIR="$PROJECT_DIR/hr-erp-mobile"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║     HR-ERP Platform — Starting Services      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Kill existing processes on target ports ────────────────────────
echo -e "${YELLOW}Cleaning up existing processes...${NC}"

for PORT in 3001 5173 8082; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    kill $PID 2>/dev/null
    echo -e "  ${GREEN}✓${NC} Killed process on port $PORT (PID: $PID)"
    sleep 1
  fi
done

# ─── Ensure PostgreSQL is running ───────────────────────────────────
if ! pg_isready -q 2>/dev/null; then
  echo -e "  ${YELLOW}Starting PostgreSQL...${NC}"
  PG_SERVICE=$(brew services list | grep postgresql | head -1 | awk '{print $1}')
  [ -n "$PG_SERVICE" ] && brew services start "$PG_SERVICE" 2>/dev/null
  sleep 2
fi
echo -e "  ${GREEN}✓${NC} PostgreSQL is running"

# ─── Start Backend (port 3001) ──────────────────────────────────────
echo -e "\n${BLUE}Starting Backend API (port 3001)...${NC}"
osascript -e "
  tell application \"Terminal\"
    do script \"cd '$BACKEND_DIR' && echo '═══ HR-ERP Backend (port 3001) ═══' && npm run dev\"
    set custom title of front window to \"HR-ERP Backend\"
  end tell
" >/dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Backend terminal opened"

sleep 2

# ─── Start Admin UI (port 5173) ─────────────────────────────────────
echo -e "${BLUE}Starting Admin UI (port 5173)...${NC}"
osascript -e "
  tell application \"Terminal\"
    do script \"cd '$ADMIN_DIR' && echo '═══ HR-ERP Admin UI (port 5173) ═══' && npm run dev\"
    set custom title of front window to \"HR-ERP Admin\"
  end tell
" >/dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Admin UI terminal opened"

sleep 2

# ─── Start Mobile Web (port 8082) ───────────────────────────────────
echo -e "${BLUE}Starting Mobile Web (port 8082)...${NC}"
osascript -e "
  tell application \"Terminal\"
    do script \"cd '$MOBILE_DIR' && echo '═══ HR-ERP Mobile Web (port 8082) ═══' && npx expo start --web --port 8082\"
    set custom title of front window to \"HR-ERP Mobile\"
  end tell
" >/dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Mobile Web terminal opened"

# ─── Success ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║         ✅ All Services Starting!             ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Backend API  → http://localhost:3001        ║"
echo "║  Admin UI     → http://localhost:5173        ║"
echo "║  Mobile Web   → http://localhost:8082        ║"
echo "║                                              ║"
echo "║  Login:                                      ║"
echo "║    admin@hr-erp.com / password123            ║"
echo "║    toth.anna@abc-kft.hu / password123        ║"
echo "║                                              ║"
echo "║  Stop all:  ./stop-all.sh                    ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
