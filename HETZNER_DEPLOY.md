# Hetzner Deployment Plan — HR-ERP Pilot

**Status:** PLAN ONLY. No server exists yet; nothing here has been executed. This is prepared so deploy-day is *execution, not research*.
**Target:** single Hetzner Cloud VM, Docker Compose, pulling CI-built images from `ghcr.io`. Pilot scale ≈ 30–50 residents.
**Author note:** every fact below (image names, env vars, ports, public routes) was read from the repo on 2026-06-11 — see the "Verified from repo" callouts. Re-verify the two ⚠️ items on deploy day.

---

## 0. Architecture decision recap

- **Compose, not k8s.** The repo has a `k8s/` dir and a `deploy` job in `.github/workflows/deploy.yml`, but that job is **disabled** (`if: false`, awaiting a cluster + `KUBE_CONFIG`). We deploy with `docker-compose` on one VM, as previously decided.
- **What CI gives us (verified `deploy.yml`):** on push to `main`, after tests pass, it builds **two** images and pushes to GHCR:
  - `ghcr.io/lerch1979/esp-project-backend:latest` (+ `:<git-sha>`)
  - `ghcr.io/lerch1979/esp-project-admin:latest` (+ `:<git-sha>`)
  - Repo name is lowercased (`lerch1979/ESP-project` → `lerch1979/esp-project`); the image suffix is appended with a hyphen. **These exact names are what the prod compose must reference.**
- **Mobile is NOT in CI.** It's an Expo app — built separately via EAS (see §2.8). Only backend + admin are containerized.
- **Stack on the box:** Caddy (TLS + reverse proxy) → `backend` (Node, :3001) + `admin` (nginx static, :80) → `postgres:15-alpine` + `redis:7-alpine`. Uploads on a persistent volume.

---

## 1. Server spec

**Recommendation: Hetzner Cloud `CX22`** (x86 / Intel, shared vCPU).

| Resource | CX22 | Why it fits a 30–50 resident pilot |
|---|---|---|
| vCPU | 2 | Node + Postgres + nginx + redis are all light at this scale; classification/translation calls are offloaded to the Claude API, not local CPU. |
| RAM | 4 GB | Node ~250–400 MB, Postgres comfortable with ~256 MB shared_buffers on a small dataset, redis <50 MB, admin nginx negligible. 4 GB leaves headroom for `docker pull`, `pg_restore`, and nightly `pg_dump`. |
| Disk | 40 GB NVMe | OS+Docker ~6 GB, two images ~1 GB, Postgres (small relational data) low hundreds of MB, **uploads** the main grower: photos are client-compressed to 1600px/0.8 JPEG (~200–400 KB each); 50 residents × a few tickets × ≤3 photos ≈ **low single-digit GB**. 40 GB has years of runway at pilot scale. |
| Price | ≈ €4–5 / month | — |

**Why not the cheaper options:**
- `CPX11` (2 vCPU / **2 GB**): too little RAM once Postgres + Node + a `pg_restore` run concurrently. Avoid.
- `CAX11` (Ampere **ARM**, 2 vCPU / 4 GB, cheapest): ⚠️ **our GHCR images are built `linux/amd64` only** (buildx default in `deploy.yml`, no multi-arch). ARM would need multi-arch builds we don't currently produce. **Stay on x86 (CX22)** unless/until we add `platforms: linux/amd64,linux/arm64` to the build step.

**Upgrade path:** if residents grow past ~150, or we co-host more apps, resize in place to `CX32` (4 vCPU / 8 GB / 80 GB). Hetzner resize is a reboot, no rebuild. Attach a **Hetzner Volume** for `uploads/` if photo storage outgrows the root disk (lets you grow storage without resizing the whole VM).

**Region:** Nuremberg/Falkenstein (EU, low latency to Hungary, GDPR-friendly).
**Image:** Ubuntu 24.04 LTS.

---

## 2. Deploy-day runbook (top-to-bottom)

> Everything in `$BACKtick`-style blocks is meant to be run as-is, substituting the values you decide in §4. Run as a non-root sudo user except where noted.

### 2.1 Provision + first login
1. Create the CX22, Ubuntu 24.04, **with your SSH public key attached at creation** (so root login is key-only from minute one).
2. Assign a **Floating IP** (optional but recommended — lets you rebuild the VM later without changing DNS).
3. First login as root, create an admin user, copy your key:
   ```bash
   adduser deploy && usermod -aG sudo deploy
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
   ```

### 2.2 SSH hardening
Edit `/etc/ssh/sshd_config`:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```
```bash
sudo systemctl restart ssh
```
(Optional: move SSH off :22 to cut log noise — not security by itself.)

### 2.3 Firewall — **two layers** (Hetzner Cloud Firewall + ufw)
**Use the Hetzner Cloud Firewall as the primary** (it filters *before* traffic reaches the VM, so it is **not** bypassed by Docker — see the warning below). Allow only:
- TCP **22** (SSH) — ideally restricted to your home/office IP (decision in §4)
- TCP **80** (HTTP — ACME challenge + redirect to 443)
- TCP **443** (HTTPS)

Then `ufw` on the host as defence-in-depth:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
> ⚠️ **Docker + ufw gotcha:** Docker writes its own iptables rules and **published container ports bypass ufw**. The defence is architectural (next line), not just ufw.
> **Therefore: in the prod compose, do NOT publish Postgres/redis/backend/admin to the host.** Only Caddy publishes `80`/`443`. Everything else talks over the internal Docker network. (The dev `docker-compose.yml` exposes `5432`, `6379`, `3001`, `5173` — the prod compose in §2.6 strips all of those.) This is the single most important hardening step.

### 2.4 fail2ban
```bash
sudo apt update && sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```
Default `sshd` jail is on out of the box; that's enough for the pilot.

### 2.5 Docker + Compose
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy   # re-login after this
docker compose version           # v2 ships with the install
```

### 2.6 Production compose (pull from GHCR — do NOT build on the box)
Create `~/hr-erp/docker-compose.prod.yml`. **Key differences from the repo's dev compose:** images are *pulled* (not built); no host port publishing except Caddy; backend gets **`DB_*` vars** (see the ⚠️ below); uploads + DB on named volumes.

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: hr_erp
      POSTGRES_USER: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    # NO ports: — internal network only

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    # NO ports:

  backend:
    image: ghcr.io/lerch1979/esp-project-backend:latest
    env_file: ./.env.production
    environment:
      # ⚠️ The backend reads DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD,
      # NOT DATABASE_URL (verified src/database/connection.js). The dev
      # compose's DATABASE_URL is ignored by the app — do not rely on it.
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: hr_erp
      DB_USER: postgres
      REDIS_HOST: redis
      REDIS_PORT: 6379
      NODE_ENV: production
      PORT: 3001
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_started }
    volumes:
      - uploads_data:/app/uploads
      - backend_logs:/app/logs
    restart: unless-stopped
    # NO ports: — Caddy proxies to backend:3001 over the internal network

  admin:
    image: ghcr.io/lerch1979/esp-project-admin:latest
    depends_on: [backend]
    restart: unless-stopped
    # NO ports: — Caddy proxies to admin:80

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [backend, admin]
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  uploads_data:
  backend_logs:
  caddy_data:
  caddy_config:
```

Authenticate to GHCR and pull (use a GitHub **PAT with `read:packages`** if the packages are private; public packages need no login):
```bash
echo "$GHCR_PAT" | docker login ghcr.io -u lerch1979 --password-stdin
docker compose -f docker-compose.prod.yml pull
```
> Redis is included because the dev stack and `.env` reference it, but note: **rate limiting is in-memory** (verified `src/middleware/rateLimiter.js`), so a single backend instance does not depend on redis for limiting. Keep redis for now; it's tiny.

### 2.7 PostgreSQL: **container** + restore the laptop dump
**Decision: run Postgres in the container** (as above). Rationale: one-command lifecycle, matches CI, trivially backed up via the volume + `pg_dump`. A native install buys nothing at pilot scale and adds host-management surface.

**Schema/data come from the laptop dump — do NOT run the migration runner on prod.**
> ⚠️ Known issue (carried in SESSION_LOG): the migration runner is **blocked at `093 cleanup_demo_data`** (guard expects exactly 1 user). The restore path sidesteps it entirely — the dump already contains the full schema + data. Future migrations (120+) will need the runner fixed before they can apply in prod; out of scope for this deploy.

On the **laptop**, dump production-quality data (exclude demo cruft as needed):
```bash
pg_dump --no-owner --no-privileges \
  --format=custom \
  "postgresql://lerchbalazs@localhost:5432/hr_erp_db" \
  -f hr_erp_$(date +%Y%m%d).dump
scp hr_erp_*.dump deploy@<SERVER_IP>:~/hr-erp/
```
On the **server**, bring up Postgres only, then restore:
```bash
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --no-owner --no-privileges --clean --if-exists -U postgres -d hr_erp \
  < ~/hr-erp/hr_erp_*.dump
```
Then bring up the rest:
```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost:3001/health   # via internal port from host? No — see note
```
> The backend port is not published. Health-check from inside: `docker compose ... exec backend wget -qO- http://localhost:3001/health` — or just hit `https://<api-domain>/health` once Caddy is up.

> **uploads/** start empty on a fresh box. If you have existing resident photos on the laptop/old host, `scp` them into the `uploads_data` volume (e.g. `docker cp ./uploads/. <backend_container>:/app/uploads/`) **before** go-live. This is also where the photo-backup tech-debt closes (§2.9).

### 2.8 `.env.production` checklist (every var)
Create `~/hr-erp/.env.production` (chmod 600). Source of truth: backend `.env.example`. **🔑 = secret that must be NEW/strong, not copied from dev.**

| Var | Prod value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | internal only |
| `API_VERSION` | `v1` | keeps `/api/v1` prefix the mobile app expects |
| `DB_HOST` | `postgres` | container name |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `hr_erp` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | 🔑 **new strong** | also feeds `POSTGRES_PASSWORD`; set once, before first DB start |
| `DB_SSL` | `false` | container-to-container on one host; no SSL needed |
| `DB_SSL_REJECT_UNAUTHORIZED` | `false` | irrelevant when `DB_SSL=false` |
| `REDIS_HOST` | `redis` | |
| `REDIS_PORT` | `6379` | |
| `JWT_SECRET` | 🔑 **new strong** | `openssl rand -base64 48`. Rotating it invalidates existing tokens — fine pre-launch (everyone logs in fresh). |
| `JWT_EXPIRES_IN` | `15m` (or current) | match dev unless changing policy |
| `JWT_REFRESH_EXPIRES_IN` | `7d` (or current) | |
| `CORS_ORIGIN` | `https://<admin-domain>` | **must be set** — comma-separate if more than one. App warns & locks to localhost if empty. Mobile (native) doesn't need CORS. |
| `RATE_LIMIT_ENABLED` | `true` | |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 min (default) |
| `RATE_LIMIT_MAX_REQUESTS` | `100`–`300` | tune; residents poll chat |
| `CSRF_ENABLED` | `true` | |
| `SECURITY_HEADERS_ENABLED` | `true` | |
| `MAX_FILE_SIZE` | match dev (8 MB) | photo upload cap |
| `UPLOAD_DIR` | `/app/uploads` | matches the mounted volume |
| `ANTHROPIC_API_KEY` | 🔑 **NEW — rotate HERE** | **The C-01 rotation happens at this step.** Generate a fresh key in the Anthropic console, set it here, and revoke the old one. Powers translation **and** the new category-suggestion feature. |
| `CLAUDE_MODEL` | match dev | |
| `CLAUDE_MAX_TOKENS` | match dev | |
| `ENCRYPTION_KEY` | ⚠️ **see note** | If this encrypts data **already in the dump**, it must be the **same value used in dev** or that data won't decrypt — **carry it over, do NOT rotate**, unless you confirm it only protects not-yet-written data. Decision in §4. |
| `EMAIL_HOST`/`PORT`/`USER`/`PASSWORD` | prod SMTP or leave blank | 🔑 password. Only needed if email features are used in the pilot (no password-reset route exists — see §3). |
| `ANTHROPIC_API_KEY` already covered | | |
| `GMAIL_*` / `GOOGLE_*` | prod creds or blank | 🔑. Only if Gmail/Calendar integrations are in scope for the pilot (likely **not** — leave blank to shrink attack surface). |
| `GMAIL_REDIRECT_URI` / `GOOGLE_REDIRECT_URI` | prod URLs if used | must match the prod domain |
| `FRONTEND_URL` | `https://<admin-domain>` | used in links/emails |
| `AGENT_EMAIL_TO` | prod value or blank | |
| `GITHUB_TOKEN` / `GITHUB_REPO` | blank in prod | 🔑. Dev-only integration; do not ship a PAT to the server. |
| `LOG_LEVEL` | `info` | |

> **Secret generation one-liners:** `openssl rand -base64 48` (JWT), `openssl rand -base64 32` (DB password), keep `ANTHROPIC_API_KEY` from the console. Store all of these in your password manager — they are not recoverable from the box.

### 2.9 TLS + reverse proxy — **Caddy** (recommended)
**Recommendation: Caddy.** Automatic Let's Encrypt issuance + renewal, one-file config, HTTP→HTTPS redirect built in. nginx+certbot is the alternative but is more moving parts (separate cron/renewal, manual redirect block) for no benefit here.

`~/hr-erp/Caddyfile` (two subdomains — adjust to §4 decision):
```
<api-domain> {
    reverse_proxy backend:3001
}

<admin-domain> {
    reverse_proxy admin:80
}
```
- Caddy fetches certs on first start (port 80 must be open — §2.3).
- The **public accountant page** is served by the backend at `/public/accountant/:token` (outside `/api/v1`), so it's automatically reachable under `<api-domain>/public/accountant/...` — no extra Caddyfile rule needed. (If you'd rather it live on its own host, add a third block.)
- Resident photo uploads are served via **authenticated** endpoints (`/api/v1/tickets/my/:id/attachments/:attId`), proxied through `<api-domain>` — no separate static mount to expose.

DNS (do **before** deploy day so propagation is done): `A` records for `<api-domain>` and `<admin-domain>` → server (or floating) IP.

### 2.10 Mobile app — where the API URL changes
Verified `hr-erp-mobile/src/services/api.js`: the base URL comes from **`EXPO_PUBLIC_API_URL`**, baked in **at build time** (falls back to the old ngrok domain if unset).

For the production build:
1. In `hr-erp-mobile/.env` (or the EAS build profile env), set:
   ```
   EXPO_PUBLIC_API_URL=https://<api-domain>/api/v1
   ```
   `UPLOADS_BASE_URL` is derived automatically (strips `/api/v1`).
2. Build the Android app (Android-first decision) with EAS:
   ```bash
   cd hr-erp-mobile
   eas build -p android --profile production
   ```
3. Distribute the APK/AAB (decision in §4 — direct APK sideload vs Play Store internal track).
> The fallback ngrok URL must never ship to residents — confirm `EXPO_PUBLIC_API_URL` is set in the build profile, not just locally.

### 2.11 Nightly backups (closes the uploads tech-debt)
A single cron does **both** the DB and `uploads/`, then pushes **offsite** to a **Hetzner Storage Box** (separate from the VM — a snapshot on the same account is convenient but not a true offsite copy).

`~/hr-erp/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/hr-erp
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups
# 1. Database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump --no-owner --no-privileges -U postgres -F c hr_erp \
  > "backups/db-$STAMP.dump"
# 2. Uploads (from the named volume via the running container)
docker compose -f docker-compose.prod.yml exec -T backend \
  tar -czf - -C /app uploads > "backups/uploads-$STAMP.tgz"
# 3. Offsite push (Storage Box over SSH/rsync) + local retention
rsync -az backups/ u<box-id>@u<box-id>.your-storagebox.de:hr-erp-backups/
find backups -type f -mtime +14 -delete
```
```bash
chmod +x ~/hr-erp/backup.sh
( crontab -l 2>/dev/null; echo "30 2 * * * /home/deploy/hr-erp/backup.sh >> /home/deploy/hr-erp/backups/backup.log 2>&1" ) | crontab -
```
**Belt-and-braces:** also enable **Hetzner automated snapshots/backups** on the VM (whole-disk, one-click rollback). Use snapshots for fast disaster recovery, the Storage Box copy as the true offsite. **Test a restore once** before go-live (restore the dump into a throwaway DB).

#### Dual backup — provider independence (DECISION: stay on Hetzner, mitigate provider risk)
Everything above lives inside the Hetzner account. If that account is ever locked/suspended, the server **and** the Storage Box become unreachable at once. Mitigation: a **daily pull-down to a machine you control** (Mac laptop / NAS), so a full copy of the data exists outside Hetzner and the docker-compose stack can be redeployed anywhere within a day.

On the **Mac**, `~/hr-erp-backup-pull.sh` (pulls the newest DB dump + uploads archive — from the Storage Box, or directly from the server):
```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=~/hr-erp-offsite; mkdir -p "$DEST"
# Pull from the Storage Box (preferred — already aggregated, off the live VM):
rsync -az --delete u<box-id>@u<box-id>.your-storagebox.de:hr-erp-backups/ "$DEST/"
# (Alternative — straight from the server: rsync -az deploy@<SERVER_IP>:hr-erp/backups/ "$DEST/")
# Keep the two newest of each so the laptop doesn't fill up:
ls -1t "$DEST"/db-*.dump      2>/dev/null | tail -n +3 | xargs -r rm -f
ls -1t "$DEST"/uploads-*.tgz  2>/dev/null | tail -n +3 | xargs -r rm -f
echo "$(date): pulled $(ls -1 "$DEST"/db-*.dump | wc -l) db dump(s)"
```
Schedule it with **launchd** (survives reboots; runs at next wake if the Mac was asleep). `~/Library/LaunchAgents/hu.hrerp.backuppull.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>hu.hrerp.backuppull</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string>
    <string>~/hr-erp-backup-pull.sh >> ~/hr-erp-offsite/pull.log 2>&1</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
</dict></plist>
```
```bash
chmod +x ~/hr-erp-backup-pull.sh
launchctl load ~/Library/LaunchAgents/hu.hrerp.backuppull.plist
```
> Runs at 09:00 (after the server's 02:30 backup). Uses the **same SSH key** added to the Storage Box / server. **Verify the local copy restores** at least once (`pg_restore` a pulled dump into a throwaway DB) — an untested backup isn't a backup. This is the disaster-recovery seed: with the latest dump + uploads tarball + this repo, the whole stack redeploys on any host via `docker-compose.prod.yml`.

> 🔒 **GDPR interaction (bounded backup retention = the "ages out" guarantee).** The GDPR anonymization feature is irreversible in the live DB, but nightly backups taken *before* an erasure still contain the subject's data. Standard compliant practice (we do **not** edit backups): keep a **bounded retention** — the `backup.sh` `find … -mtime +14 -delete` above plus the offsite Storage Box rotation must be set so erased data ages out within the documented window. The app default is **`anonymization_config.backup_retention_days = 30`** — keep the backup rotation ≤ that figure (or update the config to match your chosen window), and document it as the retention policy. **After any restore**, re-run the outstanding entries in `anonymization_log` (reason=`gdpr_request`/`retention_expiry`) against the restored DB so erasures aren't silently resurrected — restores are all-or-nothing disaster recovery, never selective resurrection.

---

## 3. Go-live security checklist

- [ ] **No public registration path.** ✅ Verified: `auth.routes.js` mounts only `login`, `refresh`, `me`, `logout` — **there is no `/register` and no `/reset-password` route**. (Those strings appear only in the CSRF *exempt* list in `server.js` for paths that aren't mounted — harmless dead entries; consider removing them for tidiness.)
- [ ] **Only one unauthenticated route exists:** `/public/accountant/:token` (mounted at `/public/accountant`, no auth by design). It is **token-in-URL gated** and **rate-limited to 30 req/min per token** (`accountantShare.routes.js`); the token is validated by `accessByToken`. ✅ Safe pattern. **Verify before launch:** (a) tokens are high-entropy/unguessable, (b) links can be expired/revoked, (c) only the last 6 chars are ever shown in the admin UI (they are). Everything else under `/api/v1/*` requires `authenticateToken`.
- [ ] **Resident self-scoping** proven this sprint (own data only; cross-tenant → 404; AI suggestion returns only the resident's own 6 category slugs). No change needed — just don't loosen the `/tickets/my` WHERE clauses.
- [ ] **Rate limiting active:** `RATE_LIMIT_ENABLED=true`; global + speed + auth limiters wired in `server.js`. (In-memory store — fine for the single-instance pilot; switch to redis-store only if we scale to multiple backend containers.)
- [ ] **Secrets are NEW, not copied:**
  - `ANTHROPIC_API_KEY` — 🔑 **rotated here** (C-01 closes), old key revoked.
  - `DB_PASSWORD` — 🔑 new strong, set before first DB start.
  - `JWT_SECRET` — 🔑 new strong (safe to rotate pre-launch; invalidates dev tokens only).
  - `ENCRYPTION_KEY` — ⚠️ **carry over if it protects data in the dump** (rotating breaks decryption); decision in §4.
  - `GITHUB_TOKEN` left blank in prod; `GMAIL_*`/`GOOGLE_*` blank unless those integrations are in pilot scope.
- [ ] **Ports exposed to the internet: only 443 (HTTPS) and 80 (ACME/redirect), plus 22 (SSH, ideally IP-restricted).** Postgres/redis/backend/admin are **not published** — internal Docker network only. Confirm with `ss -tlnp` on the host that nothing but Caddy and sshd listens on public interfaces.
- [ ] **`CORS_ORIGIN` set** to the admin domain (no wildcard).
- [ ] **`CSRF_ENABLED=true`, `SECURITY_HEADERS_ENABLED=true`.**
- [ ] **HTTPS only** — Caddy redirects 80→443 automatically; confirm cert issued for both subdomains.
- [ ] **Backups verified** — run `backup.sh` once and do a test restore before residents are onboarded.
- [ ] **Provider independence: local backup copy verified** — the daily Mac/NAS pull-down (`~/hr-erp-backup-pull.sh` via launchd, §2.11) has fetched a dump + uploads archive, and a pulled dump has been test-restored into a throwaway DB. Guarantees all data is held outside Hetzner; the stack can redeploy anywhere within a day if the provider account is ever locked.
- [ ] **Run the i18n guard** on the deployed commit (`node scripts/check-i18n-coverage.js`) — standing rule for resident-facing releases.

---

## 4. Open questions — decisions needed before deploy day

1. **Domain / subdomains.** Which domain do we own, and what subdomains?
   - Proposed: `api.<domain>` (backend + public accountant page) and `admin.<domain>` (admin SPA). Mobile points at `https://api.<domain>/api/v1`.
   - Need the registrar so DNS A-records can be set up ahead of time (propagation isn't instant).
2. **`ENCRYPTION_KEY` — carry over or rotate?** This is the one secret we likely **cannot** rotate: if it encrypts data already present in the laptop dump (e.g. stored credentials/tokens), prod must reuse the **exact dev value** or that data won't decrypt. *Decision needed:* (a) confirm what `ENCRYPTION_KEY` protects, (b) carry it over verbatim, or (c) confirm it's only for new data and may be rotated. (Everything else — `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DB_PASSWORD` — is safe to make new.)
3. **Backup destination.** Recommended: **Hetzner Storage Box** (offsite, ~€3–4/mo for 1 TB, SSH/rsync) as primary + Hetzner VM snapshots as fast-rollback secondary. Confirm, or name an alternative (S3/Backblaze B2/offsite NAS).
4. **SSH source restriction.** Restrict port 22 to a known IP (home/office), or leave open (key-only + fail2ban)? Restricting is stronger; a dynamic home IP makes it fiddly.
5. **Mobile distribution.** Android-first decided — **direct APK sideload** to residents, or **Play Store internal/closed track**? Affects whether we need a Play Console account + signing setup now.
6. **GHCR package visibility.** Are the `esp-project-backend`/`-admin` packages **public or private**? If private, we need a GitHub **PAT with `read:packages`** on the box for `docker login ghcr.io`. (Recommend keeping them private + a deploy PAT.)
7. **Which integrations are in pilot scope?** Gmail, Google Calendar, Slack, NLP, email/SMTP — if **not** needed for the resident pilot, leave their secrets blank to shrink the attack surface and avoid shipping unused credentials. Confirm the minimal set (expected: just the resident app + admin + Claude key).
8. **Admin users.** Who logs into the admin SPA in prod, and are their accounts already in the dump with strong passwords? (No self-registration means accounts must pre-exist.)

---

## Appendix — facts verified from the repo (2026-06-11)

| Fact | Source |
|---|---|
| Images: `ghcr.io/lerch1979/esp-project-{backend,admin}:latest` / `:<sha>` | `.github/workflows/deploy.yml` (matrix + lowercased repo) |
| k8s deploy job disabled (`if: false`) | `.github/workflows/deploy.yml` |
| Backend reads `DB_HOST/PORT/NAME/USER/PASSWORD`, **not** `DATABASE_URL` | `src/database/connection.js` |
| Backend port 3001, non-root, healthcheck `/health`, runs `node src/server.js` (no auto-migrate) | `hr-erp backend/.../Dockerfile` |
| No `/register` or `/reset-password` route mounted | `src/routes/auth.routes.js` |
| Only public route: `/public/accountant/:token`, token-gated + 30/min/token | `src/routes/accountantShare.routes.js` (`server.js:396`) |
| Rate limiting in-memory; global + speed + auth limiters | `src/middleware/rateLimiter.js`, `server.js:185–187` |
| `trust proxy` = 1 (correct behind Caddy) | `server.js:103` |
| Full env var list | backend `.env.example` |
| Mobile API base = `EXPO_PUBLIC_API_URL` (build-time), ngrok fallback | `hr-erp-mobile/src/services/api.js` |
| Redis present in stack but not used by the rate limiter | `docker-compose.yml`, `rateLimiter.js` |
