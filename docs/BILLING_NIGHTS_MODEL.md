# Per-night / per-person billing — how it works & the pricing decision

**Status:** the engine already EXISTS, is scheduled, and is verified working on real
data (draft run, 2026-06-20). The open items are **config** and **one business
decision** (pricing model), NOT building.

---

## TL;DR
Housing Solutions' core revenue model (nights × people) is implemented end-to-end:
`employee_accommodation_history` → daily `occupancy_snapshots` → monthly
`accommodation_billings`, with an admin UI (`Billing.jsx`) and a full JSONB audit
trail. A draft run on real prod occupancy produced correct, traceable numbers.
Before configuring it for real billing, **the pricing model must be chosen** (§4).

---

## 1. How a "night" is counted (verified)
Source of truth = **`employee_accommodation_history`** (`check_in_date`,
`check_out_date` per employee/accommodation/room).

A resident is counted as present on a given `date` when:
```
check_in_date <= date  AND  (check_out_date IS NULL OR check_out_date > date)
```
- `check_out_date` = "the first day they are no longer here".
- Half-day stay → counts as a full day; same-day in-AND-out → does NOT count.

**`occupancyTracking.service.recordDailySnapshot()`** (daily cron 00:30) writes one
`occupancy_snapshots` row per present resident per day. Idempotent upsert (safe to
re-run; recomputes from current config).

**Nights × people** is then `accommodation_billings.total_employee_days`.

## 2. The pipeline that exists
| Stage | Component | Trigger |
|---|---|---|
| Stay periods | `employee_accommodation_history` | populated from move-in/out |
| Daily nights | `occupancyTracking.service` → `occupancy_snapshots` | **cron 00:30 daily** |
| Monthly billing | `billingEngine.service` → `billing_runs` + `accommodation_billings` | **cron 03:00 on the 1st** (+ manual) |
| Review / invoice | `Billing.jsx` (runs / billings / profit / drafts tabs) → `invoice_drafts` | manual (human) |
| Profit | `profit.service` (revenue − `accommodation_expenses`/`cost_centers`) | — |

- **Status workflow:** `draft → calculated → finalized → cancelled`. Finalized runs
  are protected from re-compute. **The human finalizes + creates invoices** → this is
  the L1 ceiling (engine proposes, human approves the money/client-facing step).
- **Számlázz.hu / Billingo: NOT wired** — invoice *sending* is manual/export today.
- **Audit:** every `accommodation_billings` row carries `calculation_details` JSONB
  (rooms → per-day occupants/share → per-employee days/subtotal), so any total is
  reverse-engineerable to named residents.

## 3. Config gaps (prod-verified 2026-06-20)
| Item | State | Impact |
|---|---|---|
| Stay history | **284 rows** ✓ | occupancy known |
| Daily snapshots | **1,704 rows** ✓ (cron running) | nights flowing |
| `monthly_rent` set | **6 / 16** accommodations | rest produce NULL share → skipped |
| **Rent on the RIGHT accommodations** | ❌ the 6 with rent (Budapest/Debrecen/…) have **0 occupants**; the real occupied ones (Fertőd/Röjtökmuzsaj/…) have **no rent** | **disjoint sets** — biggest gap |
| Partner/client assignment (`current_contractor_id` = who to bill) | **1 / 16** | 15 can't be invoiced even with rent |
| Billing run executed | **0** (until the demo below) | never produced a bill |

## 4. ⚠️ THE PRICING DECISION (the key business choice)
Today the engine derives price from **`accommodations.monthly_rent`**, allocated
pro-rata:
```
per_occupant_daily_share = monthly_rent / days_in_month / room_occupant_count
```
i.e. it bills the **cost-allocation** of the accommodation's rent. Three options:

| Model | What it means | Change needed |
|---|---|---|
| **A — Cost pass-through** (what exists) | Bill the client the pro-rata share of what the accommodation costs HS. No margin. | None (just config). |
| **B — Cost + margin** | Pass-through × (1 + margin %), or + fixed uplift. Margin per client or global. | Small: a margin field (per client/accommodation) + apply over `total_amount`. |
| **C — Fixed per-night client rate** | A negotiated price/night/person per client (decoupled from actual rent). Bill = `total_employee_days × client_rate`. | A rate model (per client, maybe per accommodation/room type) + the engine multiplies days × rate instead of summing shares. |

**This is the decision to make before configuring real billing.** B and C are the
real revenue models if HS charges above cost; A only recovers cost. The current
engine = A; B is a thin post-pass over the JSONB; C is a different (still small)
rate-driven calc.

Adjacent (separate) open decision: `docs/ARCH_COST_TRACKING_OPTIONS.md`
(cost_centers vs accommodation_expenses) — affects the *profit* side, not nights.

## 5. Proof — draft run on real data (2026-06-20)
To demonstrate on real occupancy, a **demo rent of 4,770,000 HUF/mo** was set on
**Röjtökmuzsaj** (53 real residents, 4 snapshot days Jun 16–19), snapshots
recomputed, and a **draft** run executed (NOT finalized; rent reverted afterwards):

```
accommodation_billings: Röjtökmuzsaj | 2026-06 | total_employee_days=212 | total_amount=636,000 HUF | status=draft
  → 4,770,000 / 30 days / 53 occupants = 3,000 HUF per occupant-night
  → 53 occupants × 4 nights = 212 employee-days × 3,000 = 636,000 HUF
  → calculation_details: each of 53 residents = 4 days × 3,000 = 12,000 (traceable by name)
```
The night-counting and pro-rata math are **correct and fully auditable**.
(Draft run `10359d18-…` left for viewing in Billing.jsx; demo rent reverted to NULL.)

## 6. Proposed path (config + decide, not build)
1. **Decide the pricing model** (§4: A / B / C) — the gating business call.
2. **Config:** set rent (or client rate) + assign each occupied accommodation's
   **partner/client** (`current_contractor_id`).
3. **Run a real month** as a draft → review in `Billing.jsx` → validate vs reality → finalize.
4. **Automation later:** wire Számlázz.hu/Billingo for invoice *sending* (still
   human-triggered) + VAT/discount templates (engine already anticipates a
   template post-pass over the JSONB).

---

## DECISION (CONFIRMED 2026-06-20) — Option C + billing_client + true margin

**Pricing = Option C: fixed negotiated per-night rate per CLIENT.**
`revenue = worker-nights × client_rate`. Margin over actual cost = profit.

**The billable client is per-WORKER, decoupled from workplace:**
- `employees.workplace` (existing, 283/286 populated) = **where they work** (Autoliv) — informational only; feeds Insights, NOT billing.
- **`employees.billing_client_id`** (NEW, uuid → contractors, nullable) = **who pays for housing** (Man at Work OR Autoliv). **Drives billing.** Set per worker.
- `employees.contractor_id` left untouched (tenancy/access meaning, wired across 9+ files — do NOT overload).
- Two workers at the same workplace can bill to different clients via `billing_client_id`.

**Rate model — `client_night_rates`:** per `contractor_id` (+ optional `accommodation_id` override; NULL = client default), `rate_per_night`, effective-dated (`valid_from`/`valid_to`). Resolution: accommodation-specific over client-default, within the date window.

**Engine (option C):** for each occupancy_snapshot row → employee → `billing_client_id` → resolved rate. Group by **(billing_client_id, accommodation, month)**:
- `revenue` = Σ resolved rate (= employee-days × rate when constant)
- `cost` = **rent allocation (`per_occupant_daily_share`) + operating `accommodation_expenses`** (the latter allocated pro-rata by the group's employee-days share of the accommodation) — **TRUE margin, not rent-only**
- `margin = revenue − cost`
- `accommodation_billings`: `total_amount` = revenue, `cost_amount`, `margin_amount`.

**Unchanged:** night-counting (snapshots) + the L1 human-finalize gate. Rates & billing_client are human-set config.
**cost_centers:** stays a dormant optional taxonomy — NOT wired into billing; `accommodation_expenses` is the cost source.

**Bulk-populate billing_client:** (1) import column "Számlázási ügyfél" mapped to a contractor by name; (2) Employees-list multi-select → "Set billing client".
