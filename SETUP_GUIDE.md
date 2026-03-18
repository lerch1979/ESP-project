# HR-ERP Platform — Setup Guide

## Prerequisites

| Requirement | Minimum Version | Install |
|------------|----------------|---------|
| macOS | 12+ | — |
| Homebrew | any | [brew.sh](https://brew.sh) |
| Node.js | 18+ | `brew install node` |
| npm | 9+ | Comes with Node.js |

## One-Time Setup

```bash
cd ~/Desktop/HR-ERP-PROJECT
chmod +x setup.sh start-all.sh stop-all.sh
./setup.sh
```

This will automatically:
1. Install PostgreSQL (if missing)
2. Create the `hr_erp_db` database
3. Configure all `.env` files
4. Install npm dependencies (backend, admin, mobile)
5. Run all database migrations
6. Seed test users and sample data

## Daily Startup

```bash
./start-all.sh
```

Opens 3 Terminal windows:
- **Backend API** on port 3001
- **Admin UI** on port 5173
- **Mobile Web** on port 8082

## Stopping

```bash
./stop-all.sh
```

Gracefully stops all 3 services.

## URLs

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3001 |
| Admin UI | http://localhost:5173 |
| Mobile Web | http://localhost:8082 |
| API Health | http://localhost:3001/api/v1/health |

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Superadmin | admin@hr-erp.com | password123 |
| Employee | toth.anna@abc-kft.hu | password123 |

## Troubleshooting

### PostgreSQL won't start
```bash
brew services restart postgresql@14
# or check which version you have:
brew services list | grep postgres
```

### Port already in use
```bash
# Kill process on specific port
lsof -ti :3001 | xargs kill
# Or stop all HR-ERP services
./stop-all.sh
```

### Database connection fails
```bash
# Check PostgreSQL is running
pg_isready

# Verify database exists
psql -l | grep hr_erp_db

# Recreate database (WARNING: deletes data)
dropdb hr_erp_db
createdb hr_erp_db
cd "hr-erp backend/hr-erp-backend"
npm run db:migrate
npm run db:migrate:seed
npm run db:seed
```

### Migration errors
```bash
cd "hr-erp backend/hr-erp-backend"
# Check migration status
npm run db:migrate:status

# Re-run pending migrations
npm run db:migrate
```

### Admin UI can't reach backend
1. Verify backend is running: `curl http://localhost:3001/api/v1/health`
2. Check `hr-erp-admin/.env` contains: `VITE_API_URL=http://localhost:3001/api/v1`
3. Restart Admin UI

### Mobile can't reach backend
1. Check `hr-erp-mobile/src/services/api.js` has `LOCAL_IP = 'localhost'`
2. Verify backend is on port 3001

### Fresh start (reset everything)
```bash
./stop-all.sh
dropdb hr_erp_db
./setup.sh
./start-all.sh
```
