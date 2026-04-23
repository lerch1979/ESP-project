# External Access for HR-ERP (ngrok)

How to expose the local dev stack to outside testers (e.g. a product owner reviewing from their phone, a contractor trying the admin UI from home).

## TL;DR

```bash
./scripts/start-with-ngrok.sh
# prints:  https://blinker-bronze-evasion.ngrok-free.dev
```

Share that URL. The admin UI loads there, and its API calls go through Vite's `/api` proxy to the local backend on the same origin — no CORS, no second URL.

## What gets exposed

On **free ngrok** (current default):

| Service | Port  | How it's reached                                              |
|---------|-------|---------------------------------------------------------------|
| Admin UI (Vite) | 5173 | `https://blinker-bronze-evasion.ngrok-free.dev/` |
| Backend API     | 3001 | same URL, via Vite proxy: `/api/v1/...`          |
| Mobile (Expo web) | 8082 | **not exposed** — LAN-only (see "Mobile testing" below) |

Free tier gives **one static domain per account**. We pin that domain to the admin UI because it's the only public surface testers need; the backend is reachable through the same origin via Vite proxy.

## First-time setup

1. `brew install ngrok` (or download from ngrok.com)
2. Get an authtoken from https://dashboard.ngrok.com → Your Authtoken
3. `ngrok config add-authtoken <token>` — writes to `~/Library/Application Support/ngrok/ngrok.yml` (macOS) or `~/.config/ngrok/ngrok.yml` (Linux)
4. (Optional) `brew install qrencode` — the start script will then print a QR code for the public URL

The repo ships an `ngrok.yml` fragment in `docs/deployment/ngrok.yml.example` — copy its `tunnels:` block into the file from step 3.

## Starting everything

```bash
./scripts/start-with-ngrok.sh            # default: admin tunnel only (free tier)
NGROK_MODE=backend ./scripts/start-with-ngrok.sh   # expose backend directly
NGROK_MODE=all ./scripts/start-with-ngrok.sh       # paid tier with multiple reserved domains
```

The script is idempotent — it skips services/tunnels that are already up.

Logs land in `logs/ngrok-session/{backend,admin,mobile,ngrok}.log`.

## Stopping

```bash
./stop-all.sh                      # kills backend + admin + mobile
pkill -f "ngrok start"             # kills the tunnel
```

## Mobile testing (three options)

1. **LAN** — easiest. Connect the phone to the same WiFi, then in the mobile app set `EXPO_PUBLIC_API_URL=http://<your-laptop-lan-ip>:3001/api/v1` in `hr-erp-mobile/.env`. Get your LAN IP with `ipconfig getifaddr en0` (Mac) / `ip addr` (Linux).
2. **ngrok backend tunnel** — on free tier, swap to `NGROK_MODE=backend` (admin UI becomes local-only). The mobile app's `EXPO_PUBLIC_API_URL` in `.env` already points at `blinker-bronze-evasion.ngrok-free.dev/api/v1`, so no code change needed.
3. **Paid ngrok (or Cloudflare Tunnel)** — each service on its own reserved domain. See `CLOUDFLARE_TUNNEL.md`.

## How the admin UI finds the backend

`hr-erp-admin/src/services/api.js` picks its API base URL at runtime:

1. If the page host ends in `.ngrok-free.dev`/`.trycloudflare.com`/etc → use same-origin `/api/v1` (Vite proxy / ingress proxy handles the rest).
2. Else if `VITE_API_URL` env is set to an absolute URL → use it (for paid tier with a separate backend domain).
3. Else → same-origin `/api/v1`.

This means you can deploy the same admin bundle to localhost, LAN, ngrok, or a real domain without changing config.

## Security considerations

- **ngrok URLs are public**. Anyone who has the URL can reach the admin UI. Don't share it on public channels.
- The `ngrok-skip-browser-warning` header trick means testers bypass the interstitial page, but ngrok still logs every request on your dashboard.
- **CORS**: the backend allows tunnel-host origins (ngrok/cloudflared/localtunnel) when `NODE_ENV !== production` or `ALLOW_TUNNEL_ORIGINS=true`. Set `ALLOW_TUNNEL_ORIGINS=false` in production.
- **Rate limiting**: the same per-IP rate limits apply — ngrok forwards the real client IP because `app.set('trust proxy', 1)` is set in `server.js`.
- **Sessions**: JWT_SECRET is the same across envs; don't leak a dev token into a public Slack channel.
- **Kill the tunnel when you're done**: `pkill -f "ngrok start"`.

## Free-tier URL changes

When you restart ngrok, the admin tunnel keeps the reserved domain (`blinker-bronze-evasion.ngrok-free.dev`). On paid plans with `domain:` fields set per-tunnel, all URLs are stable across restarts.

If you bump ngrok plans and get more reserved domains, edit `~/Library/Application Support/ngrok/ngrok.yml` to add `domain:` lines to `admin:` / `mobile:`, then `NGROK_MODE=all ./scripts/start-with-ngrok.sh`.

## Troubleshooting

- **403 "Blocked request. This host is not allowed"** → Vite 5.x rejects unknown Host headers. Fixed by `server.allowedHosts` in `hr-erp-admin/vite.config.js`; if a new tunnel host appears, add its domain suffix there.
- **Login works locally but fails through ngrok** → check the backend log for `CORS: tunnel hosts allowed`. If missing, set `ALLOW_TUNNEL_ORIGINS=true` or fall back to `NODE_ENV=development`.
- **"ngrok already running"** → `pkill -f "ngrok start"` and retry.
- **Tunnels collapse to one URL** → expected on free tier with multiple `tunnels:` entries; see "What gets exposed" above.
