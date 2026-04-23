#!/bin/bash
# HR-ERP database backup — daily, compressed, auto-pruning.
#
# Auto-detects pg_dump source:
#   1. DOCKER_CONTAINER env var (override)
#   2. A running container named `hr-erp-postgres`
#   3. Local pg_dump in $PATH
#
# Reads credentials from the backend's .env, falling back to localhost
# defaults (DB_NAME=hr_erp_db, DB_USER=$USER).
#
# Exit codes: 0 ok, 1 bad config, 2 dump failed, 3 empty dump.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${HR_ERP_BACKUP_DIR:-$HOME/Backups/HR-ERP}"
RETENTION_DAYS="${HR_ERP_BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# Read specific keys from .env — avoids the `source` pitfall where a value
# with unquoted spaces (Gmail app password, etc.) gets parsed as commands.
load_env_keys() {
  [ -f "$BACKEND_DIR/.env" ] || return 0
  local key val
  while IFS='=' read -r key val; do
    case "$key" in
      DB_NAME|DB_USER|DB_HOST|DB_PORT|DB_PASSWORD)
        # strip surrounding quotes if present
        val="${val%\"}"; val="${val#\"}"
        val="${val%\'}"; val="${val#\'}"
        export "$key=$val" ;;
    esac
  done < "$BACKEND_DIR/.env"
}
load_env_keys

DB_NAME="${DB_NAME:-hr_erp_db}"
DB_USER="${DB_USER:-$USER}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-}"

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup-${TIMESTAMP}.sql.gz"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Choose dump source ---------------------------------------------------
DOCKER_CONTAINER="${DOCKER_CONTAINER:-}"
if [ -z "$DOCKER_CONTAINER" ] && command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^hr-erp-postgres$'; then
    DOCKER_CONTAINER="hr-erp-postgres"
  fi
fi

log "Source: $([ -n "$DOCKER_CONTAINER" ] && echo "docker:$DOCKER_CONTAINER" || echo "local pg_dump")"
log "Target: $BACKUP_FILE"
log "DB:     ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Dump ---------------------------------------------------------------------
if [ -n "$DOCKER_CONTAINER" ]; then
  if ! docker exec -e PGPASSWORD="$DB_PASSWORD" "$DOCKER_CONTAINER" \
       pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
    | gzip -c > "$BACKUP_FILE"; then
    log "ERROR: docker pg_dump failed"; rm -f "$BACKUP_FILE"; exit 2
  fi
else
  if ! command -v pg_dump >/dev/null 2>&1; then
    log "ERROR: pg_dump not found in PATH and no docker container detected"; exit 1
  fi
  if ! PGPASSWORD="$DB_PASSWORD" pg_dump \
       -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" \
       --no-owner --no-acl \
    | gzip -c > "$BACKUP_FILE"; then
    log "ERROR: pg_dump failed"; rm -f "$BACKUP_FILE"; exit 2
  fi
fi

if [ ! -s "$BACKUP_FILE" ]; then
  log "ERROR: backup is empty"; rm -f "$BACKUP_FILE"; exit 3
fi

SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
log "OK:     $SIZE"

# Retention --------------------------------------------------------------
find "$BACKUP_DIR" -name 'backup-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
REMAINING=$(find "$BACKUP_DIR" -name 'backup-*.sql.gz' -type f | wc -l | tr -d ' ')
log "Kept:   $REMAINING files (>${RETENTION_DAYS}d pruned)"
