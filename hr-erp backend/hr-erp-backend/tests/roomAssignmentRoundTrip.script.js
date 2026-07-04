/**
 * Regression: room-assignment Excel round-trip (export → edit → upload).
 *  - exportRoomTemplate emits identity + accommodation + room + shift columns.
 *  - bulkAssignRooms matches employees BY IDENTITY (never creates duplicates),
 *    resolves the room within the employee's accommodation, and enforces bed
 *    capacity + room-belongs-to-accommodation.
 *
 * Pure Node, real DB, cleans up. Run: node tests/roomAssignmentRoundTrip.script.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const pool = require('../src/database/connection');
const emp = require('../src/controllers/employee.controller');

const CONTRACTOR = '00000000-0000-0000-0000-000000000001';
const TAG = 'ZZRT' + Date.now();
function resCapture() { const r = { statusCode: 200, body: null, headers: {}, buf: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;}, setHeader(k,v){this.headers[k]=v;}, send(b){this.buf=b;} }; return r; }
const fileReq = (rows) => ({ file: { buffer: XLSX.write((() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'S'); return wb; })(), { type: 'buffer', bookType: 'xlsx' }) } });
let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const one = async (s, p) => (await pool.query(s, p)).rows[0];

(async () => {
  const acc = await one(`INSERT INTO accommodations (name) VALUES ($1) RETURNING id`, [`${TAG} Szálló`]);
  const room2 = await one(`INSERT INTO accommodation_rooms (accommodation_id, room_number, beds) VALUES ($1,'101',2) RETURNING id`, [acc.id]); // 2 beds
  const acc2 = await one(`INSERT INTO accommodations (name) VALUES ($1) RETURNING id`, [`${TAG} Másik`]);
  await pool.query(`INSERT INTO accommodation_rooms (accommodation_id, room_number, beds) VALUES ($1,'999',1)`, [acc2.id]); // room in a DIFFERENT accommodation
  // 3 employees, same accommodation, distinct identity (name + mother's name)
  const mk = (ln, fn, mn) => one(
    `INSERT INTO employees (contractor_id, accommodation_id, last_name, first_name, mothers_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [CONTRACTOR, acc.id, `${TAG}${ln}`, fn, `${TAG}anya${ln}`]);
  const e1 = await mk('A', 'Anna', 'A');
  const e2 = await mk('B', 'Béla', 'B');
  const e3 = await mk('C', 'Csaba', 'C');
  const ids = [e1.id, e2.id, e3.id];

  try {
    // --- Task 3: export template contains the round-trip columns + our rows ---
    let res = resCapture();
    await emp.exportRoomTemplate({}, res);
    check('export returns an xlsx buffer', !!res.buf && res.headers['Content-Disposition'].includes('.xlsx'));
    const exported = XLSX.utils.sheet_to_json(XLSX.read(res.buf, { type: 'buffer' }).Sheets['Szoba-kiosztás']);
    const cols = Object.keys(exported[0] || {});
    check('template has identity + room + shift columns', ['Vezetéknév', 'Keresztnév', 'Anyja neve', 'Szálláshely', 'Szoba', 'Műszak'].every(c => cols.includes(c)));
    check('our seeded employees appear in the export', exported.filter(r => String(r['Vezetéknév']).startsWith(TAG)).length === 3);

    // --- Task 2: fill rooms + upload; identity-matched UPDATE, no duplicates ---
    const before = await one('SELECT COUNT(*)::int c FROM employees WHERE last_name LIKE $1', [`${TAG}%`]);
    res = resCapture();
    await emp.bulkAssignRooms(fileReq([
      { 'Vezetéknév': `${TAG}A`, 'Keresztnév': 'Anna', 'Anyja neve': `${TAG}anyaA`, 'Szálláshely': `${TAG} Szálló`, 'Szoba': '101', 'Műszak': 'Éjszakai' },
      { 'Vezetéknév': `${TAG}B`, 'Keresztnév': 'Béla', 'Anyja neve': `${TAG}anyaB`, 'Szálláshely': `${TAG} Szálló`, 'Szoba': '101', 'Műszak': 'nappali' },
    ]), res);
    check('upload reports 2 updated, 0 errors', res.body?.data?.updated_count === 2 && res.body?.data?.error_count === 0);
    check('e1 room_id set (101) + shift night', (await one('SELECT ar.room_number, e.shift_schedule FROM employees e JOIN accommodation_rooms ar ON ar.id=e.room_id WHERE e.id=$1', [e1.id]))?.room_number === '101');
    check('e2 shift normalized to day', (await one('SELECT shift_schedule FROM employees WHERE id=$1', [e2.id])).shift_schedule === 'day');
    const after = await one('SELECT COUNT(*)::int c FROM employees WHERE last_name LIKE $1', [`${TAG}%`]);
    check('NO duplicates created (count unchanged)', before.c === after.c);

    // --- bed capacity: room 101 has 2 beds, already 2 occupants → 3rd is rejected ---
    res = resCapture();
    await emp.bulkAssignRooms(fileReq([
      { 'Vezetéknév': `${TAG}C`, 'Keresztnév': 'Csaba', 'Anyja neve': `${TAG}anyaC`, 'Szálláshely': `${TAG} Szálló`, 'Szoba': '101' },
    ]), res);
    check('over-capacity assignment rejected (room full)', res.body?.data?.error_count === 1 && /tele van/.test(res.body.data.errors[0].message));
    check('e3 NOT assigned (room_id still null)', (await one('SELECT room_id FROM employees WHERE id=$1', [e3.id])).room_id === null);

    // --- room-not-in-accommodation: room 999 belongs to acc2, not e3's accommodation ---
    res = resCapture();
    await emp.bulkAssignRooms(fileReq([
      { 'Vezetéknév': `${TAG}C`, 'Keresztnév': 'Csaba', 'Anyja neve': `${TAG}anyaC`, 'Szoba': '999' },
    ]), res);
    check('room from a different accommodation rejected', res.body?.data?.error_count === 1 && /nem tartozik/.test(res.body.data.errors[0].message));

    // --- unmatched identity → error, no crash ---
    res = resCapture();
    await emp.bulkAssignRooms(fileReq([{ 'Vezetéknév': 'NoSuchPerson', 'Keresztnév': 'X', 'Anyja neve': 'Y', 'Szoba': '101' }]), res);
    check('unmatched identity → error (not found)', res.body?.data?.error_count === 1 && /Nem található/.test(res.body.data.errors[0].message));
  } finally {
    await pool.query('DELETE FROM employees WHERE last_name LIKE $1', [`${TAG}%`]).catch(()=>{});
    await pool.query('DELETE FROM accommodation_rooms WHERE accommodation_id IN ($1,$2)', [acc.id, acc2.id]).catch(()=>{});
    await pool.query('DELETE FROM accommodations WHERE id IN ($1,$2)', [acc.id, acc2.id]).catch(()=>{});
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
