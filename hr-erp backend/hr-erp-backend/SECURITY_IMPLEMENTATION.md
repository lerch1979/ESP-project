# Security Implementation Plan

## Sprint 1: PII Encryption + Database Security

### 1. PII Encryption (Implemented)

**Approach:** Application-level AES-256-CBC encryption for sensitive employee data.

**Encrypted Fields (employees table):**
- `social_security_number` (TAJ szam)
- `passport_number` (Utlevelszam)
- `bank_account` (Bankszamlaszam)
- `tax_id` (Adoazonosito)

**Implementation:**
- `src/services/encryption.service.js` — Core encrypt/decrypt using Node.js `crypto`
- Random IV per encryption (iv:ciphertext format)
- Backward-compatible: plaintext values are returned as-is until encrypted
- Transparent to controllers via `encryptPiiFields()` / `decryptPiiFields()` helpers

**Migration:**
- `migrations/encrypt_pii_data.sql` (040) — Alters column types to TEXT, adds `pii_encrypted` tracking column
- `migrations/run_encrypt_pii.js` — One-time script to encrypt existing plaintext data

**Key Management:**
- `ENCRYPTION_KEY` in .env (64-char hex = 32 bytes)
- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **CRITICAL:** Back up this key securely. Lost key = unrecoverable data.

---

### 2. Database SSL/TLS (Implemented)

**Configuration:**
- `DB_SSL=true` enables SSL connections
- `DB_SSL_REJECT_UNAUTHORIZED=true` (default) enforces certificate validation
- `DB_SSL_CA=/path/to/ca.crt` for custom CA certificates
- Applied in both `src/database/connection.js` and `src/database/migrate.js`

**Production Setup:**
1. Set `DB_SSL=true` in .env
2. Provide CA certificate path if using self-signed certs
3. Ensure PostgreSQL server has SSL enabled (`ssl = on` in postgresql.conf)

---

### 3. Audit Triggers (Implemented)

**Migration:** `migrations/audit_triggers.sql` (041)

**Covered Tables:**
- `employees` — All CRUD operations
- `users` — All CRUD operations
- `invoices` — All CRUD operations
- `salary_bands` — All CRUD operations
- `employee_salaries` — All CRUD operations

**Trigger Behavior:**
- Captures old/new values as JSONB
- Skips `updated_at` noise in change diffs
- Skips no-op UPDATEs (no meaningful changes)
- Stores entries in existing `activity_logs` table
- Sets `metadata.trigger = true` to distinguish from application-level logs
- Reads `app.current_user_id` session variable when available

**Application Integration:**
To pass user context to triggers, set the session variable before queries:
```sql
SET LOCAL app.current_user_id = 'user-uuid-here';
```

---

### 4. Row-Level Security (RLS) — Planning

**Strategy:** Multi-tenant isolation using PostgreSQL RLS policies.

**Current Multi-Tenancy Model:**
- `contractor_id` (formerly `tenant_id`) on key tables: employees, users, invoices
- Users are associated with contractors via `user_roles.contractor_id`

**Proposed RLS Implementation:**

#### Phase 1: Read Isolation
```sql
-- Enable RLS on employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see employees from their contractor
CREATE POLICY employees_contractor_isolation ON employees
  FOR SELECT
  USING (contractor_id = current_setting('app.current_contractor_id')::UUID);
```

#### Phase 2: Write Isolation
```sql
-- Policy: users can only INSERT/UPDATE employees in their contractor
CREATE POLICY employees_contractor_write ON employees
  FOR INSERT
  WITH CHECK (contractor_id = current_setting('app.current_contractor_id')::UUID);

CREATE POLICY employees_contractor_update ON employees
  FOR UPDATE
  USING (contractor_id = current_setting('app.current_contractor_id')::UUID);
```

#### Phase 3: Superadmin Bypass
```sql
-- Superadmins bypass RLS
CREATE POLICY employees_superadmin ON employees
  FOR ALL
  USING (current_setting('app.is_superadmin', true)::BOOLEAN = true);
```

**Tables Requiring RLS:**
| Table | Isolation Key | Priority |
|-------|--------------|----------|
| employees | contractor_id | High |
| users | contractor_id | High |
| invoices | contractor_id | High |
| tickets | contractor_id | Medium |
| salary_bands | contractor_id | Medium |
| employee_salaries | (via employee) | Medium |
| documents | (via employee) | Low |

**Implementation Notes:**
- Requires setting `app.current_contractor_id` session variable per request
- Middleware should set this from `req.user.contractor_id`
- Superadmin role needs bypass policies
- Test thoroughly with multi-tenant data before enabling
- RLS must be enabled per-table (not retroactive)
- **Risk:** Incorrect policy = data leak or lockout. Test in staging first.

**Estimated Effort:** 2-3 sprints for full implementation + testing

---

## Sprint 2: API Security Hardening

### 5. Rate Limiting (Implemented)

**File:** `src/middleware/rateLimiter.js`

**Tiers:**
| Tier | Limit | Window | Target |
|---|---|---|---|
| Global | 100 req/IP | 15 min | All `/api/` routes |
| Auth | 5 req/IP | 15 min | Login, register |
| Password Reset | 3 req/IP | 1 hour | Password reset |
| File Upload | 10 req/IP | 1 hour | File uploads |
| Authenticated | 1000 req/user | 1 hour | All routes (by user ID) |
| Speed Limiter | Delay after 50 req | 15 min | Progressive slowdown |

**Features:**
- Superadmin bypass
- Rate limit violations logged
- Configurable via `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`
- Standard `RateLimit-*` response headers
- Speed limiter adds progressive delay after threshold

**Documentation:** `docs/RATE_LIMITING.md`

---

### 6. CSRF Protection (Implemented)

**File:** `src/middleware/csrf.js`

**Approach:** Double-submit cookie pattern.

**How it works:**
1. Server sets `_csrf` cookie (JS-readable, `sameSite: strict`)
2. Client reads cookie and sends it in `x-csrf-token` header
3. Server validates cookie === header

**Smart Exemptions:**
- Safe methods (GET, HEAD, OPTIONS) — skipped
- JWT Bearer requests — inherently CSRF-safe, skipped
- Configurable exempt paths

**Endpoint:** `GET /api/v1/csrf-token` — issues a new token

**Documentation:** `docs/CSRF_INTEGRATION.md`

---

### 7. Security Headers (Implemented)

**File:** `src/middleware/securityHeaders.js`

**Helmet.js + Custom Headers:**
- Content Security Policy (CSP) with strict directives
- X-Frame-Options: DENY (clickjacking prevention)
- X-Content-Type-Options: nosniff (MIME sniffing prevention)
- Strict-Transport-Security (HSTS) for HTTPS enforcement
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- Cache-Control: no-store for API responses (prevent sensitive data caching)
- Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy

**CSP Features:**
- Report-only mode in development
- Full enforcement in production
- CSP violation report endpoint: `POST /api/v1/csp-report`
- `unsafe-inline` for styles only (required by UI frameworks)

**Documentation:** `docs/SECURITY_HEADERS.md`

---

## Sprint 3: Input Validation + SQL Injection Prevention

### 8. Input Validation (Implemented)

**Files:**
- `src/utils/validation.js` — Core validation utilities
- `src/middleware/validate.js` — Express middleware factories

**Validation Functions:**
| Function | Purpose |
|----------|---------|
| `isValidUUID(value)` | Validates UUID v4 format |
| `sanitizeString(value, maxLen)` | Strips HTML, trims, enforces length |
| `parsePositiveNumber(value)` | Safe numeric parsing |
| `parsePagination(query, opts)` | Page/limit/offset with bounds |
| `parseSortOrder(value)` | Allowlist: ASC or DESC only |
| `sanitizeSearch(value)` | Trims, 200-char max |
| `isValidDate(value)` | YYYY-MM-DD format only |
| `validateAmount(value)` | Positive number, max 9,999,999,999 |
| `isAllowedValue(value, list)` | Allowlist validation |
| `validateIdParam(req, res)` | UUID validation for req.params.id |

**Controllers Hardened:**
- `employee.controller.js` — UUID, pagination, sanitize, search
- `user.controller.js` — UUID, pagination, sanitize, search, email
- `ticket.controller.js` — UUID, pagination, sanitize, search
- `auth.controller.js` — sanitize, email format
- `notification.controller.js` — UUID, pagination

**Documentation:** `docs/INPUT_VALIDATION.md`

---

### 9. SQL Injection Prevention (Verified)

**Approach:** All database queries use PostgreSQL parameterized queries (`$1`, `$2`, ...).

**Scan Results:** `npm run security:scan-sql`
- 185 pattern matches found across source files
- All confirmed safe: parameterized values, allowlist-validated ORDER BY columns
- Zero actual SQL injection vulnerabilities

**Key Patterns Verified:**
- No string interpolation in WHERE clauses
- ORDER BY columns use allowlists (SORT_COLUMNS maps)
- LIKE patterns use parameterized `$N` with `%` concatenated in SQL
- Table names are never user-controlled

---

### 10. XSS Prevention (Implemented)

**Approach:** HTML tag stripping + Content Security Policy headers.

- `sanitizeString()` removes all HTML tags via regex before storage
- CSP headers prevent inline script execution (via Helmet.js)
- API responses are JSON — no server-side HTML rendering

---

### 11. Security Test Suite (Implemented)

**Test Files:**
| File | Tests | Coverage |
|------|-------|----------|
| `tests/security/sql-injection.test.js` | 69 | 14 SQL injection payloads |
| `tests/security/xss-prevention.test.js` | 28 | 16 XSS payloads |
| `tests/security/validation.test.js` | 43 | All validation utilities |
| `tests/encryption.test.js` | 21 | AES-256 encryption |
| `tests/rateLimiter.test.js` | 10 | Rate limiting tiers |
| `tests/csrf.test.js` | 16 | CSRF double-submit |
| `tests/securityHeaders.test.js` | 8 | Helmet + custom headers |
| **Total** | **195** | |

**Run:** `npm run test:security`

---

### 12. Audit Scripts (Implemented)

- `npm run security:scan-sql` — Scans for SQL injection patterns, generates `SQL_INJECTION_SCAN.md`
- `npm run security:audit-validation` — Audits controller validation coverage, generates `VALIDATION_AUDIT.md`

---

## Security Checklist

### Sprint 1
- [x] PII encryption at rest (AES-256-CBC)
- [x] Database SSL/TLS connection support
- [x] Audit triggers on sensitive tables
- [x] Encryption key management documentation
- [x] Row-Level Security strategy documented

### Sprint 2
- [x] Tiered rate limiting (global, auth, upload, authenticated)
- [x] Speed limiter (progressive delay)
- [x] CSRF protection (double-submit cookie)
- [x] Security headers (Helmet + CSP + custom)
- [x] CSP violation reporting
- [x] API response cache prevention
- [x] Permissions-Policy header
- [x] Rate limit violation logging

### Sprint 3
- [x] Input validation audit across all controllers
- [x] SQL injection vulnerability scan (185 patterns checked, all safe)
- [x] UUID validation on all path parameters
- [x] Pagination validation with maxLimit enforcement
- [x] String sanitization (HTML stripping) on user inputs
- [x] Search input sanitization with length limits
- [x] Email format validation on auth endpoints
- [x] Amount validation on financial endpoints
- [x] Sort order allowlist validation (ASC/DESC only)
- [x] XSS prevention test suite (16 payloads, 28 tests)
- [x] SQL injection test suite (14 payloads, 69 tests)
- [x] Validation utility test suite (43 tests)
- [x] Security test integration runner
- [x] SQL injection scan script (`npm run security:scan-sql`)
- [x] Validation audit script (`npm run security:audit-validation`)
- [x] Input validation documentation (`docs/INPUT_VALIDATION.md`)
- [x] notification.controller.js UUID validation fixes

### Future
- [ ] RLS Phase 1: Read isolation
- [ ] RLS Phase 2: Write isolation
- [ ] RLS Phase 3: Superadmin bypass
- [ ] Encryption key rotation procedure
- [ ] Data backup encryption
- [ ] Redis-backed rate limiting (multi-instance)
- [ ] API key authentication for external integrations
