# 🤖 AGENTIC DEVELOPMENT TEAM - MASTER GUIDE

**Projekt:** HR-ERP Integrált Vállalatirányítási Rendszer  
**Készítette:** Claude + Balázs  
**Verzió:** 1.0  
**Dátum:** 2026-03-07  

---

## 📋 TARTALOMJEGYZÉK

1. [Áttekintés](#áttekintés)
2. [Team Struktúra](#team-struktúra)
3. [Agent Szerepkörök](#agent-szerepkörök)
4. [Implementációs Fázisok](#implementációs-fázisok)
5. [Napi Workflow](#napi-workflow)
6. [Tool Stack](#tool-stack)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 ÁTTEKINTÉS

### **Mi ez?**

Egy **teljes mértékben automatizált fejlesztői csapat** amely:
- ✅ **Önállóan dolgozik** (éjjel-nappal)
- ✅ **Tervez, kódol, tesztel, deployol**
- ✅ **Dokumentál és backup-ol**
- ✅ **Proaktívan jelzi** a problémákat
- ✅ **Biztonságosan halad** (review, rollback, audit)

### **Miért van rá szükség?**

- 🕐 **Időnyerés:** Amíg te alszol/dolgozol, a csapat halad
- 🛡️ **Biztonság:** Minden lépés dokumentált, backup-olt, review-zott
- 🚀 **Sebesség:** Több agent = több párhuzamos munka
- 📊 **Minőség:** Automatikus tesztek, code review, compliance check

### **Főbb célok:**

1. **Sprint 1-6 implementálása** (Projektek, Feladatok, Pénzügy, Analytics)
2. **Teljes test coverage** (unit, integration, E2E)
3. **GDPR compliance** minden modulban
4. **Production-ready quality**

---

## 👥 TEAM STRUKTÚRA

### **Piramis modell:**

```
        [CEO Agent] ← Üzleti döntések, roadmap
             |
        [CTO Agent] ← Tech stack, architektúra
             |
    ┌────────┴────────┐
    |                 |
[Advisory Layer]  [Dev Layer]
    |                 |
 Logic/UX/Legal   Back/Front/Mobile
    |                 |
    └────────┬────────┘
             |
      [QA & DevOps]
```

### **Kommunikációs csatornák:**

- **Slack/Discord:** Real-time kommunikáció
- **GitHub Issues:** Task tracking
- **GitHub Projects:** Sprint board
- **Notion/Confluence:** Dokumentáció
- **Email:** Automatikus jelentések

---

## 🤖 AGENT SZEREPKÖRÖK

### **TIER 1: LEADERSHIP**

#### **1. CEO Agent (Business Strategist)**

**Felelősség:**
- Üzleti prioritások meghatározása
- Sprint planning (mi kerüljön be a következő sprint-be)
- ROI számítások (melyik feature hozza a legtöbb értéket)
- Stakeholder kommunikáció

**Tool stack:**
- Claude (Chat) - stratégiai konzultáció
- GPT-4 API - üzleti elemzések
- Notion AI - dokumentáció

**Input:**
- Piaci trendek
- User feedback
- Business metrics

**Output:**
- Sprint priorities
- Feature ranking
- Budget allocation

**Implementáció:**
```python
# CEO Agent - Python script
# Prompt template:
"""
You are the CEO of an HR-ERP software company.
Analyze these user requests and market data.
Prioritize features for the next sprint based on:
- Business value (ROI)
- User impact
- Technical feasibility
- Compliance requirements
Output: Ranked feature list with justification
"""
```

---

#### **2. CTO Agent (Technical Leader)**

**Felelősség:**
- Architektúra döntések (microservices vs monolith, stb)
- Tech stack választás
- Performance optimization
- Security architecture
- Scalability planning

**Tool stack:**
- Claude Code - architektúra design
- Cursor AI - interactive design
- GitHub Copilot - code review

**Input:**
- CEO priorities
- Current system metrics
- Tech debt assessment

**Output:**
- Technical architecture docs
- Tech stack recommendations
- Performance benchmarks
- Security audit reports

**Implementáció:**
```python
# CTO Agent - Architecture review
"""
You are the CTO reviewing the HR-ERP architecture.
Current stack: Node.js, React, React Native, MySQL
Evaluate:
1. Is this stack optimal for 10,000+ users?
2. Security vulnerabilities?
3. Scalability bottlenecks?
4. Recommendations for improvement
Output: Technical roadmap
"""
```

---

### **TIER 2: ADVISORY LAYER**

#### **3. Logic/Architecture Advisor**

**Felelősség:**
- Algoritmusok optimalizálása
- Database schema design & normalization
- API design patterns (RESTful best practices)
- Data flow optimization
- Code efficiency review

**Tool stack:**
- Claude (Chat) - logic consultation
- DeepSeek R1 - mathematical optimization
- PostgreSQL Explain Analyzer

**Példa feladatok:**
- ✅ HR Analytics algoritmus: átlagos munkaórák számítása
- ✅ Feladat prioritizálás: overdue tasks + SLA kalkuláció
- ✅ Database query optimization: N+1 probléma felderítés

**Implementáció:**
```javascript
// Logic Advisor - Review prompt
/*
Review this database query for efficiency:
SELECT * FROM tasks 
  JOIN projects ON tasks.project_id = projects.id
  JOIN users ON tasks.assigned_to = users.id
WHERE tasks.status = 'overdue'

Issues:
1. SELECT * - fetch only needed columns
2. Missing index on tasks.status
3. Consider materialized view for frequently accessed data

Recommendation: [optimized query]
*/
```

---

#### **4. UX/UI Advisor**

**Felelősség:**
- User flow elemzés (mennyire intuitív a navigáció?)
- Accessibility audit (WCAG 2.1 AA compliance)
- Mobile UX review (thumb-friendly zones, swipe gestures)
- Design system compliance (konzisztens színek, spacing, typography)
- Performance (perceived speed, loading states)

**Tool stack:**
- Claude Vision - screenshot review
- Figma API - design sync
- Lighthouse CI - accessibility metrics

**Példa feladatok:**
- ✅ Dashboard túl zsúfolt → javaslat: expandable sections
- ✅ More menü kategorizálás (8 elem → 4 szekció)
- ✅ Task card overdue highlight színválasztás (error red vs warning orange)

**Implementáció:**
```python
# UX Advisor - Screen review
"""
Review this mobile screen design:
[Screenshot: Dashboard with 12 StatCards]

UX Issues:
1. Cognitive overload - too many stats at once
2. No clear hierarchy - all equal visual weight
3. No quick actions - user must navigate deeper

Recommendations:
- Reduce to 4 primary stats
- Add expandable sections for secondary info
- Include quick action buttons (e.g., "Add Task")
"""
```

---

#### **5. Legal/Compliance Advisor**

**Felelősség:**
- **GDPR compliance:** adatkezelési szabályok
- **Munkajogi szabályok:** munkaórák rögzítése, szabadság kezelés
- **Adatvédelmi audit:** ki fér hozzá milyen adathoz
- **Audit trail:** minden módosítás naplózása
- **Cookie policy, Privacy policy** generálás

**Tool stack:**
- Claude (Chat) - legal consultation
- GDPR Checklist API
- Audit log analyzer

**Kritikus területek HR-ERP-nél:**
1. **Személyes adatok:** név, email, telefon, lakcím
2. **Érzékeny adatok:** egészségügyi adatok (betegség, wellbeing metrics)
3. **Hozzáférési jogok:** ki láthatja mások bérét, értékelését
4. **Adatmegőrzés:** mennyi ideig őrizzük a régi dolgozók adatait
5. **Data export:** dolgozó kérheti saját adatainak exportját

**Implementáció:**
```python
# Compliance Advisor - GDPR audit
"""
Audit this database schema for GDPR compliance:

Table: users
- email (PII - personal identifiable info)
- phone (PII)
- salary (sensitive)
- health_metrics (special category data - EXTRA védelem kell!)

Issues:
1. No consent tracking - add 'gdpr_consent' boolean + timestamp
2. No data retention policy - add 'data_retention_until' date
3. Health metrics need encryption at rest
4. Missing 'data_export' API endpoint

Recommendations: [detailed compliance fixes]
"""
```

---

### **TIER 3: DEVELOPMENT LAYER**

#### **6. Backend Developer Agent**

**Felelősség:**
- Node.js/Express API development
- Database migrations (MySQL)
- RESTful endpoints
- Business logic implementation
- Authentication & authorization

**Tool stack:**
- **Claude Code** - primary developer
- **GitHub Copilot** - code completion
- **Cursor AI** - interactive debugging

**Workflow:**
1. Kap task-ot a CTO-tól (pl. "Create /api/projects endpoint")
2. Generálja a kódot (controller, service, model)
3. Ír unit test-eket
4. Git commit + push
5. Jelzi a QA Agent-nek: "Ready for testing"

**Példa output:**
```javascript
// Backend Agent output
// File: src/controllers/project.controller.js

const { projectService } = require('../services');

exports.getAll = async (req, res) => {
  try {
    const { status, limit } = req.query;
    const projects = await projectService.getAll({ status, limit });
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// File: src/services/project.service.js
exports.getAll = async (filters) => {
  const query = db('projects').select('*');
  if (filters.status) query.where('status', filters.status);
  if (filters.limit) query.limit(filters.limit);
  return await query;
};

// File: tests/project.test.js
describe('Project API', () => {
  it('should fetch all projects', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

---

#### **7. Frontend Developer Agent**

**Felelősség:**
- React admin panel (Vite + Material-UI)
- State management (Redux/Context)
- API integration
- Responsive design

**Tool stack:**
- Claude Code
- Cursor AI
- Storybook (component documentation)

**Workflow:**
1. Kap design-t a UX Advisor-tól
2. Generálja a React komponenseket
3. Integrál backend API-val
4. Ír Storybook story-kat
5. Git commit + push

---

#### **8. Mobile Developer Agent**

**Felelősség:**
- React Native + Expo
- Native components
- Offline-first architecture
- Push notifications
- App Store deployment

**Tool stack:**
- Claude Code
- Expo EAS (build service)
- TestFlight (iOS testing)

**Workflow:**
1. Backend API készen van → Mobile sync
2. Generálja a React Native screen-eket
3. Navigation setup
4. Offline cache strategy (AsyncStorage)
5. EAS build + TestFlight upload

---

### **TIER 4: QUALITY & OPS**

#### **9. QA/Testing Agent**

**Felelősség:**
- Automatikus unit test írás
- Integration test suite
- E2E testing (Playwright/Cypress)
- Performance testing (Lighthouse)
- Regression testing

**Tool stack:**
- Jest + Supertest (backend)
- React Testing Library (frontend)
- Detox (mobile E2E)
- Playwright (web E2E)

**Workflow:**
1. Dev Agent jelzi: "Feature ready"
2. QA fut teszteket
3. Ha fail → GitHub issue + Slack notification
4. Ha pass → approve merge
5. Regression suite futtatás

**Test coverage target:**
- Backend: 80%+
- Frontend: 70%+
- Mobile: 70%+
- E2E: Critical user paths 100%

---

#### **10. DevOps Agent**

**Felelősség:**
- CI/CD pipeline (GitHub Actions)
- Docker containerization
- Kubernetes deployment (opcionális)
- Monitoring (Prometheus + Grafana)
- Log aggregation (ELK stack)
- Automated backups

**Tool stack:**
- GitHub Actions
- Docker + Docker Compose
- AWS/GCP/Azure (cloud provider)
- Terraform (infrastructure as code)

**Workflow:**
1. Code push → trigger CI pipeline
2. Run tests
3. Build Docker images
4. Deploy to staging
5. Smoke tests
6. Deploy to production (ha staging OK)
7. Monitor metrics

**GitHub Actions példa:**
```yaml
# .github/workflows/backend-ci.yml
name: Backend CI/CD

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run lint
  
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: docker build -t hr-erp-backend .
      - run: docker push hr-erp-backend:latest
      - run: kubectl apply -f k8s/backend.yml
```

---

## 📅 IMPLEMENTÁCIÓS FÁZISOK

### **FÁZIS 1: CORE TEAM (1 HÉT)**

**Cél:** Működő development workflow

**Agent-ek:**
1. ✅ CEO Agent (priorities)
2. ✅ CTO Agent (architecture)
3. ✅ Backend Dev Agent
4. ✅ Frontend Dev Agent
5. ✅ Mobile Dev Agent
6. ✅ QA Agent

**Setup lépések:**
1. GitHub repository setup
2. Claude Code telepítés + konfiguráció
3. Cursor AI telepítés (opcionális)
4. GitHub Actions CI pipeline
5. Slack/Discord bot integráció

**Deliverable:**
- Sprint 1 befejezése (Projects & Tasks module)
- Automatikus testing pipeline
- Daily standup automation

**Részletes setup:** Lásd `PHASE_1_SETUP.md`

---

### **FÁZIS 2: ADVISORY LAYER (2 HÉT)**

**Cél:** Minőség és compliance

**Új agent-ek:**
7. ✅ Logic/Architecture Advisor
8. ✅ UX/UI Advisor
9. ✅ Legal/Compliance Advisor

**Setup lépések:**
1. GDPR audit tool integráció
2. Accessibility testing (axe-core)
3. Performance monitoring (Lighthouse CI)
4. Design system documentation (Storybook)

**Deliverable:**
- GDPR compliance Sprint 2-ben
- Accessibility AA rating
- Design system v1.0

---

### **FÁZIS 3: FULL AUTOMATION (3 HÉT)**

**Cél:** Autonóm működés

**Új komponensek:**
10. ✅ DevOps Agent (full CI/CD)
11. ✅ Monitoring & Alerting
12. ✅ Automated documentation
13. ✅ Nightly regression suite

**Setup lépések:**
1. Production deployment automation
2. Monitoring dashboards (Grafana)
3. Alerting (PagerDuty/Opsgenie)
4. Automated backup & disaster recovery

**Deliverable:**
- Zero-touch deployment
- 99.9% uptime
- Automated rollback on failure

---

## 🔄 NAPI WORKFLOW

### **Reggel 6:00 (automata):**

```
1. CEO Agent: Ellenőrzi a GitHub Issues-t
   └─> Prioritizálja a mai feladatokat
   
2. CTO Agent: Architektúra review
   └─> Ellenőrzi van-e tech debt kritikus issue
   
3. Dev Agents: Kiosztott task-ok alapján dolgoznak
   └─> Backend: API endpoint-ok
   └─> Frontend: UI komponensek
   └─> Mobile: Screen implementációk
   
4. QA Agent: Tegnap commit-olt kód tesztelése
   └─> Ha fail → GitHub issue + Slack alert
```

### **Délután 14:00 (daily standup automation):**

```
Slack/Discord channel:
---
🤖 **Daily Standup Report - 2026-03-07 14:00**

**Backend Agent:**
✅ Completed: /api/tasks endpoint (GET, POST, PUT, DELETE)
✅ Tests: 12/12 passed
🚧 In Progress: Task status transition validation
⏰ ETA: End of day

**Frontend Agent:**
✅ Completed: TaskListView component
✅ Tests: 8/8 passed
🚧 In Progress: TaskDetailView
⏰ ETA: Tomorrow 10:00

**Mobile Agent:**
✅ Completed: TaskCard component
❌ Blocked: Waiting for /api/tasks (now unblocked)
🚧 In Progress: TaskListScreen
⏰ ETA: Tomorrow 16:00

**QA Agent:**
✅ All tests passed
⚠️ Performance warning: TaskList renders slowly with 1000+ items
   └─> Created issue #142: Optimize TaskList virtualization
---
```

### **Este 20:00 (nightly build):**

```
1. DevOps Agent: Production build
   └─> Docker images
   └─> Deploy to staging
   
2. QA Agent: E2E regression suite (1 hour)
   └─> Critical user paths testing
   
3. Monitoring Agent: Health check
   └─> Database performance
   └─> API response times
   └─> Error rates
   
4. Backup Agent: Nightly backup
   └─> Database dump
   └─> Code repository
   └─> Documentation
```

### **Ha probléma van (bármikor):**

```
1. Alert triggerelés (Slack/Email/SMS)
2. DevOps Agent: Automated rollback (ha production issue)
3. CEO/CTO értesítés
4. Post-mortem dokumentálás
```

---

## 🛠️ TOOL STACK

### **Development:**

| Agent | Primary Tool | Secondary | Third |
|-------|--------------|-----------|-------|
| CEO | Claude Chat | GPT-4 API | Notion AI |
| CTO | Claude Code | Cursor AI | GitHub Copilot |
| Backend Dev | Claude Code | Cursor AI | Copilot |
| Frontend Dev | Claude Code | Cursor AI | Copilot |
| Mobile Dev | Claude Code | Expo EAS | Copilot |
| QA | Jest + Playwright | Detox | Lighthouse |
| DevOps | GitHub Actions | Docker | Terraform |

### **Communication:**

- **Slack/Discord:** Real-time team chat
- **GitHub Issues:** Task tracking
- **GitHub Projects:** Kanban board
- **Notion:** Documentation wiki

### **Monitoring:**

- **Sentry:** Error tracking
- **Prometheus + Grafana:** Metrics & dashboards
- **Lighthouse CI:** Performance tracking
- **Snyk:** Security vulnerability scanning

---

## 💾 BACKUP & RECOVERY

### **Backup stratégia:**

**1. Code (Git):**
- GitHub repository (main backup)
- GitLab mirror (secondary)
- Local clone (tertiary)

**2. Dokumentáció:**
- GitHub `/docs` folder
- Notion workspace (synced)
- Google Drive backup (nightly export)

**3. Database:**
- Nightly MySQL dump → AWS S3
- Point-in-time recovery (WAL archiving)
- Retention: 30 days

**4. Conversation Transcripts:**
- `/mnt/transcripts/` folder
- Git LFS for large files
- Daily commit to `conversation-history` branch

---

### **Recovery Protocol (Adatvesztés után):**

#### **HA Claude leáll és memória elvész:**

**LÉPÉSEK:**

1. **Nyisd meg ezt a fájlt:**
   ```
   AGENTIC_TEAM_MASTER_GUIDE.md
   ```

2. **Töltsd be a RECOVERY_GUIDE.md-t:**
   ```
   RECOVERY_GUIDE.md
   ```

3. **Claude-nak mondd:**
   ```
   "Read the AGENTIC_TEAM_MASTER_GUIDE.md and RECOVERY_GUIDE.md files.
   Restore the project context and continue from where we left off."
   ```

4. **Claude visszatölti:**
   - Projekt státuszt
   - Agent konfigurációkat
   - Aktuális sprint feladatokat
   - Utolsó commit info-kat

5. **Validáció:**
   ```bash
   # Ellenőrzés:
   git status
   git log --oneline -5
   npm test
   ```

6. **Folytatás:**
   - Claude kérdez: "Hol tartottunk?"
   - Te: "Sprint 1 kész, kezdjük Sprint 2-t"
   - Claude: "Oké, Sprint 2 planning..."

---

## 🐛 TROUBLESHOOTING

### **Probléma: Claude Code nem indul**

**Megoldás:**
```bash
# 1. Ellenőrzés:
npx @anthropic-ai/claude-code --version

# 2. Ha 404 error:
# Package törölve lett vagy soha nem volt publikus
# Alternatíva: Cursor AI használata

# 3. Cursor telepítés:
brew install --cask cursor
cursor /path/to/project
```

---

### **Probléma: Agent "hallgat" vagy leáll**

**Jelek:**
- "Churned for 4m 1s" → utána semmi
- Prompt után nincs válasz
- Background task fail

**Megoldás:**
1. Ellenőrizd a network connection-t
2. Nézd meg van-e rate limit (API quota)
3. Ellenőrizd a process-t: `ps aux | grep claude`
4. Restart: Kill process + újraindítás

---

### **Probléma: GitHub Actions fail**

**Leggyakoribb okok:**
- Test failure → nézd a log-ot
- Build timeout → növeld a timeout-ot
- Secrets missing → ellenőrizd GitHub Secrets

**Debug:**
```yaml
# .github/workflows/debug.yml
- name: Debug info
  run: |
    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"
    echo "Working dir: $(pwd)"
    ls -la
```

---

### **Probléma: Agent konfliktusok**

**Példa:**
- Backend Agent módosított egy fájlt
- Frontend Agent ugyanazt a fájlt módosítja
- Git merge conflict

**Megelőzés:**
1. **File ownership:** Minden agent megkapja a felelősségi területét
   - Backend: `src/controllers/`, `src/services/`
   - Frontend: `src/components/`, `src/pages/`
   - Mobile: `src/screens/`, `src/components/`

2. **Branch strategy:**
   - main → production
   - develop → integration
   - feature/agent-name-task → agent work

3. **Auto-merge rules:**
   - Ha nincs conflict → auto-merge
   - Ha van conflict → human review

---

## 📊 METRIKÁK & KPI-k

### **Development Velocity:**

- **Sprint velocity:** Hány task/story point per sprint
- **Lead time:** Ötlettől production-ig
- **Deployment frequency:** Hányszor deploy-olunk per nap

**Target:**
- Sprint velocity: 20 story points/week
- Lead time: < 3 nap (feature → production)
- Deployment: 2x/nap minimum

---

### **Quality Metrics:**

- **Test coverage:** Backend 80%+, Frontend 70%+
- **Bug escape rate:** < 5% (production bug / total features)
- **Mean time to recovery (MTTR):** < 1 óra

---

### **Agent Performance:**

- **Task completion rate:** 95%+
- **Code review approval:** 90%+ first-time
- **Test pass rate:** 98%+

---

## 🎯 KÖVETKEZŐ LÉPÉSEK

### **MOST (következő 24 óra):**

1. ✅ Elolvasod ezt a guide-ot
2. ✅ Megnézed a PHASE_1_SETUP.md-t
3. ✅ Telepíted a Core Team-et (CEO, CTO, 3 Dev, QA)
4. ✅ Első automated daily standup

### **1 HÉT:**

1. ✅ Sprint 1 befejezés (Projects & Tasks)
2. ✅ Sprint 2 indítás (Pénzügy modul)
3. ✅ CI/CD pipeline élesítése

### **2 HÉT:**

1. ✅ Advisory Layer telepítése (Logic, UX, Legal)
2. ✅ GDPR compliance audit
3. ✅ Design system v1.0

### **1 HÓNAP:**

1. ✅ Full automation (DevOps, monitoring)
2. ✅ Production deployment
3. ✅ Zero-touch workflow

---

## 📞 SUPPORT & HELP

Ha bármi probléma:

1. **Nézd meg:** `TROUBLESHOOTING.md`
2. **Recovery:** `RECOVERY_GUIDE.md`
3. **Setup help:** `PHASE_1_SETUP.md`
4. **Kérdezd Claude-ot:**
   ```
   "Read AGENTIC_TEAM_MASTER_GUIDE.md and help me with [problem]"
   ```

---

## ✅ CHECKLIST - SIKERES SETUP

- [ ] AGENTIC_TEAM_MASTER_GUIDE.md elolvasva
- [ ] PHASE_1_SETUP.md elkezdve
- [ ] Claude Code telepítve
- [ ] GitHub Actions pipeline működik
- [ ] Első agent commit sikeres
- [ ] Daily standup automation beállítva
- [ ] Backup strategy működik
- [ ] Recovery protokoll tesztelve

---

## 🎉 GRATULÁLOK!

Ha idáig eljutottál, **készen állsz az agentic development-re!**

**Következő lépés:** `PHASE_1_SETUP.md`

**Jó munkát!** 🚀

---

**Verzió:** 1.0  
**Utolsó frissítés:** 2026-03-07  
**Készítette:** Claude Agent 🤖 + Balázs 👨‍💻
