#!/bin/bash
# HR-ERP backup verification — restores the latest backup into a disposable
# temp database and compares table-row counts vs. the live DB. Drops the
# temp DB whether the check passes or fails.
#
# Fails (exit 1) when:
#   - no backups present
#   - restore fails
#   - a table in the live DB has rows but the restored copy has zero
#     (i.e. data loss somewhere in the pipeline)
#
# Does NOT fail on exact row-count mismatch — live data changes during the
# gap between backup and verify. Instead it compares "has rows vs empty".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${HR_ERP_BACKUP_DIR:-$HOME/Backups/HR-ERP}"
VERIFY_DB="${VERIFY_DB:-hr_erp_verify_temp}"

load_env_keys() {
  [ -f "$BACKEND_DIR/.env" ] || return 0
  local key val
  while IFS='=' read -r key val; do
    case "$key" in
      DB_NAME|DB_USER|DB_HOST|DB_PORT|DB_PASSWORD)
        val="${val%\"}"; val="${val#\"}"
        val="${val%\'}"; val="${val#\'}"
        export "$key=$val" ;;
    esac
  done < "$BACKEND_DIR/.env"
}
load_env_keys
DB_USER="${DB_USER:-$USER}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-}"
LIVE_DB="${DB_NAME:-hr_erp_db}"

export PGPASSWORD="$DB_PASSWORD"

LATEST="$(ls -1t "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "FAIL: no backups found in $BACKUP_DIR" >&2
  exit 1
fi
echo "Verify: $LATEST"
echo "Live:   $LIVE_DB"
echo "Temp:   $VERIFY_DB"

cleanup() {
  psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=0 -c \
    "DROP DATABASE IF EXISTS ${VERIFY_DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"$SCRIPT_DIR/restore-database.sh" "$LATEST" --force --target "$VERIFY_DB" >/dev/null

# Compare: tables with >0 rows on live should be non-empty on the restore.
REPORT=$(mktemp)
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$LIVE_DB" -At -F '|' <<'SQL' > "$REPORT"
SELECT n.nspname || '.' || c.relname, c.reltuples::bigint
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY c.relname;
SQL

DISCREPANCIES=0
while IFS='|' read -r TABLE LIVE_ROWS; do
  if [ "$LIVE_ROWS" -gt 0 ] 2>/dev/null; then
    RESTORED_ROWS=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$VERIFY_DB" -At -c \
      "SELECT COUNT(*) FROM $TABLE" 2>/dev/null || echo 0)
    if [ "${RESTORED_ROWS:-0}" = "0" ] && [ "$LIVE_ROWS" -gt 0 ]; then
      echo "  ✗ $TABLE: live has rows, restored is empty"
      DISCREPANCIES=$((DISCREPANCIES + 1))
    fi
  fi
done < "$REPORT"
rm -f "$REPORT"

if [ "$DISCREPANCIES" -gt 0 ]; then
  echo "FAIL: $DISCREPANCIES table(s) lost data in the restored copy"
  exit 1
fi

echo "OK: backup verified — all tables with data restored non-empty"
