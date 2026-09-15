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
    {
      id: 'ALLOC-12',
      name: 'a FELÜLET útvonalán rögzített számla besorolása is megmarad',
      expected: { created: 201, rows: 1, type: 'accommodation', full_amount: 40000 },
      hint: 'a képernyő a /cost-centers/invoices végpontot hívja — az a controller korábban nem is ismerte a besorolást, így a funkció kattintható felületről elérhetetlen volt',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Felület Kft', amount: 40000, total_amount: 40000,
          invoice_date: '2026-09-02', cost_center_id: s.cc,
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        s.ui = r.body?.data?.invoice?.id || r.body?.data?.id;
        const al = (await query(`SELECT target_type, amount FROM invoice_allocations
           WHERE invoice_id=$1`, [s.ui])).rows;
        return { created: r.status, rows: al.length, type: al[0]?.target_type,
                 full_amount: Number(al[0]?.amount) };
      },
    },
    {
      id: 'ALLOC-13',
      name: 'egy fizetési státusz átállítása NEM törli a meglévő besorolást',
      expected: { updated: 200, still_allocated: 1, same_house: true },
      hint: 'a szerkesztő űrlap besorolás nélkül küldött mentése némán kiürítette volna a hozzárendelést',
      run: async (ctx, s) => {
        const r = await http.put(`/cost-centers/invoices/${s.ui}`, { token: s.t,
          body: { payment_status: 'sent' } });
        const al = (await query(`SELECT accommodation_id FROM invoice_allocations
           WHERE invoice_id=$1`, [s.ui])).rows;
        return { updated: r.status, still_allocated: al.length,
                 same_house: al[0]?.accommodation_id === s.a1.id };
      },
    },
    {
      id: 'ALLOC-14',
      name: 'tömeges átsorolás: a kijelölt számlák új költséghelyre kerülnek',
      expected: { ok: 200, updated: 2, both_moved: true, allocation_untouched: 1 },
      hint: 'a költséghely-fa a meglévő számlák UTÁN alakult ki — enélkül egyesével kellene átnyitogatni mindet',
      run: async (ctx, s) => {
        const cc2 = (await query(
          `INSERT INTO cost_centers (name, code, is_active) VALUES ('ALLOC Új Költséghely','ALLOC-UJ',true)
           RETURNING id`)).rows[0].id;
        s.cc2 = cc2;

        // SAJÁT számlák, NYITOTT hónapban (2026-12). A suite 2026-09-et lezárja, és az
        // átsorolás — helyesen — nem nyúl lezárt hónaphoz; ezt az ALLOC-16 vizsgálja
        // külön. Itt a tömeges átsorolás a tárgy, ezért nem osztozunk azon a hónapon.
        const mk = async (nev, osszeg, hova) => {
          const r = await http.post('/invoices', { token: s.t, body: {
            vendor_name: nev, amount: osszeg, total_amount: osszeg,
            invoice_date: '2026-12-01', performance_date: '2026-12-01',
            cost_center_id: s.cc, ...(hova ? { allocations: [hova] } : {}) } });
          return r.body?.data?.invoice?.id;
        };
        s.b1 = await mk('ALLOC Tömeges Egy Kft', 40000,
          { target_type: 'accommodation', accommodation_id: s.a1.id });
        s.b2 = await mk('ALLOC Tömeges Kettő Kft', 50000, null);

        const r = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
          invoice_ids: [s.b1, s.b2], cost_center_id: cc2 } });
        const moved = (await query(
          `SELECT count(*)::int c FROM invoices WHERE id = ANY($1) AND cost_center_id=$2`,
          [[s.b1, s.b2], cc2])).rows[0].c;
        // A besorolást nem kértük — nem is szabad hozzányúlnia.
        const al = (await query(`SELECT count(*)::int c FROM invoice_allocations
           WHERE invoice_id=$1`, [s.b1])).rows[0].c;
        return { ok: r.status, updated: r.body?.data?.updated_count, both_moved: moved === 2,
                 allocation_untouched: al };
      },
    },
    {
      id: 'ALLOC-15',
      name: 'tömeges besorolás: a kijelölt számlák a TELJES összegükkel kerülnek a megadott házra',
      expected: { ok: 200, updated: 2, both_on_house: true, amounts_full: true, nothing_skipped: 0 },
      hint: 'egy célpontnál nem kell összeget gépelni — mindegyik számla a sajátjával megy át',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
          invoice_ids: [s.b1, s.b2],
          allocation: { target_type: 'accommodation', accommodation_id: s.a2.id } } });
        const al = (await query(
          `SELECT al.invoice_id, al.accommodation_id, al.amount, i.total_amount
             FROM invoice_allocations al JOIN invoices i ON i.id = al.invoice_id
            WHERE al.invoice_id = ANY($1)`, [[s.b1, s.b2]])).rows;
        return {
          ok: r.status, updated: r.body?.data?.updated_count,
          both_on_house: al.length === 2 && al.every((x) => x.accommodation_id === s.a2.id),
          amounts_full: al.every((x) => Number(x.amount) === Number(x.total_amount)),
          nothing_skipped: r.body?.data?.skipped_count,
        };
      },
    },
    {
      id: 'ALLOC-16',
      name: 'LEZÁRT hónap számlája kimarad, és a válasz megnevezi — `force`-szal viszont átmegy',
      expected: { skipped: 1, names_month: true, not_moved: true, forced: 1, moved_after_force: true },
      hint: 'egy már kiszámlázott időszak kimutatását nem írjuk át észrevétlenül',
      run: async (ctx, s) => {
        const inv = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Lezárt Hónap Kft', amount: 10000, total_amount: 10000,
          invoice_date: '2026-01-15', performance_date: '2026-01-15', cost_center_id: s.cc } });
        const id = inv.body?.data?.invoice?.id;
        // Izolált hónap: 2026-01-et egyetlen másik forgatókönyv sem használja.
        await query(`INSERT INTO billing_runs (billing_month, run_type, status, finalized_at)
                     VALUES ('2026-01','incoming','finalized', NOW())`);
        try {
          const r = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
            invoice_ids: [id], cost_center_id: s.cc2 } });
          const sk = r.body?.data?.skipped?.[0];
          const after = (await query(`SELECT cost_center_id FROM invoices WHERE id=$1`, [id])).rows[0];

          const f = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
            invoice_ids: [id], cost_center_id: s.cc2, force: true } });
          const after2 = (await query(`SELECT cost_center_id FROM invoices WHERE id=$1`, [id])).rows[0];

          return {
            skipped: r.body?.data?.skipped_count,
            names_month: /2026-01/.test(sk?.reason || ''),
            not_moved: after.cost_center_id !== s.cc2,
            forced: f.body?.data?.updated_count,
            moved_after_force: after2.cost_center_id === s.cc2,
          };
        } finally {
          await query(`DELETE FROM billing_runs WHERE billing_month='2026-01'`);
        }
      },
    },
    {
      id: 'ALLOC-17',
      name: 'a több ház között FELOSZTOTT számla nem esik szét egyetlen célpontra',
      expected: { skipped: 1, split_intact: 2, says_split: true, overwritten: 1, after_force: 1 },
      hint: 'egy célpont ráhúzása eldobná a részösszegeket — külön engedély nélkül nem tesszük',
      run: async (ctx, s) => {
        // Felosztott számla NYITOTT hónapban — lásd az ALLOC-14 indoklását.
        const sp = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Felosztott Kft', amount: 90000, total_amount: 90000,
          invoice_date: '2026-12-02', performance_date: '2026-12-02', cost_center_id: s.cc,
          allocations: [
            { target_type: 'accommodation', accommodation_id: s.a1.id, amount: 60000 },
            { target_type: 'accommodation', accommodation_id: s.a2.id, amount: 30000 },
          ] } });
        const spId = sp.body?.data?.invoice?.id;

        const r = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
          invoice_ids: [spId],
          allocation: { target_type: 'general' } } });
        const intact = (await query(`SELECT count(*)::int c FROM invoice_allocations
           WHERE invoice_id=$1`, [spId])).rows[0].c;

        const f = await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
          invoice_ids: [spId],
          allocation: { target_type: 'general' }, overwrite_split: true } });
        const after = (await query(`SELECT count(*)::int c FROM invoice_allocations
           WHERE invoice_id=$1`, [spId])).rows[0].c;

        return {
          skipped: r.body?.data?.skipped_count,
          split_intact: intact,
          says_split: /felosztva/.test(r.body?.data?.skipped?.[0]?.reason || ''),
          overwritten: f.body?.data?.updated_count,
          after_force: after,
        };
      },
    },
    {
      id: 'ALLOC-18',
      name: 'a felület listája visszaadja a besorolást, és a költséghely-szűrő a GYEREKEKRE is illeszkedik',
      expected: { ok: 200, has_allocations: true, parent_finds_child: true },
      hint: 'ha a szűrő csak a pontos egyezést nézné, egy szülő-költséghely kiválasztása üres listát adna',
      run: async (ctx, s) => {
        const child = (await query(
          `INSERT INTO cost_centers (name, code, parent_id, is_active)
           VALUES ('ALLOC Gyerek','ALLOC-GY',$1,true) RETURNING id`, [s.cc2])).rows[0].id;
        const inv = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Gyerek Kft', amount: 5000, total_amount: 5000,
          invoice_date: '2026-09-03', cost_center_id: child, target_type: 'central' } });
        const list = await http.get('/cost-centers/invoices/list', { token: s.t,
          query: { cost_center_id: s.cc2, limit: 200 } });
        const rows = list.body?.data?.invoices || [];
        return {
          ok: list.status,
          has_allocations: rows.some((x) => Array.isArray(x.allocations) && x.allocations.length > 0),
          parent_finds_child: rows.some((x) => x.id === inv.body?.data?.invoice?.id),
        };
      },
    },
    {
      id: 'ALLOC-19',
      name: 'a tömeges törlés visszafordítható: a sor megmarad, a lista nem mutatja',
      expected: { deleted: 200, gone_from_list: true, row_survives: 1, file_kept: true },
      hint: 'korábban a felület véglegesen törölt, és a számlaképet a lemezről is levette — egy téves kijelölés visszavonhatatlan volt',
      run: async (ctx, s) => {
        const inv = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Törlendő Kft', amount: 7000, total_amount: 7000,
          invoice_date: '2026-09-04', cost_center_id: s.cc, target_type: 'general' } });
        const id = inv.body?.data?.invoice?.id;
        await query(`UPDATE invoices SET file_path='uploads/invoices/alloc-proba.pdf' WHERE id=$1`, [id]);

        const d = await http.post('/cost-centers/invoices/bulk-action', { token: s.t,
          body: { action: 'delete', ids: [id] } });
        const list = await http.get('/cost-centers/invoices/list', { token: s.t, query: { limit: 200 } });
        const row = (await query(
          `SELECT deleted_at, file_path FROM invoices WHERE id=$1`, [id])).rows;
        return {
          deleted: d.status,
          gone_from_list: !(list.body?.data?.invoices || []).some((x) => x.id === id),
          row_survives: row.length,
          file_kept: !!row[0]?.file_path,
        };
      },
    },
    {
      id: 'ALLOC-20',
      name: 'egy már kifizetett régi számla FIZETVE állapotban rögzíthető, nem ragad piszkozatban',
      expected: { created: 201, status: 'paid' },
      hint: 'a rögzítéskor megadott állapot érvényesül — korábban kötött draft jött létre, ahonnan a felületen csak a sztornó vezetett tovább',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Régi Számla Kft', amount: 12000, total_amount: 12000,
          invoice_date: '2026-12-03', cost_center_id: s.cc, payment_status: 'paid' } });
        const row = (await query(`SELECT payment_status FROM invoices WHERE id=$1`,
          [r.body?.data?.invoice?.id])).rows[0];
        return { created: r.status, status: row?.payment_status };
      },
    },
    {
      id: 'ALLOC-21',
      name: 'a piszkozatnak VAN útja a véglegesítésig: draft → sent → paid',
      expected: { created_as: 'draft', to_sent: 200, to_paid: 200, final: 'paid' },
      hint: 'a felület korábbi státuszkészletéből egyik lépés sem volt érvényes, a sztornót leszámítva',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Piszkozat Kft', amount: 8000, total_amount: 8000,
          invoice_date: '2026-12-03', cost_center_id: s.cc } });
        const id = r.body?.data?.invoice?.id;
        const created = (await query(`SELECT payment_status FROM invoices WHERE id=$1`, [id])).rows[0];
        const a = await http.put(`/cost-centers/invoices/${id}`, { token: s.t,
          body: { payment_status: 'sent' } });
        const b = await http.put(`/cost-centers/invoices/${id}`, { token: s.t,
          body: { payment_status: 'paid', payment_date: '2026-12-04' } });
        const fin = (await query(`SELECT payment_status FROM invoices WHERE id=$1`, [id])).rows[0];
        return { created_as: created?.payment_status, to_sent: a.status, to_paid: b.status,
                 final: fin?.payment_status };
      },
    },
    {
      id: 'ALLOC-22',
      name: 'a szerver által nem ismert állapot (pending) elutasítva — se rögzítéskor, se módosításkor',
      expected: { on_create: 400, on_update: 400, unchanged: 'draft' },
      hint: 'a felület négy képernyőn kínálta a pending-et, amit a szerver sosem fogadott el',
      run: async (ctx, s) => {
        const bad = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Pending Kft', amount: 3000, total_amount: 3000,
          invoice_date: '2026-12-03', cost_center_id: s.cc, payment_status: 'pending' } });
        const ok = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Pending2 Kft', amount: 3000, total_amount: 3000,
          invoice_date: '2026-12-03', cost_center_id: s.cc } });
        const id = ok.body?.data?.invoice?.id;
        const upd = await http.put(`/cost-centers/invoices/${id}`, { token: s.t,
          body: { payment_status: 'pending' } });
        const row = (await query(`SELECT payment_status FROM invoices WHERE id=$1`, [id])).rows[0];
        return { on_create: bad.status, on_update: upd.status, unchanged: row?.payment_status };
      },
    },
    {
      id: 'ALLOC-23',
      name: 'az oszlop alapértéke sem vezet zsákutcába: a DB-default is érvényes állapot',
      expected: { db_default: 'draft', no_pending_left: 0 },
      hint: 'mig 159 — a pending állapotból az állapotgép szerint SEMMI nem elérhető, tehát ami oda kerül, ott ragad',
      run: async () => {
        const d = (await query(
          `SELECT column_default FROM information_schema.columns
            WHERE table_name='invoices' AND column_name='payment_status'`)).rows[0];
        const left = (await query(
          `SELECT count(*)::int c FROM invoices WHERE payment_status='pending'`)).rows[0].c;
        const m = /'([a-z_]+)'/.exec(d?.column_default || '');
        return { db_default: m && m[1], no_pending_left: left };
      },
    },
    {
      id: 'ALLOC-24',
      name: 'a besorolás KÉPEZI a szállásköltség-sort — a kimutatás forrásában is megjelenik',
      expected: { created: 201, expense_rows: 1, house_ok: true, amount_ok: 40000, source: 'invoice', month: '2026-12' },
      hint: 'a felület az invoices-ba írt, a költségriport az accommodation_expenses-t olvasta — júliustól nullát mutatott, miközben a számlák érkeztek',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Hídteszt Kft', amount: 40000, total_amount: 40000,
          invoice_date: '2026-12-05', performance_date: '2026-12-05', cost_center_id: s.cc,
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        s.bridge = r.body?.data?.invoice?.id;
        const e = (await query(
          `SELECT accommodation_id, amount, billing_month, source, category
             FROM accommodation_expenses WHERE invoice_id=$1 AND deleted_at IS NULL`,
          [s.bridge])).rows;
        return { created: r.status, expense_rows: e.length, house_ok: e[0]?.accommodation_id === s.a1.id,
                 amount_ok: Number(e[0]?.amount), source: e[0]?.source, month: e[0]?.billing_month };
      },
    },
    {
      id: 'ALLOC-25',
      name: 'ismételt mentés NEM duplázza a költséget — az átsorolás átviszi a másik házra',
      expected: { after_resave: 1, after_move: 1, moved_house: true, old_house_zero: 0 },
      hint: 'ez a legfontosabb védelem: egy kétszer könyvelt költség hónapokkal később derül ki',
      run: async (ctx, s) => {
        // ugyanaz a besorolás még egyszer
        await http.put(`/cost-centers/invoices/${s.bridge}`, { token: s.t, body: {
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        const after1 = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [s.bridge])).rows[0].c;

        // átsorolás a másik házra
        await http.post('/cost-centers/invoices/bulk-reallocate', { token: s.t, body: {
          invoice_ids: [s.bridge],
          allocation: { target_type: 'accommodation', accommodation_id: s.a2.id } } });
        const rows = (await query(`SELECT accommodation_id FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [s.bridge])).rows;
        const old = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND accommodation_id=$2 AND deleted_at IS NULL`,
          [s.bridge, s.a1.id])).rows[0].c;
        return { after_resave: after1, after_move: rows.length,
                 moved_house: rows[0]?.accommodation_id === s.a2.id, old_house_zero: old };
      },
    },
    {
      id: 'ALLOC-26',
      name: 'a BÉRLETI DÍJ nem képez költségsort — a motor a bérleti konstrukcióból már számolja',
      expected: { created: 201, expense_rows: 0, says_why: true },
      hint: 'a bérbeadói számla átvezetése kétszer terhelné a házat: egyszer a rent_amount, egyszer a költségsor',
      run: async (ctx, s) => {
        const cat = (await query(
          `INSERT INTO invoice_categories (name) VALUES ('Bérleti díj')
           ON CONFLICT DO NOTHING RETURNING id`)).rows[0]
          || (await query(`SELECT id FROM invoice_categories WHERE name='Bérleti díj' LIMIT 1`)).rows[0];
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Bérbeadó Kft', amount: 300000, total_amount: 300000,
          invoice_date: '2026-12-06', performance_date: '2026-12-06',
          cost_center_id: s.cc, category_id: cat.id,
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        const id = r.body?.data?.invoice?.id;
        const e = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [id])).rows[0].c;
        const sk = JSON.stringify(r.body?.data?.invoice?.expense_sync?.skipped
                                  || r.body?.data?.expense_sync?.skipped || []);
        return { created: r.status, expense_rows: e, says_why: /bérleti díj/i.test(sk) };
      },
    },
    {
      id: 'ALLOC-27',
      name: 'az általános és a központi célpont nem szállásköltség',
      expected: { created: 201, expense_rows: 0 },
      hint: 'cégszintű kiadás — nincs mögötte ház, amire terhelni lehetne',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Általános Kft', amount: 5000, total_amount: 5000,
          invoice_date: '2026-12-06', performance_date: '2026-12-06', cost_center_id: s.cc,
          allocations: [{ target_type: 'general' }] } });
        const e = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [r.body?.data?.invoice?.id])).rows[0].c;
        return { created: r.status, expense_rows: e };
      },
    },
    {
      id: 'ALLOC-28',
      name: 'a számla törlésével a képzett költségsor is megszűnik',
      expected: { rows_before: 1, deleted: 200, rows_after: 0 },
      hint: 'a kimutatás nem őrizhet olyan tételt, aminek a bizonylata már nincs meg',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Törlendő Híd Kft', amount: 9000, total_amount: 9000,
          invoice_date: '2026-12-07', performance_date: '2026-12-07', cost_center_id: s.cc,
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        const id = r.body?.data?.invoice?.id;
        const before = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [id])).rows[0].c;
        const d = await http.del(`/cost-centers/invoices/${id}`, { token: s.t });
        const after = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [id])).rows[0].c;
        return { rows_before: before, deleted: d.status, rows_after: after };
      },
    },
    {
      id: 'ALLOC-29',
      name: 'a besorolás törlése a költségsort is elviszi — az üres lista TÖRÖL, nem hagy érintetlenül',
      expected: { alloc_before: 1, alloc_after: 0, expense_after: 0 },
      hint: 'a "Besorolás törlése" korábban némán nem csinált semmit: a szolgáltatás üres listánál azonnal visszatért',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Besorolás Törlés Kft', amount: 6000, total_amount: 6000,
          invoice_date: '2026-12-08', performance_date: '2026-12-08', cost_center_id: s.cc,
          allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
        const id = r.body?.data?.invoice?.id;
        const b = (await query(`SELECT count(*)::int c FROM invoice_allocations WHERE invoice_id=$1`,
          [id])).rows[0].c;
        await http.put(`/cost-centers/invoices/${id}`, { token: s.t, body: { allocations: [] } });
        const a = (await query(`SELECT count(*)::int c FROM invoice_allocations WHERE invoice_id=$1`,
          [id])).rows[0].c;
        const e = (await query(`SELECT count(*)::int c FROM accommodation_expenses
           WHERE invoice_id=$1 AND deleted_at IS NULL`, [id])).rows[0].c;
        return { alloc_before: b, alloc_after: a, expense_after: e };
      },
    },
    {
      id: 'ALLOC-30',
      name: 'a megosztott számla HÁZANKÉNT külön költségsort képez, a részösszegével',
      expected: { rows: 2, sum: 90000, first: 60000, second: 30000 },
      hint: 'egy takarítási számla két szállóra: mindkét ház a saját részét viseli',
      run: async (ctx, s) => {
        const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
          vendor_name: 'ALLOC Megosztott Híd Kft', amount: 90000, total_amount: 90000,
          invoice_date: '2026-12-09', performance_date: '2026-12-09', cost_center_id: s.cc,
          allocations: [
            { target_type: 'accommodation', accommodation_id: s.a1.id, amount: 60000, expense_category: 'takaritas' },
            { target_type: 'accommodation', accommodation_id: s.a2.id, amount: 30000, expense_category: 'takaritas' },
          ] } });
        const e = (await query(
          `SELECT amount, category FROM accommodation_expenses
            WHERE invoice_id=$1 AND deleted_at IS NULL ORDER BY amount DESC`,
          [r.body?.data?.invoice?.id])).rows;
        return { rows: e.length, sum: e.reduce((a, x) => a + Number(x.amount), 0),
                 first: Number(e[0]?.amount), second: Number(e[1]?.amount) };
      },
    },
    {
      id: 'ALLOC-31',
      name: 'LEZÁRT hónapra a költségsor nem képződik magától, és a válasz megmondja, miért',
      expected: { created: 201, expense_rows: 0, says_closed: true, alloc_saved: 1 },
      hint: 'egy már kiszámlázott hónap költségoldalát nem írjuk át észrevétlenül — a besorolás viszont elmentődik',
      run: async (ctx, s) => {
        await query(`INSERT INTO billing_runs (billing_month, run_type, status, finalized_at)
                     VALUES ('2026-02','incoming','finalized', NOW())`);
        try {
          const r = await http.post('/cost-centers/invoices', { token: s.t, body: {
            vendor_name: 'ALLOC Lezárt Híd Kft', amount: 11000, total_amount: 11000,
            invoice_date: '2026-02-10', performance_date: '2026-02-10', cost_center_id: s.cc,
            allocations: [{ target_type: 'accommodation', accommodation_id: s.a1.id }] } });
          const id = r.body?.data?.invoice?.id;
          const e = (await query(`SELECT count(*)::int c FROM accommodation_expenses
             WHERE invoice_id=$1 AND deleted_at IS NULL`, [id])).rows[0].c;
          const al = (await query(`SELECT count(*)::int c FROM invoice_allocations WHERE invoice_id=$1`,
            [id])).rows[0].c;
          const sk = JSON.stringify(r.body?.data?.invoice?.expense_sync?.skipped
                                    || r.body?.data?.expense_sync?.skipped || []);
          return { created: r.status, expense_rows: e, says_closed: /le van zárva/.test(sk), alloc_saved: al };
        } finally {
          await query(`DELETE FROM billing_runs WHERE billing_month='2026-02'`);
        }
      },
    },
  ],
};
