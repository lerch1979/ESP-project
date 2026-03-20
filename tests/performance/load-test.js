/**
 * K6 Load Test — HR-ERP Platform
 *
 * Run: k6 run tests/performance/load-test.js
 *
 * Simulates normal load: ramp to 100 → sustain → ramp to 200 → cool down
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('failed_requests');
const dashboardDuration = new Trend('dashboard_duration');
const userListDuration = new Trend('user_list_duration');
const analyticsDuration = new Trend('analytics_duration');
const healthDuration = new Trend('health_duration');

export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Warm up
    { duration: '3m', target: 100 },   // Normal load
    { duration: '5m', target: 100 },   // Sustain
    { duration: '2m', target: 200 },   // Peak load
    { duration: '5m', target: 200 },   // Sustain peak
    { duration: '2m', target: 0 },     // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    failed_requests: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;

export function setup() {
  // Login to get auth token
  const loginRes = http.post(`${API}/auth/login`, JSON.stringify({
    email: __ENV.TEST_EMAIL || 'admin@hr-erp.com',
    password: __ENV.TEST_PASSWORD || 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status !== 200) {
    console.warn(`Login failed with status ${loginRes.status} — tests will use health endpoint only`);
    return { token: null };
  }

  return { token: loginRes.json('token') };
}

export default function (data) {
  const headers = data.token
    ? { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  // 1. Health check (always works)
  let res = http.get(`${BASE_URL}/health`);
  check(res, { 'health: status 200': (r) => r.status === 200 });
  healthDuration.add(res.timings.duration);
  sleep(0.5);

  if (!data.token) return;

  // 2. Dashboard
  res = http.get(`${API}/dashboard`, { headers });
  const dashOk = check(res, {
    'dashboard: status 200': (r) => r.status === 200,
    'dashboard: < 500ms': (r) => r.timings.duration < 500,
  });
  if (!dashOk) failureRate.add(1);
  dashboardDuration.add(res.timings.duration);
  sleep(1);

  // 3. User list
  res = http.get(`${API}/users?page=1&limit=20`, { headers });
  const usersOk = check(res, {
    'users: status 200': (r) => r.status === 200,
    'users: < 500ms': (r) => r.timings.duration < 500,
  });
  if (!usersOk) failureRate.add(1);
  userListDuration.add(res.timings.duration);
  sleep(1);

  // 4. Analytics overview
  res = http.get(`${API}/analytics/pulse/overview`, { headers });
  const analyticsOk = check(res, {
    'analytics: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'analytics: < 1000ms': (r) => r.timings.duration < 1000,
  });
  if (!analyticsOk) failureRate.add(1);
  analyticsDuration.add(res.timings.duration);
  sleep(1);

  // 5. Tickets list
  res = http.get(`${API}/tickets?page=1&limit=10`, { headers });
  check(res, { 'tickets: status 200': (r) => r.status === 200 });
  sleep(1);

  // 6. Gamification leaderboard
  res = http.get(`${API}/gamification/leaderboard`, { headers });
  check(res, { 'leaderboard: status 2xx': (r) => r.status >= 200 && r.status < 400 });
  sleep(1);
}

export function handleSummary(data) {
  return {
    'tests/performance/load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  // k6 built-in handles this when not overridden
  return '';
}
