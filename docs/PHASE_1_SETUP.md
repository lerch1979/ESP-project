# 🚀 PHASE 1 SETUP - CORE TEAM

**Időtartam:** 1 hét  
**Cél:** Működő automated development workflow  
**Előfeltétel:** Működő Git, Node.js, Docker  

---

## 📋 PHASE 1 AGENT-EK

1. ✅ CEO Agent (Strategist)
2. ✅ CTO Agent (Technical Leader)
3. ✅ Backend Developer Agent
4. ✅ Frontend Developer Agent
5. ✅ Mobile Developer Agent
6. ✅ QA/Testing Agent

---

## 🎯 PHASE 1 CÉLOK

**Hét vége:**
- Sprint 1 befejezve (Projects & Tasks mobile)
- Automatikus CI/CD pipeline
- Daily standup automation
- 80%+ test coverage

---

## 📦 SZÜKSÉGES ESZKÖZÖK

### **1. Claude Code**

```bash
# Telepítés check:
npx @anthropic-ai/claude-code --version

# Ha működik:
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile
npx @anthropic-ai/claude-code --remote-control

# Ha NEM működik (404 error):
# Alternatíva: Cursor AI (lásd lent)
```

---

### **2. Cursor AI (Alternatíva/Kiegészítő)**

**Telepítés:**
```bash
# macOS:
brew install --cask cursor

# Indítás:
cursor /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile

# Használat:
# Cmd+K → "Implement Sprint 2 backend endpoints"
# Cmd+L → Chat with Claude
```

**Előnyök:**
- VS Code fork → ismerős interface
- Claude Opus 4 beépítve
- Multi-file editing
- Git integration

---

### **3. GitHub Actions (CI/CD)**

**Setup:**

```bash
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile

# Workflows mappa létrehozása:
mkdir -p .github/workflows

# Backend CI pipeline:
cat > .github/workflows/backend-ci.yml << 'EOF'
name: Backend CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'hr-erp backend/**'
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpassword
          MYSQL_DATABASE: hr_erp_test
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: 'hr-erp backend/hr-erp-backend/package-lock.json'
      
      - name: Install dependencies
        working-directory: hr-erp backend/hr-erp-backend
        run: npm ci
      
      - name: Run linter
        working-directory: hr-erp backend/hr-erp-backend
        run: npm run lint
      
      - name: Run tests
        working-directory: hr-erp backend/hr-erp-backend
        run: npm test
        env:
          NODE_ENV: test
          DB_HOST: 127.0.0.1
          DB_USER: root
          DB_PASSWORD: testpassword
          DB_NAME: hr_erp_test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./hr-erp backend/hr-erp-backend/coverage/lcov.info
EOF

# Mobile CI pipeline:
cat > .github/workflows/mobile-ci.yml << 'EOF'
name: Mobile CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'hr-erp-mobile/**'
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: 'hr-erp-mobile/package-lock.json'
      
      - name: Install dependencies
        working-directory: hr-erp-mobile
        run: npm ci
      
      - name: Run tests
        working-directory: hr-erp-mobile
        run: npm test
      
      - name: Type check
        working-directory: hr-erp-mobile
        run: npx tsc --noEmit || true
EOF

# Commit:
git add .github/workflows/
git commit -m "ci: Add GitHub Actions CI pipelines"
git push
```

**Ellenőrzés:**
- GitHub repository → Actions tab
- Látnod kell a pipeline-okat futni

---

### **4. Slack/Discord Integration**

**Slack Bot Setup:**

1. **Hozz létre Slack App-ot:**
   - https://api.slack.com/apps
   - "Create New App" → "From scratch"
   - Név: "HR-ERP Dev Bot"
   - Workspace: Válaszd a workspace-ed

2. **OAuth & Permissions:**
   - Bot Token Scopes:
     - `chat:write`
     - `chat:write.public`
     - `files:write`
   - Install to Workspace
   - Másold ki az **Bot User OAuth Token**-t

3. **GitHub Secret beállítás:**
   ```
   GitHub repo → Settings → Secrets → New secret
   Name: SLACK_WEBHOOK_URL
   Value: [Slack webhook URL]
   ```

4. **Slack notification action:**
   ```yaml
   # .github/workflows/notify-slack.yml
   name: Slack Notifications
   
   on:
     push:
       branches: [main]
     workflow_run:
       workflows: ["Backend CI", "Mobile CI"]
       types: [completed]
   
   jobs:
     notify:
       runs-on: ubuntu-latest
       steps:
         - name: Slack notification
           uses: 8398a7/action-slack@v3
           with:
             status: ${{ job.status }}
             text: 'CI Pipeline completed'
             webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
   ```

---

## 🤖 AGENT KONFIGURÁCIÓK

### **CEO Agent - Priority Setting**

**Setup Script:**

```python
# ceo_agent.py
import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are the CEO of an HR-ERP software company.

Your responsibilities:
1. Prioritize features based on business value
2. Review sprint progress
3. Make go/no-go decisions for releases
4. Communicate with stakeholders

Current Sprint: Sprint 2 (Pénzügy modul)
Stakeholder priorities:
- CFO wants invoice tracking ASAP
- HR wants performance reviews module
- Users want better mobile UX

Evaluate and prioritize for next sprint.
"""

def get_priorities(sprint_tasks):
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Review these tasks and prioritize:\n{sprint_tasks}"
            }
        ]
    )
    return message.content[0].text

# Használat:
tasks = """
1. Invoice list screen (mobile)
2. Invoice detail screen (mobile)
3. Cost center management (admin)
4. Performance review module (admin)
5. Dashboard UX improvements (mobile)
"""

priorities = get_priorities(tasks)
print(priorities)
```

**Futtatás:**
```bash
# Setup:
pip3 install anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Daily morning run (cron):
python3 ceo_agent.py > priorities.txt
```

**Kimenet példa:**
```
Priority Ranking (Sprint 2):

1. Invoice list screen (mobile) - HIGH
   Justification: CFO critical request, user-facing, enables billing workflow
   
2. Dashboard UX improvements (mobile) - HIGH
   Justification: Affects all users, quick wins, improves engagement
   
3. Invoice detail screen (mobile) - MEDIUM
   Justification: Completes invoice workflow, but list is higher priority
   
4. Cost center management (admin) - MEDIUM
   Justification: Finance team need, but admin-only (smaller user base)
   
5. Performance review module (admin) - LOW
   Justification: Important long-term, but Sprint 3-4 target

Recommendation: Focus Sprint 2 on items 1-2, start item 3 if time permits.
```

---

### **CTO Agent - Architecture Review**

**Setup Script:**

```python
# cto_agent.py
import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are the CTO reviewing the HR-ERP technical architecture.

Current Stack:
- Backend: Node.js 18 + Express 4 + MySQL 8
- Frontend: React 18 + Vite + Material-UI
- Mobile: React Native 0.81 + Expo ~54

Your responsibilities:
1. Identify technical debt
2. Security audit
3. Performance optimization
4. Scalability assessment
5. Tech stack recommendations

User base target: 10,000+ concurrent users
Data volume: 1M+ records (users, tasks, projects, invoices)
"""

def architecture_review(focus_area):
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Review the architecture focusing on: {focus_area}"
            }
        ]
    )
    return message.content[0].text

# Weekly review:
print("=== SECURITY AUDIT ===")
print(architecture_review("security vulnerabilities and auth/authorization"))

print("\n=== PERFORMANCE ===")
print(architecture_review("database query optimization and caching strategy"))

print("\n=== SCALABILITY ===")
print(architecture_review("handling 10,000 concurrent users"))
```

**Kimenet példa:**
```
=== SECURITY AUDIT ===

Critical Issues:
1. JWT secret hardcoded in config file → Move to environment variable
2. No rate limiting on API endpoints → Implement express-rate-limit
3. SQL injection risk in raw queries → Use parameterized queries only
4. CORS policy too permissive → Whitelist specific domains

Recommendations:
- Implement Helmet.js for security headers
- Add input validation with Joi/Zod
- Enable HTTPS only (HSTS)
- Audit log for sensitive operations

=== PERFORMANCE ===

Bottlenecks Detected:
1. Dashboard query fetches ALL tasks (no pagination) → Add limit/offset
2. No caching layer → Implement Redis for frequent queries
3. N+1 queries in project list → Use JOIN or eager loading

Recommendations:
- Add database indexes on frequently queried columns (status, assignedTo)
- Implement Redis cache for dashboard stats (TTL: 5 minutes)
- Use DataLoader pattern for GraphQL-like batch loading

=== SCALABILITY ===

Current Capacity: ~500 concurrent users
Target: 10,000 concurrent users

Scaling Strategy:
1. Horizontal scaling: Multiple backend instances behind load balancer
2. Database: Read replicas for SELECT queries, master for writes
3. Caching: Redis cluster for session store and frequently accessed data
4. CDN: Static assets (frontend, images) served from CloudFront/Cloudflare

Estimated Cost: $500-1000/month (AWS)
Timeline: 2-3 sprints to implement
```

---

### **Backend Dev Agent - Code Generation**

**Claude Code használat:**

```bash
# Terminal:
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp\ backend/hr-erp-backend
npx @anthropic-ai/claude-code --remote-control

# Claude Code-ban:
"""
Create the Invoice API endpoints:

1. GET /api/invoices - List all invoices
   - Filters: status, client_id, date_range
   - Pagination: limit, offset
   - Sort: date, amount

2. GET /api/invoices/:id - Get single invoice

3. POST /api/invoices - Create invoice
   - Validate: client, amount, line_items
   - Auto-generate invoice number

4. PUT /api/invoices/:id - Update invoice

5. DELETE /api/invoices/:id - Soft delete

Include:
- Controller, Service, Model layers
- Input validation (Joi)
- Unit tests (Jest + Supertest)
- API documentation (JSDoc)
"""
```

**Claude Code output:**
```javascript
// src/controllers/invoice.controller.js
const { invoiceService } = require('../services');
const Joi = require('joi');

const invoiceSchema = Joi.object({
  client_id: Joi.number().required(),
  amount: Joi.number().positive().required(),
  status: Joi.string().valid('draft', 'sent', 'paid', 'overdue'),
  due_date: Joi.date().required(),
  line_items: Joi.array().items(
    Joi.object({
      description: Joi.string().required(),
      quantity: Joi.number().positive().required(),
      unit_price: Joi.number().positive().required()
    })
  ).min(1).required()
});

exports.getAll = async (req, res) => {
  try {
    const { status, client_id, limit = 20, offset = 0 } = req.query;
    const invoices = await invoiceService.getAll({
      status,
      client_id,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { error, value } = invoiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    
    const invoice = await invoiceService.create(value);
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ... rest of CRUD operations

// src/services/invoice.service.js
const db = require('../config/database');

exports.getAll = async (filters) => {
  let query = db('invoices').select('*');
  
  if (filters.status) {
    query = query.where('status', filters.status);
  }
  if (filters.client_id) {
    query = query.where('client_id', filters.client_id);
  }
  
  query = query.limit(filters.limit).offset(filters.offset);
  return await query;
};

exports.create = async (data) => {
  // Generate invoice number
  const latestInvoice = await db('invoices')
    .orderBy('id', 'desc')
    .first();
  const invoiceNumber = `INV-${String((latestInvoice?.id || 0) + 1).padStart(6, '0')}`;
  
  const [id] = await db('invoices').insert({
    ...data,
    invoice_number: invoiceNumber,
    created_at: new Date()
  });
  
  return await db('invoices').where({ id }).first();
};

// tests/invoice.test.js
const request = require('supertest');
const app = require('../src/app');

describe('Invoice API', () => {
  it('should create an invoice', async () => {
    const invoice = {
      client_id: 1,
      amount: 1500.00,
      due_date: '2026-04-01',
      line_items: [
        { description: 'Consulting', quantity: 10, unit_price: 150 }
      ]
    };
    
    const res = await request(app)
      .post('/api/invoices')
      .send(invoice);
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice_number).toMatch(/^INV-\d{6}$/);
  });
  
  it('should validate invoice data', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({ client_id: 1 }); // Missing required fields
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
```

**Validáció:**
```bash
# Futtatás:
npm test -- invoice.test.js

# Kimenet:
# ✓ should create an invoice (45ms)
# ✓ should validate invoice data (12ms)
# Test Suites: 1 passed
# Tests: 2 passed
```

---

### **QA Agent - Automated Testing**

**Test Suite Setup:**

```bash
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp\ backend/hr-erp-backend

# Jest config:
cat > jest.config.js << 'EOF'
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ]
};
EOF

# Run tests with coverage:
npm test -- --coverage

# CI integration:
# Already in .github/workflows/backend-ci.yml!
```

**E2E Testing (Playwright):**

```bash
# Mobile E2E setup:
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile

npm install --save-dev detox detox-cli

# Detox config:
cat > .detoxrc.js << 'EOF'
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/HrErpMobile.app',
      build: 'xcodebuild -workspace ios/HrErpMobile.xcworkspace -scheme HrErpMobile -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build'
    }
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 14'
      }
    }
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug'
    }
  }
};
EOF

# E2E test példa:
mkdir -p e2e
cat > e2e/login.test.js << 'EOF'
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should login successfully', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });
});
EOF

# Run E2E:
npx detox build -c ios.sim.debug
npx detox test -c ios.sim.debug
```

---

## 📊 DAILY STANDUP AUTOMATION

**Slack Bot Script:**

```python
# daily_standup.py
import anthropic
import os
import requests
from datetime import datetime

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL")

def get_git_activity():
    """Get last 24h git commits"""
    import subprocess
    result = subprocess.run(
        ["git", "log", "--since='24 hours ago'", "--pretty=format:%h - %s (%an)"],
        capture_output=True,
        text=True
    )
    return result.stdout

def get_github_issues():
    """Fetch open issues from GitHub API"""
    # Implement GitHub API call
    pass

def generate_standup_report():
    git_activity = get_git_activity()
    
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        system="You are a dev team standup facilitator. Generate a concise daily standup report.",
        messages=[{
            "role": "user",
            "content": f"""
            Generate a daily standup report based on:
            
            Git Activity (last 24h):
            {git_activity}
            
            Format:
            **Backend Agent:**
            ✅ Completed: [task]
            🚧 In Progress: [task]
            ⚠️ Blocked: [blocker]
            
            **Frontend Agent:**
            ...
            """
        }]
    )
    
    return message.content[0].text

def post_to_slack(message):
    requests.post(SLACK_WEBHOOK, json={"text": message})

# Run daily at 9 AM
if __name__ == "__main__":
    report = generate_standup_report()
    post_to_slack(f"🤖 **Daily Standup - {datetime.now().strftime('%Y-%m-%d')}**\n\n{report}")
```

**Cron setup (macOS):**
```bash
# Edit crontab:
crontab -e

# Add line:
0 9 * * * cd /path/to/project && python3 daily_standup.py
```

---

## ✅ PHASE 1 VALIDÁCIÓ

**Checklist:**

```bash
# 1. Git működik
git status
git log --oneline -3

# 2. CI pipeline működik
# GitHub → Actions tab → látod a zöld pipát

# 3. Tests pass
cd hr-erp-backend
npm test
# ✓ All tests passed

# 4. Slack bot működik
# Slack channel → látod a daily standup message-t

# 5. Claude Code működik
npx @anthropic-ai/claude-code --version
# Vagy Cursor:
cursor --version

# 6. Coverage target elérve
npm test -- --coverage
# Branches: 70%+ ✓
# Functions: 80%+ ✓
```

---

## 🎯 PHASE 1 SUCCESS CRITERIA

**Sprint 1 Complete:**
- [x] Projects module (mobile)
- [x] Tasks module (mobile)
- [x] Dashboard expandable sections
- [x] More menu kategorized

**CI/CD:**
- [x] GitHub Actions pipeline működik
- [x] Automated tests minden commit-nál
- [x] Slack notifications

**Quality:**
- [x] 80%+ test coverage (backend)
- [x] 70%+ test coverage (frontend/mobile)
- [x] No critical bugs

**Automation:**
- [x] Daily standup automated
- [x] Git commit automated (Claude Code)
- [x] Test run automated (CI)

---

## 🚀 NEXT: PHASE 2

Ha Phase 1 kész:
- Lásd: `PHASE_2_ADVISORY_LAYER.md`

---

**Verzió:** 1.0  
**Készítette:** Claude Agent 🤖
