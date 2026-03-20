/**
 * K6 Spike Test — HR-ERP Platform
 *
 * Run: k6 run tests/performance/spike-test.js
 *
 * Simulates sudden traffic spike: 10 → 500 → 10
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },    // Normal
    { duration: '30s', target: 500 },   // Spike!
    { duration: '2m', target: 500 },    // Hold spike
    { duration: '30s', target: 10 },    // Recovery
    { duration: '2m', target: 10 },     // Verify recovery
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<3000'],   // Even during spike, 99th < 3s
    http_req_failed: ['rate<0.15'],      // Allow some failures during spike
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status ok': (r) => r.status === 200,
    'fast response': (r) => r.timings.duration < 3000,
  });
  sleep(0.3);
}
