/**
 * Security Test Suite - Integration Runner
 *
 * Runs all security-related tests as a unified suite.
 * Execute: npm run test:security
 */

describe('Security Test Suite', () => {
  describe('Sprint 1: PII Encryption', () => {
    require('../encryption.test.js');
  });

  describe('Sprint 2: Rate Limiting', () => {
    require('../rateLimiter.test.js');
  });

  describe('Sprint 2: CSRF Protection', () => {
    require('../csrf.test.js');
  });

  describe('Sprint 2: Security Headers', () => {
    require('../securityHeaders.test.js');
  });

  describe('Sprint 3: SQL Injection Prevention', () => {
    require('./sql-injection.test.js');
  });

  describe('Sprint 3: XSS Prevention', () => {
    require('./xss-prevention.test.js');
  });
});
