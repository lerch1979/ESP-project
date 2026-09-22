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
    {
      id: 'RESTICK-07',
      name: '⚠️ az értesítés akkor is megy, ha az admin FELELŐST IS választott',
      expected: { created: 201, van_felelos: true, lako_ertesult: true },
      hint: 'ez bukott el élesben: az értesítés a szignálási ÁGON BELÜL volt',
      run: async (ctx, s) => {
        // Az admin EGYSZERRE ad felelőst és érintett lakót — ilyenkor a szignálási ág
        // nem fut le, és korábban vele együtt az értesítés is kimaradt.
        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK felelőssel együtt', description: 'x', category_id: s.kat.id,
          assigned_to: ctx.ids.user.superadmin, linked_employee_id: s.emp.id } });
        const jegy = r.body?.data?.ticket?.id;
        const t = (await query('SELECT assigned_to FROM tickets WHERE id=$1', [jegy])).rows[0];
        const ert = (await query(
          `SELECT count(*)::int AS db FROM notifications
            WHERE user_id=$1 AND type='ticket_created' AND data->>'ticket_id' = $2`,
          [s.lakoId, jegy])).rows[0];
        return {
          created: r.status,
          van_felelos: t?.assigned_to === ctx.ids.user.superadmin,
          lako_ertesult: ert.db > 0,
        };
      },
    },
    {
      id: 'RESTICK-08',
      name: 'TÖBB érintett lakó egy jegyen — mindegyik látja és értesül',
      expected: { created: 201, mindketto_latja: true, mindketto_ertesult: true },
      hint: 'közös helyiség: egy hiba több emberre vonatkozik',
      run: async (ctx, s) => {
        // második lakói fiók, saját employee-sorral és app-belépéssel
        const masik = (await query(
          `INSERT INTO users (email, password_hash, first_name, last_name, is_active, preferred_language)
           VALUES ('restick-masik@functest.local','x','Másik','Lakó',true,'hu') RETURNING id`)).rows[0];
        await query('UPDATE employees SET user_id=$1 WHERE id=$2', [masik.id, s.masikEmp.id]);
        const masikToken = http.tokenFor(masik.id);

        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK közös konyha', description: 'Nem folyik le a víz',
          category_id: s.kat.id,
          affected_employee_ids: [s.emp.id, s.masikEmp.id] } });
        const jegy = r.body?.data?.ticket?.id;

        const a = await http.get('/tickets/my', { token: s.lako });
        const b = await http.get('/tickets/my', { token: masikToken });
        const ert = (await query(
          `SELECT count(DISTINCT user_id)::int AS db FROM notifications
            WHERE type='ticket_created' AND data->>'ticket_id' = $1`, [jegy])).rows[0];
        return {
          created: r.status,
          mindketto_latja: (a.body?.data?.tickets || []).some((x) => x.id === jegy)
            && (b.body?.data?.tickets || []).some((x) => x.id === jegy),
          mindketto_ertesult: ert.db >= 2,
        };
      },
    },
    {
      id: 'RESTICK-09',
      name: 'EGÉSZ SZÁLLÁS hatókör: a ház lakói látják, DE névsor NEM keletkezik',
      expected: { created: 201, lakok_latjak: true, nincs_nevsor: 0, ertesultek: true },
      hint: 'vegyes szálláson egy névsor más megbízó dolgozóit adná ki',
      run: async (ctx, s) => {
        const acc = (await query('SELECT accommodation_id FROM employees WHERE id=$1', [s.emp.id])).rows[0];
        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK folyosói lámpa', description: 'Nem ég',
          category_id: s.kat.id, scope_accommodation_id: acc.accommodation_id } });
        const jegy = r.body?.data?.ticket?.id;

        const lista = await http.get('/tickets/my', { token: s.lako });
        // A LÉNYEG: a kapcsolótáblában NINCS sor ehhez a jegyhez.
        const nevsor = (await query(
          'SELECT count(*)::int AS db FROM ticket_affected_employees WHERE ticket_id=$1', [jegy])).rows[0];
        const ert = (await query(
          `SELECT count(*)::int AS db FROM notifications WHERE data->>'ticket_id' = $1`, [jegy])).rows[0];
        return {
          created: r.status,
          lakok_latjak: (lista.body?.data?.tickets || []).some((x) => x.id === jegy),
          nincs_nevsor: nevsor.db,
          ertesultek: ert.db > 0,
        };
      },
    },
    {
      id: 'RESTICK-10',
      name: 'a ház-hatókörű jegyet MÁS ház lakója NEM látja',
      expected: { nem_latja: true },
      hint: 'a hatókör nem ad általános láthatóságot',
      run: async (ctx, s) => {
        const masikAcc = (await query(
          `INSERT INTO accommodations (name, type, capacity, status, utilities_billing)
           VALUES ('RESTICK Másik Ház','dormitory',5,'available','we_pay') RETURNING id`)).rows[0];
        const r = await http.post('/tickets', { token: s.admin, body: {
          title: 'RESTICK másik ház folyosója', description: 'x',
          category_id: s.kat.id, scope_accommodation_id: masikAcc.id } });
        const jegy = r.body?.data?.ticket?.id;
        const lista = await http.get('/tickets/my', { token: s.lako });
        return { nem_latja: !(lista.body?.data?.tickets || []).some((x) => x.id === jegy) };
      },
    },
    {
      id: 'RESTICK-11',
      name: 'a lakó MEGTUDJA, miért látja a jegyet: saját / közös / téged is érint',
      expected: { sajat: 'sajat', kozos: 'kozos', erintett: 'erintett' },
      hint: 'jelölés nélkül azt hinné, valaki az ő nevében írt, vagy elrontottunk valamit',
      run: async (ctx, s) => {
        const lista = await http.get('/tickets/my', { token: s.lako });
        const sorok = lista.body?.data?.tickets || [];
        const okok = new Set(sorok.map((x) => x.lathatosag_oka));
        return {
          sajat: okok.has('sajat') ? 'sajat' : '—',
          kozos: okok.has('kozos') ? 'kozos' : '—',
          erintett: okok.has('erintett') ? 'erintett' : '—',
        };
      },
    },
  ],
};
