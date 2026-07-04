/**
 * Regression: employees.shift_schedule (room-consolidation-engine input).
 *  - updateEmployee persists a valid slug.
 *  - Hungarian/English variants normalize to a slug (day/night/rotating/flexible).
 *  - An unrecognized value → NULL (never violates the CHECK constraint).
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
    let res = await upd('night');
    check('update with valid slug "night" → 200', res.statusCode === 200);
    check('persisted as night', await shiftOf(emp) === 'night');

    await upd('nappali');   // Hungarian "day"
    check('Hungarian "nappali" normalized → day', await shiftOf(emp) === 'day');

    await upd('éjszakai');  // Hungarian "night"
    check('Hungarian "éjszakai" normalized → night', await shiftOf(emp) === 'night');

    await upd('váltott');   // Hungarian "rotating"
    check('Hungarian "váltott" normalized → rotating', await shiftOf(emp) === 'rotating');

    res = await upd('totally-invalid-shift');
    check('unrecognized value → NULL (no CHECK violation, 200)', res.statusCode === 200 && (await shiftOf(emp)) === null);

    await upd('flexible');
    check('valid slug "flexible" persists', await shiftOf(emp) === 'flexible');
  } finally {
    await pool.query('DELETE FROM employees WHERE id=$1', [emp]).catch(()=>{});
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
