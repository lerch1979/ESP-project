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
    {
      id: 'IMP-06',
      name: 'a duplikáció-ellenőrzés MEZŐPONTOZÁSSAL megy: 3+ egyező azonosító = ugyanaz a személy',
      expected: { two_fields_new: 3, three_fields_updated: 3, total: 6 },
      hint: 'the spec was "warn at 3+ matching fields"; the code matched a fixed trio and skipped entirely without mother\'s name',
      run: async (ctx, s) => {
        // Same surnames, DIFFERENT birth dates and first names → only 1 field agrees,
        // so these are genuinely new people and must import as such.
        const distinct = sheet([
          { last_name: 'ImpTeszt', first_name: 'Dezso', birth_date: '1975-01-01', accommodation: s.accName },
          { last_name: 'ImpTeszt', first_name: 'Elek',  birth_date: '1976-02-02', accommodation: s.accName },
          { last_name: 'ImpTeszt', first_name: 'Ferenc', birth_date: '1977-03-03', accommodation: s.accName },
        ]);
        const a = await http.upload('/employees/bulk', { token: s.t, buffer: distinct });

        // The ORIGINAL three, identified by last+first+birth only — no mother's name.
        // Three fields agree, so these must UPDATE rather than duplicate.
        const threeFields = sheet(PEOPLE.map((p) => ({
          last_name: p.last_name, first_name: p.first_name, birth_date: p.birth_date,
          accommodation: s.accName,
        })));
        const b = await http.upload('/employees/bulk', { token: s.t, buffer: threeFields });

        const n = await query(`SELECT count(*)::int c FROM employees WHERE last_name='ImpTeszt'`);
        return {
          two_fields_new: a.body.data?.imported,
          three_fields_updated: b.body.data?.updated,
          total: n.rows[0].c,
        };
      },
    },
    {
      id: 'IMP-07',
      name: 'túl kevés azonosító mező → NEM néma import, hanem kiírt figyelmeztetés',
      expected: { imported: 1, warnings: 1, code: 'duplicate_check_impossible', says_why: true },
      hint: 'the old check simply skipped when mother\'s name was missing; silence was the bug',
      run: async (ctx, s) => {
        const thin = sheet([{ last_name: 'ImpVekony', accommodation: s.accName }]);
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: thin });
        const w = (r.body.data?.warnings || [])[0];
        return {
          imported: r.body.data?.imported,
          warnings: r.body.data?.warnings?.length,
          code: w?.code,
          says_why: /hiányzó azonosító mezők/i.test(w?.message || ''),
        };
      },
    },
    {
      id: 'IMP-08',
      name: 'szigorú módban a valószínű duplikáció FIGYELMEZTETŐ sor, nem néma átugrás',
      expected: { imported: 0, errors: 3, names_the_fields: true },
      hint: 'mode:insert_only must explain WHY a row was refused so the user can resolve it',
      run: async (ctx, s) => {
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: s.file, mode: 'insert_only' });
        const e = (r.body.data?.errors || [])[0];
        return {
          imported: r.body.data?.imported,
          errors: r.body.data?.errors?.length,
          names_the_fields: /egyező azonosító/.test(e?.message || ''),
        };
      },
    },
    {
      id: 'IMP-09',
      name: 'HIÁNYZÓ ADATOK körút: export → két oszlop kitöltése → visszatöltés',
      expected: { all_got_language: true, all_got_nationality: true, others_untouched: true, balanced: true },
      hint: 'the whole point: filling gaps must not disturb anything else on the record',
      run: async (ctx, s) => {
        const completeness = require('../../../src/services/dataCompleteness.service');

        // Snapshot everything we are NOT filling, so "nothing else moved" is measured
        // rather than assumed.
        const before = (await query(
          `SELECT id, employee_number, first_name, last_name, birth_date, mothers_name,
                  position, workplace, arrival_date, accommodation_id, room_id,
                  shift_schedule, billing_client_id, personal_email, personal_phone,
                  bank_account, tax_id, passport_number, social_security_number
             FROM employees WHERE last_name='ImpTeszt' ORDER BY first_name`)).rows;

        const wb = await completeness.buildWorkbook(['preferred_language', 'nationality']);
        const XL = require('xlsx');
        const book = XL.read(wb.buffer, { type: 'buffer' });
        const aoa = XL.utils.sheet_to_json(book.Sheets['Kitöltendő'], { header: 1 });
        const head = aoa[0];
        const iLang = head.indexOf('Nyelv');
        const iNat = head.indexOf('Nemzetiség');

        // Fill ONLY our three people's two columns; leave every other row blank.
        const ours = [];
        for (let r = 1; r < aoa.length; r++) {
          if (aoa[r][1] === 'ImpTeszt') { aoa[r][iLang] = 'ukrán'; aoa[r][iNat] = 'UA'; ours.push(r); }
        }
        const out = XL.utils.book_new();
        XL.utils.book_append_sheet(out, XL.utils.aoa_to_sheet(aoa), 'Kitöltendő');
        const filled = XL.write(out, { type: 'buffer', bookType: 'xlsx' });

        const up = await http.upload('/employees/bulk', { token: s.t, buffer: filled });

        const after = (await query(
          `SELECT id, employee_number, first_name, last_name, birth_date, mothers_name,
                  position, workplace, arrival_date, accommodation_id, room_id,
                  shift_schedule, billing_client_id, personal_email, personal_phone,
                  bank_account, tax_id, passport_number, social_security_number,
                  preferred_language, nationality
             FROM employees WHERE last_name='ImpTeszt' ORDER BY first_name`)).rows;

        const same = before.length === after.length && before.every((b, i) =>
          Object.keys(b).every((k) => String(b[k]) === String(after[i][k])));

        // Earlier cases add more ImpTeszt people, so assert against however many the
        // export actually carried rather than a hard-coded three.
        return {
          all_got_language: ours.length > 0 && after.filter((r) => r.preferred_language === 'uk').length === ours.length,
          all_got_nationality: ours.length > 0 && after.filter((r) => r.nationality === 'UA').length === ours.length,
          others_untouched: same,
          balanced: up.body.data?.summary?.balanced === true,
        };
      },
    },
    {
      id: 'IMP-10',
      name: 'az import összesítő KIEGYENLÍTETT: minden sor pontosan egy vödörbe kerül',
      expected: { balanced: true, accounted_equals_rows: true, has_reasons: true },
      hint: 'a 300-row round trip must be verifiable at a glance, and silent row drops impossible',
      run: async (ctx, s) => {
        // One good row, one that names a megbízó we do not have → exactly one failure.
        const mixed = sheet([
          { last_name: 'ImpTeszt', first_name: 'Anna', birth_date: '1990-03-14', accommodation: s.accName },
          { last_name: 'ImpOsszeg', first_name: 'Uj', birth_date: '1999-09-09',
            accommodation: s.accName, 'Megbízó': 'Nincs Ilyen Megbízó Kft' },
        ]);
        const r = await http.upload('/employees/bulk', { token: s.t, buffer: mixed });
        const sm = r.body.data?.summary;
        return {
          balanced: sm?.balanced === true,
          accounted_equals_rows: sm?.accounted_for === sm?.rows_in_file,
          has_reasons: Object.keys(sm?.error_reasons || {}).length > 0 || sm?.failed === 0,
        };
      },
    },
    {
      id: 'IMP-11',
      name: 'a Hiányzó adatok végpontok a VALÓDI HTTP útvonalon érhetők el, nem nyeli el a /:id',
      expected: { summary: 200, has_fields: true, drill: 200, export: 200, is_xlsx: true },
      hint: 'REGRESSION: /completeness was declared after /:id, so Express passed "completeness" to a uuid column (prod 500, 2026-09-04)',
      run: async (ctx, s) => {
        // IMP-09 exercised the service directly, which is exactly why it could not catch
        // a routing mistake. These calls go over the real router.
        const sum = await http.get('/employees/completeness', { token: s.t });
        const drill = await http.get('/employees/completeness/nationality', { token: s.t });
        const exp = await http.rawGet('/api/v1/employees/completeness/export?fields=nationality',
          { token: s.t });
        return {
          summary: sum.status,
          has_fields: Array.isArray(sum.body?.data?.fields) && sum.body.data.fields.length > 0,
          drill: drill.status,
          export: exp.status,
          is_xlsx: /spreadsheetml/.test(exp.contentType || ''),
        };
      },
    },
  ],
};
