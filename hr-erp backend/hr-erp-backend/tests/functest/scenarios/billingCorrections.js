/**
 * CORR — előre kiszámlázott ágyszám visszavezetése a tényleges foglaltságra.
 *
 * A havi számla ELŐRE megy ki a lekötött ágyszámra, mert a hónap elején még nem tudni, ki
 * mikor költözik ki. Amikor a megbízó elviszi az embereket, a különbözet a KÖVETKEZŐ
 * számlából kerül levonásra — augusztusra ez 3 583 100 Ft volt, kézzel számolva.
 *
 * CORR-03 és CORR-07 a két védelem, ami miatt az egész így épül:
 *   • jóváhagyás nélkül semmi nem kerül számlára (a levonás valódi pénz),
 *   • a profit NEM változik tőle — az már a tényleges foglaltságból számol, tehát a
 *     korrekció ott ugyanazt a különbözetet vonná le másodszor.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'CORR',
  title: 'számlakorrekció · jóváhagyás · levonás a következő számlán · a profit érintetlen',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const cl = (await query(
      `SELECT ab.partner_contractor_id AS id, ab.billing_month,
              sum(ab.total_amount)::numeric AS netto
         FROM accommodation_billings ab
         JOIN billing_runs br ON br.id = ab.billing_run_id
        WHERE br.status <> 'cancelled' AND ab.status <> 'cancelled'
          AND ab.partner_contractor_id IS NOT NULL AND ab.total_amount > 0
        GROUP BY 1,2 ORDER BY 3 DESC LIMIT 1`)).rows[0];

    // A TÉNYLEGES oldal ház+munkahely bontásban — az előre számlázott tételsorokat
    // ehhez képest állítjuk elő, hogy a különbözet szándékolt legyen, ne véletlen.
    const teny = (await query(
      `SELECT ab.accommodation_id, ab.workplace_id,
              sum(ab.total_employee_days)::numeric AS bed_nights,
              sum(ab.total_amount)::numeric AS net_amount,
              max((ab.calculation_details->'per_bed'->>'rate_used')::numeric) AS rate
         FROM accommodation_billings ab
         JOIN billing_runs br ON br.id = ab.billing_run_id
        WHERE ab.billing_month = $1 AND ab.partner_contractor_id = $2
          AND br.status <> 'cancelled' AND ab.status <> 'cancelled' AND ab.total_amount > 0
        GROUP BY 1,2 ORDER BY 4 DESC`, [cl.billing_month, cl.id])).rows;
    const p0 = await http.get('/profit/by-accommodation', { token: t, query: { month: cl.billing_month } });
    return {
      t, client: cl.id, month: cl.billing_month, tenyleges: Number(cl.netto), teny,
      profit0: Number(p0.body?.data?.summary?.total_income || 0),
      margin0: Number(p0.body?.data?.summary?.total_margin ?? p0.body?.data?.summary?.margin ?? 0),
    };
  },

  cases: [
    {
      id: 'CORR-01',
      name: 'a javaslat a KISZÁMLÁZOTT és a TÉNYLEGES különbözetét adja, levezetéssel',
      expected: { created: 201, kulonbozet: true, van_levezetes: true, statusz: 'javaslat' },
      hint: 'a kiszámlázott összeg a SZÁMLÁRÓL jön — a rendszer nem tudja, mi ment ki',
      run: async (ctx, s) => {
        // Minden házra 25%-kal több ágy-éjszakát "számlázunk ki", mint ami tényleg volt —
        // ez a lekötött ágyszám, amit a hónap elején még nem tudtunk pontosan.
        s.lines = s.teny.map((x) => {
          const rate = Number(x.rate) || 3476;
          const beds = Math.max(1, Math.ceil((Number(x.bed_nights) * 1.25) / 30));
          return { accommodation_id: x.accommodation_id, workplace_id: x.workplace_id,
                   beds, days: 30, rate };
        });
        s.kiszamlazott = s.lines.reduce((a, l) => a + l.beds * l.days * l.rate, 0);
        const r = await http.post('/billing-corrections', { token: s.t, body: {
          contractor_id: s.client, affected_month: s.month, lines: s.lines,
          note: 'Előre számlázott lekötött ágyszám',
        } });
        s.corr = r.body?.data?.correction?.id;
        const c = (await query('SELECT * FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        return {
          created: r.status,
          kulonbozet: Math.abs(Number(c?.amount) - (Number(c?.invoiced_amount) - Number(c?.actual_amount))) < 1,
          van_levezetes: Array.isArray(c?.breakdown?.lines) && c.breakdown.lines.length > 0,
          statusz: c?.status,
        };
      },
    },
    {
      id: 'CORR-02',
      name: 'a levezetés HÁZANKÉNT és munkahelyenként mutatja az ágy-éjszakát és a díjat',
      expected: { van_haz: true, van_munkahely: true, van_ejszaka: true, van_dij: true },
      hint: 'egy 7 milliós levonás mögé fél év múlva is oda kell tudni nézni',
      run: async (ctx, s) => {
        const l = (await query(
          `SELECT l.*, a.name AS haz FROM billing_correction_lines l
             JOIN accommodations a ON a.id=l.accommodation_id
            WHERE l.correction_id=$1 ORDER BY l.diff_amount DESC LIMIT 1`, [s.corr])).rows[0];
        return {
          van_haz: typeof l?.haz === 'string' && l.haz.length > 0,
          van_munkahely: l?.workplace_id !== undefined,
          van_ejszaka: Number.isFinite(Number(l?.actual_bed_nights))
            && Number.isFinite(Number(l?.invoiced_beds)) && Number.isFinite(Number(l?.invoiced_days)),
          van_dij: Number.isFinite(Number(l?.rate)),
        };
      },
    },
    {
      id: 'CORR-03',
      name: 'JÓVÁHAGYÁS NÉLKÜL nem kerülhet számlára',
      expected: { beszamitas_elutasitva: 409, says_why: true, a_lapon_nincs: 0 },
      hint: 'a levonás valódi pénz, a foglaltsági adat pedig emberi átvezetésen múlik',
      run: async (ctx, s) => {
        const r = await http.post(`/billing-corrections/${s.corr}/settle`, {
          token: s.t, body: { month: '2026-12' } });
        const lap = await http.get('/settlements/client/preview', {
          token: s.t, query: { partner_id: s.client, month: '2026-12' } });
        return {
          beszamitas_elutasitva: r.status,
          says_why: /JÓVÁHAGYOTT/i.test(r.body?.message || ''),
          a_lapon_nincs: (lap.body?.data?.correction_lines || []).length,
        };
      },
    },
    {
      id: 'CORR-04',
      name: 'jóváhagyás után TÉTELSORKÉNT jelenik meg a következő számlán, NEGATÍV előjellel',
      expected: { jovahagyva: 200, sorok: 1, negativ: true, van_cimke: true },
      hint: 'külön soron, hogy látszódjon, mi az eredeti díj és mi a korrekció',
      run: async (ctx, s) => {
        const a = await http.post(`/billing-corrections/${s.corr}/approve`, { token: s.t });
        const lap = await http.get('/settlements/client/preview', {
          token: s.t, query: { partner_id: s.client, month: '2026-12' } });
        const sorok = lap.body?.data?.correction_lines || [];
        return {
          jovahagyva: a.status, sorok: sorok.length,
          negativ: Number(sorok[0]?.amount) < 0,
          van_cimke: /Korrekció/.test(sorok[0]?.label || ''),
        };
      },
    },
    {
      id: 'CORR-05',
      name: 'RÉSZLEGES beszámítás: a maradék nyitva marad a következő számlára',
      expected: { elso: 200, marad_nyitva: true, statusz: 'jovahagyva' },
      hint: 'ha a havi díj kisebb a korrekciónál, a maradékot görgetjük',
      run: async (ctx, s) => {
        const c = (await query('SELECT amount FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        const fele = Math.round(Number(c.amount) / 2);
        const r = await http.post(`/billing-corrections/${s.corr}/settle`, {
          token: s.t, body: { month: '2026-12', amount: fele } });
        const utana = (await query(
          'SELECT status, amount, settled_amount FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        return {
          elso: r.status,
          marad_nyitva: Number(utana.settled_amount) < Number(utana.amount),
          statusz: utana.status,
        };
      },
    },
    {
      id: 'CORR-06',
      name: 'a teljes beszámítás lezárja, és többet nem számítható be',
      expected: { masodik: 200, statusz: 'beszamitva', harmadik_elutasitva: 409 },
      hint: 'egy korrekció egyszer vonható le — különben a levonás duplázna',
      run: async (ctx, s) => {
        const b = await http.post(`/billing-corrections/${s.corr}/settle`, {
          token: s.t, body: { month: '2027-01' } });
        const c = (await query('SELECT status FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        const h = await http.post(`/billing-corrections/${s.corr}/settle`, {
          token: s.t, body: { month: '2027-02', amount: 1000 } });
        return { masodik: b.status, statusz: c.status, harmadik_elutasitva: h.status };
      },
    },
    {
      id: 'CORR-07',
      name: 'a PROFIT nem változik a korrekciótól — az már a tényleges foglaltságból számol',
      expected: { valtozatlan: true },
      hint: 'ha a korrekció is csökkentené, ugyanaz a különbözet kétszer jelenne meg',
      run: async (ctx, s) => {
        // s.profit0 a korrekció LÉTREHOZÁSA ELŐTT készült; azóta a korrekció végigment a
        // javaslat → jóváhagyás → beszámítás láncon. A bevételnek ugyanannyinak kell lennie.
        const p = await http.get('/profit/by-accommodation', { token: s.t, query: { month: s.month } });
        const most = Number(p.body?.data?.summary?.total_income || 0);
        return { valtozatlan: s.profit0 > 0 && Math.abs(most - s.profit0) < 1 };
      },
    },
    {
      id: 'CORR-08',
      name: 'a nyitott korrekciók nézete összesít, és külön mutatja a még jóvá nem hagyottakat',
      expected: { ok: 200, van_osszesen: true, van_bontas: true, javaslat_kulon: true },
      hint: 'a javaslat még nem pénz — a kettőt nem szabad egy számban összeadni',
      run: async (ctx, s) => {
        // egy friss javaslat, hogy legyen mit mutatni
        const masik = (await query(
          `INSERT INTO contractors (name, slug, is_active) VALUES ('CORR Teszt Megbízó','corr-teszt',true)
           RETURNING id`)).rows[0];
        await query(
          `INSERT INTO billing_corrections (contractor_id, affected_month, invoiced_amount,
             actual_amount, amount, status) VALUES ($1,'2026-05',100000,60000,40000,'javaslat')`,
          [masik.id]);
        const r = await http.get('/billing-corrections/open', { token: s.t });
        const d = r.body?.data || {};
        return {
          ok: r.status,
          van_osszesen: Number.isFinite(d.osszesen) && d.osszesen > 0,
          van_bontas: Number.isFinite(d.javaslat) && Number.isFinite(d.jovahagyva),
          // a javaslat összege külön áll a jóváhagyottétól, és a kettő adja ki az összeset
          javaslat_kulon: d.javaslat_osszeg === 40000
            && Math.abs(d.osszesen - (d.javaslat_osszeg + d.jovahagyva_osszeg)) < 1,
        };
      },
    },
    {
      id: 'CORR-09',
      name: 'SORONKÉNTI kihagyás: a kivett sor látható marad, de nem számít a végösszegbe',
      expected: { ok: 200, osszeg_csokkent: true, sor_megmaradt: true, included_false: true },
      hint: 'a kihagyott ház mást jelent, mint a soha be nem vitt ház',
      run: async (ctx, s) => {
        // friss javaslat, mert az elsőt a korábbi esetek már beszámították
        const teny = s.teny[0];
        const rate = Number(teny.rate) || 3476;
        const lines = s.teny.slice(0, 2).map((x) => ({
          accommodation_id: x.accommodation_id, workplace_id: x.workplace_id,
          beds: Math.max(1, Math.ceil((Number(x.bed_nights) * 1.4) / 30)), days: 30,
          rate: Number(x.rate) || rate,
        }));
        const p = await http.post('/billing-corrections', { token: s.t, body: {
          contractor_id: s.client, affected_month: '2026-04', lines } });
        s.corr9 = p.body?.data?.correction?.id;
        const elotte = Number((await query(
          'SELECT amount FROM billing_corrections WHERE id=$1', [s.corr9])).rows[0].amount);

        const sor = (await query(
          `SELECT id, diff_amount FROM billing_correction_lines
            WHERE correction_id=$1 ORDER BY diff_amount DESC LIMIT 1`, [s.corr9])).rows[0];
        const r = await http.patch(`/billing-corrections/${s.corr9}/lines/${sor.id}`, {
          token: s.t, body: { included: false } });

        const utana = (await query(
          'SELECT amount FROM billing_corrections WHERE id=$1', [s.corr9])).rows[0];
        const megvan = (await query(
          'SELECT included FROM billing_correction_lines WHERE id=$1', [sor.id])).rows[0];
        return {
          ok: r.status,
          osszeg_csokkent: Math.abs(Number(utana.amount) - (elotte - Number(sor.diff_amount))) < 1,
          sor_megmaradt: !!megvan,
          included_false: megvan?.included === false,
        };
      },
    },
    {
      id: 'CORR-10',
      name: 'ALULSZÁMLÁZÁS is korrekció: pótszámlázás POZITÍV tételsorként',
      expected: { created: 201, negativ_amount: true, irany: 'potszamlazas', szamlasor_pozitiv: true },
      hint: 'aki a számlázás után költözik be, nem marad ingyen',
      run: async (ctx, s) => {
        // Saját, önálló eset: egy megbízó, akinek 2026-03-ra 400 000 Ft TÉNYLEGES
        // foglaltsága van, de csak egyetlen ágyra egy napra ment ki előre a számla.
        // Azért nem a fixture hónapját használom, mert arra már van beszámított
        // korrekció, és egy megbízóra egy hónapra csak egy élő korrekció lehet.
        const mb = (await query(
          `INSERT INTO contractors (name, slug, is_active) VALUES ('CORR Pót Megbízó','corr-pot','true')
           RETURNING id`)).rows[0];
        await query(`INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'megbizo')`, [mb.id]);
        s.run03 = (await query(
          `INSERT INTO billing_runs (billing_month, status, run_type)
           VALUES ('2026-03','calculated','outgoing') RETURNING id`)).rows[0].id;
        const acc = (await query('SELECT id FROM accommodations ORDER BY name LIMIT 1')).rows[0];
        await query(
          `INSERT INTO accommodation_billings
             (billing_run_id, billing_month, accommodation_id, partner_contractor_id,
              total_amount, vat_amount, gross_amount, cost_amount, margin_amount,
              total_employee_days, calculation_details, status)
           VALUES ($1,'2026-03',$2,$3,400000,108000,508000,0,400000,100,
                   '{"per_bed":{"rate_used":4000}}'::jsonb,'draft')`,
          [s.run03, acc.id, mb.id]);

        const r = await http.post('/billing-corrections', { token: s.t, body: {
          contractor_id: mb.id, affected_month: '2026-03',
          lines: [{ accommodation_id: acc.id, beds: 1, days: 1, rate: 4000 }] } });
        s.corr10 = r.body?.data?.correction?.id;
        const c = (await query('SELECT amount FROM billing_corrections WHERE id=$1', [s.corr10])).rows[0];

        await http.post(`/billing-corrections/${s.corr10}/approve`, { token: s.t });
        const lap = await http.get('/settlements/client/preview', {
          token: s.t, query: { partner_id: mb.id, month: '2026-11' } });
        const sorok = (lap.body?.data?.correction_lines || []).filter(
          (x) => x.affected_month === '2026-03');
        return {
          created: r.status,
          // 4 000 kiszámlázva − 400 000 tényleges = −396 000 → alulszámlázás
          negativ_amount: Number(c?.amount) < 0,
          irany: r.body?.data?.direction,
          szamlasor_pozitiv: Number(sorok[0]?.amount) > 0,
        };
      },
    },
    {
            id: 'CORR-11',
      name: 'a nyitott lista KOROSÍT, és a két irányt KÜLÖN összegzi',
      expected: { ok: 200, van_korosites: true, ket_irany_kulon: true, van_vodor: true },
      hint: 'egy visszajáró és egy pótszámlázandó összege nulla lenne — a legrosszabb "rendben"',
      run: async (ctx, s) => {
        const r = await http.get('/billing-corrections/open', { token: s.t });
        const d = r.body?.data || {};
        const vodrok = Object.keys(d.korosites || {});
        return {
          ok: r.status,
          van_korosites: vodrok.length === 4 && vodrok.includes('90+'),
          // a visszajáró pozitív, a pótszámlázandó negatív, és nem egy számban ülnek
          ket_irany_kulon: Number.isFinite(d.visszajar) && Number.isFinite(d.potszamlazando)
            && d.potszamlazando < 0 && d.visszajar > 0,
          van_vodor: (d.rows || []).every((x) => typeof x.aging_bucket === 'string'),
        };
      },
    },
    {
      id: 'CORR-12',
      name: 'HÓNAPZÁRÁS: a JÓVÁHAGYOTT, vissza nem vezetett korrekció blokkol',
      expected: { blokkolt: 409, felsorol: true, van_figyelmeztetes: true },
      hint: 'egy elismert, de ki nem küldött levonással lezárt hónap = elfelejtett pénz',
      run: async (ctx, s) => {
        // a CORR-10 korrekciója jóváhagyva, de nincs beszámítva → 2026-03 nem zárható
        // a CORR-10 jóváhagyott, de be nem számított pótszámlázása fogja megállítani
        const r = await http.post(`/billing/runs/${s.run03}/finalize`, { token: s.t });
        const d = r.body?.data || {};
        return {
          blokkolt: r.status,
          felsorol: Array.isArray(d.blocking_corrections) && d.blocking_corrections.length > 0
            && typeof d.blocking_corrections[0].label === 'string',
          van_figyelmeztetes: Array.isArray(d.warning_corrections),
        };
      },
    },
    {
      id: 'CORR-13',
      name: 'a még JÓVÁ NEM HAGYOTT javaslat NEM blokkol, csak figyelmeztet',
      expected: { nem_blokkol: true, figyelmeztet: true },
      hint: 'egy ki nem vizsgált különbözet nem elismert tartozás — de tudni kell róla',
      run: async (ctx, s) => {
        const b = await (async () => {
          const svc = require('../../../src/services/billingCorrection.service');
          return svc.blockingForMonth('2026-04');   // CORR-09 javaslata, jóváhagyás nélkül
        })();
        return {
          nem_blokkol: b.blocking.length === 0,
          figyelmeztet: b.warnings.length > 0 && /Ft/.test(b.warnings[0].label),
        };
      },
    },
  ],
};
