# Tomorrow's Action Plan — Security & Mobile Blitz Day
**Date:** 2026-03-12 (Wednesday)
**Goal:** 100% Production-Ready HR-ERP System
**Working Hours:** 09:00 - 18:00 (9 hours, 7.5 effective)

---

## Daily Schedule

### Phase 1: Critical Security Fixes (09:00 - 12:00)

| Time | Task | Duration | Details |
|------|------|----------|---------|
| 09:00 | Morning setup | 15 min | Coffee, open IDE, `docker-compose up`, verify backend health |
| 09:15 | C-01: Rotate exposed API keys | 15 min | New Anthropic key, new GitHub token, update .env |
| 09:30 | C-05: Fix CORS wildcard | 10 min | Replace `'*'` fallback with localhost array |
| 09:40 | C-06: Strong DB password | 10 min | Generate with `openssl rand -base64 32`, update .env + docker-compose |
| 09:50 | C-07: Replace JWT secret | 10 min | Generate 64-byte random key, update .env |
| 10:00 | C-02: Remove test credentials | 10 min | Delete hardcoded email/password from Login.jsx |
| 10:10 | C-03: Login brute force protection | 30 min | Add loginLimiter middleware, failed_login_attempts column, account lockout |
| 10:40 | **BREAK** | 10 min | Stand up, stretch, hydrate |
| 10:50 | C-04: Invoice status state machine | 25 min | Add validTransitions map, reject invalid transitions |
| 11:15 | C-09: Token storage (httpOnly cookies) | 30 min | Backend: set cookie on login. Frontend: remove localStorage usage |
| 11:45 | C-10: Refresh token invalidation | 15 min | Add Redis blacklist on logout |

**Phase 1 Success Criteria:**
- [ ] All 12 critical issues addressed
- [ ] Login rate limited to 5 attempts / 15 min
- [ ] CORS only allows localhost:3001 and localhost:19006
- [ ] JWT secret is cryptographically random
- [ ] No test credentials visible in UI
- [ ] Invoice status transitions validated

---

### Phase 2: High Priority Security (12:15 - 14:00)

| Time | Task | Duration | Details |
|------|------|----------|---------|
| 12:15 | H-10: Bind DB/Redis to localhost | 10 min | Change docker-compose ports to 127.0.0.1:port |
| 12:25 | H-11: Redis authentication | 10 min | Add requirepass to Redis config |
| 12:35 | H-01: Invoice amount validation | 15 min | Reject negative/zero/overflow amounts |
| 12:50 | H-02: Overpayment protection | 15 min | Check totalPaid + new <= invoiceTotal |
| 13:05 | **LUNCH BREAK** | 30 min | Away from screen. Eat properly. |
| 13:35 | H-08: API request timeout | 5 min | Add `timeout: 30000` to Axios instance |
| 13:40 | H-15: Pagination defaults | 15 min | Add `Math.min(limit, 100)` to all list endpoints |
| 13:55 | H-16: Password complexity | 15 min | Min 12 chars, uppercase, number, special char |
| 14:10 | H-18: Search input max length | 5 min | Add `q.length > 100` check |

**Phase 2 Success Criteria:**
- [ ] Database only accessible from localhost
- [ ] Redis password-protected
- [ ] No negative invoices possible
- [ ] No overpayments accepted
- [ ] All list endpoints paginated (max 100)
- [ ] Strong password requirements enforced

---

### Phase 3: Dependency Fixes (14:15 - 15:15)

| Time | Task | Duration | Details |
|------|------|----------|---------|
| 14:15 | C-11: Replace xlsx with exceljs | 20 min | `npm uninstall xlsx && npm install exceljs`, update imports |
| 14:35 | H-13: Replace react-quill | 15 min | Switch to @tiptap/react or react-quill-new |
| 14:50 | H-14: Replace pdf-parse | 15 min | Switch to pdfjs-dist |
| 15:05 | Run npm audit fix on all 3 projects | 10 min | Backend, frontend, mobile |

**Phase 3 Success Criteria:**
- [ ] Zero HIGH severity npm audit findings
- [ ] xlsx replaced in both backend and frontend
- [ ] react-quill replaced
- [ ] pdf-parse replaced
- [ ] All tests still passing

---

### Phase 4: Mobile Testing (15:15 - 17:00)

| Time | Task | Duration | Details |
|------|------|----------|---------|
| 15:15 | **BREAK** | 10 min | Walk, fresh air |
| 15:25 | Fix Expo startup issues | 20 min | Check package.json, resolve dependency conflicts |
| 15:45 | iOS Simulator testing | 30 min | Test all screens, navigation, API connectivity |
| 16:15 | Android Emulator testing | 30 min | Test all screens, verify layout on different sizes |
| 16:45 | Fix mobile-specific bugs | 15 min | Address any issues found during testing |

**Phase 4 Success Criteria:**
- [ ] `npx expo start` runs without errors
- [ ] iOS Simulator: all screens load, API calls work
- [ ] Android Emulator: all screens load, API calls work
- [ ] No console errors in React Native debugger

---

### Phase 5: Final Validation & Wrap-Up (17:00 - 18:00)

| Time | Task | Duration | Details |
|------|------|----------|---------|
| 17:00 | Run full backend test suite | 10 min | `npm test` — target: 84/84 passing |
| 17:10 | Run security test suite | 10 min | Re-run AUTOMATED_TEST_SUITE.js |
| 17:20 | E2E smoke test in Chrome | 15 min | Login, dashboard, create project, create invoice |
| 17:35 | Update test reports | 10 min | Update SECURITY_AUDIT_REPORT.md with fixes applied |
| 17:45 | Git commit + push | 5 min | Final commit with all changes |
| 17:50 | Write PRODUCTION_READINESS.md | 10 min | Document remaining items, deployment checklist |

**Phase 5 Success Criteria:**
- [ ] 84/84 backend tests passing
- [ ] Security test failures reduced from 13 to < 5
- [ ] E2E smoke test clean
- [ ] All changes committed and pushed
- [ ] Production readiness documented

---

## Break Schedule & Energy Management

| Time | Break Type | Duration | Activity |
|------|-----------|----------|----------|
| 10:40 | Micro-break | 10 min | Stand, stretch, water |
| 13:05 | Lunch | 30 min | Full meal, away from screen |
| 15:15 | Activity break | 10 min | Walk outside, fresh air |
| 16:45 | Eye rest | 5 min | Look away from screen, 20-20-20 rule |

**Energy Tips:**
- Start with config changes (low cognitive load) to warm up
- Tackle the hardest items (token storage, brute force) mid-morning when focus peaks
- Save mechanical tasks (npm audit, test runs) for afternoon energy dip
- Mobile testing is hands-on and engaging — good for late afternoon

---

## Prep Checklist (Tonight)

- [ ] Top up Anthropic API credits (console.anthropic.com)
- [ ] Verify Docker Desktop is updated
- [ ] Charge laptop
- [ ] Install/update Xcode Command Line Tools (for iOS Simulator)
- [ ] Install/update Android Studio + emulator image
- [ ] Review SECURITY_FIXES_ROADMAP.md for fix details
- [ ] Prepare a clean git branch: `git checkout -b security-blitz-day`
- [ ] Set phone to Do Not Disturb for deep work blocks

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Token migration breaks auth flow | Keep localStorage fallback with feature flag, test thoroughly |
| xlsx replacement breaks Excel import/export | Test with actual .xlsx files before removing old package |
| Mobile Expo won't start | Have `expo doctor` output ready, check Node version compatibility |
| Running out of time | Prioritize Critical > High > Dependencies > Mobile. Skip Low items |
| Docker issues | Keep `docker-compose logs -f` open in separate terminal |

---

## Final Goal Checklist

By 18:00 tomorrow, the system should be:

- [ ] **12/12 Critical security issues** fixed
- [ ] **12/18 High security issues** fixed (minimum)
- [ ] **0 HIGH npm audit vulnerabilities**
- [ ] **Mobile app running** on both iOS and Android
- [ ] **84+ backend tests** passing
- [ ] **< 5 security test failures** (down from 13)
- [ ] **All changes committed** and pushed to GitHub
- [ ] **Production readiness** documented

**Target: 95% -> 100% production-ready**
