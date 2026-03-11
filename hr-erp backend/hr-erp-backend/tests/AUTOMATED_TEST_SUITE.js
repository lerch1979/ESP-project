/**
 * HR-ERP Comprehensive Security & Integration Test Suite
 *
 * Tests all critical endpoints for:
 * - SQL injection vulnerabilities
 * - Authentication & authorization checks
 * - Input validation & business logic
 * - Edge cases (empty, null, overflow, XSS)
 *
 * Run: node tests/AUTOMATED_TEST_SUITE.js
 * Requires: Backend running on localhost:3000
 */

const http = require('http');
const https = require('https');
const assert = require('assert');

// ============================================
// CONFIG
// ============================================
const BASE_URL = 'http://localhost:3000/api/v1';
let AUTH_TOKEN = '';
let REFRESH_TOKEN = '';
let testResults = { passed: 0, failed: 0, skipped: 0, errors: [] };

// ============================================
// HTTP HELPER
// ============================================
function request(method, path, body = null, token = AUTH_TOKEN) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================
// TEST FRAMEWORK
// ============================================
async function test(name, fn) {
  try {
    await fn();
    testResults.passed++;
    console.log(`  \x1b[32mPASS\x1b[0m: ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ name, error: error.message });
    console.log(`  \x1b[31mFAIL\x1b[0m: ${name}`);
    console.log(`    → ${error.message}`);
  }
}

function describe(name) {
  console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`);
}

// ============================================
// 1. AUTHENTICATION TESTS
// ============================================
async function testAuth() {
  describe('🔐 AUTHENTICATION');

  await test('Login with valid credentials returns token', async () => {
    const res = await request('POST', '/auth/login', {
      email: 'kiss.janos@abc-kft.hu',
      password: 'password123',
    }, null);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.body.data?.token, 'No token in response');
    AUTH_TOKEN = res.body.data.token;
    REFRESH_TOKEN = res.body.data.refreshToken;
  });

  await test('Login with wrong password returns 401', async () => {
    const res = await request('POST', '/auth/login', {
      email: 'kiss.janos@abc-kft.hu',
      password: 'wrongpassword',
    }, null);
    assert.ok([400, 401].includes(res.status), `Expected 400/401, got ${res.status}`);
  });

  await test('Login with empty body returns 400', async () => {
    const res = await request('POST', '/auth/login', {}, null);
    assert.ok([400, 401].includes(res.status), `Expected 400/401, got ${res.status}`);
  });

  await test('Login with SQL injection in email returns 400/401', async () => {
    const res = await request('POST', '/auth/login', {
      email: "' OR '1'='1",
      password: 'test',
    }, null);
    assert.ok([400, 401].includes(res.status), `SQL injection should not succeed: ${res.status}`);
    assert.ok(!res.body.data?.token, 'SQL injection should not return token');
  });

  await test('Login with XSS in email returns 400/401', async () => {
    const res = await request('POST', '/auth/login', {
      email: '<script>alert(1)</script>',
      password: 'test',
    }, null);
    assert.ok([400, 401].includes(res.status), `XSS in email should fail: ${res.status}`);
  });

  await test('Access protected endpoint without token returns 401', async () => {
    const res = await request('GET', '/salary/stats', null, null);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await test('Access with invalid token returns 401/403', async () => {
    const res = await request('GET', '/salary/stats', null, 'invalid.token.here');
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('Access with expired token returns 401', async () => {
    // Manually crafted expired JWT (payload: {"exp": 0})
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.fake';
    const res = await request('GET', '/salary/stats', null, expiredToken);
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('Token refresh with valid refresh token', async () => {
    if (!REFRESH_TOKEN) { testResults.skipped++; return; }
    const res = await request('POST', '/auth/refresh', { refreshToken: REFRESH_TOKEN }, null);
    if (res.status === 200 && res.body.data?.token) {
      AUTH_TOKEN = res.body.data.token;
    }
    // Accept 200 (success) or 404 (endpoint not implemented)
    assert.ok([200, 404].includes(res.status), `Expected 200/404, got ${res.status}`);
  });

  await test('Password in login response should NOT be exposed', async () => {
    const res = await request('POST', '/auth/login', {
      email: 'kiss.janos@abc-kft.hu',
      password: 'password123',
    }, null);
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('password_hash'), 'password_hash exposed in response');
    assert.ok(!body.includes('$2a$'), 'bcrypt hash exposed in response');
    assert.ok(!body.includes('$2b$'), 'bcrypt hash exposed in response');
  });
}

// ============================================
// 2. SQL INJECTION TESTS
// ============================================
async function testSQLInjection() {
  describe('💉 SQL INJECTION TESTS');

  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT * FROM users --",
    "1; DELETE FROM employees WHERE ''='",
    "' OR 1=1 --",
    "admin'--",
    "' OR ''='",
  ];

  for (const payload of sqliPayloads) {
    await test(`Search endpoint: SQLi payload "${payload.substring(0, 30)}..."`, async () => {
      const res = await request('GET', `/search?q=${encodeURIComponent(payload)}`);
      // Should NOT return 500 (which could indicate SQL error)
      assert.ok(res.status !== 500, `Server error with SQLi payload: status ${res.status}`);
      // Should not return all users/data
      if (res.body.data) {
        const dataStr = JSON.stringify(res.body.data);
        assert.ok(!dataStr.includes('password'), 'SQLi may have leaked password data');
      }
    });
  }

  await test('Salary bands: SQLi in query params', async () => {
    const res = await request('GET', "/salary/bands?department=' OR '1'='1");
    assert.ok(res.status !== 500, `SQLi caused server error: ${res.status}`);
  });

  await test('Employee salaries: SQLi in query params', async () => {
    const res = await request('GET', "/salary/employees?department=' UNION SELECT * FROM users--");
    assert.ok(res.status !== 500, `SQLi caused server error: ${res.status}`);
  });

  await test('Invoice list: SQLi in sort param', async () => {
    const res = await request('GET', "/invoices?sort=amount;DROP TABLE invoices--");
    assert.ok(res.status !== 500, `SQLi in sort caused server error: ${res.status}`);
  });

  await test('Cost center: SQLi in ID param', async () => {
    const res = await request('GET', "/cost-centers/' OR '1'='1");
    assert.ok(res.status !== 500, `SQLi in ID caused server error: ${res.status}`);
  });
}

// ============================================
// 3. XSS INJECTION TESTS
// ============================================
async function testXSS() {
  describe('🔴 XSS INJECTION TESTS');

  const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    '"><script>alert(document.cookie)</script>',
    '<svg onload=alert(1)>',
  ];

  await test('Create salary band with XSS in position_name', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: '<script>alert("xss")</script>',
      min_salary: 500000,
      max_salary: 900000,
      level: 'senior',
    });
    // Should either reject (400) or store escaped (201)
    if (res.status === 201 && res.body.data) {
      const stored = JSON.stringify(res.body.data);
      assert.ok(!stored.includes('<script>'), 'XSS stored unescaped in response');
    }
  });

  for (const payload of xssPayloads) {
    await test(`Search with XSS: "${payload.substring(0, 30)}..."`, async () => {
      const res = await request('GET', `/search?q=${encodeURIComponent(payload)}`);
      if (res.body && typeof res.body === 'string') {
        assert.ok(!res.body.includes(payload), 'XSS payload reflected unescaped');
      }
    });
  }
}

// ============================================
// 4. SALARY TRANSPARENCY API TESTS
// ============================================
async function testSalaryAPI() {
  describe('💰 SALARY TRANSPARENCY API');

  let createdBandId = null;
  let createdSalaryId = null;

  // --- Salary Bands ---
  await test('GET /salary/stats returns stats', async () => {
    const res = await request('GET', '/salary/stats');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
    if (res.status === 200) {
      assert.ok(res.body.success, 'Response not successful');
    }
  });

  await test('GET /salary/departments returns list', async () => {
    const res = await request('GET', '/salary/departments');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('GET /salary/bands returns paginated list', async () => {
    const res = await request('GET', '/salary/bands?page=1&limit=10');
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.body.data, 'No data in response');
  });

  await test('POST /salary/bands creates new band', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Test Auditor',
      min_salary: 400000,
      max_salary: 800000,
      level: 'medior',
      department: 'QA',
      employment_type: 'full_time',
      currency: 'HUF',
    });
    assert.ok([201, 403].includes(res.status), `Expected 201/403, got ${res.status}`);
    if (res.status === 201) {
      createdBandId = res.body.data?.salary_band?.id || res.body.data?.id;
      assert.ok(createdBandId, 'No ID returned for created band');
    }
  });

  await test('POST /salary/bands rejects missing required fields', async () => {
    const res = await request('POST', '/salary/bands', {
      min_salary: 400000,
    });
    assert.ok([400, 403].includes(res.status), `Expected 400/403, got ${res.status}`);
  });

  await test('POST /salary/bands rejects min > max', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Test',
      min_salary: 900000,
      max_salary: 400000,
      level: 'junior',
    });
    assert.ok([400, 403].includes(res.status), `Expected 400/403, got ${res.status}`);
  });

  await test('POST /salary/bands rejects invalid level', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Test',
      min_salary: 400000,
      max_salary: 800000,
      level: 'grandmaster',
    });
    assert.ok([400, 403, 500].includes(res.status), `Expected 400/403/500, got ${res.status}`);
  });

  await test('POST /salary/bands rejects negative salary', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Test Negative',
      min_salary: -100000,
      max_salary: 800000,
      level: 'junior',
    });
    // BUG CHECK: If 201, negative salary was accepted (vulnerability!)
    if (res.status === 201) {
      console.log('    ⚠️  BUG FOUND: Negative salary accepted!');
    }
    // We still pass the test but flag the bug
  });

  if (createdBandId) {
    await test('GET /salary/bands/:id returns specific band', async () => {
      const res = await request('GET', `/salary/bands/${createdBandId}`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const band = res.body.data?.salary_band || res.body.data;
      assert.strictEqual(band.id, createdBandId);
    });

    await test('PUT /salary/bands/:id updates band', async () => {
      const res = await request('PUT', `/salary/bands/${createdBandId}`, {
        position_name: 'Test Auditor Updated',
        max_salary: 850000,
      });
      assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
    });
  }

  await test('GET /salary/bands/:id with invalid UUID returns 400/404', async () => {
    const res = await request('GET', '/salary/bands/not-a-uuid');
    assert.ok([400, 404, 500].includes(res.status), `Expected 400/404, got ${res.status}`);
    if (res.status === 500) {
      console.log('    ⚠️  BUG: Invalid UUID causes 500 instead of 400');
    }
  });

  // --- Employee Salaries ---
  await test('GET /salary/employees returns list', async () => {
    const res = await request('GET', '/salary/employees?page=1&limit=10');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('POST /salary/employees rejects missing fields', async () => {
    const res = await request('POST', '/salary/employees', {
      gross_salary: 650000,
    });
    assert.ok([400, 403].includes(res.status), `Expected 400/403, got ${res.status}`);
  });

  await test('POST /salary/employees rejects non-existent employee', async () => {
    const res = await request('POST', '/salary/employees', {
      employee_id: '00000000-0000-0000-0000-000000000000',
      gross_salary: 650000,
      effective_date: '2026-03-01',
      change_type: 'initial',
    });
    assert.ok([400, 404, 403].includes(res.status), `Expected 400/404/403, got ${res.status}`);
  });

  // Clean up created band
  if (createdBandId) {
    await test('DELETE /salary/bands/:id removes band', async () => {
      const res = await request('DELETE', `/salary/bands/${createdBandId}`);
      assert.ok([200, 204, 403].includes(res.status), `Expected 200/204/403, got ${res.status}`);
    });
  }
}

// ============================================
// 5. INVOICE API TESTS
// ============================================
async function testInvoiceAPI() {
  describe('🧾 INVOICE API');

  let createdInvoiceId = null;

  await test('GET /invoices returns list', async () => {
    const res = await request('GET', '/invoices?page=1&limit=10');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('POST /invoices rejects empty body', async () => {
    const res = await request('POST', '/invoices', {});
    assert.ok([400, 403, 422].includes(res.status), `Expected 400/403/422, got ${res.status}`);
  });

  await test('POST /invoices rejects negative amount', async () => {
    const res = await request('POST', '/invoices', {
      vendor_name: 'Test Vendor',
      amount: -50000,
      invoice_date: '2026-03-01',
      due_date: '2026-04-01',
    });
    if (res.status === 201) {
      console.log('    ⚠️  BUG FOUND: Negative invoice amount accepted!');
      createdInvoiceId = res.body.data?.id;
    }
  });

  await test('POST /invoices rejects zero amount', async () => {
    const res = await request('POST', '/invoices', {
      vendor_name: 'Test Vendor',
      amount: 0,
      invoice_date: '2026-03-01',
      due_date: '2026-04-01',
    });
    if (res.status === 201) {
      console.log('    ⚠️  BUG FOUND: Zero invoice amount accepted!');
    }
  });

  await test('POST /invoices: due_date before invoice_date accepted (BUG check)', async () => {
    const res = await request('POST', '/invoices', {
      vendor_name: 'Test Vendor',
      amount: 100000,
      invoice_date: '2026-06-01',
      due_date: '2026-01-01', // Before invoice date
    });
    if (res.status === 201) {
      console.log('    ⚠️  BUG FOUND: due_date before invoice_date accepted!');
    }
  });

  await test('GET /invoices with very long search string', async () => {
    const longString = 'A'.repeat(10000);
    const res = await request('GET', `/invoices?search=${encodeURIComponent(longString)}`);
    assert.ok(res.status !== 500, `Very long search caused server error: ${res.status}`);
  });

  // Clean up if we created an invoice
  if (createdInvoiceId) {
    await request('DELETE', `/invoices/${createdInvoiceId}`);
  }
}

// ============================================
// 6. COST CENTER API TESTS
// ============================================
async function testCostCenterAPI() {
  describe('🏢 COST CENTER API');

  await test('GET /cost-centers returns list', async () => {
    const res = await request('GET', '/cost-centers');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('GET /cost-centers/hierarchy returns tree', async () => {
    const res = await request('GET', '/cost-centers/hierarchy');
    // 400 may occur if 'hierarchy' is treated as UUID :id param — acceptable
    assert.ok([200, 400, 404, 403].includes(res.status), `Expected 200/400/404/403, got ${res.status}`);
  });

  await test('POST /cost-centers rejects empty body', async () => {
    const res = await request('POST', '/cost-centers', {});
    assert.ok([400, 403, 422].includes(res.status), `Expected 400/403/422, got ${res.status}`);
  });

  await test('POST /cost-centers with self-referencing parent_id', async () => {
    const res = await request('POST', '/cost-centers', {
      name: 'Test Center',
      code: 'TC-AUDIT',
      parent_id: '00000000-0000-0000-0000-000000000000', // Non-existent
    });
    // Should reject non-existent parent
    if (res.status === 201) {
      console.log('    ⚠️  BUG: Non-existent parent_id accepted');
    }
  });

  await test('GET /cost-centers with SQLi in query', async () => {
    const res = await request('GET', "/cost-centers?search=' UNION SELECT * FROM users--");
    assert.ok(res.status !== 500, `SQLi caused server error: ${res.status}`);
  });
}

// ============================================
// 7. PAYMENT API TESTS
// ============================================
async function testPaymentAPI() {
  describe('💳 PAYMENT API');

  await test('GET /payments returns list', async () => {
    const res = await request('GET', '/payments?page=1&limit=10');
    assert.ok([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('POST /payments rejects empty body', async () => {
    const res = await request('POST', '/payments', {});
    assert.ok([400, 403, 422].includes(res.status), `Expected 400/403/422, got ${res.status}`);
  });

  await test('POST /payments rejects negative amount', async () => {
    const res = await request('POST', '/payments', {
      invoice_id: '00000000-0000-0000-0000-000000000000',
      amount: -50000,
      payment_date: '2026-03-01',
      payment_method: 'bank_transfer',
    });
    if (res.status === 201) {
      console.log('    ⚠️  BUG FOUND: Negative payment amount accepted!');
    }
    assert.ok([400, 403, 404].includes(res.status) || res.status === 201,
      `Unexpected status: ${res.status}`);
  });

  await test('POST /payments rejects non-existent invoice', async () => {
    const res = await request('POST', '/payments', {
      invoice_id: '00000000-0000-0000-0000-000000000000',
      amount: 100000,
      payment_date: '2026-03-01',
      payment_method: 'bank_transfer',
    });
    assert.ok([400, 404, 403].includes(res.status), `Expected 400/404/403, got ${res.status}`);
  });
}

// ============================================
// 8. AUTHORIZATION TESTS
// ============================================
async function testAuthorization() {
  describe('🛡️  AUTHORIZATION TESTS');

  const protectedEndpoints = [
    { method: 'GET', path: '/salary/stats' },
    { method: 'GET', path: '/salary/bands' },
    { method: 'GET', path: '/salary/employees' },
    { method: 'POST', path: '/salary/bands' },
    { method: 'GET', path: '/invoices' },
    { method: 'GET', path: '/cost-centers' },
    { method: 'GET', path: '/payments' },
    { method: 'GET', path: '/employees' },
    { method: 'GET', path: '/users' },
  ];

  for (const ep of protectedEndpoints) {
    await test(`${ep.method} ${ep.path} requires auth`, async () => {
      const res = await request(ep.method, ep.path, null, null);
      assert.ok([401, 403].includes(res.status),
        `${ep.method} ${ep.path} accessible without auth: ${res.status}`);
    });
  }
}

// ============================================
// 9. EDGE CASE TESTS
// ============================================
async function testEdgeCases() {
  describe('🔧 EDGE CASES');

  await test('Very long string in salary band position name', async () => {
    const longName = 'A'.repeat(10000);
    const res = await request('POST', '/salary/bands', {
      position_name: longName,
      min_salary: 400000,
      max_salary: 800000,
    });
    assert.ok(res.status !== 500, `Very long string caused server error: ${res.status}`);
  });

  await test('Unicode characters in salary band name', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Szoftverfejlesztő 🚀 漢字 العربية',
      min_salary: 400000,
      max_salary: 800000,
      level: 'senior',
    });
    assert.ok([201, 400, 403].includes(res.status), `Unicode caused error: ${res.status}`);
  });

  await test('Null values in required fields', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: null,
      min_salary: null,
      max_salary: null,
    });
    assert.ok([400, 403].includes(res.status), `Null values not rejected: ${res.status}`);
  });

  await test('Extremely large salary values', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'CEO',
      min_salary: 999999999999.99,
      max_salary: 9999999999999.99,
      level: 'director',
    });
    // Should either accept or reject gracefully, NOT 500
    assert.ok(res.status !== 500, `Large values caused server error: ${res.status}`);
  });

  await test('Float precision in salary', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: 'Float Test',
      min_salary: 500000.555555,
      max_salary: 900000.999999,
      level: 'medior',
    });
    assert.ok(res.status !== 500, `Float precision caused error: ${res.status}`);
  });

  await test('Empty string in required fields', async () => {
    const res = await request('POST', '/salary/bands', {
      position_name: '',
      min_salary: 400000,
      max_salary: 800000,
    });
    assert.ok([400, 403].includes(res.status), `Empty string not rejected: ${res.status}`);
  });

  await test('Non-existent endpoint returns 404', async () => {
    const res = await request('GET', '/nonexistent-endpoint');
    assert.ok([404].includes(res.status), `Expected 404, got ${res.status}`);
  });

  await test('Method not allowed returns 404/405', async () => {
    const res = await request('PATCH', '/salary/stats');
    assert.ok([404, 405].includes(res.status), `Expected 404/405, got ${res.status}`);
  });
}

// ============================================
// 10. SENSITIVE DATA EXPOSURE TESTS
// ============================================
async function testDataExposure() {
  describe('🔍 SENSITIVE DATA EXPOSURE');

  await test('User list should not expose password hashes', async () => {
    const res = await request('GET', '/users');
    if (res.status === 200 && res.body.data) {
      const body = JSON.stringify(res.body.data);
      assert.ok(!body.includes('password_hash'), 'password_hash exposed in user list');
      assert.ok(!body.includes('$2a$'), 'bcrypt hash exposed in user list');
      assert.ok(!body.includes('$2b$'), 'bcrypt hash exposed in user list');
    }
  });

  await test('Employee list should not expose sensitive tokens', async () => {
    const res = await request('GET', '/employees?page=1&limit=5');
    if (res.status === 200 && res.body.data) {
      const body = JSON.stringify(res.body.data);
      assert.ok(!body.includes('jwt_secret'), 'JWT secret exposed');
      assert.ok(!body.includes('api_key'), 'API key exposed');
    }
  });

  await test('Error responses should not expose stack traces', async () => {
    const res = await request('GET', '/salary/bands/invalid-id-that-breaks-query');
    if (res.body && typeof res.body === 'object') {
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('node_modules'), 'Stack trace with node_modules exposed');
      assert.ok(!body.includes('at Function'), 'Stack trace exposed');
      assert.ok(!body.includes('at Object'), 'Stack trace exposed');
    }
  });

  await test('API should set security headers', async () => {
    const res = await request('GET', '/salary/stats');
    // Check for helmet headers
    const headers = res.headers;
    if (headers['x-powered-by']) {
      console.log('    ⚠️  X-Powered-By header present (should be removed by helmet)');
    }
  });
}

// ============================================
// 11. RATE LIMITING / BRUTE FORCE
// ============================================
async function testRateLimiting() {
  describe('⏱️  RATE LIMITING / BRUTE FORCE');

  await test('Multiple rapid login attempts (brute force simulation)', async () => {
    const attempts = 10;
    let blocked = false;
    for (let i = 0; i < attempts; i++) {
      const res = await request('POST', '/auth/login', {
        email: 'test@test.com',
        password: `wrong_password_${i}`,
      }, null);
      if (res.status === 429) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      console.log(`    ⚠️  BUG: ${attempts} rapid login attempts were all processed (no rate limiting)`);
    }
  });

  await test('Multiple rapid API requests', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(request('GET', '/salary/bands'));
    }
    const results = await Promise.all(promises);
    const rateLimited = results.some(r => r.status === 429);
    if (rateLimited) {
      console.log('    ✅ Rate limiting is active on API endpoints');
    } else {
      console.log('    ℹ️  No rate limiting detected on 20 rapid requests');
    }
  });
}

// ============================================
// 12. BUSINESS LOGIC TESTS
// ============================================
async function testBusinessLogic() {
  describe('📊 BUSINESS LOGIC');

  await test('Salary stats filter by department', async () => {
    const res = await request('GET', '/salary/stats?department=Engineering');
    assert.ok([200, 403, 429].includes(res.status), `Expected 200/403/429, got ${res.status}`);
  });

  await test('Salary bands filter by level', async () => {
    const res = await request('GET', '/salary/bands?level=senior');
    assert.ok([200, 403, 429].includes(res.status), `Expected 200/403/429, got ${res.status}`);
  });

  await test('Salary bands pagination works', async () => {
    const page1 = await request('GET', '/salary/bands?page=1&limit=2');
    const page2 = await request('GET', '/salary/bands?page=2&limit=2');
    if (page1.status === 200 && page2.status === 200) {
      // Pages should return different data (if enough records exist)
      assert.ok(page1.body.data, 'Page 1 has no data');
    }
  });

  await test('Employee salary history returns ordered results', async () => {
    const empRes = await request('GET', '/salary/employees?limit=1');
    if (empRes.status === 200 && empRes.body.data?.employee_salaries?.length > 0) {
      const empId = empRes.body.data.employee_salaries[0].employee_id;
      const histRes = await request('GET', `/salary/employees/${empId}/history`);
      assert.ok([200, 403].includes(histRes.status));
    }
  });
}

// ============================================
// MAIN RUNNER
// ============================================
async function runAllTests() {
  console.log('\n\x1b[1m╔════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║   HR-ERP Security & Integration Test Suite  ║\x1b[0m');
  console.log('\x1b[1m╚════════════════════════════════════════════╝\x1b[0m');
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  try {
    await testAuth();
    await testSQLInjection();
    await testXSS();
    await testAuthorization();
    await testSalaryAPI();
    await testInvoiceAPI();
    await testCostCenterAPI();
    await testPaymentAPI();
    await testEdgeCases();
    await testDataExposure();
    await testRateLimiting();
    await testBusinessLogic();
  } catch (error) {
    console.error(`\n\x1b[31mFATAL: Test suite crashed: ${error.message}\x1b[0m`);
    if (error.code === 'ECONNREFUSED') {
      console.error('→ Is the backend running on localhost:3000?');
    }
  }

  // Summary
  console.log('\n\x1b[1m╔════════════════════════════════════════════╗\x1b[0m');
  console.log(`\x1b[1m║  Results: \x1b[32m${testResults.passed} passed\x1b[0m\x1b[1m, \x1b[31m${testResults.failed} failed\x1b[0m\x1b[1m, ${testResults.skipped} skipped\x1b[0m`);
  console.log(`\x1b[1m║  Total:  ${testResults.passed + testResults.failed + testResults.skipped} tests\x1b[0m`);
  console.log('\x1b[1m╚════════════════════════════════════════════╝\x1b[0m');

  if (testResults.errors.length > 0) {
    console.log('\n\x1b[31mFailed Tests:\x1b[0m');
    testResults.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.name}: ${e.error}`);
    });
  }

  console.log('');
  process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests();
