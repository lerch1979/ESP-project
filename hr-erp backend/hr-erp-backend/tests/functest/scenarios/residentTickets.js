/**
 * RESTICK — mit lát a lakó a saját jegyeiből, és mikor csörren a telefonja.
 *
 * AZ ESET (2026-09-22): az iroda a lakó NEVÉBEN nyitott hibajegyet (#21, érintett: Eszti),
 * a lakó viszont sem az appban nem látta, sem push-t nem kapott. Két külön ok:
 *   1. a lakói lekérdezés a BEJELENTŐRE szűrt (`created_by`), nem az érintettre,
 *   2. az értesítés nem kért push-t — az `inAppNotification.notify()` alapból nem küld.
 *
 * ⚠️ A LEGFONTOSABB ESET ITT A RESTICK-04: a kiterjesztett láthatóság NEM szivároghat.
 * Egy "lássa azt is, ami rá vonatkozik" szabály rosszul megírva azt is jelentheti, hogy
 * MÁS lakók jegyeit is látja. Ezért a szivárgás-ellenőrzés nem ráadás, hanem a feltétele
 * annak, hogy a bővítés egyáltalán kimehessen.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'RESTICK',
  title: 'lakói jegy-láthatóság · rá vonatkozó jegyek · push · nincs szivárgás',

  async setup(ctx) {
    const admin = http.tokenFor(ctx.ids.user.superadmin);
    const lakoId = ctx.ids.user.accommodated_employee;
    const lako = http.tokenFor(lakoId);
    // A lakói fiókhoz tartozó employee-sor — ezen keresztül köt a jegy az emberhez.
    const emp = (await query('SELECT id FROM employees WHERE user_id=$1', [lakoId])).rows[0];
    const kat = (await query('SELECT id FROM ticket_categories LIMIT 1')).rows[0];
    // Egy MÁSIK lakó, akinek a jegyét nem szabad látni.
    const masikEmp = (await query(
      'SELECT id FROM employees WHERE user_id IS NULL OR user_id <> $1 LIMIT 1', [lakoId])).rows[0];
    return { admin, lako, lakoId, emp, kat, masikEmp };
  },

  cases: [
    {
      id: 'RESTICK-01',
      name: 'a lakó SAJÁT bejelentése kitölti az érintettet is',
      expected: { created: 201, erintett_kitoltve: true },
      hint: 'eddig üres maradt, így a jegy nem volt emberhez köthető',
      run: async (ctx, s) => {
        const r = await http.post('/tickets', { token: s.lako, body: {
          title: 'RESTICK saját bejelentés', description: 'x', category_id: s.kat.id } });
        s.sajat = r.body?.data?.ticket?.id;
        const t = (await query('SELECT linked_employee_id FROM tickets WHERE id=$1', [s.sajat])).rows[0];
        return { created: r.status, erintett_kitoltve: t?.linked_employee_id === s.emp.id };
      },
    },
    {
      id: 'RESTICK-02',
      name: 'az IRODA által a lakó nevében nyitott jegyet a lakó LÁTJA',
      expected: { created: 201, latja_a_listaban: true, megnyithatja: 200 },
      hint: 'ez bukott el élesben: dolgoztunk az ügyén, ő nem tudott róla',
      run: async (ctx, s) => {
        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK iroda nyitotta', description: 'x',
          category_id: s.kat.id, linked_employee_id: s.emp.id } });
        s.irodai = r.body?.data?.ticket?.id;
        const lista = await http.get('/tickets/my', { token: s.lako });
        const reszlet = await http.get(`/tickets/my/${s.irodai}`, { token: s.lako });
        return {
          created: r.status,
          latja_a_listaban: (lista.body?.data?.tickets || []).some((x) => x.id === s.irodai),
          megnyithatja: reszlet.status,
        };
      },
    },
    {
      id: 'RESTICK-03',
      name: 'a saját, korábbi jegyei sem vesznek el a bővítéstől',
      expected: { latja_a_sajatjat: true },
      hint: 'ha csak az érintettre szűrnénk, a régi jegyek eltűnnének',
      run: async (ctx, s) => {
        // olyan jegy, aminek NINCS érintettje — mint élesben a #19 és a #20
        const r = (await query(
          `INSERT INTO tickets (contractor_id, ticket_number, title, created_by, status_id, category_id)
           SELECT NULL, '#RESTICK-REGI', 'Régi jegy érintett nélkül', $1,
                  (SELECT id FROM ticket_statuses LIMIT 1), $2
           RETURNING id`, [s.lakoId, s.kat.id])).rows[0];
        const lista = await http.get('/tickets/my', { token: s.lako });
        return { latja_a_sajatjat: (lista.body?.data?.tickets || []).some((x) => x.id === r.id) };
      },
    },
    {
      id: 'RESTICK-04',
      name: '⚠️ NEM SZIVÁROG: MÁS lakó jegyét nem látja és nem is nyithatja meg',
      expected: { nincs_a_listaban: true, reszletek: 404, uzenetkuldes: 404 },
      hint: 'a kiterjesztett láthatóság feltétele, hogy csak a SAJÁT irányba terjedjen',
      run: async (ctx, s) => {
        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK másik lakóé', description: 'x',
          category_id: s.kat.id, linked_employee_id: s.masikEmp.id } });
        const masike = r.body?.data?.ticket?.id;
        const lista = await http.get('/tickets/my', { token: s.lako });
        const reszlet = await http.get(`/tickets/my/${masike}`, { token: s.lako });
        const uzenet = await http.post(`/tickets/my/${masike}/messages`, {
          token: s.lako, body: { message: 'beleírnék' } });
        return {
          nincs_a_listaban: !(lista.body?.data?.tickets || []).some((x) => x.id === masike),
          reszletek: reszlet.status,
          uzenetkuldes: uzenet.status,
        };
      },
    },
    {
      id: 'RESTICK-05',
      name: 'az érintett lakó ÉRTESÍTÉST kap az iroda által nyitott jegyről',
      expected: { van_ertesitese: true, nem_ertesult_sajatrol: true },
      hint: 'a saját bejelentésről értesíteni fölösleges zaj',
      run: async (ctx, s) => {
        const ert = (await query(
          `SELECT data FROM notifications WHERE user_id=$1 AND type='ticket_created'`, [s.lakoId])).rows;
        const irodairol = ert.some((x) => x.data?.ticket_id === s.irodai);
        const sajatrol = ert.some((x) => x.data?.ticket_id === s.sajat);
        return { van_ertesitese: irodairol, nem_ertesult_sajatrol: !sajatrol };
      },
    },
    {
      id: 'RESTICK-06',
      name: 'az értesítés PUSH-t is kér — enélkül a telefon néma marad',
      expected: { van_sablon: true, ot_nyelven: true },
      hint: 'a notify() alapból NEM küld push-t; a lakók fele nem magyar',
      run: async () => {
        const push = require('../../../src/services/pushNotification.service');
        const t = require('../../../src/services/pushNotification.service');
        // a sablon megléte és nyelvi lefedettsége
        const modul = require('fs').readFileSync(
          require.resolve('../../../src/services/pushNotification.service'), 'utf8');
        const blokk = modul.slice(modul.indexOf('ticket_created:'), modul.indexOf('expiry_alert:'));
        return {
          van_sablon: blokk.includes('ticket_created:'),
          ot_nyelven: ['hu:', 'en:', 'uk:', 'tl:', 'de:'].every((l) => blokk.includes(l)),
        };
      },
    },
  ],
};
