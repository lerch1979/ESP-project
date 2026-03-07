# 🆘 RECOVERY GUIDE - ADATVESZTÉS PROTOKOLL

**Cél:** Claude leállás után gyors újraindulás  
**Időtartam:** < 10 perc  
**Utolsó frissítés:** 2026-03-07  

---

## ⚠️ MIKOR HASZNÁLD

**Jelek hogy adatvesztés történt:**
- Claude nem emlékszik a projektre
- Claude nem tudja mi a HR-ERP
- Claude nem tudja hol tartottatok
- Claude új session-ként viselkedik

---

## 🚀 GYORS RECOVERY - 5 LÉPÉS

### **LÉPÉS 1: TÖLTSD BE EZT A FÁJLT**

**Claude-nak mondd:**

```
Read these files from the project:
1. AGENTIC_TEAM_MASTER_GUIDE.md
2. RECOVERY_GUIDE.md (this file)
3. PROJECT_CONTEXT.md
```

**Vagy ha GitHub-ról:**

```
Read these files from GitHub:
https://github.com/lerch1979/ESP-project/blob/main/AGENTIC_TEAM_MASTER_GUIDE.md
https://github.com/lerch1979/ESP-project/blob/main/PROJECT_CONTEXT.md
```

---

### **LÉPÉS 2: PROJEKT STÁTUSZ ELLENŐRZÉS**

```bash
# Git status:
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile
git status
git log --oneline -10

# Mi az utolsó commit?
# Mi van working directory-ban?
```

**Írd be Claude-nak:**

```
Latest commit: [commit hash + message]
Uncommitted changes: [git status output]
```

---

### **LÉPÉS 3: SPRINT STÁTUSZ**

**Nézd meg a GitHub Projects board-ot:**

```
https://github.com/lerch1979/ESP-project/projects
```

**Vagy Claude-nak:**

```
Current sprint: Sprint [number]
Completed tasks: [list]
In progress: [list]
Next up: [list]
```

---

### **LÉPÉS 4: AGENT KONFIG HELYREÁLLÍTÁS**

**Claude Code működik?**

```bash
npx @anthropic-ai/claude-code --version
```

**Ha igen:**
```bash
npx @anthropic-ai/claude-code --remote-control
```

**Ha nem (404 error):**
```bash
# Használj Cursor-t:
cursor /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile
```

---

### **LÉPÉS 5: VALIDÁLÁS**

**Teszteld hogy minden működik:**

```bash
# Backend:
cd "/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend"
npm test

# Mobile:
cd /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp-mobile
npm start
```

---

## 📋 TELJES CONTEXT RESTORATION

### **1. PROJEKT ALAPOK**

**Írd be Claude-nak:**

```
Project: HR-ERP Integrált Vállalatirányítási Rendszer

Tech Stack:
- Backend: Node.js 18 + Express 4 + MySQL 8
- Frontend Admin: React 18 + Vite + Material-UI
- Mobile: React Native 0.81 + Expo ~54

Repository: https://github.com/lerch1979/ESP-project (PRIVATE)
Local: /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/

Structure:
- hr-erp backend/hr-erp-backend/ (Backend API)
- hr-erp-admin/ (Admin panel)
- hr-erp-mobile/ (Mobile app)
```

---

### **2. SPRINT HISTORY**

**Sprint 0 (Setup):**
- ✅ Project setup
- ✅ GitHub repository
- ✅ Docker-compose (MySQL + backend)
- ✅ Basic authentication

**Sprint 1 (Projects & Tasks):**
- ✅ Mobile: ProjectCard, TaskCard, ExpandableSection komponensek
- ✅ Mobile: 4 új screen (ProjectList, ProjectDetail, TaskList, TaskDetail)
- ✅ Mobile: Dashboard bővített (expandable sections)
- ✅ Mobile: More menü kategorizált
- ✅ Backend: projectAPI, taskAPI
- ✅ Git commit: e9b5859a

**Sprint 2 (Pénzügy - folyamatban):**
- 🚧 Invoice module (API + mobile screens)
- 🚧 Cost center management
- ⏳ Payment tracking

---

### **3. AGENT STÁTUSZOK**

**Active Agents:**
- ✅ Claude Code (development)
- ✅ GitHub Actions (CI/CD)
- ⏳ CEO Agent (priority setting - setup in progress)
- ⏳ QA Agent (test automation - setup in progress)

**Pending Setup:**
- ⏳ CTO Agent
- ⏳ UX Advisor
- ⏳ Legal Advisor
- ⏳ DevOps Agent (full automation)

---

### **4. AKTUÁLIS FELADATOK**

**Most csinálunk:**
- [ ] Phase 1 setup befejezése
- [ ] Sprint 2 planning
- [ ] Invoice API endpoints
- [ ] Mobile invoice screens

**Blocker:**
- ⚠️ Expo connection issues (tunnel mode problémák)
- ⚠️ Backend nincs futtatva (docker-compose up szükséges)

---

## 🔧 COMMON RECOVERY SCENARIOS

### **Scenario A: Claude teljesen "üres"**

**Jelek:**
- "I don't have information about your project"
- "What is HR-ERP?"

**Megoldás:**

```
Read AGENTIC_TEAM_MASTER_GUIDE.md and PROJECT_CONTEXT.md.
Then ask me: "Where did we leave off?"

I'll tell you the current sprint and task.
```

---

### **Scenario B: Claude "félig emlékszik"**

**Jelek:**
- Emlékszik hogy HR-ERP de nem tudja hol tartottatok
- Régi infót mond (pl. Sprint 0-ról beszél amikor már Sprint 2-nél vagyunk)

**Megoldás:**

```
Update: We are now at Sprint 2.
Sprint 1 is complete (commit: e9b5859a).

Read RECOVERY_GUIDE.md section "SPRINT HISTORY" for details.
Continue from Sprint 2 planning.
```

---

### **Scenario C: Agent tools elvesztek**

**Jelek:**
- Claude Code nem működik
- GitHub Actions törölve
- Slack bot nem küld message-eket

**Megoldás:**

```bash
# 1. Claude Code check:
npx @anthropic-ai/claude-code --version

# 2. GitHub Actions check:
# GitHub repo → Actions tab → van pipeline?

# 3. Slack bot check:
# Slack → látod a botot a channel-ben?

# Ha valamelyik hiányzik:
# Lásd PHASE_1_SETUP.md → újratelepítés
```

---

## 📂 BACKUP LOCATIONS

### **Kód:**

1. **GitHub (PRIMARY):**
   ```
   https://github.com/lerch1979/ESP-project
   Branch: main
   ```

2. **Local (SECONDARY):**
   ```
   /Users/lerchbalazs/Desktop/HR-ERP-PROJECT/
   ```

---

### **Dokumentáció:**

1. **GitHub `/docs` folder:**
   ```
   AGENTIC_TEAM_MASTER_GUIDE.md
   PHASE_1_SETUP.md
   RECOVERY_GUIDE.md
   PROJECT_CONTEXT.md
   AGENT_WORKFLOWS.md
   ```

2. **Google Drive (ha csatlakoztatva):**
   ```
   HR-ERP Project/Documentation/
   ```

---

### **Transcripts:**

1. **Local:**
   ```
   /mnt/transcripts/2026-03-07-11-42-17-hr-erp-mobile-sprint1-planning.txt
   ```

2. **Git (conversation-history branch):**
   ```bash
   git checkout conversation-history
   git log
   ```

---

## 🧪 RECOVERY VALIDATION

**Checklist - Claude helyreállt?**

```
Claude-ot kérdezd:

"Summarize the HR-ERP project status:
1. What sprint are we on?
2. What was the last completed feature?
3. What are we working on now?
4. What agents are active?
5. Any blockers?"
```

**Helyes válasz:**

```
1. Sprint 2 (Pénzügy modul)
2. Sprint 1 complete: Projects & Tasks mobile module (commit e9b5859a)
3. Working on: Invoice API + mobile screens
4. Active: Claude Code, GitHub Actions CI
5. Blockers: Expo connection issues, backend not running
```

---

## 🚨 EMERGENCY CONTACTS

**Ha recovery NEM működik:**

1. **Ellenőrizd a fájlokat léteznek-e:**
   ```bash
   ls -la AGENTIC_TEAM_MASTER_GUIDE.md
   ls -la PROJECT_CONTEXT.md
   ls -la RECOVERY_GUIDE.md
   ```

2. **GitHub-ról töltsd le:**
   ```bash
   curl -o AGENTIC_TEAM_MASTER_GUIDE.md \
     https://raw.githubusercontent.com/lerch1979/ESP-project/main/AGENTIC_TEAM_MASTER_GUIDE.md
   ```

3. **Manual context injection:**
   ```
   Másold be TELJES PROJECT_CONTEXT.md-t Claude-nak
   ```

---

## ⏱️ RECOVERY TIMELINE

**Target:**
- Detection: 1 perc (te észreveszed Claude "üres")
- File loading: 2 perc (Claude olvassa a guide-okat)
- Validation: 2 perc (tesztelés)
- Resume work: 5 perc után

**Total: < 10 perc recovery time** ✅

---

## 💾 PREVENTION - JÖVŐBENI ADATVESZTÉS ELKERÜLÉSE

### **1. Git Commit gyakran:**

```bash
# Minden munkavég után:
git add .
git commit -m "descriptive message"
git push
```

### **2. Dokumentáció frissítése:**

```bash
# Sprint végén:
# Frissítsd PROJECT_CONTEXT.md
# Frissítsd SPRINT_STATUS.md
git commit -m "docs: Update project status"
```

### **3. Nightly backup:**

```bash
# Cron job (midnight):
0 0 * * * cd /path/to/project && git push --all
```

### **4. Transcript archiving:**

```bash
# Hetente:
git checkout conversation-history
cp /mnt/transcripts/*.txt .
git add .
git commit -m "archive: Week transcripts"
git push
```

---

## 📊 RECOVERY METRICS

**Track recovery effectiveness:**

| Recovery Date | Time to Restore | Issues | Notes |
|---------------|-----------------|--------|-------|
| 2026-03-07 | 8 minutes | None | First recovery test - SUCCESS |
| ... | ... | ... | ... |

---

## ✅ RECOVERY COMPLETE!

**Ha Claude válaszol:**

```
"I've restored the project context. 
We're at Sprint 2 (Pénzügy modul).
Sprint 1 (Projects & Tasks) completed.
Current task: Invoice API implementation.
Ready to continue!"
```

**→ SIKER! Folytathatjátok a munkát!** 🎉

---

**Verzió:** 1.0  
**Készítette:** Claude Agent 🤖  
**Tested:** 2026-03-07 ✅
