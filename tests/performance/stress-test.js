/**
 * K6 Stress Test — HR-ERP Platform
 *
 * Run: k6 run tests/performance/stress-test.js
 *
 * Finds the breaking point: ramp from 0 → 400 concurrent users
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Warm up
    { duration: '3m', target: 100 },   // Normal load
    { duration: '3m', target: 200 },   // High load
    { duration: '3m', target: 300 },   // Very high load
    { duration: '3m', target: 400 },   // Stress level
    { duration: '5m', target: 400 },   // Sustain stress
    { duration: '5m', target: 0 },     // Recovery
  ],
  thresholds: {
    errors: ['rate<0.1'],               // Allow up to 10% errors under stress
    http_req_duration: ['p(95)<2000'],   // 95th percentile under 2s even at stress
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Health check — lightweight endpoint to test raw throughput
  const res = http.get(`${BASE_URL}/health`);
  const success = check(res, {
    'status 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  if (!success) errorRate.add(1);

  sleep(0.5);
}
