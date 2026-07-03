# Scale-Readiness Report — HR-ERP

**Target:** several thousand residents, high availability, no data loss.
**Date:** 2026-07-03 · **Prod:** app.housingsolutions.hu (Hetzner `167.233.122.3`, Docker Compose).
**Method:** 3 parallel code investigators (single-instance / DB+N+1 / monitoring+backup) + live prod probes. Findings marked **[LIVE]** were verified directly against production; others are code-derived.

> Companion to the reliability audit (see `PROJECT_STATE.md` → reliability Phase 1). This report is the **scale gate** before real-data onboarding. Assessment only — nothing was built.

---

## Verdict

The app's fundamentals are scale-friendly: **stateless JWT** (no session store), **Redis wired**, **DB well-indexed on hot paths**, money-mutations use row locks, **no WebSocket/SSE** (no sticky sessions needed). But there are **three things already broken in production today** (surfaced by cluster mode) plus **one confirmed data-loss exposure**. None are deep rewrites.

Honest framing: several-thousand residents is **B2B traffic, not consumer-social** — a **robust single beefier VM** (CX32/CX42) serves it comfortably once the items below are fixed. **True multi-node HA** (survive a VM death with zero downtime) is a larger, separate architecture step, scoped at the end. The P0/P1 work is a prerequisite for it either way.

Legend — severity: **P0** data-loss or already-broken · **P1** gate before real-data scale · **P2** hardening/optimization. Effort: **S** ≤½ day · **M** ½–1.5 days · **L** multi-day.

---

## Headline: cluster mode makes "single-instance" bugs already live

**[LIVE]** The backend runs `cluster.js` with **4 workers** on the 2-core box (5 node procs = 1 primary + 4 workers; the loop appears to `fork()` twice per iteration — a bug, since `os.cpus().length`=2 should yield 2 workers). **Every "in-memory / per-instance" assumption below is therefore already broken across 4 workers today** — not a hypothetical 2-VM problem.

1. **P0 — Cron duplicate-sends.** All schedulers register in *every* worker with no leader election → they fire **4× per tick**. Two are not idempotent and claim no rows before sending: report-scheduler (`services/report-scheduler.service.js:363`) and the wellbeing notification queue (`services/cron/wellbeingCronJobs.js:327`). **Effect: residents/recipients likely get duplicate report emails and duplicate notifications right now.** Fix: gate the cron block to one worker (`NODE_APP_INSTANCE==='0'`) or wrap each job in `pg_try_advisory_lock` / `FOR UPDATE SKIP LOCKED`. **S–M.** Correctness fix, not just scale.
2. **P1 — Rate limiter per-worker in-memory.** `middleware/rateLimiter.js` uses the default MemoryStore → the "10 failed logins / 15 min" brute-force cap is really 10×4=40 today, multiplying further per VM. Same for AI-assistant token buckets (`services/aiAssistant.service.js:34`, a Claude-cost hole). Fix: `rate-limit-redis` on the already-wired Redis client. **S.**
3. **P1 — The double-fork itself.** 4 workers instead of 2 doubles connection demand and cron duplication. Confirm + fix `cluster.js`. **S.**

---

## 1. Single-instance assumptions

| Finding | Sev | Fix | Effort |
|---|---|---|---|
| Local-disk file uploads (`services/storage.service.js` LocalAdapter; ~10 writers: document/ticket/task/employee-doc/expense routes) — invisible across instances, **lost on rebuild if not on a mounted volume**; served via `express.static` (`server.js:234`) | P0/P1 | S3 / Hetzner Object Storage adapter behind the existing `storage.service` interface; serve via signed URLs | L |
| Crons fire on every worker/instance (headline #1) | P0 | Leader-gate or advisory-lock each job | S–M |
| In-memory rate limiter + AI token buckets (headline #2) | P1 | Redis store / Redis counters | S |
| Bull queues **silently run inline in-request** when Redis down (`queues/index.js:33`); legacy Bull, not BullMQ | P1 | Fail loud when Redis required in prod; plan BullMQ | S–M |
| In-memory TTL caches (chatbot config/FAQ, Claude semantic cache) diverge per worker → admin edits apply unevenly | P2 | Redis, or accept TTL staleness | M |

**Already scale-safe (confirmed):** stateless JWT (no session store, no refresh blocklist), no WebSocket/SSE (Slack = HTTP webhooks), Redis wired, DB row-locking on money mutations. Uploads footprint **[LIVE] 1.1 MB** today — cheap to migrate *before* it grows.

## 2. Database readiness

**[LIVE] Connection pool is the #1 DB blocker.** No pool env set → prod default **max 100 per worker** × 4 workers = **up to 400 demanded vs Postgres `max_connections = 100`**. Fine now (16 in use), wedges under load. Fix: set `DB_POOL_MAX` ~15–20/worker (4×20=80 < 100), and/or add **PgBouncer** (transaction pooling — the real scale answer). **S** for the cap, **M** for PgBouncer.

**Indexing is genuinely good [LIVE]** — `tickets` has 15 indexes; chatbot/notifications/employees/ticket_messages covered. Concrete gaps (all `CREATE INDEX CONCURRENTLY`, **S** total):

```sql
-- H3 resident ticket open — missing FK index
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
-- H1 notification unread poll + list (only single-column low-cardinality indexes today)
CREATE INDEX idx_notifications_user_unread  ON notifications(user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
-- H4 employee search + list sort (pg_trgm already enabled)
CREATE INDEX idx_employees_last_name_trgm  ON employees USING gin (last_name gin_trgm_ops);
CREATE INDEX idx_employees_first_name_trgm ON employees USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_employees_status_created  ON employees(status_id, created_at DESC);
-- M2 activity log filter/sort
CREATE INDEX idx_activity_logs_entity_created ON activity_logs(entity_type, created_at DESC);
CREATE INDEX idx_activity_logs_user_created   ON activity_logs(user_id, created_at DESC);
-- M1 chatbot conversation list (optional)
CREATE INDEX idx_chatbot_conv_user_updated ON chatbot_conversations(user_id, updated_at DESC);
```

Code-side (no migration):
- **H5** Ticket search uses `ILIKE '%term%'` and **bypasses the existing FTS GIN index** `idx_tickets_fulltext_search` (`ticket.controller.js:96`) → switch to `@@ plainto_tsquery('simple', $x)`.
- **H4** Employee search is a 7-column leading-wildcard `ILIKE` seq scan (`employee.controller.js:218`) → use the trigram indexes above.
- **H2/H6** Parallelize the sequential COUNT+SELECT pairs on list endpoints (notification-center, tickets, activity-log) with `Promise.all`, or fold counts with `COUNT(*) FILTER (...)`.
- **M2** The activity-log export (`activity-log.controller.js:137`) has **no LIMIT** — materializes full history to an in-memory XLSX (OOM risk at scale). Stream / cap it.

**N+1:** mostly clean (occupancy uses `json_agg`; resident endpoints indexed; ticket_messages translate loop is cache-first, not a DB N+1). Inspection score/task inserts are per-row loops (`inspection.controller.js:315`) — staff-only, bounded; batch later.

**Growth strategy (before millions of rows):** `activity_logs` (**[LIVE]** already the biggest table, ~11 MB at trivial load, grows per action) and `occupancy_snapshots` (~1 row/resident/day → **~730k/yr at 2000 residents**) need **retention + monthly partitioning**. P2, M.

## 3. Monitoring / alerting

**[LIVE] Sentry IS on in prod** (`SENTRY_DSN` set) — backend + admin error tracking active, PII-scrubbed (`config/sentry.js`). Concern closed. Gaps:
- **P1 — No resource alerting.** Nothing watches **disk** (real risk: `postgres_data` + `uploads` + **30 days of local backups all on one 75 GB disk, [LIVE] 56% used**), memory/OOM (no container limits), or CPU. Silent disk-full = full outage.
- **P1 — No confirmed uptime monitor** on the live domain (`docs/deployment/UPTIMEROBOT.md` still uses `example.com`). Compose healthchecks only *restart*; they don't *alert*.
- **[LIVE] Caddy only proxies exactly `/health`** — `/health/ready`, `/health/detailed` fall through to the admin SPA, so external checks can't see DB/readiness. DR doc verifies with `/healthz`, which **404s** (routes are `/health*`).
- **P2 — Logs file-only, no stdout in prod** (`docker logs` blind), no shipping/aggregation, not in backups.

**Minimum-viable proposal (concrete, ~€0):** UptimeRobot → monitors on `/health` + admin root with Slack/email alert; add a Caddy route so `/health/ready` is externally reachable and monitor *that* (real DB check). **Netdata** (one container) or a 10-line `df`/`free` → Slack cron for disk/mem at 80%. Sentry already covers errors. **M** total.

## 4. Backup & recovery — the one confirmed data-loss exposure

**[LIVE] P0 — Offsite backup is OFF.** The daily 02:30 cron works and backs up **both** the DB dump **and** the uploads tarball (so the old "uploads not backed up" tech-debt in `PROJECT_STATE.md:168` is **stale** — coverage is fine). **But every run logs `"Storage Box not configured — offsite SKIPPED, local backup only"`** — 18 days of dumps sit **only on the same VM disk they protect.** If that disk/VM dies, all backups die with it. **This is the top gap.** Fix: populate `backup.env` with the Storage Box creds (rsync path already coded in `deploy/backup.sh:27`) **and** enable the documented daily pull-down to a machine you control. **S** once creds exist.

**Restore drill — P1.** The runbook (`deploy/DISASTER_RECOVERY.md`) is concrete, but only the **DB** restore was ever exercised (initial deploy). **Uploads restore + full-stack rebuild are untested.** Single point of failure: without the exact **`ENCRYPTION_KEY`**, restored PII won't decrypt (lives only in Bitwarden). **Design a quarterly drill:** restore latest dump + uploads tarball into a throwaway VM, bring the stack up, verify login + a resident ticket + a photo download, record wall-clock. Estimate today **~30–60 min** given small data — but unproven until drilled, and impossible until offsite is fixed. Also fix the `/healthz` → `/health` doc bug. This drill doubles as the load-test staging environment.

## 5. Load-test plan (design)

**Goal:** prove the stack (after P0/P1) holds ~2000 residents' peak without connection exhaustion, OOM, or latency collapse.

- **Tool:** **k6** (scriptable, p95/p99, ramping VUs). **Staging = a restored copy of prod** (doubles as the restore drill) on a CX32/CX42.
- **Model (realistic B2B peak):** ~2000 residents, ~15–20% active in the peak hour; most traffic is the **mobile notification/unread-count poll** (highest frequency) + view-my-tickets + occasional create-ticket/chat; plus staff ticket-lists + employee search (the `ILIKE` hot path). Weight the scenario mix by these frequencies.
- **Measure:** p50/p95/p99 latency per endpoint, error rate, `pg_stat_activity` connection count + pool wait, backend RSS (OOM), Postgres CPU, Redis ops.
- **Pass:** reads p95 < 300 ms / p99 < 800 ms; writes p95 < 800 ms; error rate < 0.1%; **no pool exhaustion** (< 80% of `max_connections`); DB CPU < 70% sustained; zero OOM. Ramp to **2× peak** to find the knee and set the VM-resize trigger.

---

## Prioritized action plan

### P0 — this week (data-loss + already-broken; all small, two are pure config)
1. **Enable offsite backup** (`backup.env` Storage Box creds) + Mac/NAS pull-down. **S** — closes the data-loss exposure.
2. **Leader-gate the crons** — kills the live duplicate report-emails/notifications. **S–M**
3. **Fix `cluster.js` double-fork + cap `DB_POOL_MAX`** per worker (connection safety). **S**
4. **Disk alert at 80%** (10-line cron → Slack). **S**

### P1 — before onboarding real residents at scale
5. Rate limiter → Redis store (+ AI token buckets). **S**
6. Uploads → object-storage adapter. **L** (biggest single item; do it while uploads are ~1 MB).
7. Add the 6 indexes + swap ticket/employee search to FTS/trgm + parallelize COUNT+SELECT + LIMIT the activity-log export. **M**
8. UptimeRobot on the live domain + `/health/ready` reachable via Caddy. **S**
9. First real restore drill (uploads + full stack); record time; fix `/healthz` doc bug. **M**

### P2 — scale hardening
10. PgBouncer; `activity_logs`/`occupancy_snapshots` retention + partitioning; Bull→BullMQ + fail-loud; Redis for TTL caches; log shipping. **L**

### True HA (separate Phase-2 decision)
Zero-downtime-on-VM-death needs: managed Postgres (or streaming replica + failover), object storage (P1 #6 gets you there), 2+ app nodes behind the Hetzner LB, Redis persistence. Treat as Phase 2 after the pilot proves load on a beefier single node.

---

## Bundling note
Runs **alongside** reliability Phase 1 (#5 GDPR erasure, #6–7 money paths). **P0 #2 (cron leader-gate) reuses the exact `FOR UPDATE SKIP LOCKED` / advisory-lock technique as #6–7's payment-race fix** — worth doing in one focused session.
