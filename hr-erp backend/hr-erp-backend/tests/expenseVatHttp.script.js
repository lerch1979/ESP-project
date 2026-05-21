/**
 * VAT (migration 114) — HTTP integration smoke.
 *
 * Hits the running backend at http://localhost:3001. Catches the class of
 * bug where the model+service files on disk pass `node tests/...` but the
 * live `npm start` process is still on an older module load — only HTTP
 * roundtrips can surface that.
 *
 * Run with backend up: node tests/expenseVatHttp.script.js
 */

require('dotenv').config();

const jwt = require('jsonwebtoken');
const { query, closePool } = require('../src/database/connection');

const BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;
const createdIds = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${error.message}`);
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function cleanup() {
  if (createdIds.length === 0) return;
  try {
    await query('DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])', [createdIds]);
    await query('DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])', [createdIds]);
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

async function main() {
  // ── Bootstrap ────────────────────────────────────────────────────────
  const u = await query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE r.slug = 'superadmin' AND u.is_active = true LIMIT 1`,
  );
  if (u.rows.length === 0) throw new Error('No superadmin in DB');
  const userId = u.rows[0].id;
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const acc = await query('SELECT id FROM accommodations LIMIT 1');
  const accId = acc.rows[0].id;

  // ── HTTP helpers ─────────────────────────────────────────────────────
  const tag = `vat-http-${Date.now()}`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const post = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const put = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const get = async (path) => {
    const r = await fetch(`${BASE}${path}`, { headers });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  // Each test creates rows with a unique vendor_name so the dedup gate
  // (also live) doesn't bounce them into 409.
  const seed = async (extras) => {
    const r = await post('/api/v1/expenses', {
      accommodation_id: accId,
      billing_month: '1888-12',
      performance_date: '1888-12-15',
      category: 'rezsi',
      amount: 12700,
      vendor_name: `${tag}-${Math.random().toString(36).slice(2, 8)}`,
      notes: tag,
      ...extras,
    });
    if (r.status === 201 && r.body.data?.expense?.id) createdIds.push(r.body.data.expense.id);
    return r;
  };

  // ──────────────────────────────────────────────────────────────────────
  // 1. Standard rate — auto-fill from gross
  // ──────────────────────────────────────────────────────────────────────

  await describe('Standard 27% — server computes net + vat', async () => {
    let r;
    await test('POST {amount: 12700, vat_rate: 27} → 201', async () => {
      r = await seed({ amount: 12700, vat_rate: 27 });
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    await test('response carries computed net=10000 and vat=2700', async () => {
      const e = r.body.data.expense;
      if (parseFloat(e.net_amount) !== 10000) throw new Error(`net=${e.net_amount}`);
      if (parseFloat(e.vat_amount) !== 2700) throw new Error(`vat=${e.vat_amount}`);
      if (parseFloat(e.vat_rate) !== 27) throw new Error(`rate=${e.vat_rate}`);
    });

    await test('GET /:id returns the same values', async () => {
      const e = r.body.data.expense;
      const detail = await get(`/api/v1/expenses/${e.id}`);
      if (detail.status !== 200) throw new Error(`got ${detail.status}`);
      const back = detail.body.data.expense;
      if (parseFloat(back.net_amount) !== 10000) throw new Error('net round-trip');
      if (parseFloat(back.vat_amount) !== 2700) throw new Error('vat round-trip');
      if (parseFloat(back.vat_rate) !== 27) throw new Error('rate round-trip');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. All-three explicit
  // ──────────────────────────────────────────────────────────────────────

  await describe('All-three explicit — server stores verbatim', async () => {
    const r = await seed({
      amount: 10500, vat_rate: 5, net_amount: 10000, vat_amount: 500,
    });
    await test('POST → 201, values preserved', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      const e = r.body.data.expense;
      if (parseFloat(e.net_amount) !== 10000) throw new Error('net');
      if (parseFloat(e.vat_amount) !== 500) throw new Error('vat');
      if (parseFloat(e.vat_rate) !== 5) throw new Error('rate');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. AAM exemption
  // ──────────────────────────────────────────────────────────────────────

  let aamId;
  await describe('AAM exemption — vat_rate stays null, exemption_reason persists', async () => {
    const r = await seed({
      amount: 1000, vat_exemption_reason: 'aam',
      // No rate, no net/vat
    });
    await test('POST → 201, vat_exemption_reason=aam', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      aamId = r.body.data.expense.id;
      const e = r.body.data.expense;
      if (e.vat_exemption_reason !== 'aam') throw new Error(`exemption=${e.vat_exemption_reason}`);
      if (e.vat_rate !== null) throw new Error(`rate should be null, got ${e.vat_rate}`);
      if (e.net_amount !== null) throw new Error('net should be null');
      if (e.vat_amount !== null) throw new Error('vat should be null');
    });

    await test('GET /:id after save returns exemption=aam', async () => {
      const detail = await get(`/api/v1/expenses/${aamId}`);
      const back = detail.body.data.expense;
      if (back.vat_exemption_reason !== 'aam') {
        throw new Error(`reload exemption=${back.vat_exemption_reason}`);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Reverse VAT
  // ──────────────────────────────────────────────────────────────────────

  let revId;
  await describe('Reverse VAT — is_reverse_vat persists', async () => {
    const r = await seed({
      amount: 5000, vat_rate: 0, net_amount: 5000, vat_amount: 0,
      is_reverse_vat: true,
      category: 'karbantartas',
    });
    await test('POST → 201, is_reverse_vat=true', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      revId = r.body.data.expense.id;
      const e = r.body.data.expense;
      if (e.is_reverse_vat !== true) throw new Error(`reverse=${e.is_reverse_vat}`);
      if (parseFloat(e.vat_rate) !== 0) throw new Error(`rate=${e.vat_rate}`);
    });

    await test('GET /:id after save returns is_reverse_vat=true', async () => {
      const detail = await get(`/api/v1/expenses/${revId}`);
      const back = detail.body.data.expense;
      if (back.is_reverse_vat !== true) throw new Error(`reload reverse=${back.is_reverse_vat}`);
      if (parseFloat(back.vat_rate) !== 0) throw new Error('reload rate');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Custom (non-standard) rate
  // ──────────────────────────────────────────────────────────────────────

  await describe('Custom rate 12.5% (Egyéb) — server accepts + computes', async () => {
    const r = await seed({ amount: 11250, vat_rate: 12.5 });
    await test('POST → 201, custom rate stored', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      const e = r.body.data.expense;
      if (parseFloat(e.vat_rate) !== 12.5) throw new Error(`rate=${e.vat_rate}`);
      // 11250 / 1.125 = 10000, vat = 1250
      if (parseFloat(e.net_amount) !== 10000) throw new Error(`net=${e.net_amount}`);
      if (parseFloat(e.vat_amount) !== 1250) throw new Error(`vat=${e.vat_amount}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Validation rejections
  // ──────────────────────────────────────────────────────────────────────

  await describe('Validation rejections', async () => {
    await test('sum mismatch >1 HUF → 400', async () => {
      const r = await post('/api/v1/expenses', {
        accommodation_id: accId, billing_month: '1888-12', performance_date: '1888-12-15',
        category: 'rezsi', amount: 10000, vat_rate: 27,
        net_amount: 8000, vat_amount: 1000, // 9000, off by 1000
        vendor_name: `${tag}-mismatch`, notes: tag,
      });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
      if (!String(r.body.message || '').includes('Nettó + ÁFA')) {
        throw new Error(`unexpected message: ${r.body.message}`);
      }
    });

    await test('half-state (net only, no vat) → 400', async () => {
      const r = await post('/api/v1/expenses', {
        accommodation_id: accId, billing_month: '1888-12', performance_date: '1888-12-15',
        category: 'rezsi', amount: 1000, net_amount: 800,
        vendor_name: `${tag}-halfstate`, notes: tag,
      });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
      if (!String(r.body.message || '').includes('csak együtt')) {
        throw new Error(`unexpected: ${r.body.message}`);
      }
    });

    await test('vat_rate > 100 → 400', async () => {
      const r = await post('/api/v1/expenses', {
        accommodation_id: accId, billing_month: '1888-12', performance_date: '1888-12-15',
        category: 'rezsi', amount: 1000, vat_rate: 150,
        vendor_name: `${tag}-toohigh`, notes: tag,
      });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
    });

    await test('vat_rate negative → 400', async () => {
      const r = await post('/api/v1/expenses', {
        accommodation_id: accId, billing_month: '1888-12', performance_date: '1888-12-15',
        category: 'rezsi', amount: 1000, vat_rate: -1,
        vendor_name: `${tag}-neg`, notes: tag,
      });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. PUT — recompute on rate / amount change, clear on null rate
  // ──────────────────────────────────────────────────────────────────────

  await describe('PUT — recompute + clear', async () => {
    const r = await seed({ amount: 12700, vat_rate: 27 });
    const id = r.body.data.expense.id;

    await test('PUT vat_rate=5 recomputes net/vat from existing amount', async () => {
      const upd = await put(`/api/v1/expenses/${id}`, { vat_rate: 5 });
      if (upd.status !== 200) throw new Error(`got ${upd.status}`);
      const back = upd.body.data.expense;
      // 12700 / 1.05 = 12095.24 → round 12095; vat = 605
      if (parseFloat(back.vat_rate) !== 5) throw new Error('rate');
      if (parseFloat(back.net_amount) !== 12095) throw new Error(`net=${back.net_amount}`);
      if (parseFloat(back.vat_amount) !== 605) throw new Error(`vat=${back.vat_amount}`);
    });

    await test('PUT amount=25400 recomputes net/vat at the existing 5% rate', async () => {
      const upd = await put(`/api/v1/expenses/${id}`, { amount: 25400 });
      if (upd.status !== 200) throw new Error(`got ${upd.status}`);
      const back = upd.body.data.expense;
      // 25400 / 1.05 = 24190.47 → round 24190; vat = 1210
      if (parseFloat(back.net_amount) !== 24190) throw new Error(`net=${back.net_amount}`);
      if (parseFloat(back.vat_amount) !== 1210) throw new Error(`vat=${back.vat_amount}`);
    });

    await test('PUT vat_rate=null clears net + vat', async () => {
      const upd = await put(`/api/v1/expenses/${id}`, { vat_rate: null });
      if (upd.status !== 200) throw new Error(`got ${upd.status}`);
      const back = upd.body.data.expense;
      if (back.vat_rate !== null) throw new Error('rate should be null');
      if (back.net_amount !== null) throw new Error('net should clear');
      if (back.vat_amount !== null) throw new Error('vat should clear');
    });

    await test('PUT explicit net+vat overrides auto-compute', async () => {
      const upd = await put(`/api/v1/expenses/${id}`, {
        vat_rate: 27, net_amount: 20000, vat_amount: 5400,
      });
      if (upd.status !== 200) throw new Error(`got ${upd.status}`);
      const back = upd.body.data.expense;
      if (parseFloat(back.net_amount) !== 20000) throw new Error('net');
      if (parseFloat(back.vat_amount) !== 5400) throw new Error('vat');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. Edit reload — full payload integrity
  //
  // Mirrors the UI flow: row appears in list → user opens edit → AAM /
  // reverse states must reach the form. Failing this test = the bugs the
  // user found in the browser.
  // ──────────────────────────────────────────────────────────────────────

  await describe('Edit reload integrity (the bugs the user found)', async () => {
    await test('AAM survives list+detail GET', async () => {
      const list = await get('/api/v1/expenses?limit=100');
      if (list.status !== 200) throw new Error(`list got ${list.status}`);
      const row = list.body.data.expenses.find((e) => e.id === aamId);
      if (!row) throw new Error('aamId missing from list');
      if (row.vat_exemption_reason !== 'aam') {
        throw new Error(`list row exemption=${row.vat_exemption_reason}`);
      }
      const detail = await get(`/api/v1/expenses/${aamId}`);
      if (detail.body.data.expense.vat_exemption_reason !== 'aam') {
        throw new Error('detail exemption lost');
      }
    });

    await test('Reverse VAT survives list+detail GET', async () => {
      const list = await get('/api/v1/expenses?limit=100');
      const row = list.body.data.expenses.find((e) => e.id === revId);
      if (!row) throw new Error('revId missing');
      if (row.is_reverse_vat !== true) throw new Error(`list reverse=${row.is_reverse_vat}`);
      const detail = await get(`/api/v1/expenses/${revId}`);
      if (detail.body.data.expense.is_reverse_vat !== true) throw new Error('detail reverse lost');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 9. List filters
  // ──────────────────────────────────────────────────────────────────────

  await describe('List filters', async () => {
    await test('?vat_rate=27 returns only 27% rows', async () => {
      const r = await get('/api/v1/expenses?vat_rate=27&limit=100');
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      // Just verify everything returned has rate 27 (existing prod rows may
      // also be 27; we don't assert size, only correctness).
      const wrong = r.body.data.expenses.filter((e) => e.vat_rate != null && Number(e.vat_rate) !== 27);
      if (wrong.length > 0) throw new Error(`filter leaked ${wrong.length} non-27 rows`);
    });

    await test('?is_reverse_vat=true returns only reverse rows', async () => {
      const r = await get('/api/v1/expenses?is_reverse_vat=true&limit=100');
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const wrong = r.body.data.expenses.filter((e) => e.is_reverse_vat !== true);
      if (wrong.length > 0) throw new Error(`filter leaked ${wrong.length} non-reverse rows`);
    });
  });
}

(async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (e) {
    console.error('\nFATAL:', e.message);
    console.error(e.stack);
    exitCode = 1;
  } finally {
    await cleanup();
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(40)}\n`);
    await closePool();
    if (failed > 0 || exitCode !== 0) process.exit(1);
  }
})();
