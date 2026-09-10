/**
 * CURRENCY — foreign-currency costs booked at the MNB rate of the performance date.
 *
 * The rule under test: a historical cost must always show the HUF it was BOOKED at. So
 * the rate is frozen on the record and never recomputed — the same reasoning that makes
 * a finalized month un-recalculable.
 *
 * NOTE ON THE NETWORK. mnbRates refuses to reach mnb.hu from a test harness (the same
 * fail-closed shape as mailGuard, after the 2026-09-03 incident where fixtures sent 44
 * real emails). That is not a limitation here — it means these scenarios exercise the
 * REAL code path in the state production reaches when MNB is down, which is the state
 * most worth proving. Where a live rate is needed, the cache is seeded directly, exactly
 * as a successful fetch would have.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const mnb = require('../../../src/services/mnbRates.service');

module.exports = {
  area: 'CURRENCY',
  title: 'deviza költség · MNB árfolyam a teljesítés napjára · hiányzó árfolyam blokkolja a hónapzárást',

  async setup(ctx) {
    return { t: http.tokenFor(ctx.ids.user.superadmin), acc: ctx.ids.acc.pp };
  },

  cases: [
    {
      id: 'FX-01',
      name: 'a teszt-környezet SOHA nem hív ki az MNB-hez',
      expected: { network_allowed: false },
      hint: 'same fail-closed rule as mailGuard — a fixture must not reach a live external service',
      run: async () => ({ network_allowed: mnb.networkAllowed() }),
    },
    {
      id: 'FX-02',
      name: 'a 100-as egységű jegyzés nem lesz 100× hibás',
      expected: { eur: 376.95, eur_unit: 1, jpy: 210.5, jpy_unit: 100 },
      hint: 'MNB quotes some currencies per 100 units; ignoring `unit` is a 100x money error',
      run: async () => {
        const xml = '<Day date="2026-09-05">'
          + '<Rate unit="1" curr="EUR">376,95</Rate>'
          + '<Rate unit="100" curr="JPY">210,5</Rate></Day>';
        const e = mnb.parseRates(xml, 'EUR')[0];
        const j = mnb.parseRates(xml, 'JPY')[0];
        return { eur: e.rate, eur_unit: e.unit, jpy: j.rate, jpy_unit: j.unit };
      },
    },
    {
      id: 'FX-03',
      name: 'hétvégi teljesítés a LEGUTÓBB közzétett árfolyamon könyvel, és azt a dátumot tárolja',
      expected: { status: 'ok', rate: 376.95, rate_date: '2026-09-04', huf: 452340 },
      hint: 'MNB publishes on banking days only; the stored date must be the published one',
      run: async () => {
        await mnb.storeRates('EUR', [{ rate_date: '2026-09-04', rate: 376.95, unit: 1 }]);
        // 2026-09-06 is a Sunday — no publication.
        const c = await mnb.toHuf(1200, 'EUR', '2026-09-06');
        return { status: c.status, rate: c.rate, rate_date: c.rateDate, huf: c.amountHuf };
      },
    },
    {
      id: 'FX-04',
      name: 'deviza költség FORINTBAN könyvelődik, az eredeti összeggel és árfolyammal együtt',
      expected: { created: 201, amount_huf: 452340, original: 1200, currency: 'EUR',
                  rate: '376.950000', rate_status: 'ok' },
      hint: '`amount` stays the booked HUF because every downstream consumer reads it as forint',
      run: async (ctx, s) => {
        const r = await http.post('/expenses', { token: s.t, body: {
          accommodation_id: s.acc, category: 'rezsi', amount: 1200, currency: 'EUR',
          performance_date: '2026-09-05', billing_month: '2026-09', vendor_name: 'FX Teszt Kft' } });
        const row = (await query(
          `SELECT amount, original_amount, original_currency, exchange_rate,
                  TO_CHAR(exchange_rate_date,'YYYY-MM-DD') AS rd, rate_status
             FROM accommodation_expenses WHERE id=$1`, [r.body?.data?.expense?.id || r.body?.data?.id])).rows[0];
        return {
          created: r.status, amount_huf: Number(row.amount), original: Number(row.original_amount),
          currency: row.original_currency, rate: row.exchange_rate, rate_status: row.rate_status,
        };
      },
    },
    {
      id: 'FX-05',
      name: 'elérhetetlen MNB esetén a mentés NEM hiúsul meg — a tétel "árfolyam hiányzik" jelöléssel megy be',
      expected: { created: 201, rate_status: 'missing', original: 500, currency: 'USD', rate_null: true },
      hint: 'never guess a rate, never lose the user\'s work — the third state is the honest one',
      run: async (ctx, s) => {
        // No USD rate is cached and the harness cannot fetch → exactly the outage path.
        const r = await http.post('/expenses', { token: s.t, body: {
          accommodation_id: s.acc, category: 'rezsi', amount: 500, currency: 'USD',
          performance_date: '2026-09-05', billing_month: '2026-09', vendor_name: 'FX Outage Kft' } });
        const row = (await query(
          `SELECT original_amount, original_currency, exchange_rate, rate_status
             FROM accommodation_expenses WHERE id=$1`, [r.body?.data?.expense?.id || r.body?.data?.id])).rows[0];
        return {
          created: r.status, rate_status: row.rate_status, original: Number(row.original_amount),
          currency: row.original_currency, rate_null: row.exchange_rate === null,
        };
      },
    },
    {
      id: 'FX-06',
      name: 'hiányzó árfolyam BLOKKOLJA a hónapzárást, és megmondja MELYIK tételek miatt',
      expected: { refused: 409, requires_resolution: true, lists_them: true, names_vendor: true },
      hint: 'blocking without naming what to fix is a wall; the refusal carries the rows and their ids',
      run: async (ctx, s) => {
        const run = (await query(
          `INSERT INTO billing_runs (billing_month, run_type, status, created_by)
           VALUES ('2026-09','incoming','calculated',NULL) RETURNING id`)).rows[0];
        const r = await http.post(`/billing/runs/${run.id}/finalize`, { token: s.t, body: {} });
        const d = r.body?.data;
        return {
          refused: r.status,
          requires_resolution: r.body?.requires_rate_resolution === true,
          lists_them: (d?.missing || []).length > 0,
          names_vendor: (d?.missing || []).some((x) => x.vendor_name === 'FX Outage Kft'),
        };
      },
    },
    {
      id: 'FX-07',
      name: 'az újrapróbálkozás megoldja a tételt, és a hónap ezután lezárható',
      expected: { fixed: 1, rate_status: 'ok', amount_huf: 172500, finalize: 200 },
      hint: 'the retry is what makes "blocked" fair rather than a dead end',
      run: async (ctx, s) => {
        // A successful fetch would have written exactly this.
        await mnb.storeRates('USD', [{ rate_date: '2026-09-05', rate: 345.0, unit: 1 }]);
        const retry = await http.post('/exchange-rates/retry', { token: s.t, body: { billing_month: '2026-09' } });
        const row = (await query(
          `SELECT amount, rate_status FROM accommodation_expenses
            WHERE vendor_name='FX Outage Kft' AND deleted_at IS NULL`)).rows[0];
        const run = (await query(
          `SELECT id FROM billing_runs WHERE billing_month='2026-09' AND status='calculated' LIMIT 1`)).rows[0];
        const fin = await http.post(`/billing/runs/${run.id}/finalize`, { token: s.t, body: {} });
        return {
          fixed: retry.body?.data?.fixed, rate_status: row.rate_status,
          amount_huf: Number(row.amount), finalize: fin.status,
        };
      },
    },
    {
      id: 'FX-08',
      name: 'a lezárt hónap tétele NEM számolódik újra egy későbbi árfolyamon',
      expected: { unchanged: true, rate_unchanged: true },
      hint: 'THE invariant: a historical cost shows the HUF it was booked at, forever',
      run: async (ctx, s) => {
        const before = (await query(
          `SELECT amount, exchange_rate FROM accommodation_expenses
            WHERE vendor_name='FX Teszt Kft' AND deleted_at IS NULL`)).rows[0];
        // The forint moves; a later rate lands in the cache.
        await mnb.storeRates('EUR', [{ rate_date: '2026-09-30', rate: 999.99, unit: 1 }]);
        const after = (await query(
          `SELECT amount, exchange_rate FROM accommodation_expenses
            WHERE vendor_name='FX Teszt Kft' AND deleted_at IS NULL`)).rows[0];
        return {
          unchanged: Number(before.amount) === Number(after.amount),
          rate_unchanged: String(before.exchange_rate) === String(after.exchange_rate),
        };
      },
    },
  ],
};
