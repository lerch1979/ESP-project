# Critical Security Fixes Applied — 2026-03-11

## Test Results: 84/84 passed (was 68/81)

---

## PRIORITY 1: SQL Injection & Input Validation

### Fix 1: UUID Validation on All :id Parameters
**Files:** `salary.controller.js`, `invoice.controller.js`, `costCenter.controller.js`
**Issue:** Invalid UUIDs in URL params caused unhandled PostgreSQL errors (500)
**Fix:** Added `isValidUUID()` check at the start of every `:id` endpoint. Returns 400 with clear message instead of 500.
**Endpoints fixed:** getBandById, updateBand, deleteBand, getEmployeeSalaryById, createEmployeeSalary, updateEmployeeSalary, deleteEmployeeSalary, getEmployeeSalaryHistory, getById (invoice), update (invoice), remove (invoice), getById (cost center), update (cost center), remove (cost center)

### Fix 2: Search Input Length Limiting
**Files:** `search.controller.js`, `invoice.controller.js`
**Issue:** 10,000-character search strings caused DB performance issues (500)
**Fix:** Truncated search input to max 200 characters using `sanitizeSearch()`. Added `parsePagination()` with max limit cap.

### Fix 3: Sort Column Whitelist (Already Existed)
**File:** `invoice.controller.js`
**Issue:** Sort parameter tested as SQLi vector. The `getSortColumn()` whitelist was already in place (safe). The 500 was caused by missing `deleted_at` column (see Fix 8).

---

## PRIORITY 2: XSS Prevention

### Fix 4: HTML Tag Stripping on All String Inputs
**File:** `utils/validation.js` (NEW), `salary.controller.js`
**Issue:** `<script>alert("xss")</script>` was stored verbatim in salary band names
**Fix:** Added `stripHtml()` to `sanitizeString()`. All string inputs through `sanitizeString()` now have HTML tags removed. Applied to salary band create (position_name, department, location, notes).

---

## PRIORITY 3: Amount Validation

### Fix 5: Positive Amount Enforcement
**Files:** `salary.controller.js`, `invoice.controller.js`, `utils/validation.js`
**Issue:** Negative salaries and invoice amounts were accepted
**Fix:** Added `validateAmount()` that checks: must be positive, must be finite, must be within NUMERIC(12,2) range (max 9,999,999,999.99). Applied to createBand (min_salary, max_salary, median_salary), createEmployeeSalary (gross_salary), invoice create/update (amount).

### Fix 6: Invoice Date Validation
**File:** `invoice.controller.js`
**Issue:** due_date before invoice_date was accepted
**Fix:** Added check: `if (due_date && invoice_date && new Date(due_date) < new Date(invoice_date))` returns 400.

---

## PRIORITY 4: Business Logic

### Fix 7: Invoice Status Transition Validation (State Machine)
**File:** `invoice.controller.js`
**Issue:** Invoice status could jump to any state (e.g., draft → paid, cancelled → draft)
**Fix:** Added `VALID_TRANSITIONS` map enforcing:
- `draft` → sent, cancelled
- `sent` → paid, overdue, cancelled
- `paid` → overdue
- `overdue` → paid, cancelled
- `cancelled` → (terminal, no transitions)

---

## PRIORITY 5: Authentication & Rate Limiting

### Fix 8: Login Brute Force Protection
**Files:** `routes/auth.routes.js`, `server.js`
**Issue:** Unlimited login attempts possible. No rate limiting on auth endpoint.
**Fix:** Added dedicated `loginLimiter` middleware: 10 attempts per 15-minute window per IP. Successful requests don't count. Returns 429 with Hungarian message.

### Fix 9: CORS Hardening
**File:** `server.js`
**Issue:** CORS fell back to wildcard `'*'` with `credentials: true` if `CORS_ORIGIN` env var was unset.
**Fix:** Changed fallback to explicit localhost origins `['http://localhost:3001', 'http://localhost:3000']`. Added warning log if `CORS_ORIGIN` not set. Tightened `crossOriginResourcePolicy` to `same-origin`.

### Fix 10: Request Body Size Reduction
**File:** `server.js`
**Issue:** 10MB global body limit allowed DoS via large payloads.
**Fix:** Reduced to 2MB global limit. File upload routes can override per-route.

---

## PRIORITY 6: Error Handling & Sensitive Data

### Fix 11: console.error → logger.error
**Files:** `notification.controller.js` (13 instances), `status.controller.js`, `priority.controller.js`, `category.controller.js`
**Issue:** `console.error()` bypassed logger configuration, could expose sensitive data to stdout.
**Fix:** Replaced all `console.error()` with `logger.error()`. Added `const { logger } = require('../utils/logger')` import where missing.

### Fix 12: Removed error.message from API Responses
**Files:** `status.controller.js`, `priority.controller.js`, `category.controller.js`
**Issue:** Error responses included `error: error.message` which leaked internal error details.
**Fix:** Removed `error: error.message` from all 500 responses.

### Fix 13: Improved Global Error Handler
**File:** `server.js`
**Issue:** Error handler exposed `err.message` in all environments.
**Fix:** Only expose `err.message` when `NODE_ENV === 'development'`. Production shows generic "Szerver hiba történt". Log full error details to logger only.

---

## Database Migrations Applied

### Migration: add_invoices_api.sql
Added missing columns and sequence to invoices table:
- `deleted_at TIMESTAMP` (soft delete)
- `line_items JSONB`
- `client_name VARCHAR(200)`
- `client_id UUID`
- `invoice_number_seq` sequence
- Indexes on deleted_at, contractor_id, vendor_name, invoice_number

### Migration: add_payments.sql
Created payments table (was completely missing from Docker DB).

---

## New Files Created

### `src/utils/validation.js`
Shared validation utilities:
- `isValidUUID(str)` — UUID format validation
- `sanitizeString(str, maxLength)` — Trim + HTML strip + length limit
- `stripHtml(str)` — Remove HTML tags
- `parsePositiveNumber(value)` — Safe number parsing
- `parsePagination(query)` — Safe page/limit/offset with max cap
- `parseSortOrder(value)` — Only ASC/DESC
- `sanitizeSearch(str, opts)` — Search input sanitization
- `isValidDate(str)` — YYYY-MM-DD validation
- `validateAmount(value)` — Positive number in NUMERIC range
- `validateIdParam(req, res)` — UUID param validation helper

---

## Backup Files
All modified files have `.BACKUP` copies:
- `src/server.js.BACKUP`
- `src/routes/auth.routes.js.BACKUP`
- `src/controllers/salary.controller.js.BACKUP`
- `src/controllers/invoice.controller.js.BACKUP`
- `src/controllers/costCenter.controller.js.BACKUP`
- `src/controllers/notification.controller.js.BACKUP`
- `src/controllers/status.controller.js.BACKUP`
- `src/controllers/priority.controller.js.BACKUP`
- `src/controllers/category.controller.js.BACKUP`
