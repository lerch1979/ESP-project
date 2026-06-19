#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/hr-erp"

# --- defaults; overridden by backup.env ---
STORAGEBOX_HOST=""; STORAGEBOX_USER=""
STORAGEBOX_PATH="hr-erp-backups"; STORAGEBOX_PORT="23"; RETENTION_DAYS="30"
[ -f "$HOME/hr-erp/backup.env" ] && . "$HOME/hr-erp/backup.env"

STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups

# 1. Database — custom format, restorable via pg_restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump --no-owner --no-privileges -U postgres -F c hr_erp \
  > "backups/db-$STAMP.dump"

# 2. Uploads (resident photos/docs) from the named volume via the backend container
docker compose -f docker-compose.prod.yml exec -T backend \
  tar -czf - -C /app uploads > "backups/uploads-$STAMP.tgz"

# 3. Local retention — drop > RETENTION_DAYS (GDPR "ages out" guarantee)
find backups -type f \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$RETENTION_DAYS" -delete

# 4. Offsite push to Hetzner Storage Box (mirror: box also ages out at RETENTION_DAYS).
#    Gated on backup.env being filled in.
if [ -n "$STORAGEBOX_HOST" ] && [ -n "$STORAGEBOX_USER" ]; then
  rsync -az --delete \
    --include='db-*.dump' --include='uploads-*.tgz' --exclude='*' \
    -e "ssh -p $STORAGEBOX_PORT -o StrictHostKeyChecking=accept-new" \
    backups/ "$STORAGEBOX_USER@$STORAGEBOX_HOST:$STORAGEBOX_PATH/"
  echo "$(date '+%F %T') offsite push OK -> $STORAGEBOX_HOST:$STORAGEBOX_PATH"
else
  echo "$(date '+%F %T') WARN: Storage Box not configured (backup.env) — offsite SKIPPED, local backup only"
fi

echo "$(date '+%F %T') backup OK: db-$STAMP.dump ($(du -h backups/db-$STAMP.dump | cut -f1)), uploads-$STAMP.tgz ($(du -h backups/uploads-$STAMP.tgz | cut -f1)); $(ls -1 backups/db-*.dump | wc -l | tr -d ' ') dumps retained"
