# HR-ERP Projekt Kontextus és Dokumentáció

## 📋 Projekt Áttekintés

**Projekt név:** HR-ERP Integrált Vállalatirányítási Rendszer
**Kezdés:** 2024-2025
**Jelenlegi állapot:** Beta / Production Ready (Backend & Frontend ~95%, Mobile ~70%)
**GitHub:** https://github.com/lerch1979/ESP-project

## 🎯 Rendszer Célja

Központi, moduláris ERP platform amely:
- Kezeli munkavállalók, bérlők és külső partnerek adatait
- Támogatja digitális HR szolgáltatásokat
- Biztosítja hibajegy (ticketing) alapú ügyintézést
- Lehetővé teszi kétoldalú, időzített kommunikációt
- Pénzügyi-számviteli kiegészítéseket tartalmaz
- Támogatja tanácsadási, oktatási, feladat- és folyamatvezérlési működést

## 🏗️ Architektúra

### Tech Stack

**Backend:**
- Node.js + Express.js
- MySQL adatbázis
- RESTful API
- JWT authentikáció
- Multer (file upload)

**Frontend (Admin):**
- React 18.2
- Vite
- Material-UI v5
- React Router v6
- Axios
- React Query (valószínű)

**Mobile:**
- React Native
- React Navigation
- AsyncStorage
- Axios

**Külső Integrációk:**
- Gmail API (email polling, küldés)
- Google Calendar API
- Claude AI (OCR, chatbot, dokumentum osztályozás)
- Claude Computer Use (automatizálások)

### Projekt Struktúra

```
HR-ERP-PROJECT/
├── hr-erp backend/hr-erp-backend/     # Node.js Backend API
│   ├── src/
│   │   ├── controllers/               # Üzleti logika
│   │   ├── routes/                    # API végpontok
│   │   ├── services/                  # AI szolgáltatások, külső API-k
│   │   ├── middleware/                # Auth, permission check
│   │   ├── database/                  # DB kapcsolat, seed
│   │   └── utils/                     # Logger, cache, email
│   ├── migrations/                    # DB migrációk
│   └── scripts/                       # Seed, test scriptek
│
├── hr-erp-admin/                      # React Frontend (Admin)
│   ├── src/
│   │   ├── components/                # Újrafelhasználható komponensek
│   │   ├── pages/                     # Oldal komponensek
│   │   ├── contexts/                  # React Context (Auth)
│   │   └── services/                  # API kliens
│   └── vite.config.js
│
└── hr-erp-mobile/                     # React Native Mobile App
    ├── src/
    │   ├── screens/                   # Képernyők
    │   ├── components/                # UI komponensek
    │   ├── navigation/                # Stack & Tab navigáció
    │   ├── contexts/                  # AuthContext
    │   └── services/                  # API, storage
    └── App.js
```

## 🔑 Főbb Modulok

### 1. HR & Személyügy
**Fájlok:**
- `employee.controller.js` - CRUD műveletek
- `employee-document.controller.js` - Dokumentumok kezelése
- `EmployeeListScreen.js` (mobile)
- `Employees.jsx` (admin)

**Funkciók:**
- ✅ Munkavállalói törzsadatok (név, elérhetőség, azonosítók)
- ✅ Státuszok (aktív, szabadságon, kilépett, stb.)
- ✅ Dokumentumkezelés (szerződések, igazolások)
- ⚠️ Jogosultság-hozzárendelés (backend kész, mobile hiányzik)

### 2. Ticketing (Hibajegy) Rendszer
**Fájlok:**
- `ticket.controller.js`
- `category.controller.js`
- `priority.controller.js`
- `sla.controller.js` + `sla.service.js`
- `assignmentRule.controller.js` + `autoAssign.service.js`

**Funkciók:**
- ✅ Hibajegy létrehozás (web, mobil)
- ✅ Kategóriák, prioritások
- ✅ SLA követés és automatikus eszkalálás
- ✅ **AUTOMATIKUS HOZZÁRENDELÉS** - AI alapú ticket routing
- ✅ Státuszok (új, folyamatban, várakozik, lezárt)
- ✅ Kétoldalú kommunikáció (kommentek, file csatolás)

### 3. Kommunikáció
**Fájlok:**
- `notification.controller.js` - Push notification
- `emailService.js` - Email küldés
- `email-template.controller.js` - Template kezelés
- `chatbot.controller.js` + `chatbot.service.js` - AI chatbot
- `emailInbox.controller.js` + `gmailUniversalPoller.service.js` - Gmail integráció

**Funkciók:**
- ✅ Push értesítések
- ✅ Email küldés (egyéni, csoportos, időzített)
- ✅ Email template rendszer
- ✅ **CHATBOT** - Claude AI alapú ügyfélszolgálat
- ✅ Gmail inbox monitoring és automatikus feldolgozás

### 4. Pénzügy & Számvitel
**Fájlok:**
- `invoiceDraft.controller.js` - Számlák tervezet
- `invoiceReport.controller.js` - Számlák riportok
- `costCenter.controller.js` - Költséghelyek
- `costCenterPredictor.service.js` - **AI költséghely jóslás**
- `claudeOCR.service.js` - **OCR dokumentum felismerés**
- `documentClassifier.service.js` - **AI dokumentum osztályozás**
- `documentRouter.service.js` - Dokumentum routing
- `entityExtractor.service.js` - Entitás kinyerés

**Funkciók:**
- ✅ Számlák kezelése (draft, jóváhagyás, exportálás)
- ✅ Költséghelyek kezelése
- ✅ **OCR - Claude AI** képes PDF/kép számlákat beolvasni
- ✅ **AI Költséghely Predikció** - automatikusan javasolja a költséghelyet
- ⚠️ Dokumentum osztályozás (backend kész, frontend részleges)

### 5. Projekt Management
**Fájlok:**
- `project.controller.js`
- `task.controller.js`
- `timesheet.controller.js`
- `KanbanBoard.jsx` - Drag & drop kanban
- `TaskCard.jsx`

**Funkciók:**
- ✅ Projektek létrehozása, kezelése
- ✅ Feladatok (tasks) CRUD
- ✅ **Kanban tábla** (@hello-pangea/dnd)
- ✅ Timesheet (munkaidő nyilvántartás)
- ❌ **Mobile verzió hiányzik!** (kritikus gap)

### 6. Tanácsadás & Oktatás
**Fájlok:**
- `video.controller.js` - Videó tartalmak
- `document.controller.js` - Dokumentumok
- FAQ rendszer (chatbot része)

**Funkciók:**
- ✅ Videó library (oktatási anyagok)
- ✅ Dokumentum library
- ✅ FAQ (chatbot integrált)

### 7. Szállás Management
**Fájlok:**
- `accommodation.controller.js`
- `room.controller.js`
- `occupancy.controller.js`

**Funkciók:**
- ✅ Szobák/szállások nyilvántartása
- ✅ Foglaltság követés
- ✅ Riportok

### 8. ERP & Admin
**Fájlok:**
- `dashboard.controller.js` - Statisztikák
- `report.controller.js` - Riportok
- `scheduled-report.controller.js` - Ütemezett riportok
- `calendar.controller.js` + `google-calendar.controller.js`
- `search.controller.js` - Globális keresés
- `activity-log.controller.js` - Audit log
- `user.controller.js` - Felhasználók
- `permission.controller.js` - Jogosultságok
- `userWorkload.controller.js` - Munkaterhelés

**Funkciók:**
- ✅ Dashboard KPI-kkal
- ✅ Riportok (exportálás Excel, PDF)
- ✅ Ütemezett riportok (cron job)
- ✅ Google Calendar integráció
- ⚠️ Keresés (backend kész, optimalizálás szükséges)
- ✅ Activity log (audit trail)
- ✅ Felhasználók & szerepkörök kezelése

## 🤖 AI Integráció (FONTOS!)

### Claude AI Szolgáltatások

**1. OCR - Számlák Beolvasása**
- `claudeOCR.service.js`
- PDF/kép számlákból kinyeri: számla szám, összeg, dátum, kibocsátó, stb.
- Strukturált JSON formátumban adja vissza

**2. Költséghely Predikció**
- `costCenterPredictor.service.js`
- Számla tartalom alapján javasolja a megfelelő költséghelyet
- Tanul a korábbi hozzárendelésekből

**3. Dokumentum Osztályozás**
- `documentClassifier.service.js`
- Automatikusan kategorizálja a beérkező dokumentumokat
- Típusok: számla, szerződés, igazolás, stb.

**4. Entitás Kinyerés**
- `entityExtractor.service.js`
- Kinyeri a neveket, dátumokat, összegeket dokumentumokból

**5. Chatbot**
- `chatbot.service.js`
- Természetes nyelvű ügyfélszolgálat
- FAQ alapú válaszok
- Ticket létrehozás asszisztálás

**6. Automatikus Ticket Hozzárendelés**
- `autoAssign.service.js`
- AI alapú munkatárs kiválasztás
- Figyelembe veszi: skillek, munkaterhelés, távolság, SLA

### Gmail Univerzális Poller
- `gmailUniversalPoller.service.js`
- Folyamatosan figyeli a Gmail inbox-ot
- Automatikusan feldolgozza a beérkező emaileket
- Mellékleteket kimenti és OCR-rel feldolgozza
- Ticketet hoz létre vagy továbbítja

## 🔐 Authentikáció & Jogosultságok

### Auth Flow
1. Login: `POST /api/auth/login` → JWT token
2. Token tárolás: localStorage (admin), AsyncStorage (mobile)
3. Token küldés: `Authorization: Bearer <token>` header
4. Middleware: `auth.js` - token validálás
5. Permission check: `permission.js` - role-based access

### Szerepkörök (RBAC)
- Admin
- User
- Employee
- Contractor
- Custom roles (permission controller)

## 📱 Mobile App Architektúra

### Navigáció
```
AppNavigator (Stack)
└── MainTabNavigator (Bottom Tabs)
    ├── Dashboard
    ├── Tickets (Stack)
    ├── Employees (Stack)
    ├── Calendar
    └── More (Stack)
```

### State Management
- **AuthContext** - Global auth state
- **useState + useEffect** - Local state
- **AsyncStorage** - Persistent storage (token, user)

### API Service
- `services/api.js` - Axios instance, token injection
- Base URL: környezeti változó alapján

## 🚧 JELENLEGI GAPS & KÖVETKEZŐ LÉPÉSEK

### KRITIKUS HIÁNYOSSÁGOK (Mobil)

**❌ Hiányzik mobilból:**
1. **Projektek & Feladatok nézet** - Munkatársak nem látják a feladataikat!
2. **Pénzügy funkciók** - Költséghelyek, számlák
3. **Admin** - Felhasználók, szerepkörök
4. **SLA push értesítések** - Határidő figyelmeztetések
5. **Keresés** - Globális keresés

### Sprint Terv

**Sprint 1 - Mobile Kritikus Funkciók (1-2 hét)**
- [ ] Projektek mobil nézet
- [ ] My Tasks képernyő (saját feladatok)
- [ ] Task részletek + státusz módosítás
- [ ] Push notification fix (SLA, új feladat)
- [ ] Keresés mobil

**Sprint 2 - Mobile Pénzügy (1 hét)**
- [ ] Költséghelyek mobil
- [ ] Számlák megtekintés
- [ ] OCR result nézet

**Sprint 3 - Finomhangolás (1 hét)**
- [ ] Dokumentum osztályozás frontend
- [ ] Keresés optimalizálás
- [ ] Bug fixing

**Sprint 4 - Tesztelés (2 hét)**
- [ ] E2E tesztek
- [ ] Performance optimization
- [ ] Security audit

## 💡 Fontos Design Döntések

### Kódolási Konvenciók

**Backend:**
- `controller.js` - HTTP request handling, válasz formázás
- `service.js` - Üzleti logika, AI hívások, külső API-k
- Mindig try-catch error handling
- Response format: `{ success: true/false, data: {...}, error: '...' }`

**Frontend:**
- Funkcionális komponensek (React Hooks)
- Material-UI komponensek előnyben
- `Modal` komponensek: create/edit műveletek
- `Page` komponensek: lista nézetek

**Mobile:**
- Funkcionális komponensek
- Platform-specific kód minimal
- `Screen` postfix minden képernyőnél
- `Card` komponensek lista elemekhez

### File Upload Flow
1. Multer middleware (backend)
2. File mentés `/uploads` könyvtárba
3. Fájl path adatbázisba
4. OCR feldolgozás (ha számla/dokumentum)
5. AI osztályozás/kinyerés

### Email Template Rendszer
- HTML template-k változókkal: `{{variable}}`
- Backend replace-eli a változókat
- Template preview admin felületen

## 🔧 Deployment & Environment

### Environment Variables
```bash
# Backend
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=hr_erp
JWT_SECRET=your-secret
CLAUDE_API_KEY=sk-...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GOOGLE_CALENDAR_API_KEY=...

# Frontend
VITE_API_URL=http://localhost:3000/api

# Mobile
API_URL=http://192.168.1.x:3000/api
```

### Database
- MySQL 8.0+
- Seed script: `src/database/seed.js`
- 300 teszt dolgozó generálás: `seed_300_employees.js`

## 📚 További Dokumentáció

- **API Docs:** (TODO - Swagger/OpenAPI)
- **Felhasználói Kézikönyv:** (TODO)
- **Deployment Guide:** (TODO)

## ⚠️ KRITIKUS MEGJEGYZÉSEK

1. **Claude Computer Use** - Használtuk a fejlesztés során, tegnap migráció történt
2. **GitHub Repo:** Private, lerch1979/ESP-project
3. **Google Drive:** Projektfájlok megosztva
4. **2FA probléma** - GitHub bejelentkezés Authenticator app-pal
5. **Memória probléma** - Claude leállások után mindent elveszít, ezért FONTOS a dokumentáció!

## 🎯 ÖSSZEFOGLALÁS

Ez egy **nagyon átfogó, jól felépített ERP rendszer**, ami ~95%-ban kész.
A legnagyobb kihívás: **Mobile app utolsó 30%-a**, különösen a Projekt/Feladat nézetek.

**Következő lépés:** Sprint 1 - Mobile kritikus funkciók implementálása.

---
**Utolsó frissítés:** 2026-03-02
**Készítette:** Claude (Anthropic) + Lerch Balázs
