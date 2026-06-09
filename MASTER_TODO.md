# MASTER TODO — Cross-Project Portfolio Audit

**Created:** 2026-06-09
**Maintainer:** lerchbalazs@gmail.com
**Method:** Disk audit of all projects on this machine (`~/Desktop`, `~/`, `~/Documents/Obsidian-Vault`) + git history + inline markers + each project's own docs.

> ⚠️ **Scope caveat:** This reflects what exists on **this machine** as of 2026-06-09. If you keep separate repos elsewhere (another machine, GitHub remotes not cloned here, cloud), they are **not** captured. Tell me and I'll fold them in.

---

## 🚨 KEY FINDING — the portfolio is smaller than the mental model

Three things tracked as separate "projects" are actually **subsystems of HR-ERP**, not standalone repos. This mismatch *is* the cross-project tracking gap you flagged.

| Tracked as… | Reality on disk |
|---|---|
| **"Workforce Platform"** | = **HR-ERP itself** — its product tagline is *"Workforce Stability SaaS"*. Same repo. |
| **"Pulse Solutions"** | = **Pulse survey module inside HR-ERP** (migrations 077–079, `wellmind.controller.js`). LIVE. |
| **"Onboarding videos (AI-generated)"** | = **Inside HR-ERP**: a manual video library (LIVE) + the **Bruno** mascot (unwired CSS prototype). **No AI-video-generation pipeline exists yet** — this is why it feels "significantly behind." |

**Actual standalone code projects:** 4 repos/codebases — HR-ERP, StockMaster, hedge-fund-agent, sg-intel-agent.
**Plus:** 3 completed/parked initiatives tracked only in the Obsidian vault (CsillagHős PWA, Sales Training Ecosystem, Ökötemetés feasibility).

---

## PORTFOLIO OVERVIEW

| Project | Location | VCS | Last activity | Status | Open items |
|---|---|---|---|---|---|
| **HR-ERP** (incl. Pulse, Videos, Bruno) | `~/Desktop/HR-ERP-PROJECT` | git, clean | 2026-05-21 | 🟢 Active, pre-pilot | many (see §1) |
| **StockMaster** | `~/Desktop/StockMaster` | git, dirty | 2026-04-10 (60d) | 🟡 Dormant, phases 1–5 done | hardening/tests/CI (§2) |
| **hedge-fund-agent** | `~/Desktop/hedge-fund-agent` | **none** | 2026-04-23 | 🟡 Dormant, runs manually | not-versioned; keys; wiring (§3) |
| **sg-intel-agent** | `~/sg-intel-agent` | git, clean | 2026-05-31 (10d) | 🟢 Healthy, shipping daily | roadmap-only (§4) |
| CsillagHős PWA | (Netlify, single-file React) | — | — | ✅ Complete, in use | none (§5) |
| Sales Training Ecosystem | (Python/ReportLab) | — | — | ✅ Complete | none (§5) |
| Ökötemetés feasibility | (PDF report) | — | — | 🟡 Study done | business decision (§5) |

---

## §1 — HR-ERP (`~/Desktop/HR-ERP-PROJECT`) 🟢 ACTIVE

The flagship. Backend (Node/Express/PG/Redis, in `"hr-erp backend/hr-erp-backend/"` — note the literal space), admin SPA (React/Vite/MUI, port 5173), mobile (RN/Expo). 226/226 backend tests green. Working tree clean. Authoritative live state: `PROJECT_STATE.md`; per-session detail: `SESSION_LOG.md`.

### 1A. Billing / Expenses thread (the current sprint — Days 1–4 done)
Carried over from `SESSION_LOG.md` "WHAT'S NEXT":

- [ ] **Re-establish ngrok tunnel** → `ngrok http 5173`, update `FRONTEND_URL` in `.env`, restart backend. *(prior `blinker-bronze-evasion` tunnel is dead.)* — **blocks the item below**
- [ ] **Verify Tab 5 accountant share-link mobile path** end-to-end (open public URL on phone → expense table renders → ZIP download → individual file links). Code verified correct; only the tunnel blocks it.
- [ ] **Day 5 — Gmail poller reactivation.** Flip `GMAIL_POLLING_ENABLED=true`; **regen OAuth refresh token** (`invalid_grant` since 2026-04-21); confirm new drafts land with the extended OCR prompt (vendor + invoice + dates + amounts + performanceDate + paymentMethod).
- [ ] **Day 5 — AI cost-center suggestion** in the Tab 2 convert dialog (surface existing `suggestedCostCenter` from the OCR pipeline as a pre-fill).
- [ ] **Tab 2 + Tab 3 placeholders** — build "Billing runs" and "Billings list" views.

### 1B. Cost-tracking architecture (OPEN DECISION — needs your call)
- [ ] **Pick A/B/C** from `docs/ARCH_COST_TRACKING_OPTIONS.md` — unify new `accommodation_expenses` with the old `cost_centers` + invoice-classification pipeline. *Recommendation in PROJECT_STATE: deprecate the old pipeline, single source of truth in the new system.* **Risk if left open:** if the old pipeline is unblocked, expenses split across `invoices` and `accommodation_expenses` and the profit dashboard misses one side.
- [ ] Decide disposition of the **dormant invoice-classification pipeline** (0 finalized invoices ever; 5 stale drafts already manually converted; 11 of 20 classification rules never matched).

### 1C. Tech debt (from PROJECT_STATE.md)
- [ ] **`uploads/expenses/` not in backup cron** — **HIGH before production.** Add the path to nightly backup OR migrate to S3 (storage interface already pluggable for the swap).
- [ ] **pg DATE → UTC drift footgun** — systemic fix `pg-types.setTypeParser(1082, v => v)` to return DATE as raw `'YYYY-MM-DD'` strings. Currently worked around in 3 places (`fmtDateInput`, `dateToISODate`, `asLocalDate`). Deferred — needs a dedicated session + full regression (broad blast radius).
- [ ] **Promote payroll-deductions cron from DRY-RUN to live** when ready.
- [ ] **Verify Gmail poller registration** — confirm it isn't silently polling and piling orphan drafts.
- [ ] Decide: refresh or deprecate stale `docs/PROJECT_CONTEXT.md` (last real update 2026-03-07).
- [ ] Sarród I. vs II. — old CC has only "Sarród szálló"; split needed *if* the AI pipeline is revived.

### 1D. Onboarding Videos + Bruno ("significantly behind" — the AI-video gap)
- [ ] **No AI video-generation pipeline exists.** Current `Videos` feature is a **manual** YouTube/Vimeo link library (LIVE, nav-reachable, 6 categories, view tracking). If the goal is *AI-generated* onboarding videos, that is **greenfield** — scope it: tool choice (HeyGen / Synthesia / Runway / local), script source, Bruno-as-presenter, language coverage (hu/en/tl/uk/de).
- [ ] **Bruno is an unwired prototype** — `BrunoCharacter.jsx` (CSS-animated static `bruno-base.jpg`, 10 states) reachable only at hidden `/bruno-test`; not connected to Videos or onboarding. Vault note: *"Bruno dance = frame moves, not Bruno (needs sprite sheet)."* Decide: invest (sprite sheet / real animation + wire into onboarding) or park.
- [ ] **`add_videos.sql` is an orphan migration** — sits outside the numbered sequence (after 117). Renumber or fold into baseline so CI auto-discovery stays consistent.

### 1E. Pulse module (LIVE — minor gaps)
- [ ] **No admin UI for Pulse question management** — 88 questions across 12 categories are managed via SQL migrations only. Consider an admin CRUD page if questions need to change often.
- [ ] (Otherwise healthy: rotation system, 5-language support, mobile `DailyPulseScreen`/`PulseHistoryScreen`, gamification + sentiment hooks, daily 9am cron reminder. No code markers.)

### 1F. Known product issues (from Obsidian HR-ERP note)
- [ ] **Mobile auth broken** — `toth.anna@abc-kft.hu` login fails. *(Verify against current code — vault note may be stale.)*
- [ ] **Pilot readiness** — flagged biggest risk is user adoption (needs 60%+ for predictive analytics to be meaningful). Strategy work, not code.

---

## §2 — StockMaster (`~/Desktop/StockMaster`) 🟡 DORMANT

Multi-tenant Hungarian warehouse/inventory SaaS. Node/Express + React 19/Vite + PostgreSQL; Stripe billing, WebSocket stocktake, POS bridge, Docker/nginx/Certbot. Phases 1–5 complete. **Last commit 2026-04-10 (60 days).** No TODO/state docs — phases live in commit messages. Zero inline code markers.

> Note: older copies also exist at `~/Downloads/stockmaster` and `~/Downloads/stockmaster2` — likely stale duplicates; confirm the Desktop one is canonical and delete the Downloads copies if so.

- [ ] **Working tree is dirty** — `.claude/settings.local.json` modified, `backend/generated-qr/` untracked. Commit, gitignore, or clean.
- [ ] **No tests anywhere** (no `*.test.js`/`*.spec.js`/`__tests__`). Add at least smoke coverage before any production use.
- [ ] **No CI/CD** (no `.github/workflows`).
- [ ] **No API docs** (no OpenAPI/Swagger).
- [ ] **Production hardening before go-live:** Stripe webhook error-recovery/retry; 14-day trial lifecycle (expiry handling, upgrade prompts); tenant-limit middleware (402 gates) needs test coverage.
- [ ] **POS bridge** (TCP/Serial/OPOS, localhost:3099) needs field testing/hardening.
- [ ] No monitoring/structured logging (no Winston/Pino).
- [ ] Hungarian-only; no i18n framework (decide if multi-language is needed).
- [ ] **Decide overall disposition:** revive toward production, or formally park. 60 days idle with infra "done but untested" is the risk.

---

## §3 — hedge-fund-agent (`~/Desktop/hedge-fund-agent`) 🟡 DORMANT

6-layer Claude-driven investment-committee simulator (Python, Flask dashboard, SQLite, paper trading). L1 macro → L6 monitor; analyzes 17 TIER1 tickers. **Last run 2026-04-23; code last modified 2026-03-21.**

- [ ] **NOT under version control** — no `.git`. **`git init` + initial commit** to stop risking the 6,258-line codebase. *(Highest-leverage, lowest-effort item here.)*
- [ ] **Config inconsistencies:** `INITIAL_CAPITAL` 1,000,000 (.env) vs 100,000 (config) — pick one; `DASHBOARD_PORT` 8090 vs 8080 mismatch.
- [ ] **API keys placeholder** — `.env` has a real ANTHROPIC key but `your_*` placeholders for Finnhub, FRED, EIA, EODHD, SMTP, Telegram. Insider/institutional/credit/alt-data agents silently return empty without them. Populate or switch to explicit mock mode.
- [ ] **Auto-trader not wired** — `execute_buy/sell` coded but committee verdicts never route to trades automatically (manual CLI only).
- [ ] **Position sizer + risk agent outputs unused** — Kelly sizing computed but not applied; L4 risk not fed back into portfolio limits.
- [ ] **TIER2 (47) / TIER3 (120) watchlists paused** — only TIER1 active.
- [ ] **Dashboard skeletal** — index + API endpoints only; no real-time UI; daily HTML report generation is a stub and email send fails silently if SMTP unconfigured.
- [ ] **No tests, no Docker, no CI.** Paper-trading only (no live brokerage).
- [ ] **Decide disposition:** personal research toy (fine as-is, just version it) vs. something to push forward.

---

## §4 — sg-intel-agent (`~/sg-intel-agent`) 🟢 HEALTHY

Daily/weekly news-intelligence agent for **Solutions Group Holding** (the parent brand over Housing Solutions + Pulse Solutions). Python + Claude + RSS → Obsidian markdown. **Last commit 2026-05-31; runs daily 07:00 + weekly Sun 20:00 via launchd.** Clean tree, zero code markers. No urgent debt.

Roadmap-only (from README — not started, not blocking):
- [ ] **v2:** ChromaDB vector store for true trend persistence/semantic clustering (currently LLM-summary only).
- [ ] **v3:** Dashboard (port 8091) + email delivery.
- [ ] **v4:** Competitor monitoring (website scraping + LinkedIn watch).
- [ ] Optional: swap filter model to Haiku on high-volume days for cost; wire the `feedback/weekly_review.md` curation loop; feed-health alerting.

---

## §5 — Completed / Parked (Obsidian-tracked, no code action)

- ✅ **CsillagHős (StarHero) PWA** — single-file React routine tracker for the twins; localStorage; deployed on Netlify; in daily use. **Done.**
- ✅ **Sales Training Ecosystem** — AI Sales Simulator v5, Magyar Üzleti Nyelvi Motor v3, Sales Bible (HTML), training manual (PDF). For HR-ERP sales enablement. **Complete.**
- 🟡 **Ökötemetés (eco-burial forest) feasibility** — styled PDF feasibility report done. **Next: business go/no-go decision** (not a code task).

---

## SUGGESTED PRIORITIZATION (for the next conversation)

1. **HR-ERP billing sprint** — unblock ngrok → verify Tab 5 mobile → Day 5 (Gmail + AI suggestion). Active momentum; finish it.
2. **HR-ERP cost-tracking decision (A/B/C)** — a real fork blocking clean architecture; just needs your choice.
3. **HR-ERP `uploads/` backup/S3** — only HIGH-severity-before-production item.
4. **hedge-fund-agent `git init`** — 2 minutes, removes a real loss risk.
5. **StockMaster disposition** — explicitly revive or park; don't let it rot in limbo.
6. **AI onboarding-video scope** — if this is genuinely a priority, it's greenfield and needs a scoping session of its own (it is not "behind on a build," it's "not yet started").

---

*Maintenance: update this file when a project's status changes. It is a portfolio index, not a substitute for each project's own `SESSION_LOG`/`PROJECT_STATE`.*
