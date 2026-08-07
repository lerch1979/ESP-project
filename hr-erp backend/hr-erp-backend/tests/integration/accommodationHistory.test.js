/**
 * Regression: the occupancy-history writer (FUNCTEST DATA-01).
 *
 * `employee_accommodation_history` is the ONLY input `recordDailySnapshot` reads, and
 * nothing in the application used to write it — so every room move, transfer, hire and
 * termination was invisible to occupancy snapshots and therefore to billing.
 *
 * This pins the service's semantics directly (no HTTP), because those semantics are what
 * the money depends on:
 *   • a change effective on D closes the old stay at D and opens the new one at D, so the
 *     handover day lands on the NEW place (migration 112 decision #5);
 *   • a stay opened on D and changed again on D is REPLACED, not closed-and-reopened;
 *   • no employee ever ends up with two rows covering the same day — that would make
 *     recordDailySnapshot abort for EVERYONE (ON CONFLICT can't hit one row twice);
 *   • the resulting snapshot actually reflects the move.
 *
 * Real DB, self-cleaning, far-past sentinel month so it can never collide.
 */
// CI passes DB_* explicitly; locally they live in .env (connection.js never loads it).
require('dotenv').config();
const { query } = require('../../src/database/connection');
const svc = require('../../src/services/accommodationHistory.service');
const occ = require('../../src/services/occupancyTracking.service');

const TAG = 'ZAccHist';
const MONTH = '1904-04';
const day = (n) => `${MONTH}-${String(n).padStart(2, '0')}`;

let accA, accB, roomA1, roomA2, empId;

async function cleanup() {
  await query(`DELETE FROM occupancy_snapshots WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM employee_accommodation_history WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM employees WHERE last_name=$1`, [TAG]);
  await query(`DELETE FROM accommodation_rooms WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM accommodations WHERE name LIKE $1`, [TAG + '%']);
}

const openRows = () => query(
  `SELECT accommodation_id, room_id, TO_CHAR(check_in_date,'YYYY-MM-DD') AS check_in
     FROM employee_accommodation_history WHERE employee_id=$1 AND check_out_date IS NULL`, [empId]);
const allRows = () => query(
  `SELECT accommodation_id, room_id, TO_CHAR(check_in_date,'YYYY-MM-DD') AS check_in,
          TO_CHAR(check_out_date,'YYYY-MM-DD') AS check_out
     FROM employee_accommodation_history WHERE employee_id=$1 ORDER BY check_in, check_out NULLS LAST`, [empId]);

beforeAll(async () => {
  await cleanup();
  const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;
  const mkAcc = async (n) => (await query(
    `INSERT INTO accommodations (name,capacity,monthly_rent,status,is_active)
     VALUES ($1,10,300000,'active',true) RETURNING id`, [`${TAG}-${n}`])).rows[0].id;
  accA = await mkAcc('A');
  accB = await mkAcc('B');
  const mkRoom = async (acc, n) => (await query(
    `INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active)
     VALUES ($1,$2,4,true) RETURNING id`, [acc, n])).rows[0].id;
  roomA1 = await mkRoom(accA, `${TAG}-1`);
  roomA2 = await mkRoom(accA, `${TAG}-2`);
  empId = (await query(
    `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,room_id)
     VALUES ('E',$1,$2,$3,$4) RETURNING id`, [TAG, status, accA, roomA1])).rows[0].id;
}, 30000);

afterAll(cleanup);

describe('accommodationHistory.syncAssignment', () => {
  test('opens a stay when there is none', async () => {
    const r = await svc.syncAssignment(null, {
      employeeId: empId, accommodationId: accA, roomId: roomA1, effectiveDate: day(1), reason: 'hire',
    });
    expect(r.opened).toBe(true);
    const open = (await openRows()).rows;
    expect(open).toHaveLength(1);
    expect(open[0].accommodation_id).toBe(accA);
    expect(open[0].room_id).toBe(roomA1);
    expect(open[0].check_in).toBe(day(1));
  });

  test('is a no-op when nothing about the housing changed', async () => {
    const r = await svc.syncAssignment(null, {
      employeeId: empId, accommodationId: accA, roomId: roomA1, effectiveDate: day(5),
    });
    expect(r.changed).toBe(false);
    expect((await allRows()).rows).toHaveLength(1);
  });

  test('a ROOM change closes the old stay and opens the new one on the same day', async () => {
    await svc.syncAssignment(null, {
      employeeId: empId, accommodationId: accA, roomId: roomA2, effectiveDate: day(10), reason: 'room move',
    });
    const rows = (await allRows()).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ room_id: roomA1, check_in: day(1), check_out: day(10) });
    expect(rows[1]).toMatchObject({ room_id: roomA2, check_in: day(10), check_out: null });
  });

  test('a second change ON THE SAME DAY replaces the row rather than stacking a zero-length one', async () => {
    await svc.syncAssignment(null, {
      employeeId: empId, accommodationId: accB, roomId: null, effectiveDate: day(10), reason: 'transfer',
    });
    const rows = (await allRows()).rows;
    expect(rows).toHaveLength(2);                                   // still 2, not 3
    expect(rows[1]).toMatchObject({ accommodation_id: accB, check_in: day(10), check_out: null });
  });

  test('closeAssignment ends the stay and leaves nothing open', async () => {
    await svc.closeAssignment(null, { employeeId: empId, effectiveDate: day(20), reason: 'termination' });
    expect((await openRows()).rows).toHaveLength(0);
    const rows = (await allRows()).rows;
    expect(rows[rows.length - 1].check_out).toBe(day(20));
  });

  test('no two rows ever cover the same day (the snapshot-breaking overlap)', async () => {
    const overlaps = (await svc.findOverlaps()).filter((o) => o.employee_id === empId);
    expect(overlaps).toEqual([]);
  });
});

describe('the chain that was broken: history → snapshot', () => {
  test('the handover day belongs to the NEW accommodation, and each day is counted once', async () => {
    for (let d = 1; d <= 20; d++) await occ.recordDailySnapshot(day(d));
    const rows = (await query(
      `SELECT TO_CHAR(snapshot_date,'YYYY-MM-DD') AS d, accommodation_id, room_id
         FROM occupancy_snapshots WHERE employee_id=$1 ORDER BY snapshot_date`, [empId])).rows;

    expect(rows).toHaveLength(19);                                   // days 1..19; day 20 is check-out
    expect(rows.find((r) => r.d === day(9))).toMatchObject({ accommodation_id: accA, room_id: roomA1 });
    expect(rows.find((r) => r.d === day(10))).toMatchObject({ accommodation_id: accB });   // handover → NEW
    expect(rows.find((r) => r.d === day(19))).toMatchObject({ accommodation_id: accB });
    expect(rows.find((r) => r.d === day(20))).toBeUndefined();       // left that morning
  });

  test('re-running a day is idempotent (one row per employee-day)', async () => {
    await occ.recordDailySnapshot(day(10));
    const dup = (await query(
      `SELECT COUNT(*)::int c FROM occupancy_snapshots WHERE employee_id=$1 AND snapshot_date=$2::date`,
      [empId, day(10)])).rows[0].c;
    expect(dup).toBe(1);
  });
});

describe('backfillCurrentRoster', () => {
  test('dry run reports the plan without writing', async () => {
    await query(`UPDATE employees SET accommodation_id=$2, room_id=$3, end_date=NULL WHERE id=$1`, [empId, accA, roomA1]);
    const before = (await allRows()).rows.length;
    const plan = await svc.backfillCurrentRoster({ dryRun: true });
    expect(plan.dry_run).toBe(true);
    expect((await allRows()).rows).toHaveLength(before);
  });

  test('applying it makes history agree with the roster, with no overlaps', async () => {
    await svc.backfillCurrentRoster({});
    const open = (await openRows()).rows;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ accommodation_id: accA, room_id: roomA1 });
    expect((await svc.findOverlaps()).filter((o) => o.employee_id === empId)).toEqual([]);
  });
});
