/**
 * ALLOC — számla → hova könyveljük (szállás / általános / központi), megosztással.
 *
 * A kérés eredeti formája: "nem tudjuk egy konkrét szállóhoz rendelni a költségeket".
 * A tábla ugyanis nem volt szűk — SEMMILYEN szállás-mező nem volt rajta. A 16 darab
 * "X szálló" költséghelyet a mig 127 pont azért vonta ki, mert névegyezéssel működött;
 * ezért itt valódi FK-val kötünk, nem taxonómiával.
 *
 * ALLOC-03 a lényeg: ha a részösszegek nem adják ki a végösszeget, azt EL KELL utasítani.
 * Egy csendben elnyelt maradék hónapokkal később derül ki a kimutatásból, és akkor már
 * senki nem tudja, melyik számlánál csúszott el.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'ALLOC',
  title: 'számla hozzárendelése szálláshoz · általános · központi · megosztás több ház között',

  async setup(ctx) {
    const cc = (await query(`SELECT id FROM cost_centers WHERE is_active LIMIT 1`)).rows[0];
    const accs = (await query(`SELECT id, name FROM accommodations WHERE is_active ORDER BY name LIMIT 2`)).rows;
    return { t: http.tokenFor(ctx.ids.user.superadmin), cc: cc.id, a1: accs[0], a2: accs[1] };
  },

  cases: [
    {
      id: 'ALLOC-01',
      name: 'a gyakori eset EGY kattintás: egy szálláshely, összeg megadása nélkül',
      expected: { created: 201, rows: 1, type: 'accommodation', amount: 50000 },
      hint: 'a teljes számla arra a házra kerül — ne kelljen összeget gépelni a 95%-os esethez',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Egy Ház Kft', amount: 50000, total_amount: 50000,
          invoice_date: '2026-09-01', cost_center_id: s.cc,
          accommodation_id: s.a1.id } });
        s.one = r.body?.data?.invoice?.id;
        const al = (await query(`SELECT target_type, accommodation_id, amount
           FROM invoice_allocations WHERE invoice_id=$1`, [s.one])).rows;
        return { created: r.status, rows: al.length, type: al[0]?.target_type, amount: Number(al[0]?.amount) };
      },
    },
    {
      id: 'ALLOC-02',
      name: 'megosztás két ház között — mindkettő a SAJÁT részével jelenik meg',
      expected: { created: 201, rows: 2, sum: 90000, first: 60000, second: 30000 },
      hint: 'a ritka eset: egy takarítási számla több szállóra',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Ket Haz Kft', amount: 90000, total_amount: 90000,
          invoice_date: '2026-09-01', cost_center_id: s.cc,
          allocations: [
            { target_type: 'accommodation', accommodation_id: s.a1.id, amount: 60000 },
            { target_type: 'accommodation', accommodation_id: s.a2.id, amount: 30000 },
          ] } });
        s.two = r.body?.data?.invoice?.id;
        const al = (await query(`SELECT amount FROM invoice_allocations
           WHERE invoice_id=$1 ORDER BY amount DESC`, [s.two])).rows;
        return { created: r.status, rows: al.length,
                 sum: al.reduce((a, x) => a + Number(x.amount), 0),
                 first: Number(al[0]?.amount), second: Number(al[1]?.amount) };
      },
    },
    {
      id: 'ALLOC-03',
      name: 'a részösszegek NEM adják ki a végösszeget → elutasítva, a hiány megnevezve',
      expected: { refused: 400, says_missing: true, no_rows: 0, no_invoice_created: true },
      hint: 'a számla SEM jöhet létre: különben a javítás után két számla marad (élesben elő is fordult)',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Nem Egyezik Kft', amount: 100000, total_amount: 100000,
          invoice_date: '2026-09-01', cost_center_id: s.cc,
          allocations: [
            { target_type: 'accommodation', accommodation_id: s.a1.id, amount: 60000 },
            { target_type: 'accommodation', accommodation_id: s.a2.id, amount: 30000 },
          ] } });
        const id = r.body?.data?.invoice_id;
        const al = id ? (await query(`SELECT count(*)::int c FROM invoice_allocations WHERE invoice_id=$1`, [id])).rows[0].c : 0;
        // A lényeg: a visszautasított számla NEM maradhat bent félig kész állapotban.
        const orphan = (await query(
          `SELECT count(*)::int c FROM invoices WHERE vendor_name='ALLOC Nem Egyezik Kft' AND deleted_at IS NULL`)).rows[0].c;
        return {
          refused: r.status,
          says_missing: /Hiányzik/.test(r.body?.message || ''),
          no_rows: al,
          no_invoice_created: orphan === 0,
        };
      },
    },
    {
      id: 'ALLOC-04',
      name: 'általános és központi célpont — szálláshely nélkül, és szálláshellyel nem is engedi',
      expected: { general: 201, central: 201, acc_on_general: 400 },
      hint: 'a cég általános kiadásai és a saját részre történő kiadások is ide könyvelendők',
      run: async (ctx, s) => {
        const g = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Altalanos Kft', amount: 10000, total_amount: 10000,
          invoice_date: '2026-09-01', cost_center_id: s.cc, target_type: 'general' } });
        const c = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Kozponti Kft', amount: 20000, total_amount: 20000,
          invoice_date: '2026-09-01', cost_center_id: s.cc, target_type: 'central' } });
        const bad = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Rossz Kft', amount: 5000, total_amount: 5000,
          invoice_date: '2026-09-01', cost_center_id: s.cc,
          allocations: [{ target_type: 'general', accommodation_id: s.a1.id, amount: 5000 }] } });
        return { general: g.status, central: c.status, acc_on_general: bad.status };
      },
    },
    {
      id: 'ALLOC-05',
      name: 'szűrés szálláshelyre: a megosztott számla EGYSZER jelenik meg, nem annyiszor ahány ház',
      expected: { a1_has_both: true, single_rows: true, general_only: 1 },
      hint: 'EXISTS, nem JOIN — különben a három házra osztott számla háromszor szerepelne',
      run: async (ctx, s) => {
        const r = await http.get(`/invoices?accommodation_id=${s.a1.id}&limit=50`, { token: s.t });
        const list = r.body?.data?.invoices || [];
        const nums = list.map((x) => x.vendor_name);
        const ids = list.map((x) => x.id);
        const g = await http.get('/invoices?target_type=general&limit=50', { token: s.t });
        return {
          a1_has_both: nums.includes('ALLOC Egy Ház Kft') && nums.includes('ALLOC Ket Haz Kft'),
          single_rows: ids.length === new Set(ids).size,
          general_only: (g.body?.data?.invoices || []).filter((x) => x.vendor_name === 'ALLOC Altalanos Kft').length,
        };
      },
    },
    {
      id: 'ALLOC-06',
      name: 'összesítő: célpontonként összegez, és külön mutatja a be nem sorolt számlákat',
      expected: { has_accommodation: true, has_general: true, a1_amount: 110000, unallocated_visible: true },
      hint: 'a be nem sorolt tétel egyik kimutatásba sem számít bele — láthatónak KELL lennie',
      run: async (ctx, s) => {
        // Egy szándékosan be nem sorolt számla.
        await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Besorolatlan Kft', amount: 7000, total_amount: 7000,
          invoice_date: '2026-09-01', cost_center_id: s.cc } });
        const r = await http.get('/invoices/summary', { token: s.t });
        const d = r.body?.data;
        const acc = (d?.by_target || []).filter((x) => x.target_type === 'accommodation');
        const mine = acc.find((x) => x.accommodation_id === s.a1.id);
        return {
          has_accommodation: acc.length > 0,
          has_general: (d?.by_target || []).some((x) => x.target_type === 'general'),
          a1_amount: Number(mine?.amount),          // 50 000 + 60 000
          unallocated_visible: (d?.unallocated?.invoice_count || 0) > 0,
        };
      },
    },
  ],
};
