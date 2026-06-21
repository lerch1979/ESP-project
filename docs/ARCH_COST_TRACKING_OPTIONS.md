# Cost Tracking Unification — Architectural Options

**Status:** ✅ RESOLVED 2026-06-21 — see "## DECISION (2026-06-21)" at the bottom.
**Short version:** the old "duplicate" framing below is **superseded**. The email-OCR
pipeline was NOT abandoned — it was **migrated to feed `accommodation_expenses`**
(the `invoice_drafts → accommodation_expenses` `convert()` bridge, mig 115, built
2026-06-10) and then **paused** (poller env-gated off + stale Gmail token). It is an
**ENABLE candidate**, not a deprecate one. `cost_centers` stays (active accounting
taxonomy). Read the bottom section first; the A/B/C options below are historical.

**Author:** synthesis from 2026-05-21 audit (options A/B/C now historical)
**Companion:** `PROJECT_STATE.md` → "Known overlaps" + `docs/FEATURE_AUDIT.md`

---

## TL;DR

The repo has **two cost-tracking systems** that answer the same business question
("what does each accommodation cost?") via different mechanisms, with **no schema
link between them**. The old one (cost_centers + AI-classified invoices) has been
dormant since 2026-04-21 with 0 finalized invoices. The new one
(accommodation_expenses) is what the profit dashboard reads.

We need to pick a direction before either system grows further or before the old
pipeline's Gmail poller produces more orphan drafts.

---

## What exists today

### OLD: cost_centers + invoice classification pipeline

| Component | Detail |
|---|---|
| `cost_centers` | 32 rows, hierarchical (level 1–4). 22 strategic/HR/operational entries + 10 level-4 "X szálló" entries that mirror some accommodations by name |
| `invoice_classification_rules` | 20 rules (partner+settlement match) — 9 with ≥1 match, max 3 hits per rule |
| `invoice_drafts` | 5 pending since 2026-04-21, never reviewed |
| `invoices` | **0 active rows** — no draft ever finalized |
| `email_inbox` | 9 rows, all "processed" (= drafts emitted) |
| Code | ~1,227 lines across `invoiceDraft.controller`, `classificationRules.controller`, `costCenterPredictor.service`, `invoiceClassification.service` + Gmail polling + admin UI for CCs and email inbox |
| Last commit touching it | 2026-04-21 (`264eba43`) |
| FK to accommodations | **None** — only name-string overlap on 10 of 16 accommodations |

### NEW: accommodation_expenses + occupancy billing

| Component | Detail |
|---|---|
| `accommodation_expenses` | flat per-expense rows, FK to `accommodations`, soft-delete, 4-category CHECK constraint (`rezsi/karbantartas/takaritas/egyeb`) |
| Categories | hardcoded in CHECK constraint, NOT a separate table |
| `accommodation_billings` | computed monthly income side from occupancy snapshots |
| Profit dashboard | reads `accommodation_billings` (income) + `accommodation_expenses` (expense), groups by accommodation, breaks expenses out by category |
| Code | ~1,000 lines: model/service/controller/routes/UI/tests |
| Last commit | 2026-05-21 (today) |

### Why they overlap

- Both want to answer: per-accommodation, per-month: how much did it cost us?
- New = manual UI per accommodation, 4 fixed buckets, immediate availability.
- Old = email → OCR → AI suggests cost_center → user reviews → invoice booked under cost_center. Designed to be more granular and automated; never reached production use.

### Why they don't actually overlap on data today

- `invoices` table empty → old system has no expense data
- `accommodation_expenses` has 3 rows (from today's UI test)
- **Today there is no double-counting risk.** The risk is forward-looking: if the AI pipeline is unblocked, it would write to `invoices` while the UI continues writing to `accommodation_expenses`. The profit dashboard would only see one side.

---

## Option A — Unified Schema (add nullable FK)

**What:** Add `cost_center_id UUID REFERENCES cost_centers(id) NULL` column to `accommodation_expenses`. Keep `cost_centers` as a taxonomy. Expenses entered manually have `cost_center_id = NULL`. Expenses originating from the AI pipeline (if revived) auto-populate it.

**Effort:** ~½ day
- Migration 113: add nullable column + index
- Backend service: optional pass-through on create/update
- Admin UI: optional `cost_center_id` autocomplete in expense form
- AI pipeline (if revived later): writes both `accommodation_id` AND `cost_center_id`

**Risk:** Low–medium
- Two coexisting categorisation axes (`category` enum + `cost_center_id` tree) can confuse reports. Need a clear rule for which one drives totals.
- Reports already built (profit dashboard) only use `category` — CC stays informational unless someone uses it.

**Value gained:**
- Preserves the cost_center hierarchy as an optional taxonomy.
- AI pipeline can be revived later without schema rework.
- No data migration needed.

**What's preserved from old:** `cost_centers` table, all 32 entries, the hierarchy idea, the classification_rules (as suggestions, not enforced).
**What's preserved from new:** All current schema and code. `category` enum stays primary axis.

**Caveat:** This is the path of least disruption *now*, but it doesn't actually solve duplication — it just makes coexistence safer. The decision of which axis is "the truth" is deferred.

---

## Option B — Two-Layer System (explicit roles)

**What:** Define each system's role and enforce it in code and docs.
- `accommodation_expenses` = **data layer** — the canonical "what" (one row per expense, FK to accommodation, money + category + month).
- `cost_centers` = **taxonomy layer** — optional categorisation labels, can be linked from expenses via the nullable FK from Option A, or used purely for budget rollup.
- AI pipeline (if rebuilt) = **input layer** — writes into `accommodation_expenses`, auto-populates `cost_center_id` based on classification rules.

**Effort:** Same migration as Option A (~½ day), **plus** rewiring the AI pipeline to write to `accommodation_expenses` instead of to `invoices` (~3–5 days when actually revived).

**Risk:** Medium
- Locks in cost_centers as a permanent dependency. If you decide later you don't need the hierarchy, you've kept extra code/UI alive.
- Requires actively rewiring the pipeline at some point or it becomes the same as Option C.

**Value gained:**
- Clear mental model. Documented separation.
- Old hierarchy preserved as long-term taxonomy (useful for non-accommodation cost categorisation: HR/Strategic branches have 22 entries that don't map to accommodations at all — payroll buckets, IT, training).
- Future-proof for re-introducing OCR.

**What's preserved from old:** Hierarchy + classification rules as permanent assets.
**What's preserved from new:** Current data flow + UI as primary.

---

## Option C — Migration Forward (deprecate old)

**What:** Treat the old pipeline as a failed experiment. Stop the Gmail poller. Archive `invoice_drafts`. Leave `cost_centers` and rules in place as historical record but don't extend them. Single source of truth: `accommodation_expenses`. When/if OCR is revived (Phase 3), it writes directly to `accommodation_expenses`.

**Effort:** ~2 hours
- Verify and stop `gmailMCP.service.js` cron registration (1 hour)
- Add deprecation banners to old controllers/services pointing at the new system (30 min)
- Decide on 5 stale drafts: enter them manually as expenses, or archive (~30 min user time)
- Update `PROJECT_STATE.md` to move old pipeline from "Dormant" to "Deprecated"

**Risk:** Low
- 22 non-accommodation cost_centers (HR/Strategic/Operations bucketing) become orphans. Probably fine — nothing references them today.
- If AI OCR is later revived as Phase 3, schema has to change anyway. We'd evaluate then.
- The hierarchy is genuinely lost as a feature — anyone wanting budget rollup later starts from scratch.

**Value gained:**
- Single source of truth. Profit dashboard cannot drift from reality.
- Smallest cognitive load for new contributors.
- Frees the user from the "what do I do with these 5 drafts?" question.

**What's preserved from old:** Tables stay in DB as cold storage, code stays in repo with deprecation notes. Nothing deleted.
**What's preserved from new:** Everything as-is. No schema change.

---

## Comparison Table

| Dimension | A: Unified Schema | B: Two-Layer | C: Deprecate Old |
|---|---|---|---|
| Effort now | ½ day | ½ day | 2 hours |
| Effort later (revive OCR) | Low (FK already there) | Medium (rewire pipeline writes) | Medium-high (Phase 3 redesign) |
| Risk | Low–medium | Medium | Low |
| Resolves duplication? | No, defers it | Yes, by role | Yes, by removal |
| Cost_center hierarchy preserved as feature? | Yes (optional) | Yes (permanent) | No (cold storage only) |
| AI pipeline future | Easy revive | Easy revive after rewire | Has to be Phase-3 rebuild |
| Profit dashboard correctness | Same as today | Same as today | Same as today |
| Cognitive load | Medium (two axes) | Medium (clear roles) | Low (one system) |

---

## Recommendation

**Option C** is the lowest-risk path **for now** because:

1. The AI pipeline has produced 0 finalized invoices in ~2 months of existence. The evidence is that the workflow wasn't adopted. Spending effort to keep it "future ready" pays for capacity that isn't being used.
2. Single source of truth has direct value for the profit dashboard you just built.
3. Nothing is deleted. If OCR/AI work is revived in 6 months, you've lost no information — just chosen not to maintain it.

**If you do think AI OCR will come back within ~3 months**, Option A is cheap insurance — the nullable FK adds almost no complexity and lets the pipeline land later without a migration. But don't pick A as a way to avoid the decision; it just defers it.

**Option B is the answer if you also want the hierarchy for non-accommodation budgeting** (HR/Strategic/Operations buckets). The 22 non-accommodation cost_centers actually have potential value there. If you'd ever want a "spending across cost categories" report independent of accommodations, B is the right shape. If not, that's overhead.

---

## Decision matrix questions for the user

1. **Is OCR/AI-classified email invoice ingest a likely Phase 3 effort within ~3 months?** (yes → A or B; no → C)
2. **Do you want a separate budget rollup view across cost categories (HR / Strategic / Operations / Accommodations)?** (yes → B; no → C)
3. **What's the disposition of the 5 stale `invoice_drafts` rows from 2026-04-21?** (real expenses to enter manually / archive / ignore)
4. **Should we verify and disable the Gmail poller now?** (recommended yes regardless of option chosen)

Once we have answers to these, I can execute the chosen path. **No code changes made yet** — this doc is the proposal.

---

# DECISION (2026-06-21) — ENABLE the email-OCR cost pipeline (don't deprecate)

**Context corrected.** A deep code read (FEATURE_AUDIT) showed the email-invoice
pipeline is **not abandoned** — it was **migrated to feed `accommodation_expenses`**
(`invoice_drafts → accommodation_expenses` via `convert()`, mig 115, built
2026-06-10) and then **paused** (poller env-gated off + a stale Gmail token). It is
the **automated cost-side feed** for the billing/margin model (revenue = nights ×
rate is already automated; this automates cost). **Verdict: enable via a careful
pilot.**

## What's kept / what changes
- **KEEP `cost_centers`** — active accounting taxonomy (accountant export + projects). Not a duplicate of `accommodation_expenses`.
- **`accommodation_expenses`** stays the single source of truth for per-accommodation cost (billing/margin reads it).
- **Retired the legacy `approve()` → `invoices` path** (2026-06-21) — returns HTTP 410; reviewers use **Convert → accommodation_expenses** only. (Admin Billing.jsx Tab 2 already used Convert.)
- **The 5 historical drafts are already `converted`** (5/5 linked to `accommodation_expenses`) — real forwarded supplier invoices (gas/utilities/lighting). Proof the pipeline works end-to-end. Nothing to dispose.

## How the pipeline works (summary)
email (poller, `is:unread`) → Claude OCR (`claudeOCR.extractInvoiceData`) → rule
classifier (cost-center + confidence) → `invoice_drafts` (pending/needs_review) →
**human reviews + picks the accommodation** → **Convert** (`convert()` →
`expenseService.create()` → `INSERT INTO accommodation_expenses`, source='email_ocr',
PDF attached). Human-in-the-loop; only known vendors auto-classify, the rest land in review.

## Enable pilot plan (driven by the user — inbox + token are their call)
1. **Inbox:** dedicated `housingsolutionsszamlazas@gmail.com` (the `get-gmail-token.js` script already targets it; "szamlazas" = invoicing). Invoices are forwarded there.
2. **Re-auth the Gmail token** (`scripts/get-gmail-token.js`) — fixes the `invalid_grant` blocker; paste the new `GMAIL_REFRESH_TOKEN` into prod `.env`.
3. **Flip `GMAIL_POLLING_ENABLED=true`** in prod `.env`, restart backend → 5-min poll cron runs.
4. **Pilot:** forward ONE real supplier invoice → watch it OCR into a draft → review + pick accommodation → Convert → confirm it lands in `accommodation_expenses` AND shows in a billing/margin draft run.
5. **Tune** classification rules for top vendors over time; everything else stays human-reviewed.

**Not flipped yet** — awaiting the user's inbox confirmation + token re-auth (their decisions).

*(Historical options A/B/C above are superseded by this decision.)*
