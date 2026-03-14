#!/bin/bash
# Automated database backup script
# Runs nightly via cron

set -e

# Configuration
BACKUP_DIR="$HOME/hr-erp-backups/database"
PROJECT_ROOT="/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Database credentials from .env
cd "$PROJECT_ROOT"
source .env 2>/dev/null || true

DB_NAME="${DB_NAME:-hr_erp_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Backup filename
BACKUP_FILE="$BACKUP_DIR/hr-erp-db_${TIMESTAMP}.sql"

echo "[$(date)] Starting database backup..."

# PostgreSQL dump via Docker
docker exec hr-erp-postgres pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo "[$(date)] Backup created: $BACKUP_FILE"

# Get file size
SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[$(date)] Backup size: $SIZE"

# Delete backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date)] ERROR: Backup file is empty!"
  exit 1
fi

echo "[$(date)] Database backup complete!"
