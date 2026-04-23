# Cloudflare Tunnel (Persistent URLs, Free)

Use this instead of ngrok when you want **stable URLs that survive restarts** without paying for ngrok. Cloudflare Tunnel is free for individual accounts with a domain.

Trade-offs vs ngrok:

| Feature                  | ngrok free        | Cloudflare Tunnel (free) |
|--------------------------|-------------------|--------------------------|
| Stable URL               | 1 reserved domain | Unlimited on your domain |
| Auth required on your domain | no            | no (but can bolt on Access) |
| HTTPS                    | yes               | yes (Cloudflare edge)    |
| Setup time               | 2 min             | ~15 min (needs a domain) |
| Persistent (survives restart) | only 1 domain | yes, all of them        |
| Bandwidth cap            | soft              | generous                 |

If you don't own a domain yet, stick with ngrok (see `EXTERNAL_ACCESS.md`).

## Prerequisites

- A domain on Cloudflare (move nameservers over — free).
- `cloudflared` on your dev box: `brew install cloudflared`.

## One-time setup

```bash
cloudflared tunnel login
# opens a browser → pick your domain → Cloudflare writes a cert to ~/.cloudflared/cert.pem
```

### Create one tunnel (carries all three services)

```bash
cloudflared tunnel create hr-erp-dev
# Prints a tunnel UUID — note it; Cloudflare also saves credentials to ~/.cloudflared/<uuid>.json
```

### Map subdomains to the tunnel

In Cloudflare DNS for your domain, add three CNAME records (all orange-clouded / proxied), each pointing at `<uuid>.cfargotunnel.com`:

```
admin.hr-erp.example.com      CNAME  <uuid>.cfargotunnel.com
api.hr-erp.example.com        CNAME  <uuid>.cfargotunnel.com
mobile.hr-erp.example.com     CNAME  <uuid>.cfargotunnel.com
```

### Config file

`~/.cloudflared/config.yml`:

```yaml
tunnel: <uuid>
credentials-file: /Users/<you>/.cloudflared/<uuid>.json

ingress:
  - hostname: admin.hr-erp.example.com
    service: http://localhost:5173
  - hostname: api.hr-erp.example.com
    service: http://localhost:3001
  - hostname: mobile.hr-erp.example.com
    service: http://localhost:8082
  - service: http_status:404   # catch-all
```

## Running it

```bash
cloudflared tunnel run hr-erp-dev
# foreground — logs to stdout. Ctrl-C to stop.
# Or as a background service:
sudo cloudflared service install
```

## Admin UI + backend changes

The repo already handles Cloudflare:

- `hr-erp-admin/src/services/api.js` → runtime hostname check includes `.trycloudflare.com`; add your specific domain if you're not using Cloudflare's fast-tunnel subdomain.
- Backend CORS → `TUNNEL_HOST_RE` in `hr-erp backend/hr-erp-backend/src/server.js` matches `.trycloudflare.com`. If you use your own domain (`admin.hr-erp.example.com`), add it to `CORS_ORIGIN` env explicitly.

Example `.env` additions:

```
CORS_ORIGIN=https://admin.hr-erp.example.com,https://api.hr-erp.example.com
ALLOW_TUNNEL_ORIGINS=false   # strict mode — no wildcard tunnel domains
```

For the admin UI:

```
# hr-erp-admin/.env
VITE_API_URL=https://api.hr-erp.example.com/api/v1
```

## Cloudflare Access (optional, recommended for pre-prod)

To require SSO login before the tunnel is reachable:

1. Zero Trust dashboard → Applications → Add application → Self-hosted
2. Policy: `Email in @yourcompany.com` (or Google Workspace, etc.)
3. Apply to `admin.hr-erp.example.com`

Testers now get a Google/email OTP prompt before they ever see the app.

## When to use which

- **Ad-hoc demo to one tester, 30 minutes, no domain** → ngrok.
- **Repeated testing with a fixed URL over days** → Cloudflare Tunnel.
- **UAT with 5+ external users, needs auth** → Cloudflare Tunnel + Access.
- **Production** → neither — use real deployment (k8s in `k8s/`).
