# Performance monitoring

## Response time tracking (runtime)

Already wired — `src/middleware/responseTime.js` stamps every response with `X-Response-Time` and logs any request over 1 s via `logger.warn('[slow-request]', …)`.

Review slow requests:

```bash
tail -n 5000 ~/.hr-erp-logs/app.log | grep slow-request | sort -k6 -n -r | head
```

## Slow query logging (postgres side)

**Not auto-applied** — changing `log_min_duration_statement` is a DBA decision. To turn on a 1-second threshold on the dev DB:

```sql
-- one-shot (resets on restart)
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- to turn off
ALTER SYSTEM RESET log_min_duration_statement;
SELECT pg_reload_conf();
```

Output lands in `postgresql@14/server.log` (Homebrew on macOS: `/opt/homebrew/var/log/postgresql@14.log`).

Review weekly:

```bash
tail -n 10000 /opt/homebrew/var/log/postgresql@14.log | grep "duration:" | sort -k8 -n -r | head -20
```

Each line looks like:
```
2026-04-23 10:23:17 … duration: 1834.215 ms  statement: SELECT …
```

## Uptime-monitor target

`/health/detailed` is the dashboard-grade endpoint (200 even when DEGRADED; exposes DB latency, memory, integration status).

`/health/ready` is the binary up/down endpoint (503 when DB is down). Point k8s / UptimeRobot / load balancers at this one.

Example UptimeRobot config:

- Monitor type: HTTPS
- URL: `https://<host>/health/ready`
- Check every: 5 min
- Alert on: non-200 response, 3 consecutive failures

## Known-quirk: `emails: 0` vs real count

`/health/detailed.database.stats.emails` reads `pg_class.reltuples`, which is an estimate that stays `-1` on fresh tables until PostgreSQL runs ANALYZE. We clamp `-1 → 0` for UX. After meaningful traffic the estimate converges.
