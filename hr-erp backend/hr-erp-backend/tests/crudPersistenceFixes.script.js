/**
 * Regression: CRUD persistence fixes (Task 3 batch).
 *  - Live invoice update (costCenter.controller) persists contractor_id + line_items.
 *  - Employee update persists personal_email/personal_phone (resident invites) + room_id.
 *  - Accommodation update: an EXPLICIT status is no longer overwritten by an owner assignment.
 *
 * Pure Node, real DB, cleans up. Run: node tests/crudPersistenceFixes.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const costCenter = require('../src/controllers/costCenter.controller');
const employee = require('../src/controllers/employee.controller');
const accommodation = require('../src/controllers/accommodation.controller');

const CONTRACTOR_A = '00000000-0000-0000-0000-000000000001';
function mockRes() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const one = async (sql, p) => (await pool.query(sql, p)).rows[0];

(async () => {
  const admin = (await one(`SELECT id FROM users WHERE email='admin@hr-erp.com'`)).id;
  const cc = (await one('SELECT id FROM cost_centers LIMIT 1')).id;
  const contractorB = (await one('SELECT id FROM contractors WHERE id <> $1 LIMIT 1', [CONTRACTOR_A]))?.id || CONTRACTOR_A;
  const cleanup = { inv: [], emp: [], acc: [], room: [] };

  try {
    // ---- 1. Invoice (LIVE path = costCenter.controller): contractor_id + line_items ----
    let res = mockRes();
    await costCenter.createInvoice({ body: { cost_center_id: cc, amount: 100, invoice_date: '2026-07-04', contractor_id: CONTRACTOR_A, line_items: [{ d: 'x', n: 1 }] }, user: { id: admin } }, res);
    const invId = res.body?.data?.id; cleanup.inv.push(invId);
    check('live createInvoice persists contractor_id', res.body?.data?.contractor_id === CONTRACTOR_A);
    check('live createInvoice persists line_items', !!res.body?.data?.line_items);

    res = mockRes();
    await costCenter.updateInvoice({ params: { id: invId }, body: { contractor_id: contractorB, line_items: [{ d: 'y', n: 2 }] }, user: { id: admin } }, res);
    check('live updateInvoice returns 200', res.statusCode === 200);
    const invAfter = await one('SELECT contractor_id, line_items FROM invoices WHERE id=$1', [invId]);
    check('live updateInvoice PERSISTS contractor_id (was dropped)', invAfter.contractor_id === contractorB);
    check('live updateInvoice persists line_items', JSON.stringify(invAfter.line_items).includes('"y"'));

    // ---- 2. Employee update: personal_email/personal_phone + room_id ----
    const acc = await one(`INSERT INTO accommodations (name) VALUES ('ZZ Test Acc') RETURNING id`); cleanup.acc.push(acc.id);
    const room = await one(`INSERT INTO accommodation_rooms (accommodation_id, room_number, beds) VALUES ($1,'R1',2) RETURNING id`, [acc.id]); cleanup.room.push(room.id);
    const emp = await one(`INSERT INTO employees (contractor_id, first_name, last_name) VALUES ($1,'Test','Emp') RETURNING id`, [CONTRACTOR_A]); cleanup.emp.push(emp.id);

    res = mockRes();
    await employee.updateEmployee({ params: { id: emp.id }, body: { personal_email: 'invite@resident.com', personal_phone: '+36301234567', room_id: room.id }, user: { id: admin, contractorId: CONTRACTOR_A } }, res);
    check('updateEmployee returns 200', res.statusCode === 200);
    const empAfter = await one('SELECT personal_email, personal_phone, room_id FROM employees WHERE id=$1', [emp.id]);
    check('personal_email now persists (resident-invite unblocked)', empAfter.personal_email === 'invite@resident.com');
    check('personal_phone now persists', empAfter.personal_phone === '+36301234567');
    check('room_id assignment persists (bed-occupancy foundation)', empAfter.room_id === room.id);

    // ---- 3. Accommodation: explicit status is NOT overridden by owner assignment ----
    res = mockRes();
    await accommodation.updateAccommodation({ params: { id: acc.id }, body: { status: 'maintenance', current_contractor_id: CONTRACTOR_A }, user: { id: admin, contractorId: CONTRACTOR_A, roles: ['superadmin'] } }, res);
    const accAfter = await one('SELECT status, current_contractor_id FROM accommodations WHERE id=$1', [acc.id]);
    check('explicit status "maintenance" kept despite owner assignment (no override)', accAfter.status === 'maintenance');

    // owner assignment with NO explicit status still auto-derives occupied
    res = mockRes();
    await accommodation.updateAccommodation({ params: { id: acc.id }, body: { current_contractor_id: CONTRACTOR_A }, user: { id: admin, contractorId: CONTRACTOR_A, roles: ['superadmin'] } }, res);
    check('owner assignment w/o explicit status → auto occupied (behavior preserved)', (await one('SELECT status FROM accommodations WHERE id=$1', [acc.id])).status === 'occupied');

  } finally {
    for (const id of cleanup.inv) await pool.query('DELETE FROM invoices WHERE id=$1', [id]).catch(()=>{});
    for (const id of cleanup.emp) await pool.query('DELETE FROM employees WHERE id=$1', [id]).catch(()=>{});
    for (const id of cleanup.room) await pool.query('DELETE FROM accommodation_rooms WHERE id=$1', [id]).catch(()=>{});
    for (const id of cleanup.acc) await pool.query('DELETE FROM accommodations WHERE id=$1', [id]).catch(()=>{});
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
