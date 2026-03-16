# Production Security Guide

## Security Architecture Overview

The HR-ERP backend implements defense-in-depth security with the following layers:

### 1. PII Encryption (AES-256-CBC)

**6 encrypted fields** in the employees table:
- `social_security_number` (TAJ szám)
- `passport_number` (útlevélszám)
- `bank_account` (bankszámlaszám)
- `tax_id` (adóazonosító)
- `company_phone` (telefonszám)
- `mothers_name` (anyja neve — legally protected in Hungary)

**Implementation:**
- AES-256-CBC with random IV per encryption
- Format: `iv:encryptedData` (hex-encoded)
- Automatic encrypt on INSERT/UPDATE, decrypt on SELECT
- Backward-compatible: handles plaintext for unencrypted legacy data
- Key: `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)

Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 2. Audit Logging (Database Triggers)

**Audited tables:**
- `employees` — all PII changes tracked
- `users` — account changes tracked
- `invoices` — financial data changes
- `salary_bands` — compensation changes
- `employee_salaries` — salary changes
- `tickets` — ticket lifecycle
- `projects` — project changes
- `payments` — payment tracking
- `chatbot_knowledge_base` — FAQ content changes
- `permissions` — permission changes
- `role_permissions` — role assignment changes

**Audit record structure:**
- `entity_type` — table name
- `entity_id` — record UUID
- `action` — INSERT/UPDATE/DELETE
- `changes` — JSONB with old/new values (only changed fields)
- `user_id` — who made the change (from app session)
- `created_at` — timestamp

**Views:** `audit_summary` — 30-day aggregated stats by table/action

### 3. Password Policies

| Policy | Value |
|--------|-------|
| Minimum length | 12 characters |
| Complexity | Uppercase + lowercase + digit + special character |
| History | Last 5 passwords cannot be reused |
| Expiration | 90 days |
| Account lockout | 10 failed attempts → 30 min lockout |
| Breach check | HaveIBeenPwned API (k-anonymity) |
| Common password list | Blocked |
| Repeated characters | Max 3 consecutive identical chars |

### 4. Authentication & Authorization

- **JWT Bearer tokens** (15 min access, 7 day refresh)
- **bcrypt** password hashing (salt rounds: 10)
- **Role-based access control** (7 roles)
- **Permission-based access** (fine-grained)
- **Multi-tenant isolation** (contractor_id on all queries)

### 5. Rate Limiting

| Endpoint | Production | Development |
|----------|-----------|-------------|
| Global | 1,000/15min | 10,000/15min |
| Auth (login) | 5/15min | 1,000/15min |
| Password reset | 3/hour | 100/hour |
| File upload | 50/hour | 1,000/hour |
| Authenticated | 10,000/hour | 100,000/hour |

### 6. CSRF Protection

- Double-submit cookie pattern
- 32-byte random tokens
- 24-hour cookie lifetime
- Safe methods (GET, HEAD, OPTIONS) exempt

### 7. Security Headers (Helmet.js)

- **CSP**: `default-src 'self'`
- **X-Frame-Options**: DENY
- **HSTS**: 1 year, includeSubDomains
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: camera, microphone, geolocation disabled

### 8. Security Monitoring

**Security events tracked:**
- `login_failed` — failed login attempts
- `login_success` — successful logins
- `account_locked` — account lockouts (CRITICAL)
- `password_changed` — password changes
- `pii_accessed` — PII data access
- `suspicious_activity` — brute force detection (CRITICAL)
- `rate_limit_hit` — rate limit violations
- `csrf_violation` — CSRF token failures

**Brute force detection:** 5+ failed logins from same IP in 10 min → CRITICAL alert

**Reports:** `getSecuritySummary(days)`, `getCriticalEvents()`, `getSuspiciousIPs()`

### 9. Input Validation

- UUID format validation on all IDs
- HTML tag stripping on all text inputs
- SQL injection prevention (parameterized queries only)
- Email format validation
- Pagination limits enforced
- File upload size limits (10MB max)

## Configuration Checklist

```bash
# Required for production
JWT_SECRET=<random-256-bit-key>
ENCRYPTION_KEY=<64-char-hex-key>
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
CSRF_ENABLED=true
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
NODE_ENV=production
```

## Compliance

| Requirement | Status |
|-------------|--------|
| PII encryption at rest | Done (AES-256-CBC) |
| Audit trail for sensitive data | Done (DB triggers) |
| Password complexity | Done (12 char + complexity) |
| Account lockout | Done (10 attempts → 30 min) |
| Session management | Done (JWT 15 min) |
| Input validation | Done (all endpoints) |
| Rate limiting | Done (tiered) |
| CSRF protection | Done (double-submit) |
| Security headers | Done (Helmet.js) |
| Multi-tenant isolation | Done (contractor_id) |
| Security event logging | Done (security_events table) |
| Breach detection | Done (HaveIBeenPwned API) |

## Files

| Category | Files |
|----------|-------|
| Encryption | `src/services/encryption.service.js` |
| Password Policy | `src/middleware/passwordPolicy.js` |
| Security Monitor | `src/services/securityMonitor.service.js` |
| Auth Middleware | `src/middleware/auth.js`, `src/middleware/permission.js` |
| Rate Limiting | `src/middleware/rateLimiter.js` |
| CSRF | `src/middleware/csrf.js` |
| Security Headers | `src/middleware/securityHeaders.js` |
| Validation | `src/utils/validation.js`, `src/middleware/validate.js` |
| Migrations | `migrations/040-056` |
| Tests | `tests/encryption.test.js`, `tests/passwordPolicy.test.js`, `tests/securityMonitor.test.js` |
