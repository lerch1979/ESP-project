/**
 * PREPAID — megelőlegezett tételek: kifizettük a szállásadó helyett, visszajár tőle.
 *
 * A valós eset: a győri ingatlanban kicseréltük a vízórát (23 000 Ft). A számla a miénk,
 * szerződés szerint viszont a bérbeadó terhe, ezért a következő havi elszámolásban
 * levonjuk a neki fizetendőből.
 *
 * PRE-04 a lényeg: a tétel EGYSZER csökkentheti az eredményt. Ha költségként is
 * beszámítana ÉS levonásként is, a ház annyival többe kerülne, mint amennyibe valóban
 * került — és ez a fajta hiba hónapokkal később derül ki, a kimutatásból.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'PREPAID',
  title: 'megelőlegezett tétel · követelés · korosítás · levonás a szállásadói elszámolásban',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const acc = (await query(`SELECT id, name, current_contractor_id FROM accommodations
                               WHERE is_active AND current_contractor_id IS NOT NULL LIMIT 1`)).rows[0];
    return { t, acc, landlord: acc.current_contractor_id };
  },

  cases: [
    {
      id: 'PRE-01',
      name: 'megelőlegezett tétel rögzíthető, és NYITOTT követelésként indul',
      expected: { created: 201, bearer: 'megelolegezett', status: 'nyitott', from_landlord: true },
      hint: 'a vízóracsere a bérbeadó terhe — nálunk követelés, nem ráfordítás',
      run: async (ctx, s) => {
        const r = await http.post('/expenses', { token: s.t, body: {
          accommodation_id: s.acc.id, billing_month: '2026-10', category: 'karbantartas',
          amount: 23000, vendor_name: 'PRE Vízóra Szerelő Kft', performance_date: '2026-10-03',
          cost_bearer: 'megelolegezett', recoverable_from_contractor_id: s.landlord,
          recovery_note: 'Vízóracsere — szerződés szerint a bérbeadó terhe' } });
        s.claim = r.body?.data?.id || r.body?.data?.expense?.id;
        const e = (await query(
          `SELECT cost_bearer, recovery_status, recoverable_from_contractor_id
             FROM accommodation_expenses WHERE id=$1`, [s.claim])).rows[0];
        return { created: r.status, bearer: e?.cost_bearer, status: e?.recovery_status,
                 from_landlord: e?.recoverable_from_contractor_id === s.landlord };
      },
    },
    {
      id: 'PRE-02',
      name: 'megelőlegezett tétel CSAK akkor rögzíthető, ha megvan, kitől jár vissza',
      expected: { refused: 400, says_who: true },
      hint: 'enélkül a követelés láthatatlanul elveszne a költségek között',
      run: async (ctx, s) => {
        const r = await http.post('/expenses', { token: s.t, body: {
          accommodation_id: s.acc.id, billing_month: '2026-10', category: 'karbantartas',
          amount: 5000, vendor_name: 'PRE Hiányos Kft', performance_date: '2026-10-03',
          cost_bearer: 'megelolegezett' } });
        return { refused: r.status, says_who: /kitől jár vissza/i.test(r.body?.message || '') };
      },
    },
    {
      id: 'PRE-03',
      name: 'a követelés megjelenik a nyitott listán, KOROSÍTVA',
      expected: { ok: 200, listed: true, has_age: true, open_amount: 23000 },
      hint: '"ha valaki hónapokig görget maga előtt egy követelést, azt látni akarom"',
      run: async (ctx, s) => {
        const r = await http.get('/expenses/recoverable', { token: s.t });
        const row = (r.body?.data?.rows || []).find((x) => x.id === s.claim);
        return { ok: r.status, listed: !!row, has_age: typeof row?.korosztaly === 'string',
                 open_amount: Number(row?.open_amount) };
      },
    },
    {
      id: 'PRE-04',
      name: 'a követelés NEM számít bele a szállás költségébe — se a profitba, se a rezsibontásba',
      expected: { in_cost_report: 0, own_cost_counted: 7000 },
      hint: 'ha költségként IS beszámítana és levonásként IS, a ház kétszer viselné ugyanazt',
      run: async (ctx, s) => {
        // ugyanarra a hónapra egy SAJÁT költség is, hogy lássuk: azt beszámítja
        await http.post('/expenses', { token: s.t, body: {
          accommodation_id: s.acc.id, billing_month: '2026-10', category: 'karbantartas',
          amount: 7000, vendor_name: 'PRE Saját Költség Kft', performance_date: '2026-10-04' } });
        const r = (await query(
          `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM accommodation_expenses
            WHERE accommodation_id=$1 AND billing_month='2026-10' AND deleted_at IS NULL
              AND cost_bearer='sajat'`, [s.acc.id])).rows[0];
        const claimInCost = (await query(
          `SELECT count(*)::int c FROM accommodation_expenses
            WHERE id=$1 AND cost_bearer='sajat'`, [s.claim])).rows[0].c;
        return { in_cost_report: claimInCost, own_cost_counted: Number(r.total) };
      },
    },
    {
      id: 'PRE-05',
      name: 'a szállásadói elszámoló lapon LEVONÁSKÉNT jelenik meg, a bruttó díj mellett',
      expected: { ok: 200, has_deduction: true, gross_kept: true, net_is_less: true },
      hint: 'látszódnia kell, mi az eredeti díj és mi a korrekció — nem egy csökkentett végösszeg',
      run: async (ctx, s) => {
        const r = await http.get('/settlements/landlord/preview', { token: s.t,
          query: { partner_id: s.landlord, month: '2026-10' } });
        const t = r.body?.data?.totals || {};
        const d = r.body?.data?.deductions || [];
        return {
          ok: r.status,
          has_deduction: d.some((x) => Number(x.amount) === 23000),
          gross_kept: t.gross_total !== undefined && t.deductions_total !== undefined,
          net_is_less: Number(t.net_payable) === Number(t.gross_total) - Number(t.deductions_total),
        };
      },
    },
    {
      id: 'PRE-06',
      name: 'RÉSZLEGES levonás: a maradék nyitva marad és a következő hónapra fordul át',
      expected: { first: 200, remaining: 13000, still_open: 'nyitott', carried: true },
      hint: 'ha a havi fizetendő kevesebb a követelésnél, a maradékot görgetjük — nem kérjük vissza',
      run: async (ctx, s) => {
        const a = await http.post(`/expenses/${s.claim}/recover`, { token: s.t,
          body: { month: '2026-10', amount: 10000 } });
        const e = (await query(
          `SELECT recovered_amount, recovery_status FROM accommodation_expenses WHERE id=$1`,
          [s.claim])).rows[0];
        // a következő havi lapon "áthozott" tételként kell látszania
        const next = await http.get('/settlements/landlord/preview', { token: s.t,
          query: { partner_id: s.landlord, month: '2026-11' } });
        const d = (next.body?.data?.deductions || []).find((x) => x.expense_id === s.claim);
        return {
          first: a.status,
          remaining: 23000 - Number(e?.recovered_amount),
          still_open: e?.recovery_status,
          carried: d?.athozott === true,
        };
      },
    },
    {
      id: 'PRE-07',
      name: 'a teljes levonás lezárja a követelést, és többet nem vonható le',
      expected: { second: 200, status_after: 'levonva', third_refused: 409, total_recovered: 23000 },
      hint: 'egy tétel egyszer számítható be — különben a levonás duplázna',
      run: async (ctx, s) => {
        const b = await http.post(`/expenses/${s.claim}/recover`, { token: s.t,
          body: { month: '2026-11' } });        // összeg nélkül: a maradék
        const e = (await query(
          `SELECT recovered_amount, recovery_status FROM accommodation_expenses WHERE id=$1`,
          [s.claim])).rows[0];
        const c = await http.post(`/expenses/${s.claim}/recover`, { token: s.t,
          body: { month: '2026-12', amount: 1000 } });
        return { second: b.status, status_after: e?.recovery_status, third_refused: c.status,
                 total_recovered: Number(e?.recovered_amount) };
      },
    },
    {
      id: 'PRE-08',
      name: 'a levonás-események visszakereshetők: melyik hónapban mennyi tűnt el',
      expected: { events: 2, months: '2026-10,2026-11', sum: 23000 },
      hint: 'egy összesített "levonva" jelölő nem tudná megmondani, melyik elszámolásban történt',
      run: async (ctx, s) => {
        const r = (await query(
          `SELECT billing_month, amount FROM expense_recoveries
            WHERE expense_id=$1 ORDER BY billing_month`, [s.claim])).rows;
        return {
          events: r.length,
          months: r.map((x) => x.billing_month).join(','),
          sum: r.reduce((a, x) => a + Number(x.amount), 0),
        };
      },
    },
  ],
};
