# Rate Limiting Configuration Guide

## Overview

The HR-ERP backend implements tiered rate limiting to protect against abuse and brute-force attacks. Different endpoint categories have different limits.

## Rate Limit Tiers

| Tier | Limit | Window | Applied To |
|---|---|---|---|
| **Global** | 100 req | 15 min | All `/api/` routes (per IP) |
| **Auth** | 5 req | 15 min | Login, register (per IP) |
| **Password Reset** | 3 req | 1 hour | Password reset (per IP) |
| **File Upload** | 10 req | 1 hour | File uploads (per IP) |
| **Authenticated** | 1000 req | 1 hour | All routes (per user ID) |
| **Speed Limiter** | Delay after 50 req | 15 min | All `/api/` routes (progressive delay) |

## How It Works

1. **Global limiter** applies to all API requests by IP address
2. **Auth limiter** adds stricter limits on login endpoints (skips successful requests)
3. **Speed limiter** gradually slows responses after 50 requests (500ms delay per request over threshold)
4. **Superadmin bypass** — users with `superadmin` role skip rate limits

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Set to `false` to disable all rate limiting |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Global rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Global max requests per window |

## Response Headers

Rate-limited endpoints include standard headers:
- `RateLimit-Limit` — Max requests allowed
- `RateLimit-Remaining` — Requests remaining in current window
- `RateLimit-Reset` — Time when the window resets (Unix timestamp)

## Error Response (429 Too Many Requests)

```json
{
  "success": false,
  "message": "Túl sok kérés erről az IP címről, kérjük próbálja később.",
  "retryAfter": "Kérjük várjon 15 percet."
}
```

## Applying Custom Limits to Routes

```javascript
const { uploadLimiter } = require('../middleware/rateLimiter');

// Apply to specific routes
router.post('/upload', uploadLimiter, controller.upload);
```

## Production: Redis Store

For multi-instance deployments, switch to Redis-backed store:

```bash
npm install rate-limit-redis
```

```javascript
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });

const limiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }),
  // ... other options
});
```
