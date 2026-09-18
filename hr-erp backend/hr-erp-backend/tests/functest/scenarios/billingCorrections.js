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
    const p0 = await http.get('/profit/by-accommodation', { token: t, query: { month: cl.billing_month } });
    return {
      t, client: cl.id, month: cl.billing_month, tenyleges: Number(cl.netto),
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
        s.kiszamlazott = Math.round(s.tenyleges * 1.3);   // 30%-kal több, mint a tényleges
        const r = await http.post('/billing-corrections', { token: s.t, body: {
          contractor_id: s.client, affected_month: s.month,
          invoiced_amount: s.kiszamlazott,
          note: 'Előre számlázott lekötött ágyszám',
        } });
        s.corr = r.body?.data?.correction?.id;
        const c = (await query('SELECT * FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        return {
          created: r.status,
          kulonbozet: Math.abs(Number(c?.amount) - (s.kiszamlazott - s.tenyleges)) < 1,
          van_levezetes: Array.isArray(c?.breakdown?.actual) && c.breakdown.actual.length > 0,
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
        const c = (await query('SELECT breakdown FROM billing_corrections WHERE id=$1', [s.corr])).rows[0];
        const sor = c.breakdown.actual[0] || {};
        return {
          van_haz: typeof sor.accommodation === 'string',
          van_munkahely: typeof sor.workplace === 'string',
          van_ejszaka: Number.isFinite(sor.bed_nights),
          van_dij: sor.rate_used === null || Number.isFinite(sor.rate_used),
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
  ],
};
