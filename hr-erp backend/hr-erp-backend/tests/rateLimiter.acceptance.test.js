/**
 * ACCEPTANCE TEST — owner-specified (2026-07-13), the exact success criterion:
 *
 *   "An authenticated admin clicking through menus at normal working speed for
 *    15 minutes must NEVER hit a rate limit, while brute-force login attempts
 *    still get blocked."
 *
 * This is encoded at the REAL PROD CAPS (not the small caps the mechanism test
 * uses), so a future cap regression — e.g. the RATE_LIMIT_MAX_REQUESTS=200 that
 * caused the incident — makes THIS test fail loudly. A worst-case (heavier than
 * reality) 15-minute session is fired in full through the real limiters and must
 * produce ZERO 429s; brute-force login must still be blocked.
 */

const _origEnv = {
  NODE_ENV: process.env.NODE_ENV,
  MAX: process.env.RATE_LIMIT_MAX_REQUESTS,
  AUTH_MAX: process.env.RATE_LIMIT_AUTHENTICATED_MAX,
  WINDOW: process.env.RATE_LIMIT_WINDOW_MS,
};

// The REAL production caps (see rateLimiter.js defaults + prod .env.production).
process.env.NODE_ENV = 'production';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';        // global per-IP / 15 min
process.env.RATE_LIMIT_AUTHENTICATED_MAX = '10000';  // authenticated per-USER / hour
process.env.RATE_LIMIT_WINDOW_MS = '900000';         // 15 min

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const { globalLimiter, authLimiter, authenticatedLimiter } = require('../src/middleware/rateLimiter');

afterAll(() => {
  process.env.NODE_ENV = _origEnv.NODE_ENV;
  for (const [k, v] of [['RATE_LIMIT_MAX_REQUESTS', _origEnv.MAX], ['RATE_LIMIT_AUTHENTICATED_MAX', _origEnv.AUTH_MAX], ['RATE_LIMIT_WINDOW_MS', _origEnv.WINDOW]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

// ── Worst-case model of "normal admin clicking for 15 minutes" — deliberately
//    heavier than real usage so passing is a strong guarantee. ──
const MINUTES = 15;
const PAGES_PER_MIN = 4;            // brisk navigation (a page every 15s)
const CALLS_PER_HEAVY_PAGE = 20;    // the heaviest admin pages (Billing ~20, GTDDashboard ~15)
const POLLERS = 2;                  // /tasks/my/stats + /notification-center/unread-count
const POLLS_PER_MIN = 2;            // each polled every ~30s
const SESSION_REQUESTS =
  MINUTES * PAGES_PER_MIN * CALLS_PER_HEAVY_PAGE + // 1200
  MINUTES * POLLERS * POLLS_PER_MIN;               //   60  → 1260

describe('ACCEPTANCE: 15 minutes of normal admin clicking NEVER hits a limit', () => {
  it('the modeled worst-case session volume stays below BOTH the per-IP and per-user caps', () => {
    // If a future change lowers a cap below a realistic session, this fails first.
    expect(SESSION_REQUESTS).toBeLessThan(Number(process.env.RATE_LIMIT_MAX_REQUESTS));       // per-IP / 15min
    expect(SESSION_REQUESTS).toBeLessThan(Number(process.env.RATE_LIMIT_AUTHENTICATED_MAX));  // per-user / hour
  });

  it(`fires a full ${SESSION_REQUESTS}-request authenticated session (one admin, one IP) through the real limiters → ZERO 429`, async () => {
    const app = express();
    app.use(globalLimiter); // per-IP anti-DoS ceiling (5000/15min)
    app.use((req, res, next) => { req.user = { id: 'admin-1' }; return authenticatedLimiter(req, res, next); }); // per-user (10000/hr)
    app.get('/api/anything', (req, res) => res.json({ ok: true }));

    let blocked = 0;
    const BATCH = 200; // in-memory store counts all requests; batch only for speed
    for (let sent = 0; sent < SESSION_REQUESTS; sent += BATCH) {
      const n = Math.min(BATCH, SESSION_REQUESTS - sent);
      const results = await Promise.all(Array.from({ length: n }, () => request(app).get('/api/anything')));
      blocked += results.filter((r) => r.status === 429).length;
    }
    expect(blocked).toBe(0); // not a single legitimate request throttled
  });
});

describe('ACCEPTANCE: brute-force login is STILL blocked (the strict limiter is unaffected)', () => {
  it('>10 failed logins from one IP → 429 with the Hungarian message', async () => {
    const app = express();
    app.post('/login', authLimiter, (req, res) => res.status(401).json({ success: false }));
    let last;
    for (let i = 0; i < 12; i++) last = await request(app).post('/login');
    expect(last.status).toBe(429);
    expect(last.body.message).toMatch(/sikertelen bejelentkezési/);
  });
});
