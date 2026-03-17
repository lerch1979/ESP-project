# Wellbeing Platform — Complete API Documentation

**Base URL:** `http://localhost:3000/api/v1`
**Authentication:** JWT Bearer Token (`Authorization: Bearer <token>`)
**Rate Limiting:** 100 requests/15min (authenticated), 5/15min (login)

## API Summary

| Module | Prefix | Endpoints | Auth |
|--------|--------|-----------|------|
| WellMind | `/wellmind` | 20 | JWT + RBAC |
| CarePath | `/carepath` | 18 | JWT + RBAC |
| Integration | `/wellbeing` | 8 | JWT |
| **Total** | | **46** | |

---

## WellMind API (`/api/v1/wellmind`)

### Employee Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/pulse` | Submit daily pulse survey |
| GET | `/pulse/history` | Pulse trend (30/60/90 days) |
| GET | `/pulse/today` | Today's pulse status + questions |
| POST | `/assessment` | Submit quarterly assessment (MBI+UWES) |
| GET | `/assessment/history` | Assessment history |
| GET | `/my-dashboard` | Personal wellbeing dashboard |
| GET | `/interventions` | List interventions |
| POST | `/interventions/:id/accept` | Accept intervention |
| POST | `/interventions/:id/complete` | Complete with notes + rating |
| POST | `/interventions/:id/skip` | Decline with reason |
| GET | `/coaching-sessions` | List coaching sessions |
| POST | `/coaching-sessions/:id/feedback` | Rate session (1-5) |

### Manager Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/team/:teamId/metrics` | blue_colibri.team.view | Team metrics (min 5 employees) |

### Admin Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/admin/dashboard` | blue_colibri.admin.view | Company dashboard + wellbeing index |
| GET | `/admin/risk-employees` | blue_colibri.admin.manage | High-risk employee list |
| GET | `/admin/trends` | blue_colibri.admin.view | Pulse + risk trends |
| POST | `/admin/questions` | blue_colibri.admin.manage | Create question |
| PUT | `/admin/questions/:id` | blue_colibri.admin.manage | Update question |
| DELETE | `/admin/questions/:id` | blue_colibri.admin.manage | Delete (soft/hard) |
| GET | `/admin/questions` | blue_colibri.admin.view | List questions |
| POST | `/admin/bulk-intervention` | blue_colibri.admin.manage | Company-wide program |

---

## CarePath API (`/api/v1/carepath`)

### Employee Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/categories` | List service categories |
| POST | `/cases` | Create support case |
| GET | `/my-cases` | View own cases |
| GET | `/cases/:id` | Case details + sessions + bookings |
| PUT | `/cases/:id/close` | Close case + satisfaction rating |
| GET | `/providers/search` | Geo-proximity + filter search |
| GET | `/providers/:id` | Provider profile |
| GET | `/providers/:id/availability` | Available time slots |
| POST | `/bookings` | Book appointment |
| GET | `/my-bookings` | View appointments |
| PUT | `/bookings/:id/cancel` | Cancel booking |
| PUT | `/bookings/:id/reschedule` | Reschedule booking |

### Provider Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/provider/sessions` | eap.provider.sessions | Log session (encrypted notes) |
| GET | `/provider/cases` | eap.provider.sessions | View assigned cases |

### Admin Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/admin/usage-stats` | eap.admin.stats | Monthly analytics |
| GET | `/admin/providers` | eap.providers.manage | Provider directory |
| POST | `/admin/providers` | eap.providers.manage | Add provider |
| PUT | `/admin/providers/:id` | eap.providers.manage | Update provider |

---

## Integration API (`/api/v1/wellbeing`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/referrals` | Create cross-module referral |
| GET | `/my-referrals` | View referrals (pending/expired counts) |
| PUT | `/referrals/:id/accept` | Accept (auto-executes action) |
| PUT | `/referrals/:id/decline` | Decline with reason + alternatives |
| GET | `/notifications` | View notifications (unread count) |
| PUT | `/notifications/:id/read` | Mark notification read |
| PUT | `/notifications/read-all` | Mark all read |
| POST | `/feedback` | Submit feedback (1-5 rating) |

---

## Key Request/Response Examples

### Submit Pulse
```bash
curl -X POST http://localhost:3000/api/v1/wellmind/pulse \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mood_score":4,"stress_level":5,"sleep_quality":7,"workload_level":6}'
```

### Geo Provider Search
```bash
curl "http://localhost:3000/api/v1/carepath/providers/search?lat=47.5&lng=19.0&radius=10&provider_type=counselor" \
  -H "Authorization: Bearer $TOKEN"
```

### Accept Referral (auto-creates CarePath case)
```bash
curl -X PUT http://localhost:3000/api/v1/wellbeing/referrals/{id}/accept \
  -H "Authorization: Bearer $TOKEN"
```
Response:
```json
{
  "success": true,
  "data": {
    "referral": {"id": "...", "status": "accepted"},
    "action_taken": {"type": "carepath_case_created", "case_number": "CP-2026-000042"},
    "next_steps": "A CarePath eseted létrejött. Keress szolgáltatót és foglalj időpontot."
  }
}
```

---

## Error Format
```json
{ "success": false, "message": "Hiba leírása" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Permission denied / Privacy (< 5 employees) |
| 404 | Not found |
| 409 | Conflict (duplicate, double-booking) |
| 500 | Server error |

---

## Privacy Rules

- Team metrics: minimum 5 employees for aggregation
- Company index: minimum 5 active users
- Anonymous cases: identity stripped from provider view
- Session notes: pgcrypto encrypted
- Audit log: immutable, logged on all sensitive access
- HR risk alerts: minimum 3 employees threshold
