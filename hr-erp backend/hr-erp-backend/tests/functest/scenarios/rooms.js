/**
 * ROOMS — the delete/recreate cycle and natural room-number ordering.
 *
 * ROOM-03 is the one a tester found: `deleteRoom` only DEACTIVATED the row, but
 * `accommodation_rooms` carries a hard UNIQUE (accommodation_id, room_number) that knows
 * nothing about is_active. So the number stayed reserved by a row the user could no
 * longer see, and re-adding it failed with "already exists" — a dead end with no way out
 * from the UI.
 *
 * ROOM-05 guards the other half of that bug: deleting a room un-rooms whoever lives in
 * it, which is a housing change that feeds billing and consolidation. It must never
 * happen without the caller being told how many people it moves.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

const nums = (rooms) => rooms.map((r) => r.room_number);

module.exports = {
  area: 'ROOMS',
  title: 'természetes szobaszám-sorrend · törlés/újralétrehozás · lakós törlés megerősítéssel',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    // A site with no fixture rooms, so this scenario owns the whole room set.
    return { t, acc: ctx.ids.acc.pp, base: `/accommodations/${ctx.ids.acc.pp}/rooms` };
  },

  cases: [
    {
      id: 'ROOM-01',
      name: 'a szobaszámok TERMÉSZETESEN rendeződnek, nem betűrendben',
      expected: { order: ['2', '7', '9 /B2', '10', '113', 'Konyha'] },
      hint: 'room_number is varchar; plain text sort puts 10 before 2 and 113 before 9',
      run: async (ctx, s) => {
        // Created deliberately out of order.
        for (const n of ['113', '2', 'Konyha', '10', '9 /B2', '7']) {
          await http.post(s.base, { token: s.t, body: { room_number: n, beds: 2 } });
        }
        const r = await http.get(s.base, { token: s.t });
        s.rooms = r.body.data.rooms;
        return { order: nums(s.rooms) };
      },
    },
    {
      id: 'ROOM-02',
      name: 'előzmény nélküli szoba VÉGLEG törlődik, és a szobaszám újra használható',
      expected: { del: 200, hard_deleted: true, gone_from_db: 0, recreate: 201, restored: false },
      hint: 'a soft-deleted row would keep the number reserved forever via the UNIQUE index',
      run: async (ctx, s) => {
        const room = s.rooms.find((x) => x.room_number === '113');
        const d = await http.del(`${s.base}/${room.id}`, { token: s.t });
        const still = await query('SELECT count(*)::int c FROM accommodation_rooms WHERE id=$1', [room.id]);
        const again = await http.post(s.base, { token: s.t, body: { room_number: '113', beds: 4 } });
        return {
          del: d.status,
          hard_deleted: d.body.data?.hard_deleted,
          gone_from_db: still.rows[0].c,
          recreate: again.status,
          restored: again.body.data?.restored,
        };
      },
    },
    {
      id: 'ROOM-03',
      name: 'előzményes szoba deaktiválódik, és ugyanazzal a számmal ÚJRA létrehozva visszaáll (ugyanaz az id)',
      expected: { del: 200, hard_deleted: false, recreate: 201, restored: true, same_id: true, active_again: true },
      hint: 'THE REPORTED BUG: recreating a deleted room number used to answer "már létezik"',
      run: async (ctx, s) => {
        const room = s.rooms.find((x) => x.room_number === '7');
        // Give it history, so it must be preserved rather than hard-deleted.
        await query(
          `INSERT INTO occupancy_snapshots
             (snapshot_date, employee_id, accommodation_id, room_id, room_beds, room_occupant_count)
           SELECT CURRENT_DATE, id, $2, $1, 2, 1 FROM employees WHERE accommodation_id=$2 LIMIT 1`,
          [room.id, s.acc]);

        const d = await http.del(`${s.base}/${room.id}`, { token: s.t });
        const again = await http.post(s.base, { token: s.t, body: { room_number: '7', beds: 5 } });
        const row = await query('SELECT is_active, beds FROM accommodation_rooms WHERE id=$1', [room.id]);
        return {
          del: d.status,
          hard_deleted: d.body.data?.hard_deleted,
          recreate: again.status,
          restored: again.body.data?.restored,
          same_id: again.body.data?.room?.id === room.id,
          active_again: row.rows[0]?.is_active === true,
        };
      },
    },
    {
      id: 'ROOM-04',
      name: 'aktív, létező szobaszám továbbra sem duplikálható',
      expected: { status: 400, message_mentions_exists: true },
      hint: 'the reactivate path must not turn a genuine duplicate into a silent overwrite',
      run: async (ctx, s) => {
        const r = await http.post(s.base, { token: s.t, body: { room_number: '2', beds: 3 } });
        return {
          status: r.status,
          message_mentions_exists: /már létezik/i.test(r.body.message || ''),
        };
      },
    },
    {
      id: 'ROOM-05',
      name: 'lakóval rendelkező szoba törlése MEGERŐSÍTÉST kér, és megmondja hány embert érint',
      expected: { refused: 409, requires_confirmation: true, occupant_count: 2, still_there: 2 },
      hint: 'un-rooming people feeds billing + consolidation; it must never be a silent side effect',
      run: async (ctx, s) => {
        const room = s.rooms.find((x) => x.room_number === '10');
        const free = await query(
          `SELECT id FROM employees
            WHERE accommodation_id=$1 AND end_date IS NULL AND room_id IS NULL LIMIT 2`, [s.acc]);
        s.movedIn = free.rows.map((x) => x.id);
        s.roomWithPeople = room.id;
        for (const id of s.movedIn) {
          await http.post(`${s.base}/${room.id}/occupants`, { token: s.t, body: { employee_id: id } });
        }

        const d = await http.del(`${s.base}/${room.id}`, { token: s.t });
        const after = await query(
          'SELECT count(*)::int c FROM employees WHERE room_id=$1', [room.id]);
        return {
          refused: d.status,
          requires_confirmation: d.body.requires_confirmation === true,
          occupant_count: d.body.data?.occupant_count,
          still_there: after.rows[0].c,   // nobody moved on the refused call
        };
      },
    },
    {
      id: 'ROOM-06',
      name: 'megerősítéssel a törlés lefut, a lakók kikerülnek a szobából és ez BEKERÜL az előzménybe',
      expected: { del: 200, unhoused: 2, room_id_cleared: 0, history_written: 2, still_at_site: 2 },
      hint: 'they stay AT the accommodation, only the room is cleared — that distinction is what billing reads',
      run: async (ctx, s) => {
        const d = await http.del(`${s.base}/${s.roomWithPeople}?confirm=true`, { token: s.t });
        const cleared = await query('SELECT count(*)::int c FROM employees WHERE room_id=$1', [s.roomWithPeople]);
        const hist = await query(
          `SELECT count(*)::int c FROM employee_accommodation_history
            WHERE employee_id = ANY($1) AND reason = 'room deleted'`, [s.movedIn]);
        const atSite = await query(
          'SELECT count(*)::int c FROM employees WHERE id = ANY($1) AND accommodation_id=$2',
          [s.movedIn, s.acc]);
        return {
          del: d.status,
          unhoused: d.body.data?.unhoused_count,
          room_id_cleared: cleared.rows[0].c,
          history_written: hist.rows[0].c,
          still_at_site: atSite.rows[0].c,
        };
      },
    },
    {
      id: 'ROOM-07',
      name: 'lakó beköltöztethető és kiköltöztethető KÖZVETLENÜL a szobalistából, tele szobába nem',
      expected: { assign: 200, in_room: 1, full: 409, remove: 200, after_remove: 0,
                  history_reason: 'room unassignment' },
      hint: 'assignment used to live only on the Employees side — the UX gap the tester hit',
      run: async (ctx, s) => {
        // A one-bed room of its own, so "full" needs two people rather than three — the
        // PerPerson site only has two employees.
        const mk = await http.post(s.base, { token: s.t, body: { room_number: '77', beds: 1 } });
        const roomId = mk.body.data.room.id;

        const e = await query(
          `SELECT id FROM employees
            WHERE accommodation_id=$1 AND end_date IS NULL AND room_id IS NULL LIMIT 2`, [s.acc]);
        const [a, b] = e.rows.map((x) => x.id);
        if (!a || !b) throw new Error(`need 2 unhoused employees, got ${e.rows.length}`);

        const r1 = await http.post(`${s.base}/${roomId}/occupants`, { token: s.t, body: { employee_id: a } });
        const inRoom = await query('SELECT count(*)::int c FROM employees WHERE room_id=$1', [roomId]);
        const overflow = await http.post(`${s.base}/${roomId}/occupants`, { token: s.t, body: { employee_id: b } });

        const rm = await http.del(`${s.base}/${roomId}/occupants/${a}`, { token: s.t });
        const left = await query('SELECT count(*)::int c FROM employees WHERE room_id=$1 AND id=$2', [roomId, a]);
        // Assign then remove ON THE SAME DAY leaves ONE row, not two: syncAssignment
        // deletes a history row opened today rather than closing it, so the final state
        // of the day is the only record of the day. Assert the surviving reason.
        const h = await query(
          `SELECT reason FROM employee_accommodation_history
            WHERE employee_id=$1 AND check_out_date IS NULL
            ORDER BY check_in_date DESC, created_at DESC LIMIT 1`, [a]);
        return {
          assign: r1.status,
          in_room: inRoom.rows[0].c,
          full: overflow.status,
          remove: rm.status,
          after_remove: left.rows[0].c,
          history_reason: h.rows[0]?.reason,
        };
      },
    },
  ],
};
