# 🚀 GYORS INDÍTÁS - HR-ERP Backend

## Legegyszerűbb út (Docker - 5 perc)

### 1. Előfeltételek
- Docker Desktop telepítve és fut
- Terminál / Command Prompt

### 2. Lépések

```bash
# 1. Navigálj a projekt mappába
cd hr-erp-backend

# 2. Környezeti változók beállítása
# Windows:
copy .env.example .env

# Mac/Linux:
cp .env.example .env

# 3. Szerkeszd az .env fájlt:
# - JWT_SECRET=valami_nagyon_titkos_kulcs_ide_123xyz
# - Mentsd el

# 4. Docker konténerek indítása
docker-compose up -d

# 5. Várj kb. 30 másodpercet (adatbázis inicializálás)

# 6. Tesztadatok feltöltése
docker-compose exec backend npm run db:seed
```

### 3. Tesztelés

**API fut:** http://localhost:3000

**Health check:**
```bash
curl http://localhost:3000/health
```

**Bejelentkezés teszt:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"kiss.janos@abc-kft.hu\",\"password\":\"password123\"}"
```

Ha JSON választ kapsz egy token-nel, működik! ✅

---

## Teszt felhasználók

| Email | Jelszó | Szerepkör |
|-------|--------|-----------|
| admin@hr-erp.com | password123 | Szuperadmin |
| kiss.janos@abc-kft.hu | password123 | Admin (ABC Kft.) |
| toth.anna@abc-kft.hu | password123 | Felhasználó |
| vizvezetek@example.com | password123 | Alvállalkozó |

---

## Gyakori parancsok

```bash
# Logok megtekintése
docker-compose logs -f backend

# Újraindítás
docker-compose restart backend

# Leállítás
docker-compose down

# Teljes törlés (adatbázissal együtt!)
docker-compose down -v
```

---

## Mit csináljak most?

1. ✅ **Postman / Insomnia telepítése** - API teszteléshez
2. ✅ **Bejelentkezés tesztelése** - Token megszerzése
3. ✅ **Ticketek lekérése** - GET /api/v1/tickets (token-nel!)
4. ✅ **Új ticket létrehozása** - POST /api/v1/tickets
5. ✅ **Dokumentáció olvasása** - README.md

---

## Következő lépés: Mobilalkalmazás csatlakoztatása

A backend API most már fut és készen áll arra, hogy a mobilalkalmazás (React Native) vagy az admin felület (React) csatlakozzon hozzá.

**API Base URL:** `http://localhost:3000/api/v1`

**Például mobilappból:**
```javascript
const API_BASE = 'http://localhost:3000/api/v1';

// Login
const response = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'toth.anna@abc-kft.hu',
    password: 'password123'
  })
});

const { data } = await response.json();
const token = data.token;

// Ticketek lekérése
const ticketsResponse = await fetch(`${API_BASE}/tickets`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Problémák?

**Docker nem indul:**
- Ellenőrizd, hogy a Docker Desktop fut-e
- Windows: WSL2 backend szükséges

**Port már használatban (3000):**
- Változtasd meg az `.env` fájlban: `PORT=3001`
- Indítsd újra: `docker-compose up -d`

**Adatbázis hiba:**
- Töröld és újra: `docker-compose down -v && docker-compose up -d`
- Várj 30 másodpercet, majd seed: `docker-compose exec backend npm run db:seed`

---

**Kész vagy! A backend fut! 🎉**
