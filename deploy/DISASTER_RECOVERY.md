# Disaster Recovery — rebuild HR-ERP from scratch (Hetzner-independent)

**Goal:** stand the whole system back up on **any** Docker host using only:
1. **This Git repo** (code + these `deploy/` orchestration files),
2. **The latest backup** from `~/hr-erp-offsite/` on the Mac (`db-*.dump` + `uploads-*.tgz`),
3. **The secrets** from **Bitwarden** (vault item "HR-ERP prod .env").

Nothing on the old Hetzner server is required. The container **images** live on
GHCR (`ghcr.io/lerch1979/esp-project-{backend,admin}`), which is GitHub-hosted,
not Hetzner.

---

## What's in this folder
- `docker-compose.prod.yml` — the full stack (postgres, redis, backend, admin, caddy) + named volumes (`postgres_data`, `uploads_data`, …). Sensitive values are `${ENV}` refs — **no secrets in this file.**
- `Caddyfile` — TLS (auto Let's Encrypt) + reverse-proxy routing for the single domain.
- `backup.sh` — the daily DB + uploads backup script (cron `30 2 * * *`).
- `.env.production.example` — env template; fill from Bitwarden on rebuild.

---

## Prerequisites on the new host
- Docker + Docker Compose v2.
- DNS: point the app domain's A record at the new host (for Caddy's auto-TLS, ports **80 + 443** must be open and DNS must resolve before first start).
- `gh`/registry: GHCR images are public-pullable; if private, `docker login ghcr.io` first.

---

## Rebuild steps

```bash
# 1. Clone the repo and enter the deploy kit
git clone https://github.com/lerch1979/ESP-project.git
cd ESP-project/deploy

# 2. Recreate the production env from Bitwarden
cp .env.production.example .env.production
#    → edit .env.production, paste DB_PASSWORD / JWT_SECRET / ANTHROPIC_API_KEY /
#      ENCRYPTION_KEY (and SENTRY_DSN) from Bitwarden "HR-ERP prod .env".
#    ⚠️ ENCRYPTION_KEY MUST be the exact original value, or restored PII won't decrypt.
ln -sf .env.production .env          # compose interpolates ${DB_PASSWORD} from default .env

# 3. Pull the prebuilt images (GHCR) and start ONLY the database first
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d postgres
#    wait for it to be healthy:
docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U postgres

# 4. Restore the database from the latest Mac backup
#    (copy the newest dump from ~/hr-erp-offsite/ to the new host first, e.g. scp)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --no-owner --no-privileges -d hr_erp --clean --if-exists \
  < db-YYYYMMDD-HHMM.dump
#    (if the DB doesn't exist yet: createdb hr_erp inside the container, then restore)

# 5. Restore uploads into the uploads_data volume (via the backend container's /app/uploads)
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml exec -T backend \
  tar -xzf - -C /app < uploads-YYYYMMDD-HHMM.tgz

# 6. Bring up the rest (admin + caddy → TLS issues automatically)
docker compose -f docker-compose.prod.yml up -d

# 7. Verify
curl -fsS https://<your-domain>/healthz && echo OK
docker compose -f docker-compose.prod.yml ps        # all healthy
```

---

## Recovery checklist (have these before you start)
- [ ] Repo cloned (this `deploy/` folder present).
- [ ] Latest `db-*.dump` + `uploads-*.tgz` from `~/hr-erp-offsite/` copied to the new host.
- [ ] Bitwarden "HR-ERP prod .env" → especially **ENCRYPTION_KEY** (without it, PII is unrecoverable).
- [ ] DNS A record pointed at the new host; ports 80/443 open.

## Notes
- **RPO** (max data loss): up to ~24h — the Mac pull is the last completed daily 02:30 dump. For a smaller window, run `backup.sh` (or pg_dump) on demand before a planned migration.
- **Restore is proven**: the `db-*.dump` (pg_dump `-F c`) restores via `pg_restore`; verified against a scratch DB (287 employees / 22 tickets / 16 accommodations).
- **`backup.env`** (Storage Box offsite leg) is intentionally not in the repo — it only holds optional offsite-target config and currently runs local-only. Recreate it on the new host only if you add an offsite mirror.
- After rebuild, re-point the **mobile app** `EXPO_PUBLIC_API_URL` to the new domain (in `hr-erp-mobile/eas.json`) and issue a new EAS build if the domain changed.
