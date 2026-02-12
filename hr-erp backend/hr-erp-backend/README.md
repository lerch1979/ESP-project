# HR-ERP Rendszer - Backend API

Integrált HR-ERP rendszer backend API Node.js, Express és PostgreSQL alapokon.

## 🚀 Funkciók

- ✅ Multi-tenant architektúra (több cég egy rendszeren)
- ✅ JWT alapú authentikáció
- ✅ Szerepkör-alapú jogosultságkezelés (RBAC)
- ✅ Ticketing rendszer (hibajegyek kezelése)
- ✅ Audit log (teljes történet minden műveletről)
- ✅ RESTful API
- ✅ PostgreSQL adatbázis
- ✅ Docker támogatás

## 📋 Követelmények

- Node.js 20+ (LTS verzió ajánlott)
- PostgreSQL 16+
- Docker & Docker Compose (opcionális, de ajánlott)

## 🛠️ Telepítés

### Opció 1: Docker Compose (Ajánlott - Legegyszerűbb)

1. **Repository klónozása / fájlok letöltése**

2. **Környezeti változók beállítása**
   ```bash
   cp .env.example .env
   ```
   Szerkeszd az `.env` fájlt és állítsd be:
   - `JWT_SECRET` - Generálj egy erős, véletlen kulcsot
   - Egyéb beállítások opcionálisak

3. **Konténerek indítása**
   ```bash
   docker-compose up -d
   ```

4. **Adatbázis séma betöltése** (ha szükséges)
   A `database_schema.sql` automatikusan betöltődik az első indításkor.

5. **Tesztadatok feltöltése**
   ```bash
   docker-compose exec backend npm run db:seed
   ```

6. **API elérhető:**
   ```
   http://localhost:3000
   ```

### Opció 2: Manuális telepítés (helyi gépen)

1. **PostgreSQL telepítése és indítása**

2. **Adatbázis létrehozása**
   ```bash
   psql -U postgres
   CREATE DATABASE hr_erp_db;
   \q
   ```

3. **Adatbázis séma betöltése**
   ```bash
   psql -U postgres -d hr_erp_db -f database_schema.sql
   ```

4. **Node.js függőségek telepítése**
   ```bash
   npm install
   ```

5. **Környezeti változók**
   ```bash
   cp .env.example .env
   # Szerkeszd az .env fájlt
   ```

6. **Tesztadatok feltöltése**
   ```bash
   npm run db:seed
   ```

7. **Szerver indítása**
   ```bash
   # Development mód (nodemon - auto restart)
   npm run dev

   # Production mód
   npm start
   ```

## 🧪 Tesztelés

### Teszt felhasználók

A seed script létrehoz több teszt felhasználót:

| Email | Jelszó | Szerepkör | Tenant |
|-------|--------|-----------|--------|
| admin@hr-erp.com | password123 | Szuperadmin | - |
| kiss.janos@abc-kft.hu | password123 | Admin | ABC Kft. |
| toth.anna@abc-kft.hu | password123 | Felhasználó | ABC Kft. |
| vizvezetek@example.com | password123 | Alvállalkozó | ABC Kft. |
| kovacs.peter@xyz-zrt.hu | password123 | Admin | XYZ Zrt. |

### API tesztelés Postman-nel / cURL-lel

**1. Bejelentkezés**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "kiss.janos@abc-kft.hu",
    "password": "password123"
  }'
```

Válasz:
```json
{
  "success": true,
  "message": "Sikeres bejelentkezés",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

**2. Ticketek lekérése (token szükséges)**
```bash
curl http://localhost:3000/api/v1/tickets \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**3. Új ticket létrehozása**
```bash
curl -X POST http://localhost:3000/api/v1/tickets \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teszt ticket",
    "description": "Ez egy teszt bejelentés",
    "priority_id": "PRIORITY_UUID"
  }'
```

## 📚 API Dokumentáció

### Auth Endpoints

| Metódus | Endpoint | Leírás | Auth |
|---------|----------|--------|------|
| POST | `/api/v1/auth/login` | Bejelentkezés | ❌ |
| POST | `/api/v1/auth/refresh` | Token frissítés | ❌ |
| GET | `/api/v1/auth/me` | Jelenlegi user adatai | ✅ |
| POST | `/api/v1/auth/logout` | Kijelentkezés | ✅ |

### Ticket Endpoints

| Metódus | Endpoint | Leírás | Auth |
|---------|----------|--------|------|
| GET | `/api/v1/tickets` | Ticketek listája | ✅ |
| GET | `/api/v1/tickets/:id` | Ticket részletei | ✅ |
| POST | `/api/v1/tickets` | Új ticket létrehozás | ✅ |
| PATCH | `/api/v1/tickets/:id/status` | Státusz frissítés | ✅ |
| POST | `/api/v1/tickets/:id/comments` | Megjegyzés hozzáadás | ✅ |

### Query paraméterek (GET /tickets)

- `status` - Státusz szerinti szűrés (slug)
- `category` - Kategória szerinti szűrés (slug)
- `priority` - Prioritás szerinti szűrés (slug)
- `assigned_to` - Felelős szerint szűrés (user ID)
- `search` - Keresés címben és leírásban
- `page` - Oldal száma (default: 1)
- `limit` - Elemek száma oldalanként (default: 20)

## 🔐 Biztonság

- JWT token alapú authentikáció (15 perces lejárat)
- Refresh token (7 napos lejárat)
- Bcrypt jelszó hashelés (10 rounds)
- Helmet.js security headers
- Rate limiting (100 req/15 perc IP-nként)
- CORS konfiguráció
- Multi-tenant adatizoláció
- Szerepkör-alapú jogosultságkezelés

## 📁 Projekt struktúra

```
hr-erp-backend/
├── src/
│   ├── controllers/        # API controller-ek
│   │   ├── auth.controller.js
│   │   └── ticket.controller.js
│   ├── database/           # Adatbázis kapcsolat és migráció
│   │   ├── connection.js
│   │   └── seed.js
│   ├── middleware/         # Express middleware-k
│   │   └── auth.js
│   ├── routes/             # API route-ok
│   │   ├── auth.routes.js
│   │   ├── ticket.routes.js
│   │   ├── user.routes.js
│   │   └── notification.routes.js
│   ├── utils/              # Segédfüggvények
│   │   └── logger.js
│   └── server.js           # Fő szerver fájl
├── logs/                   # Log fájlok
├── uploads/                # Feltöltött fájlok
├── .env.example            # Környezeti változók példa
├── database_schema.sql     # Adatbázis séma
├── docker-compose.yml      # Docker konfiguráció
├── Dockerfile              # Docker image
├── package.json            # Node.js függőségek
└── README.md               # Ez a fájl
```

## 🔧 Környezeti változók

```bash
# Szerver
NODE_ENV=development
PORT=3000

# Adatbázis
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_erp_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🐛 Hibakeresés

### Logok megtekintése

**Docker:**
```bash
docker-compose logs -f backend
```

**Lokális:**
Logok helye: `./logs/combined.log` és `./logs/error.log`

### Gyakori problémák

**1. Adatbázis kapcsolódási hiba**
- Ellenőrizd, hogy a PostgreSQL fut-e
- Ellenőrizd az `.env` fájlban az adatbázis beállításokat

**2. JWT token hibák**
- Ellenőrizd, hogy a `JWT_SECRET` be van-e állítva az `.env` fájlban
- Token lejárt? Kérj új tokent a `/auth/refresh` endpoint-tal

**3. Port már használatban**
- Változtasd meg a `PORT` értéket az `.env` fájlban

## 📈 Következő lépések (Roadmap)

- [ ] Email értesítések (NodeMailer)
- [ ] Push értesítések (Firebase)
- [ ] Fájl feltöltés kezelés (AWS S3)
- [ ] WebSocket valós idejű frissítésekhez
- [ ] Pénzügyi modul API
- [ ] HR modul API (munkavállalók CRUD)
- [ ] Riportok és statisztikák
- [ ] Unit és integrációs tesztek (Jest)
- [ ] API rate limiting Redis-szel
- [ ] Token blacklist Redis-szel (kijelentkezés)

## 🤝 Közreműködés

Ez egy privát projekt. Kérdések esetén vedd fel a kapcsolatot a projekt tulajdonosával.

## 📄 Licenc

Proprietary - Minden jog fenntartva

---

**Készítette:** Claude AI  
**Dátum:** 2024-02-09  
**Verzió:** 1.0.0
