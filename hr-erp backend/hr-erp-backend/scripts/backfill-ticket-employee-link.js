#!/usr/bin/env node
/**
 * Backfill tickets.linked_employee_id from the reporter.
 *
 * WHY IT MATTERS NOW
 * ------------------
 * The megbízó role sees a ticket only when it is about one of THEIR workers:
 *
 *   EXISTS (SELECT 1 FROM employees e
 *            WHERE e.id = t.linked_employee_id
 *              AND e.billing_client_id = <viewer's client>)
 *
 * A ticket with no linked employee therefore belongs to nobody and is invisible to the
 * client it actually concerns. On 2026-09-05 that was 16 of 24 tickets.
 *
 * The link is recoverable where the reporter IS the worker: tickets.created_by is a
 * users row, and employees.user_id points back at it. Where the reporter was a staff
 * member filing on someone's behalf, there is nothing to resolve from and the ticket
 * needs a human — which this script reports rather than guesses at.
 *
 *   node scripts/backfill-ticket-employee-link.js           # dry run (default)
 *   node scripts/backfill-ticket-employee-link.js --apply   # write
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');

(async () => {
  const db = (await query('SELECT current_database() AS d')).rows[0].d;
  console.log(`database: ${db}   mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const total = (await query('SELECT count(*)::int c FROM tickets')).rows[0].c;
  const linked = (await query('SELECT count(*)::int c FROM tickets WHERE linked_employee_id IS NOT NULL')).rows[0].c;

  // Resolvable: the reporter's user account belongs to an employee.
  const resolvable = (await query(`
    SELECT t.id, t.ticket_number, e.id AS employee_id,
           e.last_name || ' ' || e.first_name AS employee
      FROM tickets t
      JOIN employees e ON e.user_id = t.created_by
     WHERE t.linked_employee_id IS NULL
     ORDER BY t.ticket_number`)).rows;

  const unresolvable = (await query(`
    SELECT t.id, t.ticket_number, t.title,
           u.email AS reported_by,
           CASE WHEN t.created_by IS NULL THEN 'nincs bejelentő'
                WHEN u.id IS NULL THEN 'a bejelentő felhasználó törölve'
                ELSE 'a bejelentő nem munkavállaló (irodai felhasználó)' END AS why
      FROM tickets t
      LEFT JOIN users u ON u.id = t.created_by
     WHERE t.linked_employee_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = t.created_by)
     ORDER BY t.ticket_number`)).rows;

  console.log(`összes hibajegy          : ${total}`);
  console.log(`már össze van kötve      : ${linked}`);
  console.log(`a bejelentőből megoldható: ${resolvable.length}`);
  console.log(`emberi döntést igényel   : ${unresolvable.length}\n`);

  if (resolvable.length) {
    console.log('── megoldható ──');
    for (const r of resolvable.slice(0, 15)) console.log(`  ${r.ticket_number}  → ${r.employee}`);
    if (resolvable.length > 15) console.log(`  … és további ${resolvable.length - 15}`);
  }
  if (unresolvable.length) {
    console.log('\n── kézi hozzárendelés kell ──');
    const byWhy = {};
    for (const r of unresolvable) byWhy[r.why] = (byWhy[r.why] || 0) + 1;
    for (const [w, n] of Object.entries(byWhy)) console.log(`  ${n} db — ${w}`);
    for (const r of unresolvable.slice(0, 10)) {
      console.log(`    ${r.ticket_number}  "${(r.title || '').slice(0, 48)}"  (${r.reported_by || '—'})`);
    }
  }

  if (APPLY && resolvable.length) {
    const r = await query(`
      UPDATE tickets t SET linked_employee_id = e.id, updated_at = now()
        FROM employees e
       WHERE e.user_id = t.created_by AND t.linked_employee_id IS NULL
      RETURNING t.id`);
    console.log(`\n✅ ${r.rowCount} hibajegy összekötve.`);
  } else if (!APPLY) {
    console.log('\n(dry run — semmi nem íródott. --apply a végrehajtáshoz)');
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
