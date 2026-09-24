/**
 * UFIELD — az „ismeretlen mező" őre, FOKOZATOS bevezetésben.
 *
 * A hibaosztály háromszor jött elő egy napon (adószám → beszállítói számlaszám →
 * teljesítés dátuma). A tünetet javítani nem elég: a kézzel felsorolt mezőlista a
 * kódbázis alapértelmezése, 91 szerkesztő végpontból 62-ben.
 *
 * AZ 1. FÁZIS SZÁNDÉKOSAN NEM UTASÍT EL: több űrlap a teljes `form` objektumot küldi,
 * és az azonnali 400 a bevezetés napján állítaná meg a munkát. Ez a terület azt őrzi,
 * hogy a naplózó fázis TÉNYLEG naplózzon — és hogy az éles kapcsoló működjön, amikor
 * majd felkapcsoljuk.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const guard = require('../../../src/middleware/unknownFieldGuard');

module.exports = {
  area: 'UFIELD',
  title: 'ismeretlen mező · naplózó fázis · a kétrészes engedélylista',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const kh = (await query('SELECT id FROM cost_centers LIMIT 1')).rows[0];
    return { t, kh };
  },

  cases: [
    {
      id: 'UFIELD-01',
      name: 'a MENTHETŐ és a TUDATOSAN figyelmen kívül hagyott mező NEM gyanús',
      expected: { ismeretlen: [] },
      hint: 'a felület a teljes form-objektumot küldi; a belső sorszám nem hiba, csak nem mentjük',
      run: async () => guard.ellenoriz(
        { vendor_name: 'x', invoice_number: 'INV-1', is_landlord_notice: false },
        ['vendor_name'], ['invoice_number', 'is_landlord_notice']),
    },
    {
      id: 'UFIELD-02',
      name: '⚠️ amiről SENKI NEM DÖNTÖTT, azt megnevezi',
      expected: { ismeretlen: ['sajat_kitalalt_mezo'] },
      hint: 'ez az a mező, ami ma némán a szemétbe menne',
      run: async () => guard.ellenoriz(
        { vendor_name: 'x', sajat_kitalalt_mezo: 42 }, ['vendor_name'], []),
    },
    {
      id: 'UFIELD-03',
      name: 'az 1. fázis NEM utasít el — a mentés folytatódik',
      expected: { blokkolt: false, eles_kapcsolo: false },
      hint: 'azonnali 400 a bevezetés napján minden űrlapot megállítana',
      run: async () => {
        let allapot = null;
        const hamisRes = { status: () => ({ json: (b) => { allapot = b; } }) };
        const blokkolt = guard.blokkol(hamisRes, { ismeretlen_mezo: 1 }, [], [], null);
        return { blokkolt, eles_kapcsolo: guard.ELES };
      },
    },
    {
      id: 'UFIELD-04',
      name: 'a számlás végpont ismeretlen mezővel is MENT (1. fázis), és naplóz',
      expected: { status: 200, mentette: 'Körbe Kft 3' },
      hint: 'a naplóbejegyzésből fog kiderülni, hol kellene bővíteni az engedélylistát',
      run: async (ctx, s) => {
        const sz = (await query(
          `INSERT INTO invoices (vendor_name, supplier_invoice_number, amount, total_amount,
             invoice_date, cost_center_id, contractor_id, created_by, payment_status)
           VALUES ('FT UF Kft','UF-1',1000,1000,CURRENT_DATE,$1,$2,$3,'draft') RETURNING id`,
          [s.kh.id, ctx.ids.contractor || ctx.ids.client.A, ctx.ids.user.superadmin])).rows[0];

        const r = await http.put(`/invoices/${sz.id}`, {
          token: s.t,
          body: { vendor_name: 'Körbe Kft 3', ez_a_mezo_nem_letezik: 'akármi' },
        });
        const db = (await query('SELECT vendor_name FROM invoices WHERE id = $1', [sz.id]))
          .rows[0].vendor_name;
        await query('DELETE FROM invoices WHERE id = $1', [sz.id]);
        return { status: r.status, mentette: db };
      },
    },
    {
      id: 'UFIELD-05',
      name: 'az ÁLTALÁNOS mezők (id, created_at) nem számítanak ismeretlennek',
      expected: { ismeretlen: [] },
      hint: 'ezek minden kérésben ott vannak — miattuk ne zajongjon a napló',
      run: async () => guard.ellenoriz(
        { id: 'x', created_at: 'y', updated_at: 'z', nev: 'a' }, ['nev'], []),
    },
  ],
};
