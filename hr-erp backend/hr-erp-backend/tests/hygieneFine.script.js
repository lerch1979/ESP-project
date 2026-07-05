/**
 * Regression: room-hygiene house-rule fine (házirend), SANDBOX only.
 *
 * Seeds a room with two consecutive COMPLETED inspections whose hygiene is
 * failing, then proves:
 *   • toggle OFF → no fines
 *   • toggle ON  → exactly ONE HOUSE_RULES fine (10,000 Ft × residents), idempotent
 *   • the fine writes NO compensation_payments and NO salary_deductions
 *   • the cash path still works on the created fine
 *   • a single failing inspection does NOT trigger a fine
 *
 *   DB_NAME=hr_erp_sandbox node tests/hygieneFine.script.js
 */
require('dotenv').config();
const { pool } = require('../src/database/connection');
const hygiene = require('../src/services/hygieneFine.service');
const fineSvc = require('../src/services/fine.service');

if (!/sandbox/i.test(process.env.DB_NAME || '')) { console.error('Run against the sandbox: DB_NAME=hr_erp_sandbox'); process.exit(1); }

let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const q = (s, p) => pool.query(s, p);
const TAG = 'HYGTEST';

async function mkInspection(accId, roomId, hygieneScore, daysAgo, residents) {
  const insp = (await q(
    `INSERT INTO inspections (inspection_number, accommodation_id, inspection_type, status,
        scheduled_at, started_at, completed_at, hygiene_score, total_score, grade)
     VALUES ($1,$2,'monthly','completed', NOW()-($3||' days')::interval, NOW()-($3||' days')::interval,
             NOW()-($3||' days')::interval, $4, $4, 'critical')
     RETURNING id`,
    [`${TAG}-${Math.floor(Math.random()*1e9)}`, accId, daysAgo, hygieneScore])).rows[0];
  await q(
    `INSERT INTO room_inspections (inspection_id, room_id, room_number, hygiene_score, total_score,
        residents_snapshot, needs_attention)
     VALUES ($1,$2,$3,$4,$4,$5,true)`,
    [insp.id, roomId, 'TST-1', hygieneScore, JSON.stringify(residents)]);
  return insp.id;
}

(async () => {
  let accId, roomId;
  try {
    // ── setup: a dedicated test accommodation + room ──
    const contractorId = (await q(`SELECT id FROM contractors LIMIT 1`)).rows[0].id;
    accId = (await q(
      `INSERT INTO accommodations (name, address, type, current_contractor_id, status, monthly_rent)
       VALUES ($1,'Teszt cím','dormitory',$2,'occupied',100000) RETURNING id`,
      [`${TAG} Szálló`, contractorId])).rows[0].id;
    roomId = (await q(
      `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
       VALUES ($1,'TST-1',0,2,'standard',true) RETURNING id`, [accId])).rows[0].id;
    const residents = [{ name: `${TAG} Lakó Egy`, user_id: null, email: null },
                       { name: `${TAG} Lakó Kettő`, user_id: null, email: null }];

    // config: set threshold 15, N=2, amount 10000 (defaults), but start DISABLED
    await hygiene.updateConfig({ enabled: false, consecutive_fails: 2, fail_hygiene_max: 15, fine_amount: 10000 }, null);

    // two consecutive FAILING inspections (hygiene 10 <= 15)
    const i1 = await mkInspection(accId, roomId, 10, 20, residents);
    const i2 = await mkInspection(accId, roomId, 8, 5, residents);

    // ── toggle OFF → no fines ──
    const off = await hygiene.runHygieneFines({ userId: null });
    check('toggle OFF → skipped (disabled)', off.skipped === true && off.reason === 'disabled');
    const fineCount0 = (await q(`SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [roomId])).rows[0].c;
    check('toggle OFF → zero fines created', fineCount0 === 0);

    // ── toggle ON → exactly one fine ──
    await hygiene.updateConfig({ enabled: true }, null);
    const on = await hygiene.runHygieneFines({ userId: null });
    check('toggle ON → created exactly 1 fine', on.created === 1 && on.candidates === 1);

    const fine = (await q(
      `SELECT c.*, ft.code FROM compensations c JOIN fine_types ft ON ft.id=c.fine_type_id
        WHERE c.room_id=$1 AND c.type='fine'`, [roomId])).rows[0];
    check('fine is a HOUSE_RULES compensation on the latest inspection', !!fine && fine.code === 'HOUSE_RULES' && fine.inspection_id === i2);
    check('fine amount = 10,000 × 2 residents = 20,000', Number(fine.amount_gross) === 20000);
    const residentRows = (await q(`SELECT COUNT(*)::int c FROM compensation_residents WHERE compensation_id=$1`, [fine.id])).rows[0].c;
    check('2 compensation_residents rows created', residentRows === 2);

    // ── NO deduction execution artifacts ──
    const payCount = (await q(`SELECT COUNT(*)::int c FROM compensation_payments WHERE compensation_id=$1`, [fine.id])).rows[0].c;
    check('fine wrote ZERO compensation_payments (no auto-execution)', payCount === 0);
    const dedCount = (await q(`SELECT COUNT(*)::int c FROM salary_deductions WHERE compensation_id=$1`, [fine.id])).rows[0].c;
    check('fine wrote ZERO salary_deductions (no deduction)', dedCount === 0);

    // ── idempotent on re-run ──
    const again = await hygiene.runHygieneFines({ userId: null });
    check('re-run creates 0 (idempotent) + skips existing', again.created === 0 && again.skipped_existing === 1);
    const fineCount1 = (await q(`SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [roomId])).rows[0].c;
    check('still exactly 1 fine after re-run', fineCount1 === 1);

    // ── CASH path still works on the created fine ──
    const cr = (await q(`SELECT id FROM compensation_residents WHERE compensation_id=$1 LIMIT 1`, [fine.id])).rows[0];
    const cash = await fineSvc.recordOnSitePayment(cr.id, { method: 'on_site_cash', signatureData: 'sig', userId: null });
    check('cash on-site payment recorded on the fine', !!cash);
    const payAfter = (await q(`SELECT COUNT(*)::int c FROM compensation_payments WHERE compensation_resident_id=$1`, [cr.id])).rows[0].c;
    check('cash payment wrote a compensation_payments row (cash ledger works)', payAfter >= 1);
    const dedAfter = (await q(`SELECT COUNT(*)::int c FROM salary_deductions WHERE compensation_id=$1`, [fine.id])).rows[0].c;
    check('cash payment did NOT create a salary_deduction', dedAfter === 0);

    // ── negative: a room with only ONE failing inspection → no fine ──
    const acc2 = (await q(
      `INSERT INTO accommodations (name, address, type, current_contractor_id, status, monthly_rent)
       VALUES ($1,'Teszt2','dormitory',$2,'occupied',100000) RETURNING id`, [`${TAG} Szálló2`, contractorId])).rows[0].id;
    const room2 = (await q(
      `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
       VALUES ($1,'TST-2',0,2,'standard',true) RETURNING id`, [acc2])).rows[0].id;
    await mkInspection(acc2, room2, 8, 3, residents);       // one failing only
    const neg = await hygiene.runHygieneFines({ userId: null });
    const negFines = (await q(`SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [room2])).rows[0].c;
    check('single failing inspection → NO fine (needs 2 consecutive)', negFines === 0);
    void neg;
  } finally {
    // cleanup everything tagged
    await q(`DELETE FROM compensation_payments WHERE compensation_resident_id IN
             (SELECT cr.id FROM compensation_residents cr JOIN compensations c ON c.id=cr.compensation_id WHERE c.room_id IN
               (SELECT id FROM accommodation_rooms WHERE room_number LIKE 'TST-%'))`).catch(()=>{});
    await q(`DELETE FROM compensation_residents WHERE compensation_id IN (SELECT id FROM compensations WHERE responsible_name LIKE '${TAG}%')`).catch(()=>{});
    await q(`DELETE FROM compensations WHERE responsible_name LIKE '${TAG}%'`).catch(()=>{});
    await q(`DELETE FROM room_inspections WHERE inspection_id IN (SELECT id FROM inspections WHERE inspection_number LIKE '${TAG}-%')`).catch(()=>{});
    await q(`DELETE FROM inspections WHERE inspection_number LIKE '${TAG}-%'`).catch(()=>{});
    await q(`DELETE FROM accommodation_rooms WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE '${TAG}%')`).catch(()=>{});
    await q(`DELETE FROM accommodations WHERE name LIKE '${TAG}%'`).catch(()=>{});
    await hygiene.updateConfig({ enabled: false }, null).catch(()=>{});
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
