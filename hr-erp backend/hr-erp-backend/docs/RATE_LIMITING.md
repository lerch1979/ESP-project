# Rate Limiting Configuration Guide

## Overview

The HR-ERP backend implements tiered rate limiting to protect against abuse and brute-force attacks. Limits are **environment-aware** — relaxed in development, strict in production.

## Environment-Based Configuration

Rate limits are automatically adjusted based on `NODE_ENV`:

### Test Mode (`NODE_ENV=test`)

All limiters are **no-op passthroughs** — zero rate limiting during tests.

### Development Mode (`NODE_ENV=development`)

Relaxed limits for comfortable development:

| Tier | Limit | Window | Notes |
|---|---|---|---|
| **Global** | 10,000 req | 15 min | Effectively unlimited for dev |
| **Auth** | 5 req | 15 min | **STRICT** — same as production |
| **Password Reset** | 3 req | 1 hour | **STRICT** — same as production |
| **File Upload** | 1,000 req | 1 hour | High for testing |
| **Authenticated** | 100,000 req | 1 hour | Effectively unlimited |
| **Speed Limiter** | Delay after 1,000 req | 15 min | Very relaxed |

Successful requests are **skipped** in dev (don't count toward limits), except for auth/password-reset.

### Production Mode (`NODE_ENV=production`)

Balanced limits for security + usability:

| Tier | Limit | Window | Notes |
|---|---|---|---|
| **Global** | 1,000 req | 15 min | ~66 req/min per IP |
| **Auth** | 5 req | 15 min | Brute-force protection |
| **Password Reset** | 3 req | 1 hour | Abuse prevention |
| **File Upload** | 50 req | 1 hour | Reasonable for normal use |
| **Authenticated** | 10,000 req | 1 hour | ~166 req/min per user |
| **Speed Limiter** | Delay after 50 req | 15 min | 500ms progressive delay |

### Critical Security Limits (NEVER relaxed)

These are **STRICT in ALL environments**:
- **Login**: 5 attempts/15min
- **Password Reset**: 3 attempts/hour

Brute-force attacks are real threats even in development.

## How It Works

1. **Global limiter** applies to all API requests by IP address
2. **Auth limiter** adds stricter limits on login endpoints
3. **Speed limiter** gradually slows responses after threshold (500ms delay per request over threshold)
4. **Authenticated limiter** tracks by user ID instead of IP

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment: development, production, test |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Global rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | Global max requests per window (prod) |

## Response Headers

Rate-limited endpoints include standard headers:
- `RateLimit-Limit` — Max requests allowed
- `RateLimit-Remaining` — Requests remaining in current window
- `RateLimit-Reset` — Time when the window resets (Unix timestamp)

## Error Response (429 Too Many Requests)

```json
{
  "success": false,
  "message": "Túl sok kérés ebből a címből. Kérjük várjon 15 percet."
}
```

## Applying Custom Limits to Routes

```javascript
const { uploadLimiter } = require('../middleware/rateLimiter');

// Apply to specific routes
router.post('/upload', uploadLimiter, controller.upload);
```

## Scaling Recommendations

For 10,000+ concurrent users:
1. Use Redis store instead of memory: `rate-limit-redis`
2. Increase limits proportionally
3. Add load balancer with IP-based distribution
4. Consider CDN for static assets
5. Implement request queuing for burst traffic

### Redis Store Setup

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
