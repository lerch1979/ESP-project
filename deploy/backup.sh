#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/hr-erp"

# --- defaults; overridden by backup.env ---
STORAGEBOX_HOST=""; STORAGEBOX_USER=""
STORAGEBOX_PATH="hr-erp-backups"; STORAGEBOX_PORT="23"; RETENTION_DAYS="30"
BACKUP_ENCRYPTION_KEY=""; OPS_ALERT_WEBHOOK=""
[ -f "$HOME/hr-erp/backup.env" ] && . "$HOME/hr-erp/backup.env"
# openssl (a child process) reads the passphrase from the ENVIRONMENT, so the
# sourced var must be exported — not just a shell variable.
export BACKUP_ENCRYPTION_KEY

# alertOps: post a failure to the ops Slack webhook (same channel as the backend
# alertOps() + disk-alert). Never let the alert itself abort the script.
alert() {
  local msg="$1"
  echo "$(date '+%F %T') ALERT: $msg" >&2
  if [ -n "${OPS_ALERT_WEBHOOK:-}" ]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"🔴 [hr-erp backup] $msg\"}" "$OPS_ALERT_WEBHOOK" >/dev/null 2>&1 || true
  fi
}
# Any unhandled failure (set -e) alerts with the failing line before exiting.
trap 'alert "backup.sh FAILED near line $LINENO"' ERR

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
find backups -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$RETENTION_DAYS" -delete

# 4. Encryption at rest for the OFFSITE copy (openssl AES-256, PBKDF2). Produced
#    whenever a key is set — so the encrypted artifacts exist even before the
#    Storage Box is provisioned (and offsite NEVER holds plaintext PII).
#    Restore: openssl enc -d -aes-256-cbc -pbkdf2 -in X.enc -out X -pass env:BACKUP_ENCRYPTION_KEY
ENC_READY=0
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  mkdir -p backups/offsite
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "backups/db-$STAMP.dump"     -out "backups/offsite/db-$STAMP.dump.enc"     -pass env:BACKUP_ENCRYPTION_KEY
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "backups/uploads-$STAMP.tgz" -out "backups/offsite/uploads-$STAMP.tgz.enc" -pass env:BACKUP_ENCRYPTION_KEY
  find backups/offsite -maxdepth 1 -type f -name '*.enc' -mtime +"$RETENTION_DAYS" -delete
  ENC_READY=1
else
  echo "$(date '+%F %T') WARN: BACKUP_ENCRYPTION_KEY unset — encrypted offsite copies NOT produced"
fi

# 5. Offsite push to Hetzner Storage Box — encrypted artifacts ONLY (mirror:
#    the box also ages out at RETENTION_DAYS via --delete). Gated on backup.env.
if [ -n "$STORAGEBOX_HOST" ] && [ -n "$STORAGEBOX_USER" ]; then
  if [ "$ENC_READY" = 1 ]; then
    if rsync -az --delete --include='*.enc' --exclude='*' \
        -e "ssh -p $STORAGEBOX_PORT -o StrictHostKeyChecking=accept-new" \
        backups/offsite/ "$STORAGEBOX_USER@$STORAGEBOX_HOST:$STORAGEBOX_PATH/"; then
      echo "$(date '+%F %T') offsite push OK (encrypted) -> $STORAGEBOX_HOST:$STORAGEBOX_PATH"
    else
      alert "offsite rsync push to $STORAGEBOX_HOST FAILED"; exit 1
    fi
  else
    alert "Storage Box configured but BACKUP_ENCRYPTION_KEY unset — refusing to push unencrypted PII offsite. Offsite SKIPPED."
  fi
else
  echo "$(date '+%F %T') WARN: Storage Box not configured (backup.env) — offsite SKIPPED, local backup only"
fi

echo "$(date '+%F %T') backup OK: db-$STAMP.dump ($(du -h backups/db-$STAMP.dump | cut -f1)), uploads-$STAMP.tgz ($(du -h backups/uploads-$STAMP.tgz | cut -f1)); $(ls -1 backups/db-*.dump | wc -l | tr -d ' ') dumps retained$([ "$ENC_READY" = 1 ] && echo ', encrypted offsite copies ready')"
