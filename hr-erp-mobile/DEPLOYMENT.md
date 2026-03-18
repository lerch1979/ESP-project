# HR-ERP Mobile App — Deployment Guide

## Prerequisites

- Node.js 18+ & npm
- Expo CLI (`npm install -g expo-cli`)
- Docker & Docker Compose (for backend)
- EAS CLI (`npm install -g eas-cli`) for production builds

## Development Setup

```bash
# 1. Start backend (Docker)
cd "hr-erp backend/hr-erp-backend"
docker-compose up -d

# 2. Verify backend
curl http://localhost:3000/health

# 3. Start mobile app
cd hr-erp-mobile
npm install
npx expo start --web --clear
```

## Environment Variables

### Mobile (.env)
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_ENV=development
```

### Mobile Production (.env.production)
```
EXPO_PUBLIC_API_URL=https://api.your-domain.com/api/v1
EXPO_PUBLIC_ENV=production
```

### Backend (.env) — Key Variables
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/hr_erp_db
JWT_SECRET=<strong-random-string>
JWT_REFRESH_SECRET=<strong-random-string>
CORS_ORIGIN=https://app.your-domain.com,https://admin.your-domain.com
CSRF_ENABLED=true
CAREPATH_ENCRYPTION_KEY=<pgp-key>
```

## Build Commands

### Web
```bash
npx expo export --platform web
# Output in dist/ directory, deploy to any static host
```

### iOS (EAS Build)
```bash
eas build --platform ios --profile production
eas submit --platform ios
```

### Android (EAS Build)
```bash
eas build --platform android --profile production
eas submit --platform android
```

## Database Migrations

```bash
cd "hr-erp backend/hr-erp-backend"
# Migrations run automatically on container start
# Manual: docker exec hr-erp-backend node migrations/run.js
```

### Key Migration Files
- `058_blue_colibri_schema.sql` — WellMind tables
- `059_carepath_schema.sql` — CarePath tables
- `060_wellbeing_integration_schema.sql` — Cross-module integration

## Docker Production

```bash
# Build optimized image
docker build -t hr-erp-backend:latest .

# Run with production config
docker-compose -f docker-compose.prod.yml up -d
```

## Security Checklist

- [x] Environment variables not in git
- [x] JWT token expiry: 15 min access, 7 day refresh
- [x] Password hashing: bcrypt (12 rounds)
- [x] SQL injection prevention: parameterized queries
- [x] XSS prevention: Helmet headers
- [x] CSRF protection: double-submit cookie pattern
- [x] Rate limiting: express-rate-limit
- [x] CORS: explicit origin whitelist
- [x] HTTPS enforcement: production middleware
- [x] Session notes encryption: PGP symmetric

## Monitoring

- Health check: `GET /health`
- API status: `GET /api/v1/health`
- Logs: `docker logs hr-erp-backend -f`
- Log files: `logs/` directory (Winston)

## Troubleshooting

| Issue | Solution |
|---|---|
| CORS error on mobile web | Add origin to `CORS_ORIGIN` env var |
| CSRF 403 on login | Auth endpoints exempt — check server.js |
| Pulse history fails | Verify `CAST($2 AS INTEGER)` in SQL |
| Assessment 403 | Use `/assessment/questions` not `/admin/questions` |
| Docker won't start | Check port 3000/5432/6379 availability |
| Expo build fails | Clear cache: `npx expo start --clear` |
