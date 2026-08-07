#!/usr/bin/env node
/**
 * One-off: bring `employee_accommodation_history` in line with the CURRENT roster.
 *
 * The table has been frozen since migration 112's backfill — nothing in the application
 * wrote it, so anyone who moved, was hired or left since then still has an open row
 * pointing at where they used to sleep (or no row at all). Occupancy snapshots read that
 * table exclusively, so billing has been running on the stale roster.
 *
 * The application now writes history on every housing change; this closes the gap for the
 * rows that accumulated while it did not. **Past rows are never rewritten** — history that
 * already drove past billing stays exactly as it was. A mismatch is closed TODAY and a
 * correct row is opened TODAY, so tomorrow's snapshot is right without restating invoices.
 *
 *   node scripts/backfill-accommodation-history.js --dry-run     # plan only, no writes
 *   node scripts/backfill-accommodation-history.js               # apply
 *   DB_NAME=hr_erp_sandbox node scripts/backfill-accommodation-history.js
 */
require('dotenv').config();
const { pool } = require('../src/database/connection');
const svc = require('../src/services/accommodationHistory.service');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const db = (await pool.query('SELECT current_database() AS d')).rows[0].d;
  console.log(`▶ accommodation-history backfill on "${db}"${dryRun ? ' (DRY RUN — no writes)' : ''}\n`);

  const before = (await pool.query(
    `SELECT COUNT(*)::int total,
            COUNT(*) FILTER (WHERE check_out_date IS NULL)::int open
       FROM employee_accommodation_history`)).rows[0];
  console.log(`  history rows before: ${before.total} (${before.open} open)`);

  const overlapsBefore = await svc.findOverlaps();
  if (overlapsBefore.length) {
    // Two rows covering one day would make recordDailySnapshot abort for EVERYONE
    // (ON CONFLICT cannot touch the same (date, employee) twice) — report, don't hide.
    console.log(`  ⚠️  ${overlapsBefore.length} pre-existing overlapping row pair(s) found:`);
    for (const o of overlapsBefore.slice(0, 5)) {
      console.log(`      employee ${o.employee_id}: [${o.a_in}→${o.a_out || '∞'}] vs [${o.b_in}→${o.b_out || '∞'}]`);
    }
  }

  const plan = await svc.backfillCurrentRoster({ dryRun });
  console.log(`\n  employees scanned:      ${plan.employees_scanned}`);
  console.log(`  already correct:        ${plan.housed_ok}`);
  console.log(`  stale row corrected:    ${plan.housed_fixed}`);
  console.log(`  missing row opened:     ${plan.housed_opened}`);
  console.log(`  unhoused, row closed:   ${plan.unhoused_closed}`);
  console.log(`  terminated, row closed: ${plan.leavers_closed}`);
  if (plan.duplicates_collapsed) console.log(`  duplicate open rows collapsed: ${plan.duplicates_collapsed}`);
  console.log(`  effective date:         ${plan.effective_date}`);

  if (!dryRun) {
    const after = (await pool.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE check_out_date IS NULL)::int open
         FROM employee_accommodation_history`)).rows[0];
    console.log(`\n  history rows after:  ${after.total} (${after.open} open)`);

    // The roster must now agree, and no employee may cover a day twice.
    const mismatch = (await pool.query(
      `SELECT COUNT(*)::int c FROM employees e
        WHERE e.end_date IS NULL AND e.accommodation_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM employee_accommodation_history h
             WHERE h.employee_id = e.id AND h.check_out_date IS NULL
               AND h.accommodation_id = e.accommodation_id
               AND h.room_id IS NOT DISTINCT FROM e.room_id)`)).rows[0].c;
    const overlaps = await svc.findOverlaps();
    console.log(`  housed employees still out of sync: ${mismatch}`);
    console.log(`  overlapping row pairs:              ${overlaps.length}`);
    if (mismatch === 0 && overlaps.length === 0) console.log('\n✅ history matches the current roster, no overlaps');
    else console.log('\n❌ verification FAILED — investigate before relying on billing');
    await pool.end();
    process.exit(mismatch === 0 && overlaps.length === 0 ? 0 : 1);
  }

  await pool.end();
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
