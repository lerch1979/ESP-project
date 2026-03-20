/**
 * K6 Soak Test — HR-ERP Platform
 *
 * Run: k6 run tests/performance/soak-test.js
 *
 * Long-duration test to detect memory leaks: 100 users for 30 minutes
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },    // Ramp up
    { duration: '30m', target: 100 },   // Soak
    { duration: '2m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status ok': (r) => r.status === 200,
    'no degradation': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
