# Partner / CRM / Contract-lifecycle — INVENTORY + MODULE PLAN

**Written:** 2026-09-02 · **Status:** proposal, awaiting owner approval. **Nothing built.**
**Fills the forward-reference at `PROJECT_STATE.md:267`** ("the client+partner+contract
inventory"), which pointed at a document that did not exist until now.

Method: PROJECT_STATE.md + migration files (authoritative for main/prod) + live schema
introspection of `hr_erp_db` + code reading. Read-only throughout.

> ⚠️ **Dev-DB caveat.** `hr_erp_db` is behind main: the migration runner is still blocked at
> `093`, and migs 126 / 138–142 were never applied there, so `contractor_roles`,
> `client_night_rates`, `client_billing_profiles` and `accommodation_utility_lines` are
> absent from dev. Migration *files* were used as truth for anything in that range. Any new
> migration in this plan needs the same manual psql path to dev **and** prod.

---

# PART A — Inventory

## A.0 Summary

| # | Capability | Verdict |
|---|---|---|
| 1 | Lead/prospect records | **MISSING** |
| 2 | Opportunity pipeline (stages, value, win/loss + reason) | **MISSING** |
| 3 | Quotes/offers (stored, versioned, sent/accepted, files) | **MISSING** |
| 4 | Contract lifecycle on all partner types | **MISSING as a concept; PARTIAL by proxy** |
| 5 | Activity tracking per partner/contact | **MISSING** (employee-only equivalent exists) |
| 6 | Multiple contacts per partner | **MISSING** |
| 7 | What today's partner tables cover | **substantial — terms yes, relationship no** |
| 8 | Expiry-monitor reuse for contract dates | **PARTIAL — genuinely close** |

## A.1 Leads / prospects — MISSING

No `leads` / `prospects` table. `contractors` is the only company table, and `contractor_id`
is the multi-tenancy scoping key across ~50 tables — so prospects cannot simply be rows in it
without leaking into tenant pickers, permission scoping and billing-coverage reports.

## A.2 Opportunity pipeline — MISSING

No stage, expected value, expected headcount, probability, close date, or win/loss reason
field anywhere in the schema.

## A.3 Quotes / offers — MISSING

No quote table, no versioning, no sent/accepted status. Nearest analogues, none of which fit:

- `invoices` + line items — post-sale lifecycle, wrong semantics.
- `documents` — a file store, but scoped only to `tenant_id` / `employee_id` (see A.7).
- `accountant_share_links` — a **reusable pattern**: public-token sharing of a document with
  an outside party. The right precedent for "send the offer to the client".

## A.4 Contract lifecycle — MISSING as a concept

Every date in the system that *looks* like a contract date, and what it actually is:

| Where | Fields | What it really is |
|---|---|---|
| `employees` | `start_date`, `end_date`, `visa_expiry` | The **worker's** contract. Already watched by the expiry monitor. |
| `client_night_rates` | `valid_from`, `valid_to` | A **price-list window**. A rate change is not a renewal. |
| `accommodation_contractors` | `check_in`, `check_out` | Which **client occupies** a property (written by `accommodation.controller.js:285,470,480`). Not our lease with the landlord. |
| `accommodations` | `rent_basis`, `rent_amount`, `rent_per_bed_night`, `monthly_rent` | Price only. **No `lease_start`, no `lease_end`, no `notice_days`.** |

**Confirmed:** there is no notice period, renewal term, signed date, or contract-document link
for any partner type anywhere in the schema. The consolidation phase-out logic has nothing to
read, exactly as suspected.

Two orphans found while checking: `property_owner_access` (per-accommodation owner-portal
permission flags) has **zero code references** — dead. `owner_billing_info` is keyed on
`user_id`, not `contractor_id`, so it does not participate in the partner model.

## A.5 Activity tracking — MISSING for partners

- `employee_notes` exists (`note_type`, `title`, `content`, GDPR-aware) but is employee-scoped.
- `tasks` has `contractor_id` (tenancy) and `related_employee_id` — but **no partner link**, so
  a follow-up cannot be hung on a partner.
- `activity_logs` is an audit trail, not user-authored activity.

## A.6 Multiple contacts per partner — MISSING

Zero `contact_person` / `contact_name` / `primary_contact` columns in the entire schema.
`contractors` carries exactly one `email` and one `phone`.

## A.7 What already exists (so the module EXTENDS, not duplicates)

```
contractors             id, name, slug, email(x1), phone(x1), address, is_active,
                        type (legacy/unreliable), default_language
contractor_roles        megbizo (+) szallasado mutually exclusive, alvallalkozo independent
   (mig 140)            enforced in createContractor / setContractorRoles / UI auto-clear
client_billing_profiles invoicing_enabled, legal_type company|private,
   (mig 139)            vat_exemption_reason, notes            [PK = contractor_id]
client_night_rates      contractor x accommodation x [valid_from, valid_to],
   (126/138/141)        billing_basis per_person|flat|per_bed_night, rate_per_night,
                        flat_amount, rate_used, rate_empty, occupancy_floor_pct,
                        contracted_beds, vat_rate, vat_exempt
accommodations (142)    current_contractor_id -> szallasado; rent_basis + utilities matrix
employees               billing_client_id -> megbizo (revenue attribution)
documents               tenant_id + employee_id ONLY — cannot attach to a partner or a
                        property. This is the gap PROJECT_STATE.md:267 already tracks.
```

**Commercial terms are well modelled. The relationship layer around them is absent**: who we
talk to, what we agreed and until when, what we said before we agreed, and when notice is due.
The new module sits *above* these tables. A contract **points at** rates; it never copies them.

Partner master data worth folding in while we are here: tax number, company registration
number, bank account (currently only on `owner_billing_info`, wrong key).

## A.8 Expiry monitor — can it watch contract dates?

**Yes, cheaply.** The valuable machinery is already entity-agnostic:

- `expiry_threshold_rules` — `thresholds INTEGER[]`, `include_overdue`, most-specific-wins
  scoring (`expiryMonitor.service.js:68`). Already carries an **unsurfaced `contractor_id`
  dimension** — exactly what per-partner lead times need.
- `computeBucket` — pure, date-only.
- `expiry_alert_log` — dedup key `(entity_type, entity_id, field, expiry_date, threshold_days)`;
  `entity_id` is deliberately `TEXT` "so a single column must hold both" id types. A renewed
  date starts a fresh alert cycle for free.

Hardcoded parts, all small:

| Blocker | Location | Fix |
|---|---|---|
| `entity_type CHECK IN ('employee','employee_document')` | mig 120 | widen |
| `field CHECK IN ('visa','contract','document')` (2 tables) | mig 120 | add `lease`, `partner_contract`, `notice` |
| `gatherItems()` — 3-branch UNION, employee-shaped columns | service:122 | add branches + generic `subject_label` |
| `buildMessage()` builds "Lastname Firstname" | service:184 | use `subject_label` |
| `const link = '/employees/${item.employee_id}'` | service:226 | per-entity link |

**Design point:** a notice deadline is `end_date - notice_days` — *derived*, not an expiry.
Emit it as its own `field` value (`'notice'`) computed in `gatherItems`. Because `field` is part
of the dedup key, one contract then runs two independent alert cycles (notice deadline, then
expiry) with zero extra machinery.

**Estimate: 1 migration + ~100 lines of service + one dropdown option in `ExpiryMonitor.jsx`.**

---

# PART B — Permission & isolation gaps that go live with a limited user

Today **every staff account is superadmin**, which is the only reason the following are inert.
The moment one genuinely limited account exists — an external sales agent, or any re-scoped
internal role — they become live. Verified by code reading, not assumed.

## B.1 Reachable by ANY authenticated user (no permission needed at all)

These are the sharpest for an external agent, because the agent needs no role to reach them.
**These are broader than deep-audit #6–8 and were not on the original list.**

| Ref | Endpoint | What leaks | Sev |
|---|---|---|---|
| AUDIT #12 | `GET /analytics/overview` — `analytics.routes.js:13`, only `authenticateToken` | Whole-company BI: occupancy, expiry horizon, ticket age/SLA/throughput, workforce composition, accommodation utilisation. **Precisely the commercial intelligence an external agent must never hold.** | **HIGH** |
| AUDIT #11 | `GET /rooms/:id/inspection-history` — `rooms.routes.js:10`, only `authenticateToken`, `WHERE room_id=$1` | Any accommodation's inspection history by room UUID | **HIGH** |
| NEW | `gamification.routes.js` — 4 endpoints, no gate | Employee names + points across tenants (leaderboard) | MED |
| NEW | `POST /ai-assistant/chat` — `aiAssistant.routes.js`, no gate | `handleTicket` / `handleDamageReport` **create real rows** in the staff workflow. (`handleDataQuery` itself is correctly self-scoped — verified `aiAssistantHandlers.service.js:198`.) | MED (write) |
| INFO | `category` · `priority` · `status` · `translation` · `preferences` · `push` · `google-calendar` · `notification-center` — no `checkPermission` | Reference data or self-scoped. Acceptable — but must be **explicitly allow-listed**, not left to chance | INFO |

## B.2 Open deep-audit findings — read side (#6, #7, #8)

Live the moment a limited role holds the *action* permission. Standing FUNCTEST coverage
already reports these as KNOWN-GAP and will flip to FIXED automatically.

| # | Endpoint / location | What leaks | Sev | Test |
|---|---|---|---|---|
| #6 reads | `employee.controller.js:227,379` — no `contractor_id` filter anywhere in the controller | An `employees.view` holder reads **all tenants'** employee PII: tax id, passport, SSN, bank account | **HIGH** | PERM-14 |
| #7 | `invoice.controller` ~89,136 · `expense.service` ~40,119 **+ file download ~336** · `salary.controller` ~319,675 · `operatingCosts`/`profit` (`accommodation_id` optional -> omit = all) · `report.routes.js:45,51,57` | Every finance read unscoped. The expense download streams **any tenant's attachment by id**. Occupancy reports leak resident names cross-tenant | **HIGH** | PERM-15 |
| #8 | `task.controller.js:135,316,407…` · `timesheet.controller.js:99,219` | Tasks keyed by id, no tenant check — `PUT` can even reassign `contractor_id` via body. Sharpest: `GET /timesheets/task/:taskId` gives a `timesheets.view_own` holder **everyone's hours + email** for any task in any tenant | **HIGH** | PERM-16 |

## B.3 Role-checked but not tenant-scoped

| Endpoint | Finding | Sev |
|---|---|---|
| `GET /admin/documents/expiring` — `_isAdmin(req)` role check, **no contractor filter** | Any `admin`-role user sees every tenant's expiring employee documents incl. `document_number`. Not reachable by a sales agent (they hold no admin role), but live for any limited internal admin | MED |
| `GET /admin/tasks/all`, `GET /admin/ai-assistant/logs` | In-controller `superadmin` check — **verified safe** | — |

## B.4 Frontend

| Finding | Detail | Sev |
|---|---|---|
| **18 of 92 routes in `App.jsx` have no `PermissionGuard`** — 12 are CarePath/WellMind pages, plus `BrunoTest` | The page shell renders for any logged-in user. The **backends are properly gated** (`blue_colibri.*`, `eap.*`, `wellbeing.self` — verified), so no data leaks. But "must not appear in, or be able to reach, any staff surface" is violated visually | MED |
| Catch-all `<Route path="*" -> Navigate to="/dashboard">` | An external agent holding no `dashboard.view` lands on a permission-denied page. Makes the role unusable until a role-aware landing route exists | LOW (blocking for UX) |

---

# PART C — The prerequisite gate

**No external-agent account may be enabled until Gate A is green.** Endorsed as stated, with
the list extended by the B.1 findings.

### Gate A — BLOCKING for external agents (reachable with only a login)

1. **AUDIT #12** — gate `GET /analytics/overview`.
2. **AUDIT #11** — gate + scope `GET /rooms/:id/inspection-history`.
3. **Gamification endpoints** — add a permission gate.
4. **`POST /ai-assistant/chat`** — gate, or deny via the module allow-list (C.2 below).
5. **Frontend** — `PermissionGuard` on the 18 unguarded routes + a role-aware landing route.

### Gate B — BLOCKING for any limited *internal* role, and required as defence in depth

6. **#6 (reads)** — contractor-scope `employee.controller.js:227,379`.
7. **#7** — contractor-scope all finance reads, incl. the expense-attachment download.
8. **#8** — tenant-scope tasks + timesheets; refuse `contractor_id` reassignment via body.

**On the #6–8 nuance, stated plainly.** If the external role holds a clean `sales.*` permission
namespace and nothing else, #6–8 are *not* directly reachable by that role — they fire for a
limited *internal* user (a sales manager who also holds `employees.view`; the existing
`data_controller` role, which the audit already proved could mutate another tenant's employee).

**Keep them in the gate anyway.** With the allow-list choke point (C.2) as the only thing
standing between an external agent and those endpoints, a single mount-order mistake re-exposes
all three at HIGH severity. The whole class of bug this repo keeps hitting is "the filter was
simply omitted". Do not make an external-facing role the first consumer of an unproven boundary.

---

# PART D — The module

**Name:** Partnerek & Üzletfejlesztés. **One module, one relationship spine.** Contacts,
activities, documents and contracts hang off a *party* — a lead we are pitching, a contracted
partner, or a property. Sales is simply the part of the spine before a contract exists.

## D.1 Schema (next free migration number is **144**)

```sql
-- Party reference used by every child table.
-- NOT polymorphic: three real nullable FKs + CHECK exactly-one.
-- (This repo has an orphan-scan history — keep integrity DB-enforced.)
   lead_id          uuid REFERENCES partner_leads(id)   ON DELETE CASCADE,
   contractor_id    uuid REFERENCES contractors(id)     ON DELETE CASCADE,
   accommodation_id uuid REFERENCES accommodations(id)  ON DELETE CASCADE,
   CHECK (num_nonnulls(lead_id, contractor_id, accommodation_id) = 1)

-- mig 144 — Phase 1
partner_contacts    <party>, name, role_title, phone, email, language,
                    is_primary, is_active, notes
                    -- partial unique index: one primary per party

partner_contracts   <party>, contract_role megbizo|szallasado|alvallalkozo,
                    accommodation_id (set => it is a LEASE), contract_no, title,
                    status draft|active|expired|terminated,
                    start_date, end_date, is_open_ended,
                    notice_days, notice_deadline GENERATED (end_date - notice_days),
                    renewal_type none|auto|option, renewal_term_months,
                    parent_contract_id,          -- amendment / renewal chain
                    signed_at, document_id, currency, indexation_note, notes

documents           + lead_id, + contractor_id, + accommodation_id (nullable)
                    -- closes the gap PROJECT_STATE.md:267 tracks

-- mig 145 — Phase 2
partner_activities  <party>, contact_id, kind note|call|meeting|email|offer_sent,
                    occurred_at, subject, body, created_by,
                    follow_up_at, follow_up_task_id -> tasks(id)
tasks               + related_contractor_id      -- mirrors related_employee_id

-- mig 146 — Phase 3 (sales). owner_user_id present from day one.
partner_leads       name, source, industry, country, status, expected_headcount,
                    owner_user_id NOT NULL, converted_contractor_id, lost_reason
opportunities       <party>, title, stage new|qualified|proposal|negotiation|won|lost,
                    expected_headcount, expected_monthly_value, currency, probability,
                    expected_close_date, won_at, lost_at, lost_reason_code,
                    lost_reason_text, owner_user_id NOT NULL
quotes              opportunity_id, version, status draft|sent|accepted|rejected|expired,
                    valid_until, net/vat/gross, document_id, share_token,
                    sent_at, sent_to_contact_id, accepted_at, owner_user_id NOT NULL
quote_lines         description, basis per_person|per_bed_night|flat, qty, unit_price
                    -- deliberately mirrors client_night_rates
sales_record_shares record_type, record_id, user_id, granted_by, created_at
                    -- "what a manager explicitly shares"
```

### Three decisions embedded above

1. **An accommodation lease is a `partner_contracts` row** (`contract_role='szallasado'` +
   `accommodation_id`), *not* new columns on `accommodations`. One szállásadó may rent us
   several properties on different terms — the same reasoning as the 2026-08-08
   per-accommodation cost decision. One table, one expiry feed, three partner types.
2. **Leads live in their own table**, not as a flag on `contractors`, because `contractor_id`
   is the tenancy key across ~50 tables. Cost on win: one UPDATE per child table to re-parent.
3. **Follow-ups reuse `tasks`** (assignment, due dates, notification centre already exist)
   rather than a new reminder cron.

**Quote -> contract materialisation** is the anti-duplication seam: `quote_lines` uses the same
basis vocabulary as `client_night_rates`, so accepting a quote writes one `partner_contracts`
row + one `client_night_rates` row. The pipeline **feeds** the billing engine instead of
shadowing it.

## D.2 External sales agent — designed in now, not retrofitted

### D.2.1 Role and permission namespace

New role `kulso_ertekesito` ("Külső értékesítő"). New permission namespace, **no reuse of any
existing permission**:

```
sales.leads.view / sales.leads.edit
sales.opportunities.view / sales.opportunities.edit
sales.quotes.view / sales.quotes.edit
sales.contacts.view / sales.contacts.edit
sales.all.view      -- manager: sees every agent's rows
sales.assign        -- manager: reassigns owner_user_id
```

The external role holds **only** the first four pairs. Never `dashboard.view` — that is what
keeps it off every staff surface, and it is why the catch-all landing route must be fixed
(B.4). A clean namespace is also what keeps deep-audit #6–8 out of the agent's reach.

### D.2.2 Module-level isolation — one fail-closed choke point

A deny-list across **77 route files** is unmaintainable and will rot. Use an **allow-list at a
single choke point**:

- Implement `enforceModuleScope(req, res, next)` **inside `authenticateToken`**
  (`middleware/auth.js`), after user + roles + permissions load. Precedent: `authenticatedLimiter`
  is already mounted there (`auth.js:5`).
- If the user's roles are a subset of `EXTERNAL_ONLY_ROLES`, require `req.path` to match the
  sales prefix allow-list, plus an explicitly enumerated set of self-service endpoints
  (`/auth/me`, `/preferences`, `/notification-center` self, `/translation`). **Everything else
  403.**
- **Fail-closed:** route file #78 is denied by default. Adding a route cannot silently widen an
  external agent's reach.

> ⚠️ **Do NOT implement this as a `router.use()` on the bare API prefix.** Per the warning in
> `residentSelf.routes.js:32-45`, a path-less `router.use` at `${API_PREFIX}` previously ran for
> every `/api/v1/*` request and 401-gated the public chatbot endpoints. Inside
> `authenticateToken` it only runs for already-authenticated requests.

### D.2.3 Row-level isolation — server-side, structurally hard to omit

- `owner_user_id uuid NOT NULL REFERENCES users(id)` on `partner_leads`, `opportunities`,
  `quotes`. Contacts and activities inherit scope from their parent party.
- One helper `salesScope(req, alias)` returns the predicate:
  `(alias.owner_user_id = $n OR EXISTS (SELECT 1 FROM sales_record_shares …) OR <has sales.all.view>)`.
- **Every** sales read and write composes it — reads in the `WHERE`, writes in the
  `UPDATE/DELETE … WHERE`, and (per the #6-write lesson) foreign-owner writes refused *before*
  the UPDATE is built.
- Because the recurring failure mode in this repo is "the filter was simply omitted", put all
  sales data access behind a small `salesRepo.js` that takes `req` and **refuses to build a
  query without a scope clause**. One file for a reviewer to check, instead of every controller.
- Never a UI filter. The UI may hide; only the query layer decides.

### D.2.4 Field-level staging — an explicit projection, not hiding

A server-side column allow-list per resource (`SALES_EXTERNAL_FIELDS`). Never `SELECT *`.

**Owner decision, 2026-09-02: an external agent sees NO financial data of any kind.**
No prices, no quote amounts, no contract values, no margins, no rent or cost figures —
nothing monetary, not even on their own quote. Commission is not being introduced now.

**MAY see**
- Their own lead: company, contacts, status, dates, notes.
- Their own opportunity: company, contacts, stage, status, dates, notes, and
  **whether the deal was won or lost**.
- Contacts and activities on their own party.
- That a quote exists and its non-monetary status (draft / sent / accepted / rejected /
  expired) — **never its amounts, lines, or unit prices**.

**MUST NEVER see (hard deny, enforced by the projection)**
- **Any monetary field anywhere**, including their own: `quotes.net/vat/gross`,
  `quote_lines.unit_price`, `opportunities.expected_monthly_value`,
  `partner_contracts.currency`/values.
- `accommodations.rent_basis / rent_amount / rent_per_bed_night / monthly_rent`,
  `accommodation_utility_lines` — our property cost.
- `accommodation_billings.cost_amount / margin_amount`, the profit dashboard, operating costs.
- `client_night_rates` — any client's, including one they sourced.
- `client_billing_profiles` (VAT, legal type, invoicing flags).
- Any `employees` / resident row, `occupancy_snapshots`, room or bed data.
- Any inspection, ticket, compensation, fine or wellbeing row.

**Designed so widening is a config change, not a rewrite.** The projection is one map from
resource -> allowed column list, applied in a single place in `salesRepo.js`. Introducing
commission later means adding field names to that map (and the matching functest expectation),
not touching controllers, queries or the UI data flow. `expected_monthly_value` is still
*stored* — it is simply not in the external projection — so no backfill is needed if it is
later exposed to agents.

Converted clients are exposed through a narrow view (`v_sales_client_public`) carrying identity
and status only, never the `contractors` row itself. A functest diffs response-body keys against
the allow-list, so a future `SELECT *`, a new column, or an accidental join that drags a price
in is **caught by the suite**, not by review.

## D.3 Admin UI

- **`Contractors.jsx` -> Partner detail page with tabs:** Áttekintés · **Kapcsolattartók** ·
  **Szerződések** · **Dokumentumok** · **Aktivitás** · Pénzügy. The Pénzügy tab absorbs what
  today lives on the disconnected `/billing-rates` page — a partner's whole commercial picture
  in one place is worth doing on its own.
- **Accommodation detail -> "Bérleti szerződés" panel**, beside the existing "Költség & rezsi"
  tab from mig 142.
- **New "Szerződések" board** — cross-partner-type, sorted by *soonest actionable date* (notice
  deadline before expiry), fed by the generalised expiry monitor. This is the page that answers
  "which sites can we still exit this quarter".
- **"Üzletfejlesztés"** (Phase 3) — lead list, stage kanban, quote builder; offer sending reuses
  the `accountant_share_links` public-token pattern.
- **External agents get a separate shell**: role-conditional nav rendering only the sales tree,
  `PermissionGuard` on every sales route, and a role-aware landing route replacing the
  `-> /dashboard` catch-all.

## D.4 FUNCTEST scenarios

The harness is DB-driven — it "takes the permission its ROUTE declares, asks the DATABASE
whether that role holds it, and checks the HTTP response agrees" — so most of this is cheap.

| ID | Assertion |
|---|---|
| SALES-01 | Add `kulso_ertekesito` to the existing `ROLES` array in `scenarios/permissions.js`. All 16 `GATED` endpoints then assert 403 **automatically**, no per-endpoint code. |
| SALES-02 | Enumerate every mounted router prefix **from the `server.js` mount table** and assert 403 for the external agent on each non-sales prefix. Driven off the mount table, not a hand-list, so route file #78 fails the suite until an allow-list decision is made. |
| SALES-03 | Agent A's list endpoints return **zero** of agent B's rows. |
| SALES-04 | A `GET`s B's record by id -> **404**, not 403 (never confirm existence). |
| SALES-05 | A `PUT`/`DELETE` on B's record -> 404 **and the row is unchanged** (assert values, per harness convention). |
| SALES-06 | A manager holding `sales.all.view` sees both agents' rows. |
| SALES-07 | B shares one opportunity with A -> A sees exactly that one, none of B's others. |
| SALES-08 | Response-body keys for a converted client are a subset of `SALES_EXTERNAL_FIELDS`; margin / rent / rate / resident keys asserted **absent**. |
| SALES-09 | The Gate-A set (#11, #12, gamification, ai-assistant) -> 403 for the external agent. Shows as KNOWN-GAP until fixed, flips to FIXED automatically. |

---

# PART E — Phasing

| Phase | Content | Why here |
|---|---|---|
| **0 — SECURITY GATE** (blocking, no features) | Gate A (#11, #12, gamification, ai-assistant, frontend guards + landing route) **and** Gate B (#6 reads, #7, #8). PERM-14/15/16 flip to FIXED. | Nothing external ships until the boundary is real. |
| **1 — Contracts + Contacts** | mig 144: `partner_contacts`, `partner_contracts`, documents party link, partner detail tabs, accommodation lease panel, **and the expiry-monitor generalisation** (A.8). Internal users only. | The only part that feeds decisions already on the desk: which site to phase out, when notice is due, whether to switch a client to per-bed billing **at renewal** rather than mid-term. Also closes the `documents` gap PROJECT_STATE already tracks. Without the expiry work the dates are inert, and it is only half a day. |
| **2 — Activities + follow-ups** | mig 145. Reuses `tasks`. | Cheap; a pipeline without call/meeting history is a spreadsheet. Not worth shipping alone. |
| **3 — Leads / Opportunities / Quotes** | mig 146, **with `owner_user_id`, `salesRepo.js` scoping and the field projection built in from day one**. Internal users only. | This is the "plan now, don't retrofit" requirement. Building the scope helper while the only users are superadmins means enabling external accounts later is a config step, not a refactor. |
| **4 — External agent enablement** | mig 147: role + `sales.*` permissions; `enforceModuleScope` choke point; external shell; SALES-01..09. | **Gated on Phase 0 being green.** |

## E.1 Open questions for the owner

1. ~~Where the module sits in the sidebar~~ — **DECIDED 2026-09-02: a NEW "Partnerek"
   section**, not nested under Adminisztráció.
2. ~~Migration-runner disposition (`093`)~~ — **DECIDED + DONE 2026-09-02 in Phase 0:** 093 is
   recorded as OBSOLETE and never executed (replaying it would delete every NULL-contractor
   employee); dev is now migrated end-to-end through 143 by the runner. See Phase 0 notes.
3. ~~Commission~~ — **DECIDED 2026-09-02: none for now, and external agents see NO financial
   data at all.** See D.2.4; widening later is an allow-list change by design.
