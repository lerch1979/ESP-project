# Production Security Guide

## Security Architecture Overview

The HR-ERP backend implements defense-in-depth security with multiple layers protecting sensitive HR data.

---

### 1. PII Encryption (AES-256-CBC)

**11 encrypted employee fields:**
- `social_security_number` (TAJ szam)
- `passport_number` (utlevelszam)
- `bank_account` (bankszamlaszam)
- `tax_id` (adoazonosito)
- `company_phone` (telefonszam)
- `mothers_name` (anyja neve - legally protected in Hungary)
- `company_email` (vallalati email)
- `permanent_address_street`, `permanent_address_city`, `permanent_address_zip`, `permanent_address_number`

**2 encrypted user fields:**
- `email`
- `phone`

**Implementation:**
- AES-256-CBC with random IV per encryption
- Format: `iv:encryptedData` (hex-encoded)
- Automatic encrypt on INSERT/UPDATE, decrypt on SELECT
- Backward-compatible: handles plaintext for unencrypted legacy data
- Key: `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- Key version tracking for rotation support

**Key Management:**
- Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Rotation: `ENCRYPTION_KEY_NEW=<new-key> node scripts/rotate-encryption-key.js`
- Dry run: `ENCRYPTION_KEY_NEW=<new-key> node scripts/rotate-encryption-key.js --dry-run`

### 2. Row-Level Security (PostgreSQL RLS)

**RLS-enabled tables:**
- `employees` - contractor isolation
- `users` - contractor isolation + self-access
- `tickets` - contractor isolation
- `invoices` - contractor isolation
- `salary_bands` - admin/data_controller access
- `documents` - contractor isolation
- `projects` - contractor isolation

**Session variables (set per request):**
- `app.current_user_id` - authenticated user UUID
- `app.current_contractor_id` - user's contractor UUID
- `app.current_role` - highest-privilege role

**Middleware:** `src/middleware/setDatabaseUser.js`

### 3. Audit Logging (Database Triggers)

**Audited tables (11 total):**
- `employees` - all PII changes tracked
- `users` - account changes tracked
- `invoices` - financial data changes
- `salary_bands` - compensation changes
- `employee_salaries` - salary changes
- `tickets` - ticket lifecycle
- `projects` - project changes
- `payments` - payment tracking
- `chatbot_knowledge_base` - FAQ content changes
- `permissions` - permission changes
- `role_permissions` - role assignment changes

**Audit record structure:**
- `entity_type` - table name
- `entity_id` - record UUID
- `action` - INSERT/UPDATE/DELETE
- `changes` - JSONB with old/new values (only changed fields)
- `user_id` - who made the change (from app session)
- `created_at` - timestamp

**Views:** `audit_summary` - 30-day aggregated stats by table/action

### 4. Password Policies

| Policy | Value |
|--------|-------|
| Minimum length | 12 characters |
| Complexity | Uppercase + lowercase + digit + special character |
| History | Last 5 passwords cannot be reused |
| Expiration | 90 days |
| Account lockout | 10 failed attempts -> 30 min lockout |
| Breach check | HaveIBeenPwned API (k-anonymity) |
| Common password list | Blocked |
| Repeated characters | Max 3 consecutive identical chars |

### 5. Authentication & Authorization

- **JWT Bearer tokens** (15 min access, 7 day refresh)
- **bcrypt** password hashing (salt rounds: 10)
- **Role-based access control** (7 roles)
- **Permission-based access** (fine-grained)
- **Multi-tenant isolation** (contractor_id on all queries)
- **RLS enforcement** at database level

### 6. Rate Limiting

| Endpoint | Production | Development |
|----------|-----------|-------------|
| Global | 1,000/15min | 10,000/15min |
| Auth (login) | 5/15min | 1,000/15min |
| Password reset | 3/hour | 100/hour |
| File upload | 50/hour | 1,000/hour |
| Authenticated | 10,000/hour | 100,000/hour |

### 7. CSRF Protection

- Double-submit cookie pattern
- 32-byte random tokens
- 24-hour cookie lifetime
- Safe methods (GET, HEAD, OPTIONS) exempt
- JWT Bearer requests exempt (inherently CSRF-safe)

### 8. Security Headers (Helmet.js)

- **CSP**: `default-src 'self'`
- **X-Frame-Options**: DENY
- **HSTS**: 1 year, includeSubDomains, preload
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: camera, microphone, geolocation disabled
- **Cache-Control**: no-store for API responses

### 9. SSL/TLS Enforcement

- **Database**: SSL configurable via `DB_SSL=true`
- **API**: HTTPS enforcement in production (HTTP->HTTPS redirect)
- **HSTS**: 1 year max-age with preload
- **External APIs**: Certificate verification enforced in production
- **Configuration**: `src/config/ssl.config.js`

### 10. Security Monitoring

**Security events tracked:**
- `login_failed` - failed login attempts
- `login_success` - successful logins
- `account_locked` - account lockouts (CRITICAL)
- `password_changed` - password changes
- `password_expired` - expired password warnings
- `pii_accessed` - PII data access
- `permission_denied` - unauthorized access attempts
- `suspicious_activity` - brute force detection (CRITICAL)
- `rate_limit_hit` - rate limit violations
- `csrf_violation` - CSRF token failures

**Brute force detection:** 5+ failed logins from same IP in 10 min -> CRITICAL alert

**Reports:** `getSecuritySummary(days)`, `getCriticalEvents()`, `getSuspiciousIPs()`

### 11. Input Validation

- UUID format validation on all IDs
- HTML tag stripping on all text inputs
- SQL injection prevention (parameterized queries only)
- Email format validation
- Pagination limits enforced
- File upload size limits (10MB max)

---

## Configuration Checklist

```bash
# Required for production
JWT_SECRET=<random-256-bit-key>
ENCRYPTION_KEY=<64-char-hex-key>
ENCRYPTION_KEY_VERSION=1
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
NODE_ENV=production
CORS_ORIGIN=https://your-domain.com

# Optional (recommended)
DB_SSL_CA=/path/to/ca-cert.pem
LOG_LEVEL=info
```

---

## GDPR Compliance

### Data Protection Measures

| GDPR Article | Requirement | Implementation |
|--------------|-------------|----------------|
| Art. 5(1)(f) | Integrity & confidentiality | AES-256-CBC encryption, RLS, audit trails |
| Art. 25 | Data protection by design | PII encryption at rest, parameterized queries |
| Art. 30 | Records of processing | Audit triggers on all sensitive tables |
| Art. 32 | Security of processing | Encryption, access control, monitoring |
| Art. 33 | Breach notification | Security monitoring with CRITICAL alerts |
| Art. 35 | Data protection impact assessment | Complete audit trail, security documentation |

### Data Subject Rights

| Right | Support |
|-------|---------|
| Access (Art. 15) | Employee data export via API |
| Rectification (Art. 16) | Update endpoints with audit trail |
| Erasure (Art. 17) | Soft-delete with audit trail |
| Portability (Art. 20) | JSON/CSV export functionality |

### Hungarian Specifics

- **Anyja neve (Mother's name)**: Legally protected PII in Hungary, encrypted at rest
- **TAJ szam (SSN)**: Encrypted, access logged
- **Adoazonosito (Tax ID)**: Encrypted, access logged

---

## Incident Response Plan

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 - Critical | Data breach, system compromise | < 1 hour |
| P2 - High | Brute force detected, account compromise | < 4 hours |
| P3 - Medium | Rate limit abuse, suspicious patterns | < 24 hours |
| P4 - Low | Policy violation, configuration issue | < 1 week |

### Response Procedures

**1. Detection**
- Security monitoring service detects anomaly
- CRITICAL events trigger immediate alerts
- Daily security summary reports

**2. Containment**
- Account lockout (automatic after 10 failed attempts)
- Rate limiting (automatic per-IP)
- Manual IP blocking if needed

**3. Investigation**
- Review `security_events` table
- Check `activity_logs` for affected records
- Correlate with application logs

**4. Recovery**
- Reset compromised credentials
- Rotate encryption keys if needed
- Restore from audit trail if data modified

**5. Reporting**
- GDPR breach notification within 72 hours if applicable
- Internal security incident report
- Update security measures based on findings

---

## Monitoring Procedures

### Daily Checks
1. Review security summary: `SELECT * FROM audit_summary`
2. Check for critical events in `security_events`
3. Review suspicious IPs via `getSuspiciousIPs()`
4. Verify all services are running

### Weekly Checks
1. Review password expiration status
2. Check audit log volume and retention
3. Verify backup integrity
4. Review rate limiting effectiveness

### Monthly Checks
1. Rotate encryption keys (if policy requires)
2. Review and update security documentation
3. Test incident response procedures
4. Update dependencies for security patches

---

## Security Update Procedures

1. **Dependencies**: Run `npm audit` weekly, update critical fixes immediately
2. **Encryption keys**: Rotate quarterly using `scripts/rotate-encryption-key.js`
3. **JWT secrets**: Rotate annually, coordinate with active session management
4. **SSL certificates**: Auto-renew with Let's Encrypt or similar
5. **Database**: Keep PostgreSQL updated, apply security patches

---

## Files Reference

| Category | Files |
|----------|-------|
| Encryption | `src/services/encryption.service.js` |
| Password Policy | `src/middleware/passwordPolicy.js` |
| Security Monitor | `src/services/securityMonitor.service.js` |
| RLS Middleware | `src/middleware/setDatabaseUser.js` |
| SSL Config | `src/config/ssl.config.js` |
| Auth Middleware | `src/middleware/auth.js` |
| Rate Limiting | `src/middleware/rateLimiter.js` |
| CSRF | `src/middleware/csrf.js` |
| Security Headers | `src/middleware/securityHeaders.js` |
| Validation | `src/utils/validation.js` |
| Key Rotation | `scripts/rotate-encryption-key.js` |
| Migrations | `migrations/040-057` |
| Tests | `tests/pii-encryption.test.js`, `tests/passwordPolicy.test.js`, `tests/securityMonitor.test.js`, `tests/rls.test.js`, `tests/ssl-config.test.js`, `tests/security/comprehensive-security.test.js` |
