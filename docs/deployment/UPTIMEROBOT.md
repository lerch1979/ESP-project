# UptimeRobot Monitoring — HR-ERP

External uptime monitoring using [UptimeRobot](https://uptimerobot.com/). Free tier covers 50 monitors at 5-minute intervals, which is enough for this platform.

## Monitors

Configure these five monitors. All probes are HTTP(S). Replace `https://api.hr-erp.example.com` with the production backend host and `https://admin.hr-erp.example.com` with the admin host.

| # | Name                       | Type     | URL                                                     | Interval | Expected       | Keyword / Status           |
|---|----------------------------|----------|---------------------------------------------------------|----------|----------------|----------------------------|
| 1 | HR-ERP Backend — liveness  | HTTP(s)  | `https://api.hr-erp.example.com/health`                 | 5 min    | 200            | Keyword `"OK"` must exist  |
| 2 | HR-ERP Backend — readiness | HTTP(s)  | `https://api.hr-erp.example.com/health/ready`           | 5 min    | 200            | Status code 200 only       |
| 3 | HR-ERP Backend — detailed  | HTTP(s)  | `https://api.hr-erp.example.com/health/detailed`        | 5 min    | 200            | Keyword `"connected":true` |
| 4 | HR-ERP API health          | HTTP(s)  | `https://api.hr-erp.example.com/api/health`             | 5 min    | 200            | Keyword `"OK"`             |
| 5 | HR-ERP Admin UI            | HTTP(s)  | `https://admin.hr-erp.example.com/`                     | 5 min    | 200            | Keyword `<title>` exists   |

### Why five monitors?

- **`/health`** — process-up check. Fast, no DB. Alerts if node crashes or the pod can't respond.
- **`/health/ready`** — returns 503 when DB is down. Alerts on degraded-but-running state.
- **`/health/detailed`** — JSON payload with DB latency, pool stats, Sentry/Redis/SMTP status. Keyword check on `"connected":true` catches a silent DB failure even when the endpoint returns 200.
- **`/api/health`** — verifies the `/api/v1` routing prefix works end-to-end (catches ingress/nginx misconfigs that only affect the API path).
- **Admin UI** — independent of the backend. Catches CDN/static-host failures that wouldn't surface in the API monitors.

## Setup steps (web UI)

1. Sign up at https://uptimerobot.com/ with an ops-team email alias (not a personal one).
2. **My Settings → Alert Contacts**: add at least two channels:
   - Ops email group (e.g. `ops@hr-erp.example.com`)
   - Slack webhook or PagerDuty integration (paid tier for PagerDuty)
3. **+ Add New Monitor** for each row in the table above:
   - Monitor Type: `HTTP(s)` for 1, 2, 4, 5 — `Keyword` for 3 (to assert `"connected":true` on the detailed endpoint)
   - Keyword Type: `exists`
   - Monitoring Interval: `5 minutes` (free tier minimum)
   - HTTP Method: `GET`
   - Alert Contacts To Notify: select both channels from step 2
   - Advanced → Timeout: `30s` (matches backend `/health/detailed` worst case)
4. **Maintenance Windows**: optionally create a recurring window for your deploy slot (e.g. Sun 02:00–02:15 UTC) so deploy-time blips don't page.

## Alerting configuration

| Channel             | Severity         | Monitors          | Notes                                                                    |
|---------------------|------------------|-------------------|--------------------------------------------------------------------------|
| Ops email group     | All failures     | All 5             | Primary inbox; captures everything for audit trail                       |
| Slack `#alerts-ops` | All failures     | All 5             | Real-time visibility; low friction                                       |
| PagerDuty (on-call) | Critical only    | 1, 2, 4           | Page only on liveness / readiness / API-prefix; UI/detailed fire via Slack |

**Escalation rules** (PagerDuty):
- 0 min: notify primary on-call
- 5 min unacknowledged: notify secondary
- 15 min unacknowledged: notify engineering lead

**Recovery notifications**: enable "Send notifications when monitor goes back UP" for all five.

**Rate limiting** (UptimeRobot setting per-monitor): `Send notifications only after X failures` → set to `2` for the Slack channel to suppress single-probe flakes, and `1` for PagerDuty (we'd rather page once on a real outage than miss one).

## Validating the setup

After adding monitors, verify end-to-end:

```bash
# All five endpoints should return 200 locally or from prod
curl -fsS https://api.hr-erp.example.com/health
curl -fsS https://api.hr-erp.example.com/health/ready
curl -fsS https://api.hr-erp.example.com/health/detailed | jq '.database.connected'
curl -fsS https://api.hr-erp.example.com/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://admin.hr-erp.example.com/
```

Then simulate a failure:

```bash
# From a bastion with DB access — temporarily revoke the DB user's LOGIN
# and confirm /health/ready returns 503 within 5 min in UptimeRobot.
psql -c "ALTER USER hr_erp_app NOLOGIN;"
# ... wait for alert ...
psql -c "ALTER USER hr_erp_app LOGIN;"
```

## Related

- Health endpoint source: `hr-erp backend/hr-erp-backend/src/server.js` (lines 165–300)
- Sentry error monitoring: configured in `src/config/sentry.js`
- Scaling guide: `docs/deployment/SCALING.md`
