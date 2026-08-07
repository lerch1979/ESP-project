#!/usr/bin/env bash
# One-command sandbox reset: DROP + CREATE + migrate-from-scratch + seed.
# Fully local + synthetic; never touches the dev (hr_erp_db) or prod database.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${SANDBOX_DB:-hr_erp_sandbox}"
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
USER="${DB_USER:-$(whoami)}"

case "$DB" in *sandbox*) ;; *) echo "✋ SANDBOX_DB='$DB' must contain 'sandbox'"; exit 1;; esac

echo "▶ Resetting sandbox database '$DB' on $HOST:$PORT (user $USER)"
# DROP DATABASE fails outright if anything is still connected (a leftover `npm run
# dev:sandbox`, a psql session, a previous run's pool). Evict them first — the target is
# already proven to be a sandbox by the guard above, so nothing real can be interrupted.
psql "postgresql://$USER@$HOST:$PORT/postgres" -q -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null
psql "postgresql://$USER@$HOST:$PORT/postgres" -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

echo "▶ Running all migrations from scratch"
DB_NAME="$DB" DB_USER="$USER" node src/database/migrate.js run

echo "▶ Seeding synthetic dataset"
DB_NAME="$DB" DB_USER="$USER" node src/database/seed_sandbox.js

echo "✅ Sandbox '$DB' ready. Run the backend against it with: npm run dev:sandbox"
