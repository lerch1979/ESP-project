#!/bin/bash
# Full project backup (excluding node_modules, Docker volumes)

set -e

BACKUP_DIR="$HOME/hr-erp-backups/project"
PROJECT_ROOT="/Users/lerchbalazs/Desktop/HR-ERP-PROJECT"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hr-erp-project_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting full project backup..."

cd "$PROJECT_ROOT"

# Create tarball (exclude node_modules, .git large objects, Docker volumes)
tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.git/objects' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  .

SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[$(date)] Project backup complete: $BACKUP_FILE ($SIZE)"

# Keep only last 7 full backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
