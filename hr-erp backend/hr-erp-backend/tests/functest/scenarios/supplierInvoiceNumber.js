/**
 * SUPNUM — a beszállító számlaszáma a jogi azonosító, nem a belső sorszám.
 *
 * AZ ESET: a felület Számlaszám oszlopa a rendszer SAJÁT sorszámát mutatta
 * (`INV-000012`), nem a beszállítóét. Élesben 22 számlából 8-on a belső sorszám állt a
 * valódi szám helyett — azokat a könyvelő nem tudja azonosítani, a szállító nem tud
 * rájuk hivatkozni, és nem derül ki, ha ugyanaz kétszer került be.
 *
 * A SUPNUM-03 a legfontosabb: a duplikáció kétszer könyvelt költséget jelent.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'SUPNUM',
  title: 'beszállítói számlaszám · kötelező · duplikáció-védelem · a jelzés kivétel',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const kh = (await query("SELECT id FROM cost_centers LIMIT 1")).rows[0];
    return { t, kh };
  },

  cases: [
    {
      id: 'SUPNUM-01',
      name: 'a beszállítói számlaszám KÖTELEZŐ — nélküle nem rögzíthető',
      expected: { elutasitva: 400, megmondja_miert: true },
      hint: 'a belső sorszám erre nem alkalmas: azt mi adjuk, két bevitelnél kettő lesz',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'SUPNUM Szállító Kft', amount: 10000, invoice_date: '2026-09-22',
          cost_center_id: s.kh.id } });
        return {
          elutasitva: r.status,
          megmondja_miert: /számlaszáma kötelező/i.test(r.body?.message || ''),
        };
      },
    },
    {
      id: 'SUPNUM-02',
      name: 'megadva rögzíthető, és a beszállítói szám ELKÜLÖNÜL a belső sorszámtól',
      expected: { created: 201, szallitoi: 'SUP-2026/001', van_belso: true, kulonbozik: true },
      hint: 'a belső sorszám hivatkozási pont marad, de másodlagos',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'SUPNUM Szállító Kft', amount: 10000, invoice_date: '2026-09-22',
          cost_center_id: s.kh.id, supplier_invoice_number: 'SUP-2026/001' } });
        s.elso = r.body?.data?.invoice?.id || r.body?.data?.id;
        const i = (await query(
          'SELECT invoice_number, supplier_invoice_number FROM invoices WHERE id=$1', [s.elso])).rows[0];
        return {
          created: r.status,
          szallitoi: i?.supplier_invoice_number,
          van_belso: /^INV-\d+$/.test(i?.invoice_number || ''),
          kulonbozik: i?.invoice_number !== i?.supplier_invoice_number,
        };
      },
    },
    {
      id: 'SUPNUM-03',
      name: '⚠️ DUPLIKÁCIÓ: ugyanaz a szállító + számlaszám másodszor NEM megy be',
      expected: { elutasitva: 409, megmondja_melyik: true, csak_egy_sor: 1 },
      hint: 'a kétszer bevitt számla kétszer könyvelt költség',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'SUPNUM Szállító Kft', amount: 10000, invoice_date: '2026-09-25',
          cost_center_id: s.kh.id, supplier_invoice_number: 'SUP-2026/001' } });
        const db = (await query(
          `SELECT count(*)::int AS n FROM invoices
            WHERE lower(btrim(vendor_name))='supnum szállító kft'
              AND btrim(supplier_invoice_number)='SUP-2026/001' AND deleted_at IS NULL`)).rows[0];
        return {
          elutasitva: r.status,
          // a hibaüzenet mondja meg, MELYIK jegyzék alatt van már bent
          megmondja_melyik: /INV-\d+/.test(r.body?.message || ''),
          csak_egy_sor: db.n,
        };
      },
    },
    {
      id: 'SUPNUM-04',
      name: 'a kis-nagybetű és a szóköz nem kerüli meg a védelmet',
      expected: { elutasitva: 409 },
      hint: '" sup-2026/001 " ugyanaz a számla',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: '  supnum szállító kft  ', amount: 10000, invoice_date: '2026-09-26',
          cost_center_id: s.kh.id, supplier_invoice_number: '  SUP-2026/001  ' } });
        return { elutasitva: r.status };
      },
    },
    {
      id: 'SUPNUM-05',
      name: 'BÉRBEADÓI REZSI-JELZÉS a kivétel: ott nincs szállítói számla',
      expected: { created: 201, ures_szam: true },
      hint: 'a közüzemi szerződés a bérbeadó nevén van — a mi nevünkre számla nem keletkezik',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'SUPNUM Bérbeadó (jelzés)', amount: 12420, invoice_date: '2026-09-22',
          cost_center_id: s.kh.id, is_landlord_notice: true } });
        const i = (await query(
          'SELECT supplier_invoice_number FROM invoices WHERE id=$1',
          [r.body?.data?.invoice?.id || r.body?.data?.id])).rows[0];
        return { created: r.status, ures_szam: !i?.supplier_invoice_number };
      },
    },
    {
      id: 'SUPNUM-06',
      name: 'két KÜLÖNBÖZŐ szállító azonos számlaszáma megengedett',
      expected: { created: 201 },
      hint: 'a számlaszám csak a kiállítón belül egyedi',
      run: async (ctx, s) => {
        const r = await http.post('/invoices', { token: s.t, body: {
          vendor_name: 'SUPNUM Másik Kft', amount: 5000, invoice_date: '2026-09-22',
          cost_center_id: s.kh.id, supplier_invoice_number: 'SUP-2026/001' } });
        return { created: r.status };
      },
    },
  ],
};
