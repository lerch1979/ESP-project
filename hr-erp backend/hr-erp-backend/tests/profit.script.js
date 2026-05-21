/**
 * Profit dashboard endpoint tests — service + DB integration.
 *
 * Run: node tests/profit.script.js
 *
 * Seeds billing_runs, accommodation_billings, and accommodation_expenses
 * for a synthetic test month (in the far past, '1900-NN' cycles per run),
 * then exercises the profit service. Hard-deletes everything on teardown.
 */

require('dotenv').config();

const profitService = require('../src/services/profit.service');
const { query, closePool } = require('../src/database/connection');

// Use a synthetic month far away from production data
const TEST_MONTH         = '1900-01';
const TEST_MONTH_EMPTY   = '1900-02';
const TEST_MONTH_INC_ONLY = '1900-03';
const TEST_MONTH_EXP_ONLY = '1900-04';
const TEST_MONTH_MULTI   = '1900-05';

const RUN_TAG = `profit-test-${Date.now()}`;

const createdBillingRuns        = [];
const createdAccBillings        = [];
const createdAccExpenses        = [];

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
  try {
    if (createdAccExpenses.length > 0) {
      await query(
        'DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])',
        [createdAccExpenses],
      );
    }
    if (createdAccBillings.length > 0) {
      await query(
        'DELETE FROM accommodation_billings WHERE id = ANY($1::uuid[])',
        [createdAccBillings],
      );
    }
    if (createdBillingRuns.length > 0) {
      await query(
        'DELETE FROM billing_runs WHERE id = ANY($1::uuid[])',
        [createdBillingRuns],
      );
    }
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

async function seedBillingRun(month, status = 'finalized', runType = 'incoming') {
  const r = await query(
    `INSERT INTO billing_runs (billing_month, run_type, status, total_amount, partner_count)
     VALUES ($1, $2, $3, 0, 0) RETURNING id`,
    [month, runType, status],
  );
  createdBillingRuns.push(r.rows[0].id);
  return r.rows[0].id;
}

async function seedAccBilling(runId, accId, month, amount, status = 'draft') {
  const r = await query(
    `INSERT INTO accommodation_billings
       (billing_run_id, billing_month, accommodation_id,
        total_amount, total_employee_days, calculation_details, status)
     VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6)
     RETURNING id`,
    [runId, month, accId, amount, JSON.stringify({ test: RUN_TAG }), status],
  );
  createdAccBillings.push(r.rows[0].id);
  return r.rows[0].id;
}

async function seedExpense(accId, month, category, amount, userId) {
  const r = await query(
    `INSERT INTO accommodation_expenses
       (accommodation_id, billing_month, category, amount, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [accId, month, category, amount, RUN_TAG, userId],
  );
  createdAccExpenses.push(r.rows[0].id);
  return r.rows[0].id;
}

async function main() {
  // Pre-flight: pick two real accommodations and a user
  const accRes = await query('SELECT id, name FROM accommodations LIMIT 2');
  const usrRes = await query('SELECT id FROM users LIMIT 1');
  if (accRes.rows.length < 1) throw new Error('No accommodation in DB');
  if (usrRes.rows.length < 1) throw new Error('No user in DB');
  const acc1 = accRes.rows[0];
  const acc2 = accRes.rows[1] || acc1; // fall back to same if only one
  const usrId = usrRes.rows[0].id;

  console.log(`\nUsing acc1=${acc1.name} (${acc1.id})`);
  if (acc2.id !== acc1.id) console.log(`      acc2=${acc2.name} (${acc2.id})`);

  // ────────────────────────────────────────────────────────────────────────
  // Validation
  // ────────────────────────────────────────────────────────────────────────

  await describe('Validation', async () => {
    await test('missing month returns 400', async () => {
      const r = await profitService.getByAccommodation({});
      if (!r.error) throw new Error('expected error');
      if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
    });

    await test('bad month format returns 400', async () => {
      const r = await profitService.getByAccommodation({ month: '2026-5' });
      if (!r.error) throw new Error('expected error');
      if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
    });

    for (const bad of ['202605', 'May 2026', '2026/05', 'foo']) {
      await test(`rejects "${bad}"`, async () => {
        const r = await profitService.getByAccommodation({ month: bad });
        if (!r.error) throw new Error('expected error');
        if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Empty month
  // ────────────────────────────────────────────────────────────────────────

  await describe('Empty month (no billings, no expenses)', async () => {
    await test('returns zeroed summary and empty list', async () => {
      const r = await profitService.getByAccommodation({ month: TEST_MONTH_EMPTY });
      if (r.error) throw new Error(r.error);
      const d = r.data;
      if (d.month !== TEST_MONTH_EMPTY) throw new Error(`month=${d.month}`);
      if (d.summary.total_income !== 0) throw new Error(`income=${d.summary.total_income}`);
      if (d.summary.total_expenses !== 0) throw new Error(`expenses=${d.summary.total_expenses}`);
      if (d.summary.total_profit !== 0) throw new Error(`profit=${d.summary.total_profit}`);
      if (d.summary.profit_margin_pct !== null) throw new Error('margin should be null on 0 income');
      if (d.by_accommodation.length !== 0) throw new Error(`expected empty list, got ${d.by_accommodation.length}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Income only (billing run, no expenses)
  // ────────────────────────────────────────────────────────────────────────

  await describe('Income only (acc1 has billing, no expenses)', async () => {
    const run = await seedBillingRun(TEST_MONTH_INC_ONLY, 'finalized');
    await seedAccBilling(run, acc1.id, TEST_MONTH_INC_ONLY, 100000, 'draft');

    await test('reports income, zero expenses, 100% margin', async () => {
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH_INC_ONLY, accommodation_id: acc1.id,
      });
      if (r.error) throw new Error(r.error);
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (!row) throw new Error('acc1 missing from result');
      if (row.income !== 100000) throw new Error(`income=${row.income}`);
      if (row.expenses.total !== 0) throw new Error(`expenses=${row.expenses.total}`);
      if (row.profit !== 100000) throw new Error(`profit=${row.profit}`);
      if (row.profit_margin_pct !== 100) throw new Error(`margin=${row.profit_margin_pct}`);
    });

    await test('all 4 category buckets default to 0', async () => {
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH_INC_ONLY, accommodation_id: acc1.id,
      });
      const row = r.data.by_accommodation[0];
      for (const c of ['rezsi', 'karbantartas', 'takaritas', 'egyeb']) {
        if (row.expenses[c] !== 0) throw new Error(`expenses.${c}=${row.expenses[c]}`);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Expense only (no billing run)
  // ────────────────────────────────────────────────────────────────────────

  await describe('Expense only (acc1 has expenses, no billing)', async () => {
    await seedExpense(acc1.id, TEST_MONTH_EXP_ONLY, 'rezsi', 20000, usrId);
    await seedExpense(acc1.id, TEST_MONTH_EXP_ONLY, 'karbantartas', 5000, usrId);

    await test('reports zero income, summed expenses, null margin, negative profit', async () => {
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH_EXP_ONLY, accommodation_id: acc1.id,
      });
      if (r.error) throw new Error(r.error);
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (!row) throw new Error('acc1 missing');
      if (row.income !== 0) throw new Error(`income=${row.income}`);
      if (row.expenses.total !== 25000) throw new Error(`expenses.total=${row.expenses.total}`);
      if (row.expenses.rezsi !== 20000) throw new Error(`rezsi=${row.expenses.rezsi}`);
      if (row.expenses.karbantartas !== 5000) throw new Error(`karbantartas=${row.expenses.karbantartas}`);
      if (row.profit !== -25000) throw new Error(`profit=${row.profit}`);
      if (row.profit_margin_pct !== null) throw new Error(`margin should be null`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Both income and expenses, single accommodation
  // ────────────────────────────────────────────────────────────────────────

  await describe('Income + expenses on same accommodation', async () => {
    const run = await seedBillingRun(TEST_MONTH, 'finalized');
    await seedAccBilling(run, acc1.id, TEST_MONTH, 200000, 'draft');
    await seedExpense(acc1.id, TEST_MONTH, 'rezsi', 30000, usrId);
    await seedExpense(acc1.id, TEST_MONTH, 'takaritas', 10000, usrId);

    await test('computes profit and margin correctly', async () => {
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH, accommodation_id: acc1.id,
      });
      if (r.error) throw new Error(r.error);
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (!row) throw new Error('acc1 missing');
      if (row.income !== 200000) throw new Error(`income=${row.income}`);
      if (row.expenses.total !== 40000) throw new Error(`expenses.total=${row.expenses.total}`);
      if (row.expenses.rezsi !== 30000) throw new Error(`rezsi=${row.expenses.rezsi}`);
      if (row.expenses.takaritas !== 10000) throw new Error(`takaritas=${row.expenses.takaritas}`);
      if (row.profit !== 160000) throw new Error(`profit=${row.profit}`);
      // (200000 - 40000) / 200000 = 0.80 -> 80.0%
      if (row.profit_margin_pct !== 80) throw new Error(`margin=${row.profit_margin_pct}`);
    });

    await test('include_categories=false collapses categories', async () => {
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH, accommodation_id: acc1.id, include_categories: false,
      });
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (row.expenses.total !== 40000) throw new Error(`total=${row.expenses.total}`);
      if ('rezsi' in row.expenses) throw new Error('rezsi should be omitted');
      if ('karbantartas' in row.expenses) throw new Error('karbantartas should be omitted');
    });

    await test('soft-deleted expense is excluded', async () => {
      const tempId = await seedExpense(acc1.id, TEST_MONTH, 'egyeb', 99999, usrId);
      await query(
        'UPDATE accommodation_expenses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [tempId],
      );
      const r = await profitService.getByAccommodation({
        month: TEST_MONTH, accommodation_id: acc1.id,
      });
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (row.expenses.egyeb !== 0) throw new Error(`egyeb=${row.expenses.egyeb} (soft-deleted leaked)`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Multi-accommodation: ensure summary aggregates, ordering, both branches
  // ────────────────────────────────────────────────────────────────────────

  if (acc1.id !== acc2.id) {
    await describe('Multi-accommodation', async () => {
      const run = await seedBillingRun(TEST_MONTH_MULTI, 'finalized');
      // acc1: income 500_000, expenses 50_000
      await seedAccBilling(run, acc1.id, TEST_MONTH_MULTI, 500000);
      await seedExpense(acc1.id, TEST_MONTH_MULTI, 'rezsi', 50000, usrId);
      // acc2: income 100_000, no expenses
      await seedAccBilling(run, acc2.id, TEST_MONTH_MULTI, 100000);

      await test('summary aggregates both accommodations', async () => {
        const r = await profitService.getByAccommodation({ month: TEST_MONTH_MULTI });
        if (r.error) throw new Error(r.error);
        // Could include other production data — assert lower bounds only on our seeds
        const a1 = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
        const a2 = r.data.by_accommodation.find((a) => a.accommodation_id === acc2.id);
        if (!a1) throw new Error('acc1 missing');
        if (!a2) throw new Error('acc2 missing');
        if (a1.income !== 500000) throw new Error(`acc1 income=${a1.income}`);
        if (a1.expenses.total !== 50000) throw new Error(`acc1 exp=${a1.expenses.total}`);
        if (a2.income !== 100000) throw new Error(`acc2 income=${a2.income}`);
        if (a2.expenses.total !== 0) throw new Error(`acc2 exp=${a2.expenses.total}`);
      });

      await test('ordering: highest income first', async () => {
        const r = await profitService.getByAccommodation({ month: TEST_MONTH_MULTI });
        const indices = [acc1.id, acc2.id].map((id) =>
          r.data.by_accommodation.findIndex((a) => a.accommodation_id === id),
        );
        if (indices[0] > indices[1]) {
          throw new Error('acc1 (higher income) should come before acc2');
        }
      });

      await test('accommodation_id filter excludes others', async () => {
        const r = await profitService.getByAccommodation({
          month: TEST_MONTH_MULTI, accommodation_id: acc1.id,
        });
        if (r.data.by_accommodation.some((a) => a.accommodation_id === acc2.id)) {
          throw new Error('acc2 leaked through filter');
        }
        if (!r.data.by_accommodation.some((a) => a.accommodation_id === acc1.id)) {
          throw new Error('acc1 missing under filter');
        }
      });
    });
  } else {
    console.log('\nMulti-accommodation: SKIPPED (only one accommodation in DB)');
  }

  // ────────────────────────────────────────────────────────────────────────
  // Cancellation handling: cancelled billing_run and cancelled accommodation_billing
  // ────────────────────────────────────────────────────────────────────────

  await describe('Cancelled rows excluded', async () => {
    const CANCEL_MONTH = '1900-06';
    const cancelledRun = await seedBillingRun(CANCEL_MONTH, 'cancelled');
    await seedAccBilling(cancelledRun, acc1.id, CANCEL_MONTH, 777777, 'draft');

    const activeRun = await seedBillingRun(CANCEL_MONTH, 'finalized');
    await seedAccBilling(activeRun, acc1.id, CANCEL_MONTH, 50000, 'draft');
    await seedAccBilling(activeRun, acc1.id, CANCEL_MONTH, 888888, 'cancelled');

    await test('cancelled billing_run is excluded from income', async () => {
      const r = await profitService.getByAccommodation({
        month: CANCEL_MONTH, accommodation_id: acc1.id,
      });
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (!row) throw new Error('acc1 missing');
      // Only 50000 should count (777777 from cancelled run + 888888 cancelled billing both excluded)
      if (row.income !== 50000) throw new Error(`expected 50000, got ${row.income}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // run_type filter: outgoing runs should be ignored
  // ────────────────────────────────────────────────────────────────────────

  await describe('Outgoing runs ignored', async () => {
    const OUT_MONTH = '1900-07';
    const outRun = await seedBillingRun(OUT_MONTH, 'finalized', 'outgoing');
    await seedAccBilling(outRun, acc1.id, OUT_MONTH, 123456, 'draft');

    await test('outgoing billing_run does not contribute to income', async () => {
      const r = await profitService.getByAccommodation({
        month: OUT_MONTH, accommodation_id: acc1.id,
      });
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      // No income row + no expenses -> accommodation should be entirely absent
      if (row) throw new Error('outgoing run leaked into income');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Draft billing runs DO count (only cancelled excluded)
  // ────────────────────────────────────────────────────────────────────────

  await describe('Draft billing_run counts toward income', async () => {
    const DRAFT_MONTH = '1900-08';
    const draftRun = await seedBillingRun(DRAFT_MONTH, 'draft');
    await seedAccBilling(draftRun, acc1.id, DRAFT_MONTH, 60000, 'draft');

    await test('draft billing run counts (only cancelled excluded)', async () => {
      const r = await profitService.getByAccommodation({
        month: DRAFT_MONTH, accommodation_id: acc1.id,
      });
      const row = r.data.by_accommodation.find((a) => a.accommodation_id === acc1.id);
      if (!row) throw new Error('acc1 missing for draft run');
      if (row.income !== 60000) throw new Error(`expected 60000, got ${row.income}`);
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
