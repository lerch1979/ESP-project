#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# HR-ERP Platform — One-Click Setup
# ═══════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/hr-erp backend/hr-erp-backend"
ADMIN_DIR="$PROJECT_DIR/hr-erp-admin"
MOBILE_DIR="$PROJECT_DIR/hr-erp-mobile"
DB_NAME="hr_erp_db"
MAC_USER=$(whoami)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║       HR-ERP Platform — Setup Script         ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Prerequisites ──────────────────────────────────────────────
step "1/8  Checking prerequisites"

command -v node  >/dev/null 2>&1 || fail "Node.js not found. Install via: brew install node"
command -v npm   >/dev/null 2>&1 || fail "npm not found. Install via: brew install node"
command -v brew  >/dev/null 2>&1 || fail "Homebrew not found. Install from https://brew.sh"

NODE_VER=$(node -v)
ok "Node.js $NODE_VER"
ok "npm $(npm -v)"
ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"

# ─── 2. PostgreSQL ─────────────────────────────────────────────────
step "2/8  PostgreSQL"

if brew list postgresql@14 &>/dev/null; then
  ok "PostgreSQL@14 already installed"
elif brew list postgresql@16 &>/dev/null; then
  ok "PostgreSQL@16 already installed (compatible)"
elif brew list postgresql@15 &>/dev/null; then
  ok "PostgreSQL@15 already installed (compatible)"
elif brew list postgresql &>/dev/null; then
  ok "PostgreSQL already installed"
else
  echo "  Installing PostgreSQL@14..."
  brew install postgresql@14
  ok "PostgreSQL@14 installed"
fi

# Ensure PostgreSQL is running
if brew services list | grep -q "postgresql.*started"; then
  ok "PostgreSQL service is running"
else
  # Try starting whichever version is installed
  PG_SERVICE=$(brew services list | grep postgresql | head -1 | awk '{print $1}')
  if [ -n "$PG_SERVICE" ]; then
    brew services start "$PG_SERVICE"
    sleep 2
    ok "Started $PG_SERVICE service"
  else
    fail "Could not find PostgreSQL service to start"
  fi
fi

# ─── 3. Create database ────────────────────────────────────────────
step "3/8  Database"

if psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME"; then
  ok "Database '$DB_NAME' already exists"
else
  createdb "$DB_NAME" 2>/dev/null && ok "Created database '$DB_NAME'" \
    || fail "Could not create database '$DB_NAME'. Check PostgreSQL is running."
fi

# Quick connectivity test
psql -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1 \
  && ok "Database connection verified" \
  || fail "Cannot connect to database '$DB_NAME'"

# ─── 4. Configure .env files ───────────────────────────────────────
step "4/8  Environment files"

JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CAREPATH_KEY=$(openssl rand -base64 32)

# Backend .env
# If .env exists, ensure PORT and CORS are correct
if [ -f "$BACKEND_DIR/.env" ] && grep -q "DB_HOST" "$BACKEND_DIR/.env" 2>/dev/null; then
  # Fix PORT to 3001
  sed -i '' 's/^PORT=.*/PORT=3001/' "$BACKEND_DIR/.env"
  # Remove duplicate CORS_ORIGIN lines and fix
  grep -v "^CORS_ORIGIN=" "$BACKEND_DIR/.env" > "$BACKEND_DIR/.env.tmp"
  echo "CORS_ORIGIN=http://localhost:5173,http://localhost:8082,http://localhost:19006" >> "$BACKEND_DIR/.env.tmp"
  mv "$BACKEND_DIR/.env.tmp" "$BACKEND_DIR/.env"
  ok "Backend .env updated (PORT=3001, CORS fixed)"
elif [ ! -f "$BACKEND_DIR/.env" ]; then
  cat > "$BACKEND_DIR/.env" << ENVEOF
# ─── Server ──────────────────────────────────
NODE_ENV=development
PORT=3001
API_VERSION=v1

# ─── Database (PostgreSQL) ───────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${MAC_USER}
DB_PASSWORD=
DB_SSL=false

# ─── JWT ─────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# ─── CORS ────────────────────────────────────
CORS_ORIGIN=http://localhost:5173,http://localhost:8082,http://localhost:19006

# ─── Rate Limiting ───────────────────────────
RATE_LIMIT_ENABLED=false
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# ─── CSRF Protection ───────────────────────
CSRF_ENABLED=false

# ─── Security Headers ──────────────────────
SECURITY_HEADERS_ENABLED=true

# ─── File Upload ─────────────────────────────
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# ─── Encryption ──────────────────────────────
ENCRYPTION_KEY=${ENCRYPTION_KEY}
CAREPATH_ENCRYPTION_KEY=${CAREPATH_KEY}

# ─── Claude API ──────────────────────────────
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=1024

# ─── Slack (optional) ────────────────────────
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=

# ─── Email (optional) ────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=

# ─── Logging ─────────────────────────────────
LOG_LEVEL=info

# ─── Frontend URL ────────────────────────────
FRONTEND_URL=http://localhost:5173
ENVEOF
  ok "Backend .env created (port 3001, user: ${MAC_USER})"
fi

# Admin .env
if [ ! -f "$ADMIN_DIR/.env" ]; then
  cat > "$ADMIN_DIR/.env" << ENVEOF
VITE_API_URL=http://localhost:3001/api/v1
ENVEOF
  ok "Admin .env created"
else
  # Ensure correct API URL
  if grep -q "VITE_API_URL" "$ADMIN_DIR/.env"; then
    ok "Admin .env already exists"
  else
    echo "VITE_API_URL=http://localhost:3001/api/v1" >> "$ADMIN_DIR/.env"
    ok "Added VITE_API_URL to Admin .env"
  fi
fi

# Mobile API config — ensure LOCAL_IP = 'localhost'
MOBILE_API="$MOBILE_DIR/src/services/api.js"
if [ -f "$MOBILE_API" ]; then
  if grep -q "const LOCAL_IP" "$MOBILE_API"; then
    sed -i '' "s/const LOCAL_IP = .*/const LOCAL_IP = 'localhost';/" "$MOBILE_API"
    ok "Mobile api.js → LOCAL_IP = 'localhost'"
  fi
  # Ensure mobile points to backend port 3001
  sed -i '' 's/:3000\/api\/v1/:3001\/api\/v1/g' "$MOBILE_API"
  ok "Mobile api.js → port 3001"
fi

# ─── 5. Install dependencies ───────────────────────────────────────
step "5/8  Installing dependencies"

echo "  Installing Backend dependencies..."
(cd "$BACKEND_DIR" && npm install --silent 2>&1 | tail -1)
ok "Backend dependencies installed"

echo "  Installing Admin UI dependencies..."
(cd "$ADMIN_DIR" && npm install --silent 2>&1 | tail -1)
ok "Admin UI dependencies installed"

echo "  Installing Mobile dependencies..."
(cd "$MOBILE_DIR" && npm install --silent 2>&1 | tail -1)
ok "Mobile dependencies installed"

# ─── 6. Run migrations ─────────────────────────────────────────────
step "6/8  Running database migrations"

(cd "$BACKEND_DIR" && npm run db:migrate 2>&1 | grep -E '(▶|✓|✗|✅|Nothing)')
ok "Schema migrations complete"

echo ""
echo "  Running seed migrations..."
(cd "$BACKEND_DIR" && npm run db:migrate:seed 2>&1 | grep -E '(▶|✓|✗|✅|Nothing)')
ok "Seed migrations complete"

# Run newer migrations not yet in manifest (063+)
echo ""
echo "  Applying additional migrations..."
EXTRA_MIGRATIONS=(
  "063_housing_cleanliness_tracking.sql"
  "064_overtime_analytics.sql"
  "065_sick_leave_triggers.sql"
  "066_sick_leave_trigger_function.sql"
  "067_conflict_tracking.sql"
  "068_question_rotation.sql"
  "069_gamification_engine.sql"
  "070_slack_integration.sql"
  "071_nlp_sentiment.sql"
)

for mig in "${EXTRA_MIGRATIONS[@]}"; do
  MIG_FILE="$BACKEND_DIR/migrations/$mig"
  if [ -f "$MIG_FILE" ]; then
    # Check if already applied by looking for the table/content
    MIG_ID=$(echo "$mig" | sed 's/_.*//')
    ALREADY=$(psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM schema_migrations WHERE id = '$MIG_ID'" 2>/dev/null || echo "0")
    if [ "$ALREADY" = "0" ]; then
      psql -d "$DB_NAME" -f "$MIG_FILE" >/dev/null 2>&1 && {
        psql -d "$DB_NAME" -c "INSERT INTO schema_migrations (id, name) VALUES ('$MIG_ID', '$(echo $mig | sed 's/\.sql//')') ON CONFLICT DO NOTHING" >/dev/null 2>&1
        ok "Applied $mig"
      } || warn "Skipped $mig (may already exist)"
    else
      ok "$mig already applied"
    fi
  fi
done

# ─── 7. Seed test users ────────────────────────────────────────────
step "7/8  Seeding test users"

PASSWORD_HASH=$(cd "$BACKEND_DIR" && node -e "require('bcryptjs').hash('password123', 12).then(h => console.log(h))")
CONTRACTOR_ID='11111111-1111-1111-1111-111111111111'

psql -d "$DB_NAME" << SEEDEOF
-- Ensure contractor exists
INSERT INTO contractors (id, name, slug, email, phone, is_active)
VALUES ('${CONTRACTOR_ID}', 'ABC Építő Kft', 'abc-epito-kft', 'info@abc-epito.hu', '+36 1 555 0001', true)
ON CONFLICT (id) DO NOTHING;

-- Ensure roles exist
INSERT INTO roles (name, slug, description, is_system)
VALUES ('Superadmin', 'superadmin', 'Rendszergazda', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO roles (name, slug, description, is_system)
VALUES ('Employee', 'employee', 'Munkavállaló', true)
ON CONFLICT (slug) DO NOTHING;

-- Seed admin user
INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, is_active)
VALUES ('${CONTRACTOR_ID}', 'admin@hr-erp.com', '${PASSWORD_HASH}', 'Admin', 'User', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Seed employee user
INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, is_active)
VALUES ('${CONTRACTOR_ID}', 'toth.anna@abc-kft.hu', '${PASSWORD_HASH}', 'Tóth', 'Anna', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Assign roles via user_roles table
INSERT INTO user_roles (user_id, role_id, contractor_id)
SELECT u.id, r.id, u.contractor_id
FROM users u, roles r
WHERE u.email = 'admin@hr-erp.com' AND r.slug = 'superadmin'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, contractor_id)
SELECT u.id, r.id, u.contractor_id
FROM users u, roles r
WHERE u.email = 'toth.anna@abc-kft.hu' AND r.slug = 'employee'
ON CONFLICT DO NOTHING;
SEEDEOF

ok "Test users seeded"

# Also run the built-in seed script for comprehensive data
echo "  Running comprehensive seed..."
(cd "$BACKEND_DIR" && npm run db:seed 2>&1 | tail -3) || warn "Comprehensive seed had warnings (non-critical)"
ok "Comprehensive seed complete"

# ─── 8. Final verification ─────────────────────────────────────────
step "8/8  Verification"

USER_COUNT=$(psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM users" 2>/dev/null || echo "?")
TABLE_COUNT=$(psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "?")
ok "Database: ${TABLE_COUNT} tables, ${USER_COUNT} users"

# Verify connectivity from Node
(cd "$BACKEND_DIR" && node -e "
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'hr_erp_db',
    user: process.env.DB_USER || '$MAC_USER',
    password: process.env.DB_PASSWORD
  });
  pool.query('SELECT NOW()').then(r => {
    console.log('  ✓ Node.js → PostgreSQL connection OK');
    pool.end();
  }).catch(e => {
    console.error('  ✗ Connection failed:', e.message);
    pool.end();
    process.exit(1);
  });
")

# ─── Done ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║         ✅ Setup Complete!                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Start all services:                         ║"
echo "║    ./start-all.sh                            ║"
echo "║                                              ║"
echo "║  URLs:                                       ║"
echo "║    Backend API  → http://localhost:3001       ║"
echo "║    Admin UI     → http://localhost:5173       ║"
echo "║    Mobile Web   → http://localhost:8082       ║"
echo "║                                              ║"
echo "║  Test Credentials:                           ║"
echo "║    admin@hr-erp.com / password123            ║"
echo "║    toth.anna@abc-kft.hu / password123        ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
