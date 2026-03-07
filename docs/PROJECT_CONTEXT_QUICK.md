# 📊 PROJECT CONTEXT - HR-ERP PROJEKT

**Utolsó frissítés:** 2026-03-07 09:00  
**Sprint:** Sprint 2 (Pénzügy modul) - KEZDÉS  
**Projekt státusz:** ACTIVE DEVELOPMENT  

---

## 🎯 PROJEKT ÁTTEKINTÉS

**Név:** HR-ERP Integrált Vállalatirányítási Rendszer

**Cél:** Modern, mobilbarát HR és ERP rendszer kisvállalkozásoknak

**Tech Stack:**
- Backend: Node.js 18 + Express 4 + MySQL 8
- Frontend: React 18 + Vite + Material-UI  
- Mobile: React Native 0.81.5 + Expo ~54.0.33

**Repository:** https://github.com/lerch1979/ESP-project (PRIVATE)

**Local:** `/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/`

---

## ✅ SPRINT 1 COMPLETE (2026-03-07)

**Commit:** e9b5859a

**Deliverables:**
- 3 új komponens (ProjectCard, TaskCard, ExpandableSection)
- 4 új screen (ProjectList, ProjectDetail, TaskList, TaskDetail)
- Dashboard bővített (expandable sections)
- More menü kategorizált
- Backend API: projectAPI + taskAPI

**Development time:** 4 perc (Claude Code automated)

---

## 🚧 SPRINT 2 - MOST KEZDJÜK

**Pénzügy Modul - Story Points: 20**

**HIGH PRIORITY:**
1. Invoice API (Backend) - 3 pts
2. InvoiceListScreen (Mobile) - 2 pts
3. InvoiceDetailScreen (Mobile) - 3 pts
4. Cost Center Model (Backend) - 2 pts

**KÖVETKEZŐ FELADAT:** Invoice API implementation

---

## 🤖 ACTIVE AGENTS

1. **Claude** (Project Manager) - ACTIVE ✅
2. **Claude Code** - ACTIVE ✅  
   - Command: `npx @anthropic-ai/claude-code --remote-control`
3. **GitHub Actions** - ACTIVE ✅

**Setup in Progress:**
- CEO Agent (priority setting)
- QA Agent (testing automation)

---

## ⚠️ KNOWN ISSUES

- Expo tunnel connection unstable
- Test coverage <70% mobilon  
- Backend nincs futtatva (kell: `docker-compose up -d`)

---

## 🔄 RECOVERY

Ha Claude leáll:
1. Töltsd be: `AGENTIC_TEAM_MASTER_GUIDE.md`
2. Töltsd be: `RECOVERY_GUIDE.md`
3. Töltsd be: `PROJECT_CONTEXT.md`

---

**Verzió:** 2.0  
**Készítette:** Claude + Balázs 🤖👨‍💻
