# 🔄 AGENT WORKFLOWS - EGYÜTTMŰKÖDÉSI PROTOKOLLOK

**Verzió:** 1.0  
**Dátum:** 2026-03-07  

---

## 📋 TARTALOMJEGYZÉK

1. [Daily Workflow](#daily-workflow)
2. [Sprint Workflow](#sprint-workflow)
3. [Feature Development Flow](#feature-development-flow)
4. [Emergency Response](#emergency-response)
5. [Agent Communication Protocols](#agent-communication-protocols)

---

## 🌅 DAILY WORKFLOW

### **06:00 - Morning Sync (Automated)**

```
┌─────────────────────────────────────────────────┐
│ CEO Agent                                       │
│ └─> GitHub Issues review                        │
│ └─> Priority ranking for today                  │
│ └─> Slack post: "Today's Priorities"            │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ CTO Agent                                       │
│ └─> Architecture review (if needed)             │
│ └─> Tech debt assessment                        │
│ └─> Assign tasks to Dev Agents                  │
└─────────────────────────────────────────────────┘
```

**Output példa (Slack):**

```
🌅 **Good Morning! Daily Priorities - 2026-03-07**

**HIGH PRIORITY:**
1. 🔴 Invoice API endpoint (Backend Agent)
2. 🔴 Mobile invoice list screen (Mobile Agent)

**MEDIUM PRIORITY:**
3. 🟡 Dashboard performance optimization (CTO review needed)
4. 🟡 Cost center model (Backend Agent)

**LOW PRIORITY:**
5. 🟢 Documentation updates
6. 🟢 Refactoring old code

**Blockers:**
- ⚠️ Expo tunnel unstable → Use local network mode
- ⚠️ Backend not running → Start docker-compose

**Assigned Tasks:**
- Backend Agent → Task #1, #4
- Mobile Agent → Task #2
- CTO Agent → Task #3 review

Let's ship it! 🚀
```

---

### **09:00-17:00 - Active Development**

```
┌──────────────────┐
│ Backend Agent    │  ←──┐
│ Working on:      │     │
│ - Invoice API    │     │ Parallel
│ - Cost center    │     │ work
└──────────────────┘     │
                         │
┌──────────────────┐     │
│ Mobile Agent     │  ←──┘
│ Working on:      │
│ - Invoice screens│
└──────────────────┘
         │
         │ Completed
         ▼
┌──────────────────┐
│ QA Agent         │
│ - Run tests      │
│ - Report results │
└──────────────────┘
         │
         │ If pass
         ▼
┌──────────────────┐
│ Git Commit       │
│ Auto push        │
└──────────────────┘
```

**Backend Agent példa workflow:**

```python
# 09:00 - Start work
task = "Create Invoice API endpoint"

# 09:05 - Claude Code generates code
# Files created:
# - src/controllers/invoice.controller.js
# - src/services/invoice.service.js
# - src/models/invoice.model.js
# - tests/invoice.test.js

# 09:30 - Self-test
run_tests()  # All tests pass ✅

# 09:35 - Lint check
run_linter()  # No issues ✅

# 09:40 - Git commit
git_commit("feat: Add Invoice API CRUD endpoints")

# 09:41 - Notify QA Agent
slack_notify("#dev-qa", "Invoice API ready for testing")

# 09:45 - Start next task
task = "Create Cost Center model"
```

---

### **14:00 - Daily Standup (Automated)**

**Triggered by:** Cron job vagy GitHub Action

```python
# daily_standup.py (running on server)

def generate_standup():
    # Collect data
    commits = get_git_commits_last_24h()
    issues = get_github_issues()
    test_results = get_ci_results()
    
    # AI generates report
    report = ai_generate_standup_report({
        'commits': commits,
        'issues': issues,
        'tests': test_results
    })
    
    # Post to Slack
    slack_post(channel="#daily-standup", message=report)
```

**Output példa:**

```
🤖 **Daily Standup - 2026-03-07 14:00**

**✅ COMPLETED (last 24h):**

**Backend Agent:**
- Invoice API (GET, POST, PUT, DELETE) ✅
- Cost Center model ✅
- 18 tests added (all passing) ✅

**Mobile Agent:**
- InvoiceListScreen component ✅
- InvoiceCard component ✅
- Navigation integration ✅

**Frontend Agent:**
- Invoice table view (admin) ✅
- Pagination component ✅

**🚧 IN PROGRESS:**

**Backend Agent:**
- Payment tracking logic (70% complete, ETA: EOD)

**Mobile Agent:**
- InvoiceDetailScreen (50% complete, ETA: Tomorrow 10:00)

**⚠️ BLOCKERS:**

**Mobile Agent:**
- Waiting for Payment API (Backend Agent working on it)

**📊 METRICS:**
- Commits today: 12
- Tests passed: 156/156 (100%)
- Code coverage: 82% (target: 80%) ✅
- Build time: 3m 42s

**🎯 TONIGHT'S GOAL:**
- Payment tracking complete
- InvoiceDetailScreen at 80%+
- Regression suite passing

Keep crushing it! 💪
```

---

### **20:00 - Nightly Build & Test**

```
┌─────────────────────────────────────────────────┐
│ DevOps Agent                                    │
│ 1. Checkout latest main                         │
│ 2. Build Docker images                          │
│ 3. Deploy to staging                            │
│ 4. Health check                                 │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ QA Agent                                        │
│ 1. Run full regression suite (E2E)              │
│ 2. Performance tests (Lighthouse)               │
│ 3. Security scan (Snyk)                         │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Report Generator                                │
│ - Test results summary                          │
│ - Performance metrics                           │
│ - Security vulnerabilities (if any)             │
│ - Post to Slack                                 │
└─────────────────────────────────────────────────┘
```

**Nightly Report példa:**

```
🌙 **Nightly Build Report - 2026-03-07 20:30**

**BUILD STATUS:** ✅ SUCCESS

**TESTS:**
- Unit: 156/156 ✅
- Integration: 42/42 ✅
- E2E: 18/18 ✅
- Total: 216/216 (100%)

**PERFORMANCE:**
- Homepage: 92/100 (Lighthouse) ✅
- Dashboard: 88/100 ✅
- Invoice List: 85/100 ⚠️ (target: 90+)
  └─> Recommendation: Implement virtualization for large lists

**SECURITY:**
- Dependencies: 0 critical, 2 moderate
  └─> axios: 1.7.0 → 1.7.2 (upgrade recommended)
  └─> express: 4.18.0 → 4.19.1 (security patch)

**COVERAGE:**
- Backend: 82% ✅
- Frontend: 71% ✅
- Mobile: 68% ⚠️ (target: 70%)

**ACTION ITEMS:**
1. Mobile Agent: Add tests for InvoiceDetailScreen
2. DevOps Agent: Update dependencies (axios, express)
3. Mobile Agent: Optimize InvoiceList performance

**DEPLOYMENT:**
- Staging: ✅ Deployed (v1.2.34)
- Production: ⏸️ Waiting for manual approval

Sleep tight! Tomorrow we ship! 😴🚀
```

---

## 🏃 SPRINT WORKFLOW

### **Sprint Planning (Monday 09:00)**

```
┌─────────────────────────────────────────────────┐
│ CEO Agent                                       │
│ 1. Review backlog                               │
│ 2. Prioritize based on business value           │
│ 3. Propose sprint goals                         │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ CTO Agent                                       │
│ 1. Technical feasibility check                  │
│ 2. Estimate complexity                          │
│ 3. Identify dependencies                        │
│ 4. Allocate to agents                           │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Advisory Layer                                  │
│ - UX Advisor: Design review                     │
│ - Legal Advisor: Compliance check               │
│ - Logic Advisor: Algorithm optimization         │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Sprint Kickoff                                  │
│ - GitHub Project board updated                  │
│ - Tasks assigned to agents                      │
│ - Timeline set                                  │
└─────────────────────────────────────────────────┘
```

**Sprint Planning Output (GitHub Projects):**

```
Sprint 2: Pénzügy Modul (2 weeks)

**SPRINT GOALS:**
1. Invoice management (mobile + admin)
2. Cost center tracking
3. Payment processing

**TASKS:**

🔴 HIGH PRIORITY (Must Have):
- [ ] Invoice API (Backend Agent) - 3 points
- [ ] Invoice List Screen (Mobile Agent) - 2 points
- [ ] Invoice Detail Screen (Mobile Agent) - 3 points
- [ ] Cost Center model (Backend Agent) - 2 points

🟡 MEDIUM PRIORITY (Should Have):
- [ ] Payment tracking (Backend Agent) - 3 points
- [ ] Invoice filter/search (Mobile Agent) - 2 points
- [ ] Admin invoice table (Frontend Agent) - 2 points

🟢 LOW PRIORITY (Nice to Have):
- [ ] Invoice PDF export (Backend Agent) - 2 points
- [ ] Invoice email notifications (Backend Agent) - 1 point

**TOTAL STORY POINTS:** 20
**TEAM VELOCITY:** 18 points/sprint (historical)
**RISK:** Medium (tight deadline)

**DEPENDENCIES:**
- Invoice Detail Screen depends on Invoice API
- Payment tracking depends on Cost Center model

**COMPLIANCE CHECK (Legal Advisor):**
- ✅ Invoice data retention: 7 years (GDPR compliant)
- ✅ Payment info encryption: Required
- ✅ Audit log: All invoice modifications logged
```

---

### **Mid-Sprint Check-in (Wednesday 14:00)**

```python
def mid_sprint_checkin():
    completed = count_completed_tasks()
    total = count_total_tasks()
    progress = (completed / total) * 100
    
    if progress < 40:
        alert = "⚠️ BEHIND SCHEDULE"
        action = "CEO/CTO intervention needed"
    elif progress < 60:
        alert = "⚠️ ON TRACK but watch closely"
    else:
        alert = "✅ AHEAD OF SCHEDULE"
    
    slack_post(f"""
    🏃 **Mid-Sprint Check-in - Sprint 2**
    
    Progress: {progress}% ({completed}/{total} tasks)
    Status: {alert}
    
    Completed:
    {list_completed_tasks()}
    
    Remaining:
    {list_remaining_tasks()}
    
    Action: {action if progress < 40 else "Keep going!"}
    """)
```

**Output példa:**

```
🏃 **Mid-Sprint Check-in - Sprint 2**

**Progress:** 55% (11/20 tasks)
**Status:** ✅ ON TRACK

**✅ COMPLETED:**
- Invoice API (Backend) ✅
- Invoice List Screen (Mobile) ✅
- Cost Center model (Backend) ✅
- Invoice Card component (Mobile) ✅
... +7 more

**🚧 IN PROGRESS:**
- Invoice Detail Screen (Mobile) - 60% complete
- Payment tracking (Backend) - 40% complete
- Admin invoice table (Frontend) - starting tomorrow

**⏳ NOT STARTED:**
- Invoice PDF export
- Email notifications

**VELOCITY FORECAST:**
- Current pace: 19 points (on track to hit 20!)
- Estimated completion: Friday EOD ✅

**RECOMMENDATION:**
Continue current pace. No intervention needed.
```

---

### **Sprint Review (Friday 16:00)**

```
┌─────────────────────────────────────────────────┐
│ Demo Preparation                                │
│ - DevOps Agent: Deploy to demo environment      │
│ - QA Agent: Smoke tests                         │
│ - CEO Agent: Prepare demo script                │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Demo (with stakeholders)                        │
│ - Show completed features                       │
│ - Collect feedback                              │
│ - Note bugs/improvements                        │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Retrospective                                   │
│ - What went well?                               │
│ - What can improve?                             │
│ - Action items for next sprint                  │
└─────────────────────────────────────────────────┘
```

---

### **Sprint Retrospective Template**

```markdown
# Sprint 2 Retrospective - 2026-03-14

## 📊 METRICS

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Story Points | 20 | 19 | ✅ 95% |
| Velocity | 18 | 19 | ✅ +5% |
| Test Coverage | 80% | 82% | ✅ |
| Bugs Found | <5 | 3 | ✅ |

## ✅ WHAT WENT WELL

1. **Backend Agent** completed all API tasks ahead of schedule
2. **Mobile Agent** delivered high-quality UI (UX Advisor helped!)
3. **CI/CD pipeline** caught 2 bugs before merge (prevented production issues)
4. **Daily standups** kept everyone aligned

## ⚠️ WHAT CAN IMPROVE

1. **Expo connection issues** slowed Mobile Agent testing
   - Action: Setup development build for next sprint
2. **Payment tracking** took longer than estimated (3 points → 5 actual)
   - Action: Better estimation, involve Logic Advisor early
3. **Documentation** fell behind
   - Action: Automate with AI doc generator

## 🎯 ACTION ITEMS (Sprint 3)

- [ ] DevOps Agent: Setup Expo development build
- [ ] CTO Agent: Estimation workshop (improve accuracy)
- [ ] Backend Agent: Setup AI documentation tool
- [ ] CEO Agent: Invite stakeholders to demo earlier (mid-sprint)

## 🚀 SPRINT 3 PREVIEW

**Goal:** Analytics & Reporting module
**Start Date:** 2026-03-17
**End Date:** 2026-03-28
```

---

## 🏗️ FEATURE DEVELOPMENT FLOW

### **Example: Invoice API Endpoint**

**Phase 1: Specification (CEO + CTO + Advisory)**

```yaml
Feature: Invoice API Endpoint
Priority: HIGH
Business Value: Critical for billing workflow
Technical Complexity: MEDIUM (3 story points)

Requirements:
  - CRUD operations (GET, POST, PUT, DELETE)
  - Filtering (status, client, date range)
  - Pagination (limit, offset)
  - Validation (Joi schema)
  - Authorization (JWT + role-based)
  
Compliance (Legal Advisor):
  - Invoice data retention: 7 years
  - Audit log: All modifications
  - GDPR: Personal data (client info) encrypted
  
Performance (CTO):
  - Response time: <200ms (95th percentile)
  - Database indexes on: status, client_id, created_at
  
Testing (QA):
  - Unit tests: 80%+ coverage
  - Integration tests: Happy path + edge cases
  - Load test: 100 req/s sustained
```

---

**Phase 2: Implementation (Backend Agent)**

```javascript
// Day 1: 09:00-12:00
// Backend Agent (Claude Code) generates:

// 1. Controller
// src/controllers/invoice.controller.js
exports.getAll = async (req, res) => {
  const { status, client_id, limit, offset } = req.query;
  const invoices = await invoiceService.getAll({...});
  res.json({ success: true, data: invoices });
};

// 2. Service
// src/services/invoice.service.js
exports.getAll = async (filters) => {
  let query = db('invoices').select('*');
  if (filters.status) query.where('status', filters.status);
  // ... pagination, sorting
  return await query;
};

// 3. Model
// src/models/invoice.model.js
const invoiceSchema = Joi.object({
  client_id: Joi.number().required(),
  amount: Joi.number().positive().required(),
  // ...
});

// 4. Tests
// tests/invoice.test.js
describe('Invoice API', () => {
  it('should create invoice', async () => {
    const res = await request(app).post('/api/invoices').send({...});
    expect(res.status).toBe(201);
  });
});

// 5. Routes
// src/routes/invoice.routes.js
router.get('/invoices', auth, invoiceController.getAll);
router.post('/invoices', auth, validateInvoice, invoiceController.create);

// Day 1: 12:00 - Self-test
npm test -- invoice.test.js
// ✅ All tests pass

// Day 1: 12:10 - Git commit
git commit -m "feat: Add Invoice API CRUD endpoints"
git push

// Day 1: 12:15 - Notify QA
slack_notify("Invoice API ready for integration testing")
```

---

**Phase 3: Review (CTO + QA)**

```python
# Automated review (GitHub Actions)
def review_invoice_api():
    # 1. Lint check
    run_eslint()  # ✅ No issues
    
    # 2. Test coverage
    coverage = get_coverage('invoice')
    assert coverage >= 80  # ✅ 85%
    
    # 3. Security scan
    vulnerabilities = run_snyk()
    assert len(vulnerabilities) == 0  # ✅ No vulns
    
    # 4. Performance test
    response_time = load_test('/api/invoices', rps=100)
    assert response_time.p95 < 200  # ✅ 150ms
    
    # 5. Compliance check (Legal Advisor AI)
    audit_log = check_audit_log('invoice')
    assert audit_log.exists  # ✅ Audit trail present
    
    return "✅ APPROVED"
```

---

**Phase 4: Integration (Mobile Agent)**

```javascript
// Day 2: Mobile Agent implements screens

// src/screens/invoices/InvoiceListScreen.js
import { invoiceAPI } from '../../services/api';

const fetchInvoices = async () => {
  const response = await invoiceAPI.getAll({
    status: filter,
    limit: 20,
    offset: page * 20
  });
  setInvoices(response.data);
};

// Day 2: 14:00 - E2E test
// tests/e2e/invoice-flow.test.js
describe('Invoice Flow E2E', () => {
  it('should create and view invoice', async () => {
    // Admin creates invoice via API
    await admin.createInvoice({...});
    
    // Mobile user sees invoice
    await mobile.login();
    await mobile.navigateTo('Invoices');
    await expect(mobile.screen).toContainText('INV-000001');
  });
});
```

---

**Phase 5: Deployment (DevOps)**

```yaml
# .github/workflows/deploy.yml
name: Deploy Invoice Feature

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      
      - name: Run full test suite
        run: npm test
      
      - name: Build Docker image
        run: docker build -t hr-erp-backend:${{ github.ref_name }} .
      
      - name: Deploy to staging
        run: |
          docker push hr-erp-backend:${{ github.ref_name }}
          kubectl set image deployment/backend backend=hr-erp-backend:${{ github.ref_name }}
      
      - name: Smoke test
        run: |
          sleep 30
          curl -f https://staging.hr-erp.com/api/health || exit 1
      
      - name: Notify Slack
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -d "text=Invoice feature deployed to staging ✅"
```

---

## 🚨 EMERGENCY RESPONSE

### **Scenario: Production Bug**

```
┌─────────────────────────────────────────────────┐
│ 1. Alert Detection (Automated)                  │
│    - Sentry error spike                         │
│    - OR user report                             │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 2. Immediate Response (DevOps Agent)            │
│    - Assess severity (P0/P1/P2)                 │
│    - If P0: Automated rollback                  │
│    - Notify CEO/CTO (Slack + SMS)               │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 3. Root Cause Analysis (Relevant Dev Agent)     │
│    - Pull logs                                  │
│    - Identify bug                               │
│    - Estimate fix time                          │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 4. Hotfix (Backend/Frontend/Mobile Agent)       │
│    - Create hotfix branch                       │
│    - Fix bug                                    │
│    - Emergency testing                          │
│    - Deploy to prod                             │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 5. Post-Mortem (CEO + CTO + Dev)                │
│    - What happened?                             │
│    - Why did it happen?                         │
│    - How to prevent?                            │
│    - Action items                               │
└─────────────────────────────────────────────────┘
```

---

## 📡 AGENT COMMUNICATION PROTOCOLS

### **Slack Channels:**

```
#dev-backend     → Backend Agent updates
#dev-frontend    → Frontend Agent updates
#dev-mobile      → Mobile Agent updates
#dev-qa          → QA Agent test results
#daily-standup   → Automated daily reports
#alerts          → Production alerts
#general         → Team discussions
```

---

### **GitHub Labels:**

```
priority:critical   → P0 issues (immediate attention)
priority:high       → P1 issues (this sprint)
priority:medium     → P2 issues (next sprint)
priority:low        → P3 issues (backlog)

type:bug            → Bug fixes
type:feature        → New features
type:refactor       → Code improvements
type:docs           → Documentation

agent:backend       → Backend Agent task
agent:mobile        → Mobile Agent task
agent:qa            → QA Agent task
```

---

### **Notification Rules:**

```yaml
# .github/workflows/notify.yml

Trigger Slack notification when:
  - CI fails → #alerts
  - PR ready for review → #dev-{team}
  - Deployment success → #general
  - Test coverage drops → #dev-qa
  - Security vulnerability → #alerts + Email

Trigger Email when:
  - Production error → CEO + CTO
  - Deployment to prod → CEO + CTO + DevOps
  - Sprint completed → Stakeholders
```

---

## ✅ WORKFLOW CHECKLIST

**Daily:**
- [ ] Morning sync (CEO priorities)
- [ ] Development (agents work)
- [ ] Daily standup (automated report)
- [ ] Nightly build & test

**Weekly:**
- [ ] Sprint planning (Monday)
- [ ] Mid-sprint check-in (Wednesday)
- [ ] Sprint review (Friday)
- [ ] Sprint retrospective (Friday)

**Per Feature:**
- [ ] Specification (CEO + CTO + Advisory)
- [ ] Implementation (Dev Agent)
- [ ] Review (CTO + QA)
- [ ] Integration (relevant agents)
- [ ] Deployment (DevOps)

**Emergency:**
- [ ] Alert detection
- [ ] Immediate response
- [ ] Root cause analysis
- [ ] Hotfix
- [ ] Post-mortem

---

**Verzió:** 1.0  
**Készítette:** Claude Agent 🤖  
**Utolsó frissítés:** 2026-03-07
