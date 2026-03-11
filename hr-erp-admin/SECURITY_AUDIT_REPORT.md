# HR-ERP Security Audit Report

**Date:** 2026-03-11
**Auditor:** Automated Security Audit (Claude)
**Scope:** Full-stack HR-ERP system (Backend, Frontend Admin, Mobile, Database)

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 12 | Fix immediately - security breaches, data loss risks |
| **HIGH** | 18 | Fix this sprint - significant vulnerabilities |
| **MEDIUM** | 22 | Fix next sprint - moderate risk items |
| **LOW** | 8 | Backlog - minor improvements |
| **TOTAL** | **60** |

---

## CRITICAL Issues (Fix Immediately)

### C-01: Exposed API Keys in Version Control
**File:** `hr-erp-backend/.env`
**Category:** Configuration Security
**Description:** Real Anthropic API key (`sk-ant-api03-...`) and GitHub token (`ghp_...`) are committed to version control. These keys grant access to external services at your expense and to your GitHub repositories.
**Impact:** Financial loss, code tampering, supply chain attack
**Fix:**
1. **IMMEDIATELY** rotate all exposed tokens in provider dashboards
2. Remove `.env` from git history: `git filter-branch` or BFG Repo Cleaner
3. Use environment-specific secrets management (AWS Secrets Manager, Vault)
4. Verify `.env` is in `.gitignore`

---

### C-02: Hardcoded Test Credentials on Login Page
**File:** `hr-erp-admin/src/pages/Login.jsx` (lines 125-131)
**Category:** Frontend Security
**Description:** Test email/password (`kiss.janos@abc-kft.hu` / `password123`) displayed in the UI.
**Impact:** Unauthorized access to production system
**Code:**
```jsx
<Typography variant="caption">Email: kiss.janos@abc-kft.hu</Typography>
<Typography variant="caption">Jelszó: password123</Typography>
```
**Fix:** Remove test credentials block. Use separate demo/staging environment.

---

### C-03: No Brute Force Protection on Login
**File:** `hr-erp-backend/src/controllers/auth.controller.js` (lines 10-144)
**Category:** Authentication
**Description:** Login endpoint accepts unlimited attempts. No rate limiting, no account lockout, no exponential backoff.
**Impact:** Password cracking, account takeover
**Fix:**
```javascript
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Túl sok bejelentkezési kísérlet' },
  skipSuccessfulRequests: true,
});
router.post('/login', loginLimiter, authController.login);
```
Also add `failed_login_attempts` and `locked_until` columns to users table.

---

### C-04: No Invoice Status Transition Validation
**File:** `hr-erp-backend/src/controllers/invoice.controller.js` (lines 251-256)
**Category:** Business Logic
**Description:** Invoice status can jump to any value: `draft` → `paid` (skipping `sent`), `cancelled` → `draft`, etc. No state machine enforcement.
**Impact:** Financial fraud, audit trail corruption
**Fix:**
```javascript
const validTransitions = {
  'draft': ['sent', 'cancelled'],
  'sent': ['paid', 'overdue', 'cancelled'],
  'paid': ['overdue'],
  'overdue': ['paid'],
  'cancelled': []
};
const current = existing.rows[0].payment_status;
if (payment_status && !validTransitions[current]?.includes(payment_status)) {
  return res.status(400).json({ success: false, message: 'Érvénytelen státuszváltás' });
}
```

---

### C-05: CORS Wildcard with Credentials
**File:** `hr-erp-backend/src/server.js` (lines 71-76)
**Category:** Configuration Security
**Description:** CORS falls back to `'*'` if `CORS_ORIGIN` env var is unset, combined with `credentials: true`. This allows any website to make authenticated API requests.
**Impact:** CSRF attacks, session hijacking
**Code:**
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || '*', // DANGEROUS fallback
  credentials: true,
};
```
**Fix:**
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200,
};
if (!process.env.CORS_ORIGIN) {
  logger.warn('CORS_ORIGIN not set! Using localhost only.');
}
```

---

### C-06: Weak Database Password
**File:** `hr-erp-backend/.env` (line 8)
**Category:** Configuration Security
**Description:** PostgreSQL password is `postgres` (default). Combined with exposed port (docker-compose.yml exposes 5432 to all interfaces).
**Impact:** Full database compromise
**Fix:**
```bash
# Generate strong password
openssl rand -base64 32
# Update .env: DB_PASSWORD=<generated>
# In docker-compose.yml, bind to localhost only:
ports:
  - "127.0.0.1:5432:5432"
```

---

### C-07: JWT Secret is Guessable Text
**File:** `hr-erp-backend/.env` (line 10)
**Category:** Authentication
**Description:** JWT secret is `your-super-secret-jwt-key-change-this-in-production-2024` — readable English text, not cryptographically random. Can be guessed or brute-forced.
**Impact:** Token forgery, full account takeover
**Fix:**
```bash
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
JWT_SECRET=<64-byte-random-base64>
```

---

### C-08: Cost Center Circular Reference Check is Flawed
**File:** `hr-erp-backend/src/controllers/costCenter.controller.js` (lines 330-344)
**Category:** Business Logic
**Description:** Circular reference detection may fail for indirect cycles (A→B→C→A). The recursive CTE only checks one direction.
**Impact:** Infinite loops in hierarchy queries, application crashes
**Fix:** Check both directions and add database constraint:
```sql
-- Application layer: check both directions
-- Database layer: add trigger to prevent cycles
CREATE OR REPLACE FUNCTION check_cost_center_cycle() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT parent_id FROM cost_centers WHERE id = NEW.parent_id
      UNION ALL
      SELECT cc.parent_id FROM cost_centers cc JOIN ancestors a ON cc.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Circular reference detected';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### C-09: Tokens Stored in localStorage (XSS Vulnerable)
**File:** `hr-erp-admin/src/contexts/AuthContext.jsx` (lines 30-34)
**Category:** Frontend Security
**Description:** JWT tokens and refresh tokens stored in plain-text localStorage. Any XSS vulnerability exposes all tokens.
**Impact:** Session hijacking, account takeover
**Code:**
```jsx
localStorage.setItem('token', token);
localStorage.setItem('refreshToken', refreshToken);
localStorage.setItem('user', JSON.stringify(userData));
```
**Fix:** Use httpOnly, Secure, SameSite cookies for token storage. If localStorage is necessary, implement strict CSP headers.

---

### C-10: Refresh Token Not Invalidated on Logout
**File:** `hr-erp-backend/src/controllers/auth.controller.js` (lines 239-257)
**Category:** Authentication
**Description:** Logout is cosmetic only — refresh tokens remain valid. Comment in code: `"Későbbi továbbfejlesztés: token blacklist Redis-ben"`.
**Impact:** Persistent unauthorized access after "logout"
**Fix:**
```javascript
const logout = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    await redisClient.setex(`blacklist:${token}`, ttl, 'true');
  }
  res.json({ success: true, message: 'Sikeres kijelentkezés' });
};
```

---

### C-11: xlsx Package — Known Prototype Pollution (CVE-2024-22363)
**File:** Backend `package.json` and Frontend `package.json`
**Category:** Dependency Vulnerability
**Description:** `xlsx@0.18.5` has HIGH severity prototype pollution and ReDoS vulnerabilities. Package is abandoned on npm.
**Impact:** Remote code execution via crafted Excel files
**Fix:** Replace with `exceljs` or `xlsx-js-style`:
```bash
npm uninstall xlsx && npm install exceljs
```

---

### C-12: Missing Foreign Key CASCADE Deletes on Critical Tables
**File:** Multiple migration files
**Category:** Database Integrity
**Description:** Foreign keys on `activity_logs.user_id`, `user_permissions.granted_by`, and `cost_centers` lack ON DELETE CASCADE/RESTRICT. Deleting users creates orphaned records.
**Fix:**
```sql
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

---

## HIGH Priority Issues (Fix This Sprint)

### H-01: No Invoice Amount Validation
**File:** `hr-erp-backend/src/controllers/invoice.controller.js` (line 159)
**Description:** Negative amounts, zero amounts, and overflow values accepted for invoices.
**Fix:** Add `if (parseFloat(amount) <= 0) return res.status(400)...`

### H-02: Overpayment Allowed Without Warning
**File:** `hr-erp-backend/src/services/payment.service.js` (lines 169-179)
**Description:** Payments exceeding invoice total accepted. Invoice of 100K can have 150K in payments.
**Fix:** Check `totalPaid + newPayment <= invoiceTotal` before accepting.

### H-03: Salary Band Overlaps Not Detected
**File:** `hr-erp-backend/src/controllers/salary.controller.js` (lines 117-143)
**Description:** Duplicate salary bands for same position/department/level with overlapping min/max ranges allowed.
**Fix:** Query for overlapping bands before insert. Add UNIQUE constraint on (position_name, level, department).

### H-04: Unauthorized Salary Data Access
**File:** `hr-erp-backend/src/controllers/salary.controller.js` (lines 556-570)
**Description:** Gender pay gap stats accessible to any user with `settings.view` permission. Salary data should require admin/data_controller role.
**Fix:** Add role check: `if (!['admin', 'data_controller'].includes(req.user.role)) return 403`

### H-05: N+1 Query in Permission Controller
**File:** `hr-erp-backend/src/controllers/permission.controller.js` (lines 57-72)
**Description:** Loop executes individual DB query per role. 50 roles = 50 queries.
**Fix:** Use single query with `json_agg()` and `GROUP BY`.

### H-06: Missing Error Boundaries in React App
**File:** All frontend pages
**Description:** No React Error Boundaries. One component crash takes down entire admin interface.
**Fix:** Wrap route components in ErrorBoundary component.

### H-07: Missing CSRF Protection
**File:** `hr-erp-admin/src/services/api.js`
**Description:** No CSRF tokens sent with state-changing requests (POST/PUT/DELETE).
**Fix:** Implement CSRF token middleware on backend, send X-CSRF-Token header from frontend.

### H-08: No API Request Timeout
**File:** `hr-erp-admin/src/services/api.js` (lines 9-14)
**Description:** Axios instance has no timeout. Requests can hang indefinitely.
**Fix:** `const api = axios.create({ timeout: 30000, ... })`

### H-09: Excessive Console Error Logging
**Files:** `notification.controller.js` (14 instances), `status.controller.js`, `priority.controller.js`, `category.controller.js`, 50+ frontend files
**Description:** `console.error()` used instead of `logger.error()` in backend. Frontend logs full error objects that may contain sensitive data.
**Fix:** Replace all `console.error` with `logger.error` in backend. Wrap frontend logging with environment check.

### H-10: Database Exposed to All Network Interfaces
**File:** `hr-erp-backend/docker-compose.yml` (lines 13-14)
**Description:** PostgreSQL port 5432 and Redis port 6379 exposed to `0.0.0.0`.
**Fix:** Bind to localhost: `"127.0.0.1:5432:5432"` and `"127.0.0.1:6379:6379"`

### H-11: Redis Without Authentication
**File:** `hr-erp-backend/docker-compose.yml` (lines 29-30)
**Description:** Redis running without `requirepass`. Accessible to anyone on the network.
**Fix:** `command: redis-server --requirepass ${REDIS_PASSWORD}`

### H-12: Missing FK Indexes (Performance)
**Files:** Multiple migrations
**Description:** Foreign key columns without indexes: `salary_bands.created_by`, `employee_salaries.approved_by`, `projects.created_by`, `tasks.assigned_to`, `documents.uploaded_by`, etc.
**Fix:** Create indexes on all FK columns used in JOINs.

### H-13: react-quill XSS Vulnerabilities
**File:** Frontend `package.json`
**Description:** `react-quill@2.0.0` depends on Quill 1.x which has known XSS vulnerabilities. Package is unmaintained.
**Fix:** Replace with `react-quill-new` or `@tiptap/react`.

### H-14: pdf-parse Arbitrary Code Execution Risk
**File:** Backend `package.json`
**Description:** `pdf-parse@1.1.1` is unmaintained since 2019, known to execute arbitrary code on parse.
**Fix:** Replace with `pdfjs-dist` or `pdf2json`.

### H-15: Missing Pagination Defaults
**Files:** Multiple controllers
**Description:** Many list endpoints lack default pagination. Can return unlimited rows.
**Fix:** `const limit = Math.min(parseInt(req.query.limit) || 20, 100);`

### H-16: No Password Complexity Requirements
**File:** `hr-erp-backend/src/controllers/user.controller.js` (lines 153-173)
**Description:** Passwords accepted without complexity checks. No minimum length, no character requirements.
**Fix:** Validate: min 12 chars, 1 uppercase, 1 number, 1 special char.

### H-17: SELECT * Used in Queries
**Files:** 40+ instances across controllers
**Description:** `SELECT *` fetches all columns including large text/BLOB fields. Wastes bandwidth.
**Fix:** Select only needed columns.

### H-18: Missing Input Validation on Search
**File:** `hr-erp-backend/src/controllers/search.controller.js` (lines 7-19)
**Description:** Search query has minimum check (2 chars) but no maximum. Very long strings cause performance issues.
**Fix:** Add max length: `if (q.length > 100) return 400`

---

## MEDIUM Priority Issues (Fix Next Sprint)

### M-01: Invoice Date Validation Missing
No validation that due_date > invoice_date. Future dates far in the future accepted.

### M-02: Currency Mismatch on Payments
Payment currency not validated against invoice currency.

### M-03: Can Delete Parent Cost Center with Inactive Children
Only active children block deletion, orphaning inactive ones.

### M-04: Salary min > max Possible via Race Condition
Concurrent updates can create invalid state. Add DB constraint: `CHECK (min_salary <= max_salary)`.

### M-05: 10MB Request Body Limit Too High
Global `express.json({ limit: '10mb' })` allows DoS via large payloads. Reduce to 1MB with per-route exceptions.

### M-06: Helmet Cross-Origin Too Permissive
`crossOriginResourcePolicy: "cross-origin"` allows resource loading from any origin.

### M-07: Missing Soft Delete on Payments Table
Financial records need `deleted_at` for audit compliance.

### M-08: Missing Composite Database Indexes
Common query patterns lack composite indexes: `(contractor_id, payment_status)`, `(project_id, status)`, etc.

### M-09: Email Validation Weak in BulkEmailModal
Email addresses split without format validation.

### M-10: No API Response Validation on Frontend
API responses not validated against expected schema.

### M-11: Missing updated_at Triggers on All Tables
Only some tables auto-update `updated_at`. Should be universal.

### M-12: Vite Dev Server Vulnerability (CVE-2025-30208)
`vite@5.0.8` has arbitrary file read vulnerability. Upgrade to `^5.4.15`.

### M-13: Express Open Redirect (CVE-2024-29041)
`express@4.18.2` has open redirect vulnerability. Upgrade to `^4.21.2`.

### M-14: Multer Error Handling Missing
File upload errors not caught by Express error middleware. Can crash server.

### M-15: OAuth Callback Missing CSRF Validation
Google Calendar callback has no state parameter verification.

### M-16: Missing Partial Indexes on is_active Columns
Tables with `is_active` lack partial indexes for filtered queries.

### M-17: Missing UNIQUE Constraint on Salary Bands
No unique constraint on (position_name, level, department) allows duplicates.

### M-18: Missing Index on employee_salaries.deleted_at
Soft delete column exists but no index for filtered queries.

### M-19: Notification Polling Without Backoff
`NotificationBell.jsx` polls every 60s without retry limit or exponential backoff.

### M-20: Frontend Memory Leaks - Missing useEffect Cleanup
Multiple pages have useEffect without cleanup functions. State updates on unmounted components.

### M-21: Invoice Payment Status Not Enum Type
`payment_status VARCHAR(50)` should use PostgreSQL ENUM for data consistency.

### M-22: Missing Password Reset Token Table
No password reset mechanism exists in database schema.

---

## LOW Priority Issues (Backlog)

### L-01: Stack Traces in Development Error Responses
`server.js` returns `err.stack` when `NODE_ENV=development`. Risk if misconfigured in production.

### L-02: bcryptjs Package Unmaintained
`bcryptjs@2.4.3` last released 2017. Consider switching to `bcrypt` (native).

### L-03: Debug Query Logging
`connection.js` logs full SQL at DEBUG level. Could leak data if accidentally enabled.

### L-04: File Upload Names Use Timestamps
Predictable filenames. Use UUID v4 instead.

### L-05: React Router v7 Future Flag Warnings
Multiple deprecation warnings in console. Will break on upgrade.

### L-06: Date Parsing Without Validation
Multiple components use `new Date(dateStr)` without checking for Invalid Date.

### L-07: Missing Content Security Policy Headers
No CSP headers configured on backend.

### L-08: Console Errors Not Sanitized in Frontend Production
Full error objects logged to browser console.

---

## Dependency Vulnerability Summary

### Backend (5 vulnerabilities)
| Package | Severity | Issue |
|---------|----------|-------|
| xlsx | HIGH | Prototype Pollution (CVE-2024-22363), ReDoS |
| underscore | HIGH | Unlimited recursion DoS |
| qs | HIGH | arrayLimit bypass DoS |
| nodemailer | LOW | Transitive dependency |
| **Total** | **1 low, 4 high** | |

### Frontend (11 vulnerabilities)
| Package | Severity | Issue |
|---------|----------|-------|
| xlsx | HIGH | Prototype Pollution, ReDoS |
| vite | HIGH | Arbitrary file read (CVE-2025-30208) |
| serialize-javascript | HIGH | Code injection |
| rollup-plugin-terser | MODERATE | Transitive |
| workbox-build | MODERATE | Transitive |
| **Total** | **4 moderate, 7 high** | |

### Mobile (2 vulnerabilities)
| Package | Severity | Issue |
|---------|----------|-------|
| minimatch | HIGH | ReDoS (multiple CVEs) |
| tar | HIGH | Path traversal |
| **Total** | **2 high** | |

---

## Security Posture Summary

### Strengths
- Parameterized SQL queries used consistently (low SQL injection risk)
- Authentication middleware on all protected routes
- Role-based access control implemented
- Password hashing with bcrypt (10 rounds)
- Rate limiting configured (general, not per-endpoint)
- Helmet security headers enabled
- Database transactions for data consistency

### Critical Weaknesses
- API keys exposed in version control
- No brute force protection on authentication
- Token storage vulnerable to XSS
- Logout doesn't invalidate tokens
- CORS misconfiguration allows any origin
- Weak default credentials throughout
- Known vulnerable dependencies (xlsx, react-quill)

---

## Remediation Priority

### Week 1 (Critical)
1. Rotate all exposed API keys and tokens
2. Add login rate limiting + account lockout
3. Fix CORS configuration
4. Replace JWT secret with cryptographic random
5. Remove test credentials from login page
6. Bind database/Redis to localhost only

### Week 2 (High)
1. Replace xlsx with exceljs
2. Replace react-quill with @tiptap/react
3. Add invoice status transition validation
4. Add payment overpayment checks
5. Add Error Boundaries to React app
6. Create missing database indexes

### Week 3-4 (Medium)
1. Implement token blacklist for logout
2. Migrate tokens from localStorage to httpOnly cookies
3. Add CSRF protection
4. Add password complexity requirements
5. Add missing database constraints
6. Run `npm audit fix` on all projects

### Backlog (Low)
1. Switch bcryptjs to bcrypt
2. Add CSP headers
3. Sanitize frontend console logging
4. Address React Router deprecation warnings

---

## Appendix: Live Test Results

**Test Suite:** `tests/AUTOMATED_TEST_SUITE.js`
**Run Date:** 2026-03-11
**Target:** http://localhost:3000/api/v1
**Results:** 68 passed, 13 failed, 81 total

### Failed Tests (Confirmed Vulnerabilities)

| # | Test | Status | Finding |
|---|------|--------|---------|
| 1 | Invoice list: SQLi in sort param | 500 | **Sort parameter not sanitized** — SQL injection in sort causes server crash |
| 2 | Cost center: SQLi in ID param | 500 | **ID parameter not validated** — Non-UUID in path crashes server |
| 3 | Create salary band with XSS in position_name | 201 | **XSS stored unescaped** — `<script>` tags stored and returned verbatim |
| 4 | POST /salary/bands creates new band | 201 | Response missing `id` field (minor API contract issue) |
| 5 | GET /invoices returns list | 500 | **Invoice list endpoint crashes** — likely missing contractor context |
| 6 | GET /invoices with very long search string | 500 | **No input length validation** — 10K char string crashes server |
| 7 | GET /cost-centers/hierarchy returns tree | 500 | **Hierarchy endpoint crashes** — error handling missing |
| 8 | GET /payments returns list | 500 | **Payment list endpoint crashes** — likely missing contractor context |
| 9 | POST /payments rejects non-existent invoice | 500 | **Missing error handling** for non-existent invoice reference |
| 10 | Very long string in salary band position name | 500 | **No input length validation** — exceeds VARCHAR(255) limit |
| 11 | Extremely large salary values | 500 | **No numeric range validation** — overflows NUMERIC(12,2) |
| 12 | Salary stats filter by department | 429 | Rate limiting kicked in (POSITIVE — system working as designed) |
| 13 | Salary bands filter by level | 429 | Rate limiting kicked in (POSITIVE — system working as designed) |

### Key Findings from Live Testing

**Positive:**
- All 9 authorization checks passed — no unauthenticated access
- All 7 SQL injection payloads on search endpoint blocked (parameterized queries work)
- Password hashes NOT exposed in any response
- No stack traces leaked in error responses
- Rate limiting IS active on general API endpoints
- Login rejects SQL injection and XSS payloads correctly

**Negative:**
- No login-specific rate limiting (brute force possible)
- XSS stored unescaped in salary band names
- Multiple 500 errors from unhandled edge cases
- Invoice, payment, and cost center hierarchy endpoints crash with 500
- No input length or numeric range validation
- Negative salary amounts accepted
