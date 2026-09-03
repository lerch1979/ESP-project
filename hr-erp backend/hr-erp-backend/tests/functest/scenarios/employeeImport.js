/**
 * IMPORT — the delete → re-import cycle that cost 279 room links on 2026-09-03.
 *
 * What happened: `bulkImportEmployees` had no UPDATE path, and its duplicate check was
 * gated on the file carrying a mother's name (and matched on that instead of birth date,
 * despite the comment). So the only way to refresh a roster was bulk-delete then import
 * — and `bulkDelete` blanked accommodation_id and room_id and wrote no occupancy history.
 * The result: 279 people re-created without rooms, and 566 history rows left open
 * forever, with the roster and the history flatly contradicting each other.
 *
 * IMP-03 is the whole point: delete the same people, import the same file, and their
 * room, shift and megbízó must still be there afterwards.
 */
const XLSX = require('xlsx');
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

/** Build a real .xlsx buffer — the endpoint parses a file, not JSON. */
const sheet = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Munkavallalok');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const PEOPLE = [
  { last_name: 'ImpTeszt', first_name: 'Anna',  birth_date: '1990-03-14', mothers_name: 'Kiss Mária' },
  { last_name: 'ImpTeszt', first_name: 'Béla',  birth_date: '1985-07-02', mothers_name: 'Nagy Éva' },
  { last_name: 'ImpTeszt', first_name: 'Csaba', birth_date: '1992-11-30', mothers_name: 'Tóth Ilona' },
];

module.exports = {
  area: 'IMPORT',
  title: 'tömeges import UPSERT · a törlés→újraimport nem veszít szoba/műszak/megbízó adatot',

  async setup(ctx) {
    const accName = (await query('SELECT name FROM accommodations WHERE id=$1', [ctx.ids.acc.pp])).rows[0].name;
    return {
      t: http.tokenFor(ctx.ids.user.superadmin),
      acc: ctx.ids.acc.pp,
      accName,
      client: ctx.ids.client.A,
      file: sheet(PEOPLE.map((p) => ({ ...p, accommodation: accName }))),
    };
  },

  cases: [
    {
      id: 'IMP-01',
      name: 'új emberek importálódnak, és nyitott szállás-előzményt kapnak',
      expected: { status: 200, imported: 3, updated: 0, in_db: 3, open_history: 3 },
      hint: 'POST /employees/bulk',
      run: async (ctx, s) => {
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: s.file });
        const n = await query(
          `SELECT count(*)::int c FROM employees WHERE last_name='ImpTeszt' AND end_date IS NULL`);
        const h = await query(
          `SELECT count(*)::int c FROM employee_accommodation_history h
             JOIN employees e ON e.id=h.employee_id
            WHERE e.last_name='ImpTeszt' AND h.check_out_date IS NULL`);
        return {
          status: r.status, imported: r.body.data?.imported, updated: r.body.data?.updated,
          in_db: n.rows[0].c, open_history: h.rows[0].c,
        };
      },
    },
    {
      id: 'IMP-02',
      name: 'ugyanaz a fájl ÚJRA importálva FRISSÍT, nem duplikál (anyja neve nélkül is)',
      expected: { imported: 0, updated: 3, total_rows: 3 },
      hint: 'match on birth_date + last_name + first_name; mother\'s name is a tiebreaker, not a gate',
      run: async (ctx, s) => {
        // Deliberately WITHOUT mothers_name — the old check skipped duplicate detection
        // entirely when that column was missing, which is how a roster got duplicated.
        const noMother = sheet(PEOPLE.map(({ mothers_name, ...p }) => ({ ...p, accommodation: s.accName })));
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: noMother });
        const n = await query(`SELECT count(*)::int c FROM employees WHERE last_name='ImpTeszt'`);
        return { imported: r.body.data?.imported, updated: r.body.data?.updated, total_rows: n.rows[0].c };
      },
    },
    {
      id: 'IMP-03',
      name: 'TÖRLÉS → ÚJRAIMPORT: a szoba, a műszak és a megbízó MEGMARAD',
      expected: { del: 200, updated: 3, room_kept: 3, shift_kept: 3, client_kept: 3, revived: 3 },
      hint: 'THE INCIDENT: the assignment columns are not in the import\'s updatable set',
      run: async (ctx, s) => {
        // Give them the assignment state the app owns (not the spreadsheet).
        const room = (await query(
          `INSERT INTO accommodation_rooms (accommodation_id, room_number, beds, is_active)
           VALUES ($1,'IMP-1',5,true) RETURNING id`, [s.acc])).rows[0].id;
        const ids = (await query(
          `UPDATE employees SET room_id=$1, shift_schedule='delelott', billing_client_id=$2
            WHERE last_name='ImpTeszt' RETURNING id`, [room, s.client])).rows.map((x) => x.id);

        const del = await http.post('/employees/bulk-delete?confirm=true', {
          token: s.t, body: { employee_ids: ids } });
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: s.file });

        const kept = await query(
          `SELECT count(*) FILTER (WHERE room_id=$1) AS room,
                  count(*) FILTER (WHERE shift_schedule='delelott') AS shift,
                  count(*) FILTER (WHERE billing_client_id=$2) AS client,
                  count(*) FILTER (WHERE end_date IS NULL) AS revived
             FROM employees WHERE last_name='ImpTeszt'`, [room, s.client]);
        const k = kept.rows[0];
        return {
          del: del.status, updated: r.body.data?.updated,
          room_kept: Number(k.room), shift_kept: Number(k.shift),
          client_kept: Number(k.client), revived: Number(k.revived),
        };
      },
    },
    {
      id: 'IMP-04',
      name: 'a tömeges kiléptetés MEGERŐSÍTÉST kér, ha a kijelöltek szálláson vannak',
      expected: { refused: 409, requires_confirmation: true, housed_count: 3, nobody_left: 3 },
      hint: 'ending employment is routine; un-housing people is not',
      run: async (ctx, s) => {
        const ids = (await query(
          `SELECT id FROM employees WHERE last_name='ImpTeszt' AND end_date IS NULL`)).rows.map((x) => x.id);
        const d = await http.post('/employees/bulk-delete', { token: s.t, body: { employee_ids: ids } });
        const still = await query(
          `SELECT count(*)::int c FROM employees WHERE last_name='ImpTeszt' AND end_date IS NULL`);
        return {
          refused: d.status,
          requires_confirmation: d.body.requires_confirmation === true,
          housed_count: d.body.data?.housed_count,
          nobody_left: still.rows[0].c,
        };
      },
    },
    {
      id: 'IMP-05',
      name: 'kiléptetés után NINCS árva nyitott előzmény — a névsor és az előzmény egyezik',
      expected: { del: 200, open_for_leavers: 0, room_id_preserved: 3 },
      hint: 'bulkDelete used to leave the history row open forever AND blank room_id',
      run: async (ctx, s) => {
        // IMP-04 refused its delete, but re-import anyway so this case is independent.
        await http.upload('/employees/bulk', { token: s.t, buffer: s.file });
        const ids = (await query(
          `SELECT id FROM employees WHERE last_name='ImpTeszt' AND end_date IS NULL`)).rows.map((x) => x.id);
        const d = await http.post('/employees/bulk-delete?confirm=true', {
          token: s.t, body: { employee_ids: ids } });
        const orphan = await query(
          `SELECT count(*)::int c FROM employee_accommodation_history h
             JOIN employees e ON e.id=h.employee_id
            WHERE e.last_name='ImpTeszt' AND h.check_out_date IS NULL AND e.end_date IS NOT NULL`);
        const kept = await query(
          `SELECT count(*)::int c FROM employees WHERE last_name='ImpTeszt' AND room_id IS NOT NULL`);
        return { del: d.status, open_for_leavers: orphan.rows[0].c, room_id_preserved: kept.rows[0].c };
      },
    },
  ],
};
