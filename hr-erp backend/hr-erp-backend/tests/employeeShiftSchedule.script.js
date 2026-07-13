/**
 * Regression: employees.shift_schedule (room-consolidation-engine input).
 * THREE-shift model (mig 137): delelott | delutan | ejszaka | valtott.
 *  - updateEmployee persists a valid slug.
 *  - Hungarian/English variants normalize to a slug.
 *  - An unrecognized value (incl. retired 'day'/'flexible') → NULL (never violates the CHECK).
 *
 * Pure Node, real DB, cleans up. Run: node tests/employeeShiftSchedule.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const employee = require('../src/controllers/employee.controller');

const CONTRACTOR = '00000000-0000-0000-0000-000000000001';
function mockRes() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const shiftOf = async (id) => (await pool.query('SELECT shift_schedule FROM employees WHERE id=$1', [id])).rows[0].shift_schedule;

(async () => {
  const admin = (await pool.query(`SELECT id FROM users WHERE email='admin@hr-erp.com'`)).rows[0].id;
  const emp = (await pool.query(`INSERT INTO employees (contractor_id, first_name, last_name) VALUES ($1,'Shift','Test') RETURNING id`, [CONTRACTOR])).rows[0].id;

  const upd = async (val) => { const res = mockRes(); await employee.updateEmployee({ params: { id: emp }, body: { shift_schedule: val }, user: { id: admin, contractorId: CONTRACTOR } }, res); return res; };

  try {
    let res = await upd('ejszaka');
    check('update with valid slug "ejszaka" → 200', res.statusCode === 200);
    check('persisted as ejszaka', await shiftOf(emp) === 'ejszaka');

    await upd('délelőttös');   // Hungarian "morning shift"
    check('Hungarian "délelőttös" normalized → delelott', await shiftOf(emp) === 'delelott');

    await upd('délutáni');     // Hungarian "afternoon"
    check('Hungarian "délutáni" normalized → delutan', await shiftOf(emp) === 'delutan');

    await upd('éjszakai');     // Hungarian "night"
    check('Hungarian "éjszakai" normalized → ejszaka', await shiftOf(emp) === 'ejszaka');

    await upd('váltott');      // Hungarian "rotating/alternating"
    check('Hungarian "váltott" normalized → valtott', await shiftOf(emp) === 'valtott');

    await upd('valtott');      // slug persists
    check('valid slug "valtott" persists', await shiftOf(emp) === 'valtott');

    await upd('nappali');      // retired legacy "day" → no clean 3-shift target
    check('retired "nappali"/day → NULL (removed)', (await shiftOf(emp)) === null);

    await upd('ejszaka');      // set again to prove the next line clears it
    res = await upd('flexible');  // retired value
    check('retired "flexible" → NULL (removed)', (await shiftOf(emp)) === null);

    res = await upd('totally-invalid-shift');
    check('unrecognized value → NULL (no CHECK violation, 200)', res.statusCode === 200 && (await shiftOf(emp)) === null);
  } finally {
    await pool.query('DELETE FROM employees WHERE id=$1', [emp]).catch(()=>{});
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
