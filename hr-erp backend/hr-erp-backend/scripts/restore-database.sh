#!/bin/bash
# HR-ERP database restore — DESTRUCTIVE. Drops + recreates the target DB.
#
# Usage:
#   ./scripts/restore-database.sh <backup.sql.gz>             # interactive confirm
#   ./scripts/restore-database.sh <backup.sql.gz> --force     # no prompt
#   ./scripts/restore-database.sh --latest                    # newest backup
#   ./scripts/restore-database.sh --latest --target temp      # into hr_erp_temp
#
# Targets:
#   Default target DB = $DB_NAME from .env (typically hr_erp_db).
#   --target <name> overrides. This matters — using this for DR is fine,
#   but you likely want --target hr_erp_temp for test restores.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${HR_ERP_BACKUP_DIR:-$HOME/Backups/HR-ERP}"

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
TARGET_DB="${DB_NAME:-hr_erp_db}"

BACKUP_FILE=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force)    FORCE=1; shift ;;
    --latest)
      BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | head -1 || true)"
      if [ -z "$BACKUP_FILE" ]; then echo "No backups found in $BACKUP_DIR" >&2; exit 1; fi
      shift ;;
    --target)   TARGET_DB="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,22p' "$0"; exit 0 ;;
    *)          BACKUP_FILE="$1"; shift ;;
  esac
done

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: ${BACKUP_FILE:-<none>}" >&2
  echo "Try: $0 --latest" >&2
  exit 1
fi

echo "Restore plan:"
echo "  Source:  $BACKUP_FILE"
echo "  Target:  ${DB_USER}@${DB_HOST}:${DB_PORT}/${TARGET_DB}"
echo ""
echo "This will DROP database '$TARGET_DB' if it exists and recreate it from the backup."
if [ "$FORCE" -ne 1 ]; then
  read -r -p "Type 'yes' to proceed: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."; exit 1
  fi
fi

export PGPASSWORD="$DB_PASSWORD"

# Terminate existing connections to the target DB before dropping it
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();
SQL

psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS ${TARGET_DB};
CREATE DATABASE ${TARGET_DB};
SQL

echo "Restoring into ${TARGET_DB}..."
gunzip -c "$BACKUP_FILE" | psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$TARGET_DB" -v ON_ERROR_STOP=1 >/dev/null

TABLE_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$TARGET_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "Restore OK. Public-schema tables: $(echo "$TABLE_COUNT" | xargs)"
