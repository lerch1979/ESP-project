# Production Security Checklist

**Project:** HR-ERP Backend API
**Date:** 2026-03-13

Complete all items before deploying to production.

---

## 1. Encryption & Keys

- [ ] `ENCRYPTION_KEY` is set in production .env (64-char hex, generated via `npm run security:generate-key`)
- [ ] `ENCRYPTION_KEY` is stored in a secure vault (not in git, not in plaintext config files)
- [ ] `ENCRYPTION_KEY` backup procedure is documented and tested
- [ ] Key rotation schedule is established (recommended: quarterly)
- [ ] All existing PII data has been encrypted (`npm run security:encrypt-pii`)

## 2. Database Security

- [ ] `DB_SSL=true` is set in production .env
- [ ] `DB_SSL_REJECT_UNAUTHORIZED=true` (enforce certificate validation)
- [ ] `DB_SSL_CA` points to valid CA certificate (if using custom CA)
- [ ] PostgreSQL server has `ssl = on` in postgresql.conf
- [ ] Database is not publicly accessible (firewall/VPC restricted)
- [ ] Database user has minimum required privileges (no SUPERUSER)
- [ ] Database password is strong (32+ characters, random)
- [ ] Connection pooling is configured with appropriate limits
- [ ] Audit triggers are installed (`migrations/audit_triggers.sql`)

## 3. Rate Limiting

- [ ] `RATE_LIMIT_ENABLED=true` in production .env
- [ ] Rate limit values are appropriate for expected traffic:
  - Global: 100 req/15min (adjust based on traffic)
  - Auth: 5 req/15min (strict for brute force prevention)
  - Password Reset: 3 req/hour
  - File Upload: 10 req/hour
  - Authenticated: 1000 req/hour per user
- [ ] Consider Redis-backed store for multi-instance deployments
- [ ] Rate limit violation alerting is configured

## 4. CSRF Protection

- [ ] `CSRF_ENABLED=true` in production .env (or not set — defaults to true)
- [ ] Frontend sends `x-csrf-token` header on all mutating requests
- [ ] Frontend fetches CSRF token from `GET /api/v1/csrf-token` on app init
- [ ] CSRF cookie `sameSite` is `strict` (default)
- [ ] CSRF exempt paths are reviewed and minimal

## 5. Security Headers

- [ ] `SECURITY_HEADERS_ENABLED=true` in production .env (or not set — defaults to true)
- [ ] `NODE_ENV=production` is set (switches CSP from report-only to enforcement)
- [ ] CSP report URI is configured (`CSP_REPORT_URI` in .env)
- [ ] CSP violation monitoring is in place
- [ ] Verify headers with: `curl -I https://your-domain.com/api/v1/health`
  - [ ] `X-Frame-Options: DENY`
  - [ ] `Strict-Transport-Security` present
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `Content-Security-Policy` present
  - [ ] `Permissions-Policy` present

## 6. HTTPS / TLS

- [ ] SSL certificate is installed and valid
- [ ] HTTP → HTTPS redirect is configured (at reverse proxy/load balancer)
- [ ] TLS 1.2+ enforced (disable TLS 1.0/1.1)
- [ ] HSTS header is active (set by Helmet)
- [ ] Certificate auto-renewal is configured (Let's Encrypt / ACM)

## 7. Authentication & Authorization

- [ ] JWT secret (`JWT_SECRET`) is strong (64+ characters, random)
- [ ] JWT token expiry is appropriate (recommended: 1-8 hours)
- [ ] Refresh token mechanism is in place (if using long sessions)
- [ ] Password hashing uses bcrypt with appropriate cost factor (default: 10)
- [ ] Password minimum length is enforced (8 characters)

## 8. Input Validation

- [ ] All security tests pass: `npm run test:security`
- [ ] Integration tests pass: `npx jest tests/integration/`
- [ ] SQL injection scan is clean: `npm run security:scan-sql`
- [ ] Validation audit is reviewed: `npm run security:audit-validation`
- [ ] No `npm audit` critical/high vulnerabilities

## 9. Logging & Monitoring

- [ ] Application logs are sent to centralized logging (ELK, CloudWatch, etc.)
- [ ] Rate limit violations are monitored and alerted
- [ ] CSRF failures are monitored
- [ ] CSP violations are monitored
- [ ] Failed login attempts are tracked
- [ ] Encryption errors trigger alerts
- [ ] Log files are rotated and archived

## 10. Infrastructure

- [ ] Firewall rules restrict access to necessary ports only
- [ ] SSH access uses key-based auth (no password login)
- [ ] Server OS and packages are up to date
- [ ] Node.js version is LTS and up to date
- [ ] npm dependencies are audited (`npm audit`)
- [ ] Reverse proxy (nginx/Apache) is configured with security best practices
- [ ] DDoS protection is in place (Cloudflare, AWS Shield, etc.)

## 11. Backup & Recovery

- [ ] Automated backups are running (`npm run backup:now`)
- [ ] Backups are encrypted at rest
- [ ] Backup restore procedure is documented and tested
- [ ] `ENCRYPTION_KEY` is backed up separately from database backups
- [ ] Recovery time objective (RTO) is documented

## 12. Incident Response

- [ ] Security incident response plan is documented
- [ ] Contact list for security incidents is maintained
- [ ] Incident communication templates are prepared
- [ ] Post-incident review process is defined
- [ ] Security patch deployment process is fast-tracked

## 13. Compliance

- [ ] GDPR data subject access request (DSAR) process is documented
- [ ] Data retention policy is defined and enforced
- [ ] Privacy policy covers PII handling
- [ ] Data processing agreement (DPA) with hosting provider
- [ ] PII encryption satisfies regulatory requirements

---

## Pre-Deployment Verification Commands

```bash
# 1. Run all security tests
npm run test:security

# 2. Run integration security flow
npx jest tests/integration/security-flow.test.js

# 3. Scan for SQL injection
npm run security:scan-sql

# 4. Audit validation coverage
npm run security:audit-validation

# 5. Check npm vulnerabilities
npm audit

# 6. Verify encryption works
node -e "require('dotenv').config(); const e=require('./src/services/encryption.service'); const t='test'; console.log(e.decrypt(e.encrypt(t))===t?'PASS':'FAIL')"

# 7. Test all application tests
npm test
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Security Reviewer | | | |
| DevOps/Infra | | | |
| Project Manager | | | |
