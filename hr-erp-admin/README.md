# HR-ERP Admin Webes Felület

React alapú admin dashboard a HR-ERP rendszerhez.

## 🚀 Gyors indítás

### 1. Telepítés

```bash
npm install
```

### 2. Környezeti változók

Másold át az `.env.example` fájlt `.env` néven:

```bash
copy .env.example .env
```

(Mac/Linux-on: `cp .env.example .env`)

### 3. Indítás

```bash
npm run dev
```

Az alkalmazás elérhető: **http://localhost:3001**

---

## 📝 Teszt bejelentkezés

| Email | Jelszó | Szerepkör |
|-------|--------|-----------|
| kiss.janos@abc-kft.hu | password123 | Admin |
| admin@hr-erp.com | password123 | Szuperadmin |

---

## 🎯 Sprint 1 funkciók (KÉSZ)

- ✅ Bejelentkezés
- ✅ Dashboard statisztikákkal
- ✅ Oldalsó navigáció
- ✅ Felső menüsor
- ✅ Kijelentkezés
- ✅ Token kezelés
- ✅ API integráció

---

## 🔜 Következő sprintek

### Sprint 2 (következő):
- Ticketek lista (szűrés, lapozás)
- Ticket részletek
- Megjegyzések megjelenítése

### Sprint 3:
- Új ticket létrehozása
- Státusz frissítés
- Megjegyzés hozzáadása

### Sprint 4:
- Felhasználók kezelése
- Szerepkörök módosítása

---

## 🛠️ Technológiák

- **React 18** - Frontend framework
- **Vite** - Build tool
- **Material-UI (MUI)** - UI komponensek
- **React Router** - Navigáció
- **Axios** - API kommunikáció
- **React Toastify** - Értesítések

---

## 📁 Projekt struktúra

```
src/
├── components/        # Újrahasználható komponensek
│   ├── Layout.jsx    # Oldalsó menü + felső sáv
│   └── PrivateRoute.jsx
├── pages/            # Oldalak
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── Tickets.jsx
│   └── Users.jsx
├── services/         # API szolgáltatások
│   └── api.js
├── App.jsx          # Fő alkalmazás
└── main.jsx         # Entry point
```

---

## ⚙️ Parancssok

```bash
# Fejlesztői szerver indítása
npm run dev

# Production build
npm run build

# Build előnézete
npm run preview
```

---

## 🔗 Backend kapcsolat

A frontend automatikusan csatlakozik a backend API-hoz:
- **Backend URL:** http://localhost:3000/api/v1
- **Frontend URL:** http://localhost:3001

A Vite proxy automatikusan továbbítja az `/api` kéréseket a backend-nek.

---

## 📱 Mobilalkalmazásba átültetés

A kód könnyen átültethető React Native-ba:
- API szolgáltatások ugyanazok
- Komponens logika hasonló
- Csak a MUI komponenseket kell React Native komponensekre cserélni

---

**Készült:** Claude AI  
**Dátum:** 2024-02-11  
**Sprint:** 1 / 5
