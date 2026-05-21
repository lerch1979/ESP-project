/**
 * Expense Module Tests — model validation + service/DB integration.
 *
 * Run: node tests/expense.script.js
 *
 * Hits the real DB pointed at by .env. Creates rows in accommodation_expenses,
 * tagged via a UUID-based marker in `notes`, and hard-deletes them on teardown.
 */

require('dotenv').config();

const {
  validateCreate, validateUpdate,
  deriveBillingMonth, generateFingerprint,
  defaultVatRateForCategory, computeNetVat,
  VALID_CATEGORIES, VALID_SOURCES, VALID_STATUSES, VALID_PAYMENT_STATUSES,
  CATEGORY_LABELS, DEFAULT_VAT_RATE_BY_CATEGORY, VAT_TOLERANCE_HUF,
} = require('../src/models/expense.model');
const expenseService = require('../src/services/expense.service');
const { query, closePool } = require('../src/database/connection');

const RUN_TAG = `expense-test-${Date.now()}`;
const createdIds = [];

let passed = 0;
let failed = 0;

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
    await query(
      'DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])',
      [createdIds],
    );
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

async function main() {
  // Pre-flight: pick a real accommodation_id and user_id
  const accRes = await query('SELECT id FROM accommodations LIMIT 1');
  const usrRes = await query('SELECT id FROM users LIMIT 1');
  if (accRes.rows.length === 0) throw new Error('No accommodation in DB to test against');
  if (usrRes.rows.length === 0) throw new Error('No user in DB to test against');
  const accId = accRes.rows[0].id;
  const usrId = usrRes.rows[0].id;
  const ghostUuid = '00000000-0000-0000-0000-000000000000';

  console.log(`\nUsing accommodation_id=${accId}\n         user_id=${usrId}`);

  // ────────────────────────────────────────────────────────────────────────
  // 1. POST /api/v1/expenses — model validation
  // ────────────────────────────────────────────────────────────────────────

  await describe('POST validation - required fields', async () => {
    await test('rejects empty body', async () => {
      const r = validateCreate({});
      if (r.valid) throw new Error('expected invalid');
      if (r.errors.length < 4) throw new Error(`expected >=4 errors, got ${r.errors.length}`);
    });

    await test('rejects missing accommodation_id', async () => {
      const r = validateCreate({ billing_month: '2026-05', category: 'rezsi', amount: 100 });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Szállás'))) throw new Error('missing accommodation error');
    });

    await test('rejects missing billing_month', async () => {
      const r = validateCreate({ accommodation_id: accId, category: 'rezsi', amount: 100 });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Számlázási hónap'))) throw new Error('missing month error');
    });

    await test('rejects missing category', async () => {
      const r = validateCreate({ accommodation_id: accId, billing_month: '2026-05', amount: 100 });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Kategória'))) throw new Error('missing category error');
    });

    await test('rejects missing amount', async () => {
      const r = validateCreate({ accommodation_id: accId, billing_month: '2026-05', category: 'rezsi' });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Összeg'))) throw new Error('missing amount error');
    });

    await test('accepts all required fields', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05',
        category: 'rezsi', amount: 100,
      });
      if (!r.valid) throw new Error(`expected valid, got: ${r.errors.join(', ')}`);
    });
  });

  await describe('POST validation - category', async () => {
    for (const cat of VALID_CATEGORIES) {
      await test(`accepts category "${cat}"`, async () => {
        const r = validateCreate({
          accommodation_id: accId, billing_month: '2026-05', category: cat, amount: 100,
        });
        if (!r.valid) throw new Error(r.errors.join(', '));
      });
    }
    await test('rejects invalid category', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05', category: 'bogus', amount: 100,
      });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Érvénytelen kategória'))) {
        throw new Error('missing invalid-category error');
      }
    });
  });

  await describe('POST validation - billing_month format', async () => {
    const bad = ['2026-5', '202605', 'May 2026', '2026/05', 'foo'];
    for (const b of bad) {
      await test(`rejects "${b}"`, async () => {
        const r = validateCreate({
          accommodation_id: accId, billing_month: b, category: 'rezsi', amount: 100,
        });
        if (r.valid) throw new Error('expected invalid');
        if (!r.errors.some((e) => e.includes('Számlázási hónap formátuma'))) {
          throw new Error('missing format error');
        }
      });
    }
    await test('accepts valid YYYY-MM', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05', category: 'rezsi', amount: 100,
      });
      if (!r.valid) throw new Error(r.errors.join(', '));
    });
  });

  await describe('POST validation - amount', async () => {
    await test('accepts zero (CHECK is amount >= 0)', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05', category: 'rezsi', amount: 0,
      });
      if (!r.valid) throw new Error(r.errors.join(', '));
    });
    await test('rejects negative', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05', category: 'rezsi', amount: -1,
      });
      if (r.valid) throw new Error('expected invalid');
    });
    await test('rejects NaN string', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-05', category: 'rezsi', amount: 'abc',
      });
      if (r.valid) throw new Error('expected invalid');
    });
  });

  await describe('PUT validation', async () => {
    await test('rejects empty body', async () => {
      const r = validateUpdate({});
      if (r.valid) throw new Error('expected invalid');
    });
    await test('rejects unknown field only', async () => {
      const r = validateUpdate({ bogus: 'x' });
      if (r.valid) throw new Error('expected invalid');
    });
    await test('accepts partial update (amount only)', async () => {
      const r = validateUpdate({ amount: 1234 });
      if (!r.valid) throw new Error(r.errors.join(', '));
    });
    await test('rejects invalid category on update', async () => {
      const r = validateUpdate({ category: 'bogus' });
      if (r.valid) throw new Error('expected invalid');
    });
    await test('rejects invalid month on update', async () => {
      const r = validateUpdate({ billing_month: 'May' });
      if (r.valid) throw new Error('expected invalid');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. POST /api/v1/expenses — service + DB
  // ────────────────────────────────────────────────────────────────────────

  let id1; // 2026-05, rezsi, 50000
  let id2; // 2026-04, karbantartas, 30000
  let id3; // 2026-03, takaritas, 15000
  let idOtherAcc; // 2026-05, rezsi — different accommodation if available

  await describe('POST service layer', async () => {
    await test('creates expense and persists to DB', async () => {
      const r = await expenseService.create({
        accommodation_id: accId,
        billing_month: '2026-05',
        category: 'rezsi',
        amount: 50000,
        notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(`expected success, got: ${r.error}`);
      id1 = r.data.id;
      createdIds.push(id1);

      const check = await query(
        'SELECT * FROM accommodation_expenses WHERE id = $1',
        [id1],
      );
      if (check.rows.length === 0) throw new Error('row not persisted');
      const row = check.rows[0];
      if (parseFloat(row.amount) !== 50000) throw new Error(`amount=${row.amount}`);
      if (row.category !== 'rezsi') throw new Error(`category=${row.category}`);
      if (row.billing_month !== '2026-05') throw new Error(`month=${row.billing_month}`);
      if (row.currency !== 'HUF') throw new Error(`expected default HUF, got ${row.currency}`);
      if (row.created_by !== usrId) throw new Error('created_by not set');
      if (row.deleted_at !== null) throw new Error('deleted_at should be null');
    });

    await test('rejects invalid accommodation_id (404)', async () => {
      const r = await expenseService.create({
        accommodation_id: ghostUuid,
        billing_month: '2026-05',
        category: 'rezsi',
        amount: 100,
        notes: RUN_TAG,
      }, usrId);
      if (!r.error) throw new Error('expected error');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });
  });

  // Seed extras for filter tests
  const r2 = await expenseService.create({
    accommodation_id: accId, billing_month: '2026-04',
    category: 'karbantartas', amount: 30000, notes: RUN_TAG,
  }, usrId);
  id2 = r2.data.id;
  createdIds.push(id2);

  const r3 = await expenseService.create({
    accommodation_id: accId, billing_month: '2026-03',
    category: 'takaritas', amount: 15000, notes: RUN_TAG,
  }, usrId);
  id3 = r3.data.id;
  createdIds.push(id3);

  // Optional: second accommodation seed for cross-acc filter
  const acc2Res = await query(
    'SELECT id FROM accommodations WHERE id <> $1 LIMIT 1',
    [accId],
  );
  if (acc2Res.rows.length > 0) {
    const rOther = await expenseService.create({
      accommodation_id: acc2Res.rows[0].id,
      billing_month: '2026-05',
      category: 'rezsi',
      amount: 999,
      notes: RUN_TAG,
    }, usrId);
    idOtherAcc = rOther.data.id;
    createdIds.push(idOtherAcc);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. GET /api/v1/expenses — filters & pagination
  // ────────────────────────────────────────────────────────────────────────

  await describe('GET list filters', async () => {
    await test('no filter returns multiple rows (>= our 3)', async () => {
      const r = await expenseService.getAll({});
      const ours = r.expenses.filter((e) => createdIds.includes(e.id));
      if (ours.length < 3) throw new Error(`expected >=3 of our rows, got ${ours.length}`);
    });

    await test('filter accommodation_id excludes other accommodations', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId });
      if (r.expenses.some((e) => e.accommodation_id !== accId)) {
        throw new Error('accommodation filter not applied');
      }
      if (idOtherAcc && r.expenses.some((e) => e.id === idOtherAcc)) {
        throw new Error('other accommodation row leaked');
      }
    });

    await test('filter billing_month=2026-04 returns only April rows', async () => {
      const r = await expenseService.getAll({
        accommodation_id: accId, billing_month: '2026-04',
      });
      if (!r.expenses.some((e) => e.id === id2)) throw new Error('expected id2');
      if (r.expenses.some((e) => e.billing_month !== '2026-04')) {
        throw new Error('month filter not applied');
      }
    });

    await test('filter category=karbantartas returns only that category', async () => {
      const r = await expenseService.getAll({
        accommodation_id: accId, category: 'karbantartas',
      });
      if (!r.expenses.some((e) => e.id === id2)) throw new Error('expected id2');
      if (r.expenses.some((e) => e.category !== 'karbantartas')) {
        throw new Error('category filter not applied');
      }
    });

    await test('month range 2026-04..2026-05 excludes 2026-03', async () => {
      const r = await expenseService.getAll({
        accommodation_id: accId, month_from: '2026-04', month_to: '2026-05',
      });
      if (r.expenses.some((e) => e.id === id3)) throw new Error('id3 (2026-03) should be excluded');
      if (!r.expenses.some((e) => e.id === id1)) throw new Error('id1 should be included');
      if (!r.expenses.some((e) => e.id === id2)) throw new Error('id2 should be included');
    });

    await test('pagination: limit=2 returns at most 2', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, limit: 2, page: 1 });
      if (r.expenses.length > 2) throw new Error(`limit not applied, got ${r.expenses.length}`);
      if (r.pagination.limit !== 2) throw new Error('pagination meta wrong');
      if (r.pagination.page !== 1) throw new Error('pagination page wrong');
      if (typeof r.pagination.total !== 'number') throw new Error('total missing');
    });

    await test('list result joins accommodation_name', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, limit: 5 });
      const sample = r.expenses.find((e) => e.id === id1);
      if (!sample) throw new Error('id1 not in list');
      if (!sample.accommodation_name) throw new Error('accommodation_name not joined');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. GET /api/v1/expenses/:id
  // ────────────────────────────────────────────────────────────────────────

  await describe('GET by id', async () => {
    await test('returns existing expense', async () => {
      const e = await expenseService.getById(id1);
      if (!e || e.id !== id1) throw new Error('not found');
      if (!e.accommodation_name) throw new Error('expected JOIN with accommodations');
    });

    await test('returns null for non-existing id', async () => {
      const e = await expenseService.getById(ghostUuid);
      if (e !== null) throw new Error('expected null');
    });
    // Soft-deleted case verified in DELETE section below.
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. PUT /api/v1/expenses/:id
  // ────────────────────────────────────────────────────────────────────────

  await describe('PUT update', async () => {
    await test('updates amount and notes', async () => {
      const r = await expenseService.update(id1, { amount: 99999, notes: `${RUN_TAG}-updated` });
      if (r.error) throw new Error(`expected success, got: ${r.error}`);
      if (parseFloat(r.data.amount) !== 99999) throw new Error('amount not updated');
      if (r.data.notes !== `${RUN_TAG}-updated`) throw new Error('notes not updated');

      // Verify in DB
      const check = await query('SELECT amount, notes FROM accommodation_expenses WHERE id = $1', [id1]);
      if (parseFloat(check.rows[0].amount) !== 99999) throw new Error('amount not persisted');
    });

    await test('partial update preserves unchanged fields', async () => {
      const before = await expenseService.getById(id2);
      const r = await expenseService.update(id2, { notes: `${RUN_TAG}-partial` });
      if (r.error) throw new Error(r.error);
      if (parseFloat(r.data.amount) !== parseFloat(before.amount)) {
        throw new Error('amount changed on partial update');
      }
      if (r.data.category !== before.category) throw new Error('category changed');
      if (r.data.billing_month !== before.billing_month) throw new Error('month changed');
    });

    await test('returns 404 for non-existing id', async () => {
      const r = await expenseService.update(ghostUuid, { amount: 100 });
      if (!r.error) throw new Error('expected error');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });

    await test('returns 404 when changing to invalid accommodation', async () => {
      const r = await expenseService.update(id2, { accommodation_id: ghostUuid });
      if (!r.error) throw new Error('expected error');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. DELETE /api/v1/expenses/:id — soft delete
  // ────────────────────────────────────────────────────────────────────────

  await describe('DELETE soft delete', async () => {
    await test('soft-deletes the row', async () => {
      const r = await expenseService.delete(id1);
      if (r.error) throw new Error(r.error);
      if (!r.data || r.data.id !== id1) throw new Error('delete result missing data');
    });

    await test('deleted_at is set in DB', async () => {
      const check = await query(
        'SELECT deleted_at FROM accommodation_expenses WHERE id = $1',
        [id1],
      );
      if (check.rows.length === 0) throw new Error('row was hard-deleted (should be soft)');
      if (!check.rows[0].deleted_at) throw new Error('deleted_at not set');
    });

    await test('GET by id returns null after soft delete', async () => {
      const e = await expenseService.getById(id1);
      if (e !== null) throw new Error('soft-deleted row should not be returned');
    });

    await test('list excludes soft-deleted rows', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId });
      if (r.expenses.some((e) => e.id === id1)) {
        throw new Error('soft-deleted row leaked into list');
      }
    });

    await test('DELETE non-existing returns 404', async () => {
      const r = await expenseService.delete(ghostUuid);
      if (!r.error) throw new Error('expected error');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });

    await test('double-delete returns 404 (already deleted)', async () => {
      const r = await expenseService.delete(id1);
      if (!r.error) throw new Error('expected error on second delete');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Phase 2 — vendor metadata, performance_date, fingerprint, cost_center
  // ────────────────────────────────────────────────────────────────────────

  await describe('Phase 2 — pure utilities', async () => {
    await test('deriveBillingMonth from YYYY-MM-DD returns YYYY-MM', async () => {
      if (deriveBillingMonth('2026-07-15') !== '2026-07') throw new Error('wrong derive');
    });
    await test('deriveBillingMonth returns null on bad input', async () => {
      if (deriveBillingMonth(null) !== null) throw new Error('null input');
      if (deriveBillingMonth('garbage') !== null) throw new Error('garbage');
      if (deriveBillingMonth('2026-7-1') !== null) throw new Error('non-padded');
    });

    await test('generateFingerprint deterministic for same inputs', async () => {
      const a = generateFingerprint({ vendor_name: 'Vodafone Zrt.', amount: 50000, performance_date: '2026-05-15' });
      const b = generateFingerprint({ vendor_name: 'Vodafone Zrt.', amount: 50000, performance_date: '2026-05-15' });
      if (a !== b) throw new Error('not deterministic');
      if (!a || a.length !== 64) throw new Error(`bad hash length: ${a?.length}`);
    });
    await test('generateFingerprint normalises whitespace + case in vendor', async () => {
      const a = generateFingerprint({ vendor_name: '  vodafone   zrt. ', amount: 50000, performance_date: '2026-05-15' });
      const b = generateFingerprint({ vendor_name: 'Vodafone Zrt.',      amount: 50000, performance_date: '2026-05-15' });
      if (a !== b) throw new Error('normalisation failed');
    });
    await test('generateFingerprint differs when amount changes', async () => {
      const a = generateFingerprint({ vendor_name: 'V', amount: 100, performance_date: '2026-05-15' });
      const b = generateFingerprint({ vendor_name: 'V', amount: 101, performance_date: '2026-05-15' });
      if (a === b) throw new Error('should differ');
    });
    await test('generateFingerprint returns null when vendor missing', async () => {
      const f = generateFingerprint({ vendor_name: '', amount: 100, performance_date: '2026-05-15' });
      if (f !== null) throw new Error('expected null');
    });
    await test('generateFingerprint returns null when performance_date missing', async () => {
      const f = generateFingerprint({ vendor_name: 'V', amount: 100, performance_date: null });
      if (f !== null) throw new Error('expected null');
    });
  });

  let p2Id;
  await describe('Phase 2 — service create with new fields', async () => {
    await test('auto-derives billing_month from performance_date when omitted', async () => {
      const r = await expenseService.create({
        accommodation_id: accId,
        performance_date: '2026-07-15',
        // no billing_month
        category: 'rezsi',
        amount: 12345,
        vendor_name: 'Test Energiakereskedő Zrt.',
        notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(r.error);
      p2Id = r.data.id;
      createdIds.push(p2Id);
      if (r.data.billing_month !== '2026-07') throw new Error(`derived month=${r.data.billing_month}`);
      if (r.data.performance_date == null) throw new Error('performance_date not stored');
    });

    await test('persists vendor metadata, dates, source/status defaults', async () => {
      const row = await expenseService.getById(p2Id);
      if (!row) throw new Error('not found');
      if (row.vendor_name !== 'Test Energiakereskedő Zrt.') throw new Error('vendor not stored');
      if (row.source !== 'manual') throw new Error(`default source=${row.source}`);
      if (row.status !== 'confirmed') throw new Error(`default status=${row.status}`);
      if (row.payment_status !== 'unpaid') throw new Error(`default payment_status=${row.payment_status}`);
      if (!Array.isArray(row.file_attachments)) throw new Error('file_attachments not array');
      if (row.file_attachments.length !== 0) throw new Error('file_attachments not empty');
    });

    await test('generates and persists dedup_fingerprint on create', async () => {
      const row = await expenseService.getById(p2Id);
      if (!row.dedup_fingerprint) throw new Error('fingerprint missing');
      const expected = generateFingerprint({
        vendor_name: 'Test Energiakereskedő Zrt.',
        amount: 12345,
        performance_date: '2026-07-15',
      });
      if (row.dedup_fingerprint !== expected) throw new Error('fingerprint mismatch');
    });

    await test('row WITHOUT vendor_name gets NULL fingerprint', async () => {
      const r = await expenseService.create({
        accommodation_id: accId,
        billing_month: '2026-08',
        performance_date: '2026-08-01',
        category: 'egyeb',
        amount: 999,
        notes: RUN_TAG,
      }, usrId);
      createdIds.push(r.data.id);
      if (r.data.dedup_fingerprint !== null) throw new Error('fingerprint should be null');
    });
  });

  await describe('Phase 2 — update recomputes fingerprint', async () => {
    await test('amount change recomputes fingerprint', async () => {
      const before = await expenseService.getById(p2Id);
      const r = await expenseService.update(p2Id, { amount: 99999 });
      if (r.error) throw new Error(r.error);
      if (r.data.dedup_fingerprint === before.dedup_fingerprint) {
        throw new Error('fingerprint should have changed');
      }
      const expected = generateFingerprint({
        vendor_name: before.vendor_name,
        amount: 99999,
        performance_date: before.performance_date,
      });
      if (r.data.dedup_fingerprint !== expected) throw new Error('mismatch');
    });

    await test('untouched update does NOT change fingerprint', async () => {
      const before = await expenseService.getById(p2Id);
      const r = await expenseService.update(p2Id, { notes: `${RUN_TAG}-untouched` });
      if (r.data.dedup_fingerprint !== before.dedup_fingerprint) {
        throw new Error('fingerprint changed without trigger');
      }
    });
  });

  await describe('Phase 2 — filters', async () => {
    await test('filter by perf_from/perf_to (performance_date range)', async () => {
      const r = await expenseService.getAll({
        accommodation_id: accId,
        perf_from: '2026-07-01',
        perf_to:   '2026-07-31',
      });
      if (!r.expenses.some((e) => e.id === p2Id)) throw new Error('expected p2Id in July range');
      if (r.expenses.some((e) => e.performance_date && new Date(e.performance_date) < new Date('2026-07-01'))) {
        throw new Error('perf_from filter not applied');
      }
    });

    await test('filter by source=manual', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, source: 'manual' });
      if (r.expenses.some((e) => e.source !== 'manual')) throw new Error('source filter not applied');
    });

    await test('filter by vendor (ilike substring)', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, vendor: 'energiakeresk' });
      if (!r.expenses.some((e) => e.id === p2Id)) throw new Error('expected p2Id in vendor match');
    });
  });

  await describe('Phase 2 — cost_center linkage (Option B)', async () => {
    const cc = await query('SELECT id FROM cost_centers LIMIT 1');
    const ccId = cc.rows[0]?.id;

    await test('cost_center_id persists and joins back name + code', async () => {
      if (!ccId) {
        console.log('    SKIP (no cost_centers in DB)');
        return;
      }
      const r = await expenseService.update(p2Id, { cost_center_id: ccId });
      if (r.error) throw new Error(r.error);
      const row = await expenseService.getById(p2Id);
      if (row.cost_center_id !== ccId) throw new Error('cost_center_id not stored');
      if (!row.cost_center_name) throw new Error('cost_center_name not joined');
      if (!row.cost_center_code) throw new Error('cost_center_code not joined');
    });
  });

  await describe('Phase 2 — constants', async () => {
    await test('VALID_SOURCES matches migration 113 CHECK', async () => {
      const expected = ['manual', 'ai', 'email_ocr', 'import'];
      if (VALID_SOURCES.length !== 4) throw new Error('length');
      expected.forEach((s) => { if (!VALID_SOURCES.includes(s)) throw new Error(`missing ${s}`); });
    });
    await test('VALID_STATUSES matches migration 113 CHECK', async () => {
      const expected = ['pending_review', 'confirmed', 'rejected'];
      if (VALID_STATUSES.length !== 3) throw new Error('length');
      expected.forEach((s) => { if (!VALID_STATUSES.includes(s)) throw new Error(`missing ${s}`); });
    });
    await test('VALID_PAYMENT_STATUSES matches migration 113 CHECK', async () => {
      const expected = ['unpaid', 'paid', 'partial'];
      if (VALID_PAYMENT_STATUSES.length !== 3) throw new Error('length');
      expected.forEach((s) => { if (!VALID_PAYMENT_STATUSES.includes(s)) throw new Error(`missing ${s}`); });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. VAT (migration 114)
  // ────────────────────────────────────────────────────────────────────────

  await describe('VAT — pure helpers', async () => {
    await test('defaultVatRateForCategory returns 27 for rezsi/karbantartas/takaritas', async () => {
      if (defaultVatRateForCategory('rezsi') !== 27) throw new Error('rezsi');
      if (defaultVatRateForCategory('karbantartas') !== 27) throw new Error('karbantartas');
      if (defaultVatRateForCategory('takaritas') !== 27) throw new Error('takaritas');
    });
    await test('defaultVatRateForCategory returns null for egyeb + unknown', async () => {
      if (defaultVatRateForCategory('egyeb') !== null) throw new Error('egyeb');
      if (defaultVatRateForCategory('bogus') !== null) throw new Error('bogus');
    });

    await test('computeNetVat: 12700 @ 27% → net 10000, vat 2700', async () => {
      const r = computeNetVat(12700, 27);
      if (!r || r.net !== 10000 || r.vat !== 2700) throw new Error(JSON.stringify(r));
    });
    await test('computeNetVat: 11800 @ 18% → net 10000, vat 1800', async () => {
      const r = computeNetVat(11800, 18);
      if (!r || r.net !== 10000 || r.vat !== 1800) throw new Error(JSON.stringify(r));
    });
    await test('computeNetVat: 10500 @ 5% → net 10000, vat 500', async () => {
      const r = computeNetVat(10500, 5);
      if (!r || r.net !== 10000 || r.vat !== 500) throw new Error(JSON.stringify(r));
    });
    await test('computeNetVat: 10000 @ 0% → net 10000, vat 0', async () => {
      const r = computeNetVat(10000, 0);
      if (!r || r.net !== 10000 || r.vat !== 0) throw new Error(JSON.stringify(r));
    });
    await test('computeNetVat: returns null on missing inputs', async () => {
      if (computeNetVat(null, 27) !== null) throw new Error('null amount');
      if (computeNetVat(1000, null) !== null) throw new Error('null rate');
    });
    await test('computeNetVat: returns null on rate out of range', async () => {
      if (computeNetVat(1000, -1) !== null) throw new Error('-1');
      if (computeNetVat(1000, 101) !== null) throw new Error('101');
    });
  });

  await describe('VAT — validation', async () => {
    await test('vat_rate < 0 rejected', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, vat_rate: -1,
      });
      if (r.valid) throw new Error('expected invalid');
    });
    await test('vat_rate > 100 rejected', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, vat_rate: 101,
      });
      if (r.valid) throw new Error('expected invalid');
    });
    await test('only net OR only vat (half-state) rejected', async () => {
      const r1 = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, net_amount: 800,
      });
      if (r1.valid) throw new Error('only net should fail');
      const r2 = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, vat_amount: 200,
      });
      if (r2.valid) throw new Error('only vat should fail');
    });
    await test('net + vat ≠ gross beyond tolerance rejected', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, net_amount: 800, vat_amount: 150, // 950 ≠ 1000
      });
      if (r.valid) throw new Error('expected invalid');
      if (!r.errors.some((e) => e.includes('Nettó + ÁFA'))) {
        throw new Error('missing sum-mismatch error');
      }
    });
    await test('net + vat ≈ gross within ±1 HUF accepted', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, net_amount: 787, vat_amount: 213, // sums to 1000 exactly
      });
      if (!r.valid) throw new Error(r.errors.join(', '));
      const r2 = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, net_amount: 787, vat_amount: 214, // 1001, ≤1 tolerance
      });
      if (!r2.valid) throw new Error(r2.errors.join(', '));
    });
    await test('is_reverse_vat must be boolean', async () => {
      const r = validateCreate({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'rezsi', amount: 1000, is_reverse_vat: 'truthy',
      });
      if (r.valid) throw new Error('expected invalid');
    });
  });

  let vatId;
  await describe('VAT — service create (auto-fill)', async () => {
    await test('only vat_rate provided → service computes net + vat', async () => {
      const r = await expenseService.create({
        accommodation_id: accId, billing_month: '2026-09',
        performance_date: '2026-09-15',
        category: 'rezsi', amount: 12700, vat_rate: 27,
        vendor_name: 'VAT Test Áram Zrt.', notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(r.error);
      vatId = r.data.id;
      createdIds.push(vatId);
      if (parseFloat(r.data.net_amount) !== 10000) throw new Error(`net=${r.data.net_amount}`);
      if (parseFloat(r.data.vat_amount) !== 2700) throw new Error(`vat=${r.data.vat_amount}`);
      if (parseFloat(r.data.vat_rate) !== 27) throw new Error(`rate=${r.data.vat_rate}`);
      if (r.data.is_reverse_vat !== false) throw new Error(`is_reverse_vat=${r.data.is_reverse_vat}`);
    });

    await test('all three provided + match → persisted verbatim', async () => {
      const r = await expenseService.create({
        accommodation_id: accId, billing_month: '2026-09',
        performance_date: '2026-09-16',
        category: 'rezsi', amount: 10500, vat_rate: 5,
        net_amount: 10000, vat_amount: 500,
        vendor_name: 'VAT Test 5%', notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(r.error);
      createdIds.push(r.data.id);
      if (parseFloat(r.data.net_amount) !== 10000) throw new Error(`net=${r.data.net_amount}`);
      if (parseFloat(r.data.vat_amount) !== 500) throw new Error(`vat=${r.data.vat_amount}`);
    });

    await test('no vat_rate, no net/vat → all three NULL on DB', async () => {
      const r = await expenseService.create({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'egyeb', amount: 5000,
        notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(r.error);
      createdIds.push(r.data.id);
      if (r.data.net_amount !== null) throw new Error(`net should be null, got ${r.data.net_amount}`);
      if (r.data.vat_rate !== null) throw new Error(`rate should be null`);
      if (r.data.vat_amount !== null) throw new Error(`vat should be null`);
    });

    await test('exemption reason + reverse VAT persist', async () => {
      const r = await expenseService.create({
        accommodation_id: accId, billing_month: '2026-09',
        category: 'egyeb', amount: 1000,
        vat_exemption_reason: 'aam',
        is_reverse_vat: true,
        notes: RUN_TAG,
      }, usrId);
      if (r.error) throw new Error(r.error);
      createdIds.push(r.data.id);
      if (r.data.vat_exemption_reason !== 'aam') throw new Error(`exemption=${r.data.vat_exemption_reason}`);
      if (r.data.is_reverse_vat !== true) throw new Error(`reverse=${r.data.is_reverse_vat}`);
    });
  });

  await describe('VAT — service update (recompute)', async () => {
    await test('changing amount recomputes net + vat at existing rate', async () => {
      const r = await expenseService.update(vatId, { amount: 25400 }); // 25400 / 1.27 = 20000
      if (r.error) throw new Error(r.error);
      if (parseFloat(r.data.net_amount) !== 20000) throw new Error(`net=${r.data.net_amount}`);
      if (parseFloat(r.data.vat_amount) !== 5400) throw new Error(`vat=${r.data.vat_amount}`);
      if (parseFloat(r.data.vat_rate) !== 27) throw new Error('rate should be untouched');
    });

    await test('clearing vat_rate (null) clears net + vat', async () => {
      const r = await expenseService.update(vatId, { vat_rate: null });
      if (r.error) throw new Error(r.error);
      if (r.data.vat_rate !== null) throw new Error('rate should be null');
      if (r.data.net_amount !== null) throw new Error('net should clear');
      if (r.data.vat_amount !== null) throw new Error('vat should clear');
    });

    await test('changing vat_rate alone recomputes net + vat from current amount', async () => {
      const r = await expenseService.update(vatId, { vat_rate: 5 }); // current amount=25400 @ 5% → net=24190, vat=1210
      if (r.error) throw new Error(r.error);
      if (parseFloat(r.data.vat_rate) !== 5) throw new Error('rate');
      // 25400 / 1.05 = 24190.47... → round 24190; vat = 25400 - 24190 = 1210
      if (parseFloat(r.data.net_amount) !== 24190) throw new Error(`net=${r.data.net_amount}`);
      if (parseFloat(r.data.vat_amount) !== 1210) throw new Error(`vat=${r.data.vat_amount}`);
    });

    await test('explicit net + vat override auto-compute', async () => {
      const r = await expenseService.update(vatId, { net_amount: 20000, vat_amount: 5400 });
      if (r.error) throw new Error(r.error);
      if (parseFloat(r.data.net_amount) !== 20000) throw new Error(`net=${r.data.net_amount}`);
      if (parseFloat(r.data.vat_amount) !== 5400) throw new Error(`vat=${r.data.vat_amount}`);
    });

    await test('toggling is_reverse_vat false→true persists', async () => {
      const r = await expenseService.update(vatId, { is_reverse_vat: true });
      if (r.error) throw new Error(r.error);
      if (r.data.is_reverse_vat !== true) throw new Error('toggle');
    });
  });

  await describe('VAT — CHECK constraints catch direct writes', async () => {
    await test('DB rejects vat_rate = 150 via direct INSERT', async () => {
      let threw = false;
      try {
        await query(
          `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, vat_rate)
           VALUES ($1, $2, $3, $4, $5)`,
          [accId, '2026-09', 'rezsi', 1000, 150],
        );
      } catch (e) {
        if (/acc_exp_vat_rate_range/.test(e.message)) threw = true;
      }
      if (!threw) throw new Error('expected CHECK violation');
    });

    await test('DB rejects half-state (net set, vat NULL)', async () => {
      let threw = false;
      try {
        await query(
          `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, net_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [accId, '2026-09', 'rezsi', 1000, 800],
        );
      } catch (e) {
        if (/acc_exp_vat_split_consistency/.test(e.message)) threw = true;
      }
      if (!threw) throw new Error('expected CHECK violation');
    });
  });

  await describe('VAT — filters', async () => {
    await test('filter by vat_rate', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, vat_rate: 5 });
      if (r.expenses.some((e) => e.vat_rate != null && Number(e.vat_rate) !== 5)) {
        throw new Error('rate filter not applied');
      }
    });
    await test('filter by is_reverse_vat=true', async () => {
      const r = await expenseService.getAll({ accommodation_id: accId, is_reverse_vat: true });
      if (r.expenses.some((e) => e.is_reverse_vat !== true)) {
        throw new Error('reverse_vat filter not applied');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Constants sanity check
  // ────────────────────────────────────────────────────────────────────────

  await describe('Constants', async () => {
    await test('VALID_CATEGORIES has 4 entries matching CHECK constraint', async () => {
      if (VALID_CATEGORIES.length !== 4) throw new Error(`expected 4, got ${VALID_CATEGORIES.length}`);
      ['rezsi', 'karbantartas', 'takaritas', 'egyeb'].forEach((c) => {
        if (!VALID_CATEGORIES.includes(c)) throw new Error(`missing ${c}`);
      });
    });
    await test('CATEGORY_LABELS has Hungarian label for each category', async () => {
      VALID_CATEGORIES.forEach((c) => {
        if (!CATEGORY_LABELS[c]) throw new Error(`missing label for ${c}`);
      });
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
