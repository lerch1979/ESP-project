# HR-ERP Feature Audit — current-state map

**Date:** 2026-06-21 · **Method:** parallel cross-layer audit (admin / backend / mobile) + chatbot deep-dive + `PROJECT_STATE.md`.
**Purpose:** one map of what exists, where, its status, and gaps/duplications — to work through systematically.

> **Data caveat:** the automated admin-UI scan's "no route / orphan" detection had false negatives (flagged Chatbot, Billing, inspections, WellMind as unrouted, but they're confirmed live). This doc trusts the backend scan (all 70 routers mounted), the chatbot deep-dive, and `PROJECT_STATE` over that. A **manual admin route-wiring audit** is itself a follow-up item.

---

## 4 headline findings
1. **The chatbot is NOT missing from the app** (hypothesis inverted). It's built in all three layers (backend + admin + mobile `ChatbotChatScreen`). The real issue is **discoverability** — residents can't find it. And it's **complementary to ticket-chat, not a duplicate**.
2. **Biggest alignment gap: the resident mobile menu hides ~7 working features.** `MoreMenuScreen` filters to `RESIDENT_MENU_KEYS = ['accommodations','notifications','profile']` → chatbot, wellbeing/WellMind, CarePath, projects/tasks, invoices, documents, videos are built + wired + have screens but have **no resident menu entry**.
3. **Backend is complete but carries dead weight:** all 70 routers mounted, but **~12 orphan services** (referenced nowhere) + several **dormant/gated crons** (Gmail poller off, payroll DRY-RUN, in-app backup off).
4. **Two real duplications:** cost-tracking (new `accommodation_expenses` vs old `cost_centers`+invoice pipeline — open decision) and **task management** (MyTasks / UnifiedTasks / GTDDashboard / admin AllTasks).

---

## Inventory by area (feature → layers → status → gap/dup)

### Residents (mobile-facing)
| Feature | Layers | Status | Gap / note |
|---|---|---|---|
| Tickets (self-scoped) + in-ticket chat + AI translation + photos + AI category | backend ✓ admin ✓ mobile ✓ | Working | aligned |
| Calendar (List⇄Month) + .ics | backend ✓ mobile ✓ | Working | aligned |
| Profile + photo + biometrics + show-password | backend ✓ admin-view ✓ mobile ✓ | Working | aligned |
| Push notifications (chat / expiry) | backend ✓ mobile ✓ | Working | aligned |
| **Chatbot (FAQ + escalation)** | backend ✓ admin ✓ mobile ✓ | **Built, hidden** | not in resident More menu |
| **Wellbeing / WellMind (pulse, assessment, coaching)** | backend ✓ admin ✓ mobile ✓ | **Built, half-hidden** | ⚠️ health data — Art 9 review before surfacing |
| **CarePath (cases, providers, bookings)** | backend ✓ admin ✓ mobile ✓ | **Built, hidden** | ⚠️ care/health — review before surfacing |
| **Documents / Videos / Invoices (resident)** | backend ✓ mobile ✓ | **Built, hidden** | no resident menu entry |

### Tickets / Support
| Feature | Layers | Status | Note |
|---|---|---|---|
| Tickets + SLA + assignment | backend ✓ admin ✓ mobile ✓ | Working | core |
| ticket_messages (human staff↔resident) | backend ✓ admin ✓ mobile ✓ | Working | distinct from chatbot |
| Damage reports / inspections / compensations / fines | backend ✓ admin ✓ | Working | large active module |

### Billing / Finance
| Feature | Layers | Status | Gap / dup |
|---|---|---|---|
| Occupancy→billing + option-C per-client rates + margin | backend ✓ admin ✓ | Working | shipped 2026-06-20/21 |
| accommodation_expenses (cost) + profit | backend ✓ admin ✓ | Working | the cost source |
| **cost_centers + invoice-classification + Gmail pipeline** | backend ✓ admin ✓ | **DORMANT** | 0 invoices ever; duplicate of expenses — open decision (`ARCH_COST_TRACKING_OPTIONS.md`) |
| Salary / payroll deductions | backend ✓ admin ✓ | Working (cron DRY-RUN) | promote when ready |

### Notifications / Analytics / Integrations / AI
| Feature | Layers | Status | Note |
|---|---|---|---|
| In-app notifications + notification-center + push | backend ✓ admin ✓ mobile ✓ | Working | resident center under-surfaced |
| Insights (BI) + Dashboard | admin ✓ backend ✓ | Working | mild overlap (snapshot vs analytics) |
| Expiry monitor / GDPR anonymization | backend ✓ admin ✓ | Working | no real data yet |
| Slack / Gamification / Google Calendar / Translation | backend ✓ (+admin/mobile varies) | Working | integrations |
| AI agent foundation (`entity_status_history`) | backend ✓ | Collecting data; agents not built | scaffolding |

### Orphans / dead weight
- **Backend (~12 unreferenced services):** `agentEmail`, `autoTranslate`, `documentRouter`, `entityExtractor`, `invoiceClassification` (dormant), `gmailMCP` (superseded by `gmailUniversalPoller`), `securityMonitor`, `reportGenerator`, `pulseQuestionRotation`, `nlp/sentimentAnalysis`, etc. → delete-or-complete.
- **Admin:** `BrunoTest.jsx` (demo); `admin/Workplaces` (route, no nav).
- **Dormant crons:** Gmail poller (off since 2026-05-21), payroll deductions (DRY-RUN), in-app backup (off in containerized prod).

---

## Chatbot vs ticket-chat (resolved)
- **Chatbot** = first-line self-serve FAQ bot ("Bruno") + Claude fallback + decision trees; **escalates to a ticket** when stuck. Resident-facing (public FAQ + authed chat), operator-managed. Working in backend + admin + mobile.
- **ticket_messages** = human multi-party thread *after* a ticket exists (staff ↔ resident), with email-in support.
- **Distinct & complementary, not duplicates** — `createEscalationTicket()` bridges bot→ticket. **Keep separate; only fix = make the bot reachable in the app.**

---

## Priority list (work through systematically)
1. ✅ **Unhide resident features** (mobile menu) — DONE 2026-06-21 (chatbot+FAQ surfaced; docs/videos & health features correctly NOT surfaced). Rides next EAS build (batched — not built yet).
2. 🔄 **Cost-tracking decision** — IN PROGRESS (2026-06-21). Recommendation: deprecate the dead **invoice-classification/OCR pipeline**, KEEP `cost_centers` as an active accounting taxonomy (used by accountant export + projects). See below + `ARCH_COST_TRACKING_OPTIONS.md`.
3. **Task-management consolidation** — pick one of MyTasks / UnifiedTasks / GTD / AllTasks.
4. **Delete the ~12 orphan services** + `BrunoTest`; wire or drop `admin/Workplaces`.
5. **Promote the DRY-RUN payroll cron / confirm Gmail-poller disposition.**
6. **Manual admin route-wiring audit** (automated scan was unreliable).

### Priority #1 detail — surface classification (compliance lens) — ✅ DONE 2026-06-21
Verified each hidden feature's resident endpoint before surfacing:

- ✅ **SURFACED (safe + ready):** **Chatbot + history + FAQ** — `/faq/*` is public, `/conversations/*` is auth-only (no permission gate), so residents can use them. Added `chatbot`/`chatbotHistory`/`faq` to `RESIDENT_MENU_KEYS` + i18n (5 locales). Rides the next EAS build.
- ⚠️ **NOT surfaced — permission-gated (would 403 for residents), needs a resident-accessible endpoint first:**
  - **Documents** (`/documents` requires `documents.view`)
  - **Videos** (`/videos` requires `videos.view`)
  - *(These looked harmless but aren't reachable by residents today — the quick check caught it.)*
- 🛑 **FLAGGED — GDPR Art 9 / decide separately with the compliance lens — ⏳ PENDING focused session (do NOT surface meanwhile):**
  - **WellMind / Wellbeing** — pulse (mood/stress/sleep), assessments → mental-health/special-category data. Same Art 9 gate as medical calendar events.
  - **CarePath** — care cases/providers/bookings → health-services data.
- ⚠️ **FLAGGED — relevance/scope review:** Projects/Tasks (staff-oriented), Invoices (resident-own vs company scope), Google Calendar (staff OAuth — leave hidden).

*(Updated as we work through the list.)*
