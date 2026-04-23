# Database backup — operator's guide

## One-shot commands

```bash
# from hr-erp-backend/
npm run db:backup           # creates ~/Backups/HR-ERP/backup-YYYY-MM-DD-HHMMSS.sql.gz
npm run db:backup:verify    # restores latest into hr_erp_verify_temp + compares
npm run db:restore -- --latest           # interactive restore into live DB
npm run db:restore -- --latest --force   # skip prompt
npm run db:restore -- <file> --target hr_erp_scratch  # non-destructive restore
```

The scripts auto-detect dump source in this order:
1. `DOCKER_CONTAINER` env var (override)
2. A running container named `hr-erp-postgres`
3. Local `pg_dump` on `$PATH`

## Environment overrides

- `HR_ERP_BACKUP_DIR` — where backups live (default `~/Backups/HR-ERP`)
- `HR_ERP_BACKUP_RETENTION_DAYS` — auto-prune threshold (default 30)
- `VERIFY_DB` — name of the disposable restore target (default `hr_erp_verify_temp`)

Credentials come from `.env` (`DB_NAME` / `DB_USER` / `DB_HOST` / `DB_PORT` / `DB_PASSWORD`), falling back to `hr_erp_db` / `$USER` / `localhost:5432`.

## Installing the crontab entry

Not automated — your crontab is yours. To schedule daily 03:00 runs:

```bash
crontab -e
```

Append:

```cron
# HR-ERP database: backup at 03:00, verify at 03:15
0  3 * * * cd "/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend" && ./scripts/backup-database.sh   >> "$HOME/Backups/HR-ERP/backup.log"   2>&1
15 3 * * * cd "/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend" && ./scripts/verify-backup.sh     >> "$HOME/Backups/HR-ERP/verify.log"   2>&1
```

On macOS you may also want to grant `cron` Full Disk Access (System Settings → Privacy & Security → Full Disk Access → `+` → `/usr/sbin/cron`) so it can read the `.env` and write under `~/Backups/`.

## Verifying it's actually running

```bash
ls -lt ~/Backups/HR-ERP/ | head -3
tail -n 20 ~/Backups/HR-ERP/backup.log
```

If the newest file in the backup dir is older than 24h the cron isn't firing — check `/var/log/system.log` (macOS) or `journalctl -u cron` (Linux).

## Disaster recovery drill

Quarterly (or whenever the schema changes meaningfully):

```bash
# 1. Take a fresh backup
npm run db:backup

# 2. Restore into a scratch DB so we don't touch live
npm run db:restore -- --latest --target hr_erp_dr_drill --force

# 3. Point the backend at the scratch DB briefly, smoke-test login
DB_NAME=hr_erp_dr_drill npm run dev
# ... click around, then ^C

# 4. Drop the scratch DB
psql -U $USER -d postgres -c 'DROP DATABASE hr_erp_dr_drill;'
```

If step 3 fails, the backup isn't really recoverable — treat as an incident.
