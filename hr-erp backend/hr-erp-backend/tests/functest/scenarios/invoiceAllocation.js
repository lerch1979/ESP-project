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
    {
      id: 'ALLOC-07',
      name: 'a beszállító-javaslat visszaadja a korábbi neveket és az adószámot',
      expected: { status: 200, has_vendor: true, has_tax: true, carries_contractor_id: true },
      hint: 'a contractor_id már MOST is ott van (null) — a partner-törzs megjelenésekor a felület nem változik',
      run: async (ctx, s) => {
        await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Vízmű Zrt.', vendor_tax_number: '11611226-2-08',
          amount: 5000, total_amount: 5000, invoice_date: '2026-09-01',
          cost_center_id: s.cc, target_type: 'general' } });
        const r = await http.get('/vendors', { token: s.t });
        const v = (r.body?.data?.vendors || []).find((x) => x.name === 'ALLOC Vízmű Zrt.');
        return {
          status: r.status,
          has_vendor: !!v,
          has_tax: v?.tax_number === '11611226-2-08',
          // A mező LÉTEZIK, csak üres — ezen múlik, hogy a (b) lépés ne törje el a felületet.
          carries_contractor_id: v ? Object.prototype.hasOwnProperty.call(v, 'contractor_id') : false,
        };
      },
    },
    {
      id: 'ALLOC-08',
      name: 'a keresés ÉKEZET- és kisbetű-független',
      expected: { lower_no_accent: 1, upper_with_accent: 1, nonsense: 0 },
      hint: 'ugyanaz a deaccent szabály, amit a partnernév-kereső szkript használ',
      run: async (ctx, s) => {
        const hit = async (q) => ((await http.get(`/vendors?q=${encodeURIComponent(q)}`, { token: s.t }))
          .body?.data?.vendors || []).filter((x) => x.name === 'ALLOC Vízmű Zrt.').length;
        return {
          lower_no_accent: await hit('vizmu'),
          upper_with_accent: await hit('VÍZMŰ'),
          nonsense: await hit('zzz-nincs-ilyen'),
        };
      },
    },
    {
      id: 'ALLOC-09',
      name: 'a beszállító a PARTNER-TÖRZSBŐL jön, saját beszallito szereppel',
      expected: { from_master: true, has_role: true, invoice_linked: true },
      hint: 'mig 158 — a szabad szöveg mellé valódi kapcsolat kerül, nem helyette',
      run: async (ctx, s) => {
        // A migráció a sandbox RESET során fut, a fixture ELŐTT — tehát nincs mit
        // besorolnia. Egy törzs-beszállítót itt hozunk létre, ahogy a mig 158 tenné.
        const c = (await query(
          `INSERT INTO contractors (name, slug, is_active, tax_number)
           VALUES ('ALLOC Törzs Beszállító Kft','alloc-torzs-beszallito',true,'12345678-2-42')
           RETURNING id`)).rows[0];
        await query(`INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'beszallito')`, [c.id]);

        const r = await http.get('/vendors', { token: s.t });
        const v = (r.body?.data?.vendors || []).find((x) => x.contractor_id);
        if (!v) throw new Error('nincs törzs-beszállító a /vendors válaszában');
        const role = v ? (await query(
          `SELECT count(*)::int c FROM contractor_roles WHERE contractor_id=$1 AND role='beszallito'`,
          [v.contractor_id])).rows[0].c : 0;
        // Új számla a törzsből választott beszállítóval.
        const inv = await http.post('/invoices', { token: s.t, body: {
          vendor_name: v.name, vendor_contractor_id: v.contractor_id,
          amount: 1000, total_amount: 1000, invoice_date: '2026-09-01',
          cost_center_id: s.cc, target_type: 'general' } });
        const linked = (await query(
          `SELECT vendor_contractor_id FROM invoices WHERE id=$1`, [inv.body?.data?.invoice?.id])).rows[0];
        return {
          from_master: !!v,
          has_role: role === 1,
          invoice_linked: linked?.vendor_contractor_id === v.contractor_id,
        };
      },
    },
    {
      id: 'ALLOC-10',
      name: 'az eltérő írásmódú pár MEGJELENIK a duplikátum-listán, de összevonni NEM vonja össze magától',
      expected: { listed: true, same_tax_flag: true, still_two: 2 },
      hint: 'a felhasználó dönti el, melyik a helyes írásmód — a gép csak jelez',
      run: async (ctx, s) => {
        const acc = (await query(`SELECT id FROM accommodations WHERE is_active LIMIT 1`)).rows[0];
        for (const nev of ['Próba Vízmű Zrt.', '"PRÓBA" Vízmű Zrt.']) {
          await query(
            `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount,
               vendor_name, vendor_tax_number, performance_date)
             VALUES ($1,'2026-09','rezsi',1000,$2,'99999999-2-08',CURRENT_DATE)`, [acc.id, nev]);
        }
        const d = await http.get('/vendors/duplicates', { token: s.t });
        const pair = (d.body?.data?.pairs || []).find((p) => /proba vizmu/.test(p.kulcs));
        const still = (await query(
          `SELECT count(DISTINCT vendor_name)::int c FROM accommodation_expenses
            WHERE vendor_name ILIKE '%VÍZMŰ%' AND deleted_at IS NULL`)).rows[0].c;
        return { listed: !!pair, same_tax_flag: pair?.azonos_adoszam === true, still_two: still };
      },
    },
    {
      id: 'ALLOC-11',
      name: 'összevonás a VÁLASZTOTT írásmódra — és eltérő adószámnál megáll',
      expected: { merged: 200, one_name: 1, linked: true, refuses_diff_tax: 409 },
      hint: 'két hasonló név mögött állhat két külön cég; az adószám a megbízható jel',
      run: async (ctx, s) => {
        const m = await http.post('/vendors/merge', { token: s.t, body: {
          keep_name: 'Próba Vízmű Zrt.', merge_names: ['"PRÓBA" Vízmű Zrt.'] } });
        const names = (await query(
          `SELECT count(DISTINCT vendor_name)::int c FROM accommodation_expenses
            WHERE vendor_name ILIKE '%VÍZMŰ%' AND deleted_at IS NULL`)).rows[0].c;
        const linked = (await query(
          `SELECT count(*)::int c FROM accommodation_expenses
            WHERE vendor_name='Próba Vízmű Zrt.' AND vendor_contractor_id IS NOT NULL`)).rows[0].c;

        // Eltérő adószámú pár: itt meg KELL állnia.
        const acc = (await query(`SELECT id FROM accommodations WHERE is_active LIMIT 1`)).rows[0];
        await query(`INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount,
            vendor_name, vendor_tax_number, performance_date)
          VALUES ($1,'2026-09','rezsi',1000,'Más Cég Kft','11111111-1-11',CURRENT_DATE)`, [acc.id]);
        await query(`INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount,
            vendor_name, vendor_tax_number, performance_date)
          VALUES ($1,'2026-09','rezsi',1000,'Mas Ceg Kft','22222222-2-22',CURRENT_DATE)`, [acc.id]);
        const bad = await http.post('/vendors/merge', { token: s.t, body: {
          keep_name: 'Más Cég Kft', merge_names: ['Mas Ceg Kft'] } });

        return { merged: m.status, one_name: names, linked: linked > 0, refuses_diff_tax: bad.status };
      },
    },
  ],
};
