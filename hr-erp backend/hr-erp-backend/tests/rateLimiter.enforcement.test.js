/**
 * Rate-limiter ENFORCEMENT regression tests — guards the 2026-07 prod incident.
 *
 * Incident: the global per-IP limiter was env-overridden to 200/15min and applied to
 * ALL /api traffic (counting successes), so the OWNER doing normal admin work (data-heavy
 * pages fan out ~15–20 calls each) got 429'd mid-click. Guarantees pinned here:
 *   1. normal admin traffic under the (generous) ceiling is NEVER blocked;
 *   2. the strict limiter stays scoped to login brute-force ONLY;
 *   3. authenticated traffic gets a generous PER-USER budget (shared-NAT safe);
 *   4. every block returns a clear Hungarian message.
 *
 * The sibling rateLimiter.test.js covers the NODE_ENV=test passthrough. This file loads
 * the limiter in PRODUCTION mode with small env caps so thresholds are reachable in a few
 * requests. Env is restored in afterAll so it never leaks to other suites in the worker.
 */

const _origEnv = {
  NODE_ENV: process.env.NODE_ENV,
  MAX: process.env.RATE_LIMIT_MAX_REQUESTS,
  AUTH_MAX: process.env.RATE_LIMIT_AUTHENTICATED_MAX,
  WINDOW: process.env.RATE_LIMIT_WINDOW_MS,
};

// MUST be set before requiring the module — it reads env at load and branches on NODE_ENV.
process.env.NODE_ENV = 'production';
process.env.RATE_LIMIT_MAX_REQUESTS = '5';          // global per-IP cap (prod ~5000)
process.env.RATE_LIMIT_AUTHENTICATED_MAX = '3';     // per-user cap (prod 10000)
process.env.RATE_LIMIT_WINDOW_MS = '900000';

// Keep the module's startup logger.info lines out of the test output.
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const {
  globalLimiter,
  authLimiter,
  authenticatedLimiter,
} = require('../src/middleware/rateLimiter');

afterAll(() => {
  process.env.NODE_ENV = _origEnv.NODE_ENV;
  if (_origEnv.MAX === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS;
  else process.env.RATE_LIMIT_MAX_REQUESTS = _origEnv.MAX;
  if (_origEnv.AUTH_MAX === undefined) delete process.env.RATE_LIMIT_AUTHENTICATED_MAX;
  else process.env.RATE_LIMIT_AUTHENTICATED_MAX = _origEnv.AUTH_MAX;
  if (_origEnv.WINDOW === undefined) delete process.env.RATE_LIMIT_WINDOW_MS;
  else process.env.RATE_LIMIT_WINDOW_MS = _origEnv.WINDOW;
});

describe('globalLimiter — coarse per-IP anti-DoS ceiling', () => {
  const app = express();
  app.use(globalLimiter);
  app.get('/api/thing', (req, res) => res.json({ ok: true }));

  it('lets normal admin traffic through up to the cap, then blocks with a clear Hungarian message', async () => {
    // Requests 1..5 (== cap) succeed — normal clicking is never throttled below the ceiling.
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/thing');
      expect(res.status).toBe(200);
    }
    // 6th trips the ceiling → 429 with the Hungarian message + success:false envelope.
    const blocked = await request(app).get('/api/thing');
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.message).toMatch(/Túl sok kérés ebből a címből/);
  });
});

describe('authLimiter — strict, scoped to login brute-force ONLY', () => {
  // NOTE: authLimiter is the real exported singleton with ONE in-memory per-IP counter,
  // and supertest always originates from 127.0.0.1. The success test therefore runs FIRST:
  // with skipSuccessfulRequests the 25 successes net the counter back to 0, leaving the
  // brute-force test a clean budget. (Success-then-fail is also the realistic sequence.)
  it('does NOT count SUCCESSFUL logins toward the cap (skipSuccessfulRequests)', async () => {
    const app = express();
    app.post('/login', authLimiter, (req, res) => res.json({ success: true }));
    // Far more than the cap of 10, all successful → never blocked.
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/login');
      expect(res.status).toBe(200);
    }
  });

  it('blocks brute force after 10 FAILED logins from one IP', async () => {
    const app = express();
    app.post('/login', authLimiter, (req, res) => res.status(401).json({ success: false }));
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/login');
      expect(res.status).toBe(401); // failed attempts allowed up to the cap
    }
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/sikertelen bejelentkezési/);
  });
});

describe('authenticatedLimiter — generous PER-USER budget (keyed by user id, not IP)', () => {
  // Simulate the authenticateToken seam: set req.user from a header, then the limiter.
  const app = express();
  app.use((req, res, next) => {
    req.user = { id: req.headers['x-user-id'] };
    return authenticatedLimiter(req, res, next);
  });
  app.get('/api/data', (req, res) => res.json({ ok: true }));

  it('bounds a single user after its cap, then blocks with the per-user Hungarian message', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/data').set('x-user-id', 'userA');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get('/api/data').set('x-user-id', 'userA');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Túl sok kérés\. Kérjük várjon 1 órát/);
  });

  it('keys by USER, not IP: a different user on the same IP has an independent budget', async () => {
    // userA is already exhausted above; userB (same client IP) must be fresh → shared-NAT safe.
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/data').set('x-user-id', 'userB');
      expect(res.status).toBe(200);
    }
  });
});
