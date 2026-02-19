/**
 * Test the bulk import endpoint with munkavallalok_300_teszt.xlsx
 * Run: node scripts/test_bulk_import.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const API = '/api/v1';

// Seed credentials from seed.js
const LOGIN_EMAIL = 'kiss.janos@abc-kft.hu';
const LOGIN_PASSWORD = 'password123';

// ── Helper: HTTP JSON request ─────────────────────────────────────

function jsonRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Helper: Multipart file upload ─────────────────────────────────

function uploadFile(urlPath, filePath, fieldName, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now().toString(36);
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const url = new URL(urlPath, BASE_URL);
    const req = http.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Bulk Import Test ===\n');

  // Step 1: Get employee count before import
  console.log('1. Getting current employee count...');
  const preLogin = await jsonRequest('POST', `${API}/auth/login`, {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
  });

  if (!preLogin.data.success) {
    console.error('   Login failed:', preLogin.data.message || preLogin.data);
    console.error('   Make sure the server is running and seed data exists.');
    return;
  }

  const token = preLogin.data.data?.token || preLogin.data.token;
  console.log(`   Logged in as: ${LOGIN_EMAIL}`);
  console.log(`   Token: ${token.substring(0, 30)}...`);

  // Get employee count before
  const beforeRes = await jsonRequest('GET', `${API}/employees?page=1&limit=1`, null, token);
  const beforeTotal = beforeRes.data.data?.pagination?.total || 'unknown';
  console.log(`   Current employees: ${beforeTotal}`);

  // Step 2: Upload the file
  const filePath = path.join(__dirname, '..', 'munkavallalok_300_teszt.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error(`   File not found: ${filePath}`);
    console.error('   Run: node scripts/generate_test_employees.js first');
    return;
  }

  const fileSize = fs.statSync(filePath).size;
  console.log(`\n2. Uploading ${path.basename(filePath)} (${(fileSize / 1024).toFixed(1)} KB)...`);

  const startTime = Date.now();
  const result = await uploadFile(`${API}/employees/bulk`, filePath, 'file', token);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`   HTTP Status: ${result.status}`);
  console.log(`   Time: ${elapsed}s`);

  if (result.data.success) {
    console.log(`\n   ✅ SUCCESS: ${result.data.message}`);
    console.log(`   Imported: ${result.data.data.imported}`);
    console.log(`   Errors: ${result.data.data.errors.length}`);

    if (result.data.data.errors.length > 0) {
      console.log('\n   First 10 errors:');
      result.data.data.errors.slice(0, 10).forEach(err => {
        console.log(`     Row ${err.row}: ${err.message}`);
      });
      if (result.data.data.errors.length > 10) {
        console.log(`     ... and ${result.data.data.errors.length - 10} more`);
      }
    }
  } else {
    console.log(`\n   ❌ FAILED: ${result.data.message || JSON.stringify(result.data)}`);
    if (result.data.data?.errors) {
      console.log('   Errors:');
      result.data.data.errors.slice(0, 10).forEach(err => {
        console.log(`     Row ${err.row}: ${err.message}`);
      });
    }
    return;
  }

  // Step 3: Verify - get employee count after
  console.log('\n3. Verifying import...');
  const afterRes = await jsonRequest('GET', `${API}/employees?page=1&limit=1`, null, token);
  const afterTotal = afterRes.data.data?.pagination?.total || 'unknown';
  console.log(`   Employees after import: ${afterTotal}`);
  console.log(`   New employees: ${afterTotal - beforeTotal}`);

  // Step 4: Spot-check some imported records
  console.log('\n4. Spot-checking imported data...');
  const sampleRes = await jsonRequest('GET', `${API}/employees?page=1&limit=5&sort=created_at&order=desc`, null, token);

  if (sampleRes.data.success && sampleRes.data.data?.employees) {
    const employees = sampleRes.data.data.employees;
    console.log(`   Last ${employees.length} employees:`);
    employees.forEach((emp, i) => {
      const name = `${emp.last_name || ''} ${emp.first_name || ''}`.trim();
      console.log(`   ${i + 1}. ${name} | ${emp.email || '-'} | ${emp.gender || '-'} | ${emp.position || '-'} | ${emp.workplace || '-'}`);
      if (emp.birth_date || emp.tax_id || emp.passport_number) {
        const bd = emp.birth_date ? emp.birth_date.substring(0, 10) : '-';
        console.log(`      Birth: ${bd} | Tax: ${emp.tax_id || '-'} | Passport: ${emp.passport_number || '-'} | Room: ${emp.room_number || '-'}`);
      }
      if (emp.permanent_address_city || emp.company_name) {
        console.log(`      City: ${emp.permanent_address_city || '-'} | Company: ${emp.company_name || '-'} | Bank: ${emp.bank_account || '-'}`);
      }
    });
  }

  // Step 5: Check field presence on imported records
  console.log('\n5. Checking field completeness on latest imports...');
  const checkRes = await jsonRequest('GET', `${API}/employees?page=1&limit=300&sort=created_at&order=desc`, null, token);

  if (checkRes.data.success && checkRes.data.data?.employees) {
    const emps = checkRes.data.data.employees;
    const fields = [
      'first_name', 'last_name', 'email', 'phone', 'gender',
      'birth_date', 'birth_place', 'mothers_name', 'tax_id',
      'passport_number', 'social_security_number', 'marital_status',
      'arrival_date', 'visa_expiry', 'room_number', 'bank_account',
      'workplace', 'permanent_address_city', 'permanent_address_zip',
      'permanent_address_county', 'permanent_address_country',
      'permanent_address_street', 'permanent_address_number',
      'company_name', 'company_email', 'company_phone', 'position',
    ];

    const counts = {};
    fields.forEach(f => counts[f] = 0);
    emps.forEach(emp => {
      fields.forEach(f => {
        if (emp[f] && emp[f] !== '') counts[f]++;
      });
    });

    console.log(`   Checked ${emps.length} employees:`);
    const filled = fields.filter(f => counts[f] > 0);
    const empty = fields.filter(f => counts[f] === 0);

    filled.forEach(f => {
      const pct = ((counts[f] / emps.length) * 100).toFixed(0);
      console.log(`   ✅ ${f}: ${counts[f]}/${emps.length} (${pct}%)`);
    });

    if (empty.length > 0) {
      console.log('\n   Fields with no data (may not be in API response):');
      empty.forEach(f => console.log(`   ⚠️  ${f}: 0/${emps.length}`));
    }
  }

  console.log('\n=== Test Complete ===');
}

main().catch(err => {
  console.error('Test failed:', err.message || err);
  process.exit(1);
});
