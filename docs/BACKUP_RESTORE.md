# Backups & Restore (production)

**As-built reference.** The nightly job is `~/hr-erp/backup.sh` (repo copy: `deploy/backup.sh`),
run by cron at 02:30 and logged to `~/hr-erp/backups/backup.log`. Config lives in
`~/hr-erp/backup.env` (untracked — secrets).

## What is backed up

| Artifact | Path (on the prod VM) | Contents |
|---|---|---|
| DB dump | `backups/db-<STAMP>.dump` | full `hr_erp` DB, `pg_dump -F c` (custom format) |
| Uploads | `backups/uploads-<STAMP>.tgz` | `/app/uploads` (resident photos, documents, expense/ticket files) |
| **Encrypted offsite copies** | `backups/offsite/*.enc` | the two artifacts above, **AES-256 (openssl, PBKDF2)** — the only form pushed offsite |

- **Retention:** `RETENTION_DAYS=30` (local + offsite mirror; the Storage Box mirror also ages out via `rsync --delete`).
- **Encryption at rest:** offsite copies are encrypted with `BACKUP_ENCRYPTION_KEY` (in `backup.env`). Plaintext never leaves the VM.
- **Failure alerting:** any step failure (dump/tar/encrypt/offsite push) posts to `OPS_ALERT_WEBHOOK` via `alertOps` (same Slack channel as the backend + disk alerts).

## ⚠️ Disaster-recovery: store the encryption key OFF-server

`BACKUP_ENCRYPTION_KEY` lives in `~/hr-erp/backup.env` **on the prod VM**. If the VM is lost, the
offsite `.enc` files are **useless without this key**. **Copy it into a password manager now:**

```bash
ssh deploy@167.233.122.3 'grep ^BACKUP_ENCRYPTION_KEY= ~/hr-erp/backup.env'
```

Store that value somewhere independent of Hetzner (password manager / printed in a safe). Without it, offsite backups cannot be decrypted.

## Restore — from a LOCAL backup (fastest)

```bash
ssh deploy@167.233.122.3
cd ~/hr-erp
DUMP=$(ls -1t backups/db-*.dump | head -1)          # or pick a specific stamp

# DB → a throwaway DB first (never overwrite live blindly):
docker exec -i hr-erp-postgres-1 psql -U postgres -c "CREATE DATABASE hr_erp_restore;"
docker exec -i hr-erp-postgres-1 pg_restore --no-owner --no-privileges -U postgres -d hr_erp_restore < "$DUMP"
docker exec -i hr-erp-postgres-1 psql -U postgres -d hr_erp_restore -c "SELECT count(*) FROM users;"   # sanity-check

# Uploads:
UPL=$(ls -1t backups/uploads-*.tgz | head -1)
docker cp "$UPL" hr-erp-backend-1:/tmp/u.tgz
docker exec -i hr-erp-backend-1 sh -c 'cd /app && tar -xzf /tmp/u.tgz'   # extracts uploads/…
```

To promote a restore to live: stop the backend, drop/recreate `hr_erp` (or restore with
`--clean --if-exists`), restore into it, bring the backend up. Take a fresh dump first.

## Restore — from the ENCRYPTED OFFSITE copy

```bash
ssh deploy@167.233.122.3
cd ~/hr-erp
. ~/hr-erp/backup.env; export BACKUP_ENCRYPTION_KEY

# (a) fetch from the Storage Box (once provisioned):
rsync -az -e "ssh -p $STORAGEBOX_PORT" \
  "$STORAGEBOX_USER@$STORAGEBOX_HOST:$STORAGEBOX_PATH/" backups/offsite/

# (b) decrypt:
openssl enc -d -aes-256-cbc -pbkdf2 -in backups/offsite/db-<STAMP>.dump.enc     -out /tmp/db.dump  -pass env:BACKUP_ENCRYPTION_KEY
openssl enc -d -aes-256-cbc -pbkdf2 -in backups/offsite/uploads-<STAMP>.tgz.enc -out /tmp/upl.tgz  -pass env:BACKUP_ENCRYPTION_KEY

# (c) restore as in the LOCAL section above, using /tmp/db.dump + /tmp/upl.tgz.
```

**Verified 2026-07-06** (from the encrypted copy, into a throwaway DB): decrypt OK →
`pg_restore rc=0, 0 errors` → users=7 / employees=288 / compensations=2 intact; uploads archive
decrypted + listed 19 files (resident photos). Scratch DB dropped afterwards.

## ⏳ Remaining step — provision the Hetzner Storage Box (offsite target)

The offsite mechanism is **built and ready** (encryption + rsync + alerting + retention); it only
needs a Storage Box to push to. **This requires the Hetzner console (paid product) — an owner action.**

1. In the Hetzner Robot / console, create a **Storage Box** (BX11 is plenty at this scale).
2. Enable **SSH access** on it, and add this **backup public key** to its `authorized_keys`
   (Storage Box → SSH keys, or `~/.ssh/authorized_keys` via SFTP):
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPzr6uMgwWzous796UXCQzKtmu9sCKaND8FjwBTJINZy hr-erp-backup@hr-erp-prod
   ```
3. Fill the two values in `~/hr-erp/backup.env` (Hetzner gives a username like `u123456`):
   ```
   STORAGEBOX_HOST=u123456.your-storagebox.de
   STORAGEBOX_USER=u123456
   ```
4. Create the target dir + test:
   ```bash
   ssh -p 23 u123456@u123456.your-storagebox.de mkdir -p hr-erp-backups
   ~/hr-erp/backup.sh    # log should flip to "offsite push OK (encrypted) -> …"
   ```

Until then the nightly backup is **local-only** (logged as "offsite SKIPPED") — the P0 offsite gap
stays open pending this one owner action.

## Provider-independence (belt-and-braces)

Everything lives in the Hetzner account (VM + Storage Box). For account-lock resilience, also run a
**daily pull-down to a machine you control** (Mac/NAS) of the newest `*.enc` — see HETZNER_DEPLOY §2.11.
