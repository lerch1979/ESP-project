#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# HR-ERP Platform — Stop All Services
# ═══════════════════════════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║     HR-ERP Platform — Stopping Services      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Aggressive pre-kill: any leftover HR-ERP backend processes (nodemon parent
# + direct node child) go first. Prevents EADDRINUSE on next start when a
# zombie nodemon holds stale state but not the port.
pkill -f "nodemon.*hr-erp-backend" 2>/dev/null || true
pkill -f "node src/server.js" 2>/dev/null || true
pkill -f "nodemon.*hr-erp" 2>/dev/null || true
sleep 1

STOPPED=0

for PORT in 3001 5173 8082; do
  PIDS=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    # Graceful shutdown first (SIGTERM), then force if needed
    echo "$PIDS" | xargs kill 2>/dev/null
    sleep 1
    # Check if still running
    REMAINING=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$REMAINING" ]; then
      echo "$REMAINING" | xargs kill -9 2>/dev/null
    fi
    case $PORT in
      3001) SERVICE="Backend API" ;;
      5173) SERVICE="Admin UI" ;;
      8082) SERVICE="Mobile Web" ;;
    esac
    echo -e "  ${GREEN}✓${NC} Stopped ${SERVICE} (port ${PORT})"
    STOPPED=$((STOPPED + 1))
  fi
done

# Also kill zombie nodemons that survived an EADDRINUSE crash (stuck in
# "app crashed - waiting for file changes" — no port, but still holding
# ttys and preventing clean restarts).
ZOMBIES=$(pgrep -f "nodemon.*hr-erp-backend.*src/server.js" 2>/dev/null)
if [ -n "$ZOMBIES" ]; then
  echo "$ZOMBIES" | xargs kill -9 2>/dev/null
  echo -e "  ${GREEN}✓${NC} Cleaned up $(echo "$ZOMBIES" | wc -l | tr -d ' ') orphan nodemon(s)"
fi

if [ $STOPPED -eq 0 ]; then
  echo -e "  ${YELLOW}No HR-ERP services were running${NC}"
else
  echo ""
  echo -e "  ${GREEN}✅ ${STOPPED} service(s) stopped${NC}"
fi

echo ""
