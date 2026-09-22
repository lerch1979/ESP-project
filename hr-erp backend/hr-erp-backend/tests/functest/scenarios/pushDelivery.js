/**
 * PUSH — a kézbesítés ellenőrzése: az "elküldve" nem lehet hamis siker.
 *
 * AZ ESET (2026-09-22): "a push nem érkezik meg", miközben a rendszer `{"sent":1}`-et
 * jelentett. Kiderült, hogy a szolgáltatás CSAK az Expo PUSH TICKET-jét nézte — az
 * viszont mindössze annyit mond, hogy az Expo ÁTVETTE a küldést. A tényleges kézbesítés
 * a RECEIPT-ben van, amit soha nem kérdeztünk le.
 *
 * Az akkori hiba végül máshol volt, de a vakfolt valódi: ha az APNs ELUTASÍTANÁ a
 * küldést, a rendszer akkor is sikert jelentene, és senki nem tudná meg. Ez a terület
 * azt őrzi, hogy a két fogalom külön maradjon.
 */
const { query } = require('../../../src/database/connection');
const push = require('../../../src/services/pushNotification.service');

module.exports = {
  area: 'PUSH',
  title: 'push-kézbesítés · az átvétel nem kézbesítés · a hiba nem tűnhet el',

  async setup(ctx) {
    const user = ctx.ids.user.accommodated_employee;
    await query('DELETE FROM push_deliveries');
    return { user };
  },

  cases: [
    {
      id: 'PUSH-01',
      name: 'a küldés NYOMOT hagy — enélkül a nyugta később nem kérdezhető le',
      expected: { van_sor: true, allapot: 'atveve', van_ticket_id: true },
      hint: 'a ticket-azonosító csak a válaszban létezik; ha nem tároljuk, elveszik',
      run: async (ctx, s) => {
        await query(
          `INSERT INTO push_deliveries (user_id, expo_push_token, ticket_id, notification_type, status)
           VALUES ($1,'ExponentPushToken[PUSH-TESZT]','tick-1','ticket_created','atveve')`,
          [s.user]);
        const r = (await query(
          `SELECT status, ticket_id FROM push_deliveries WHERE ticket_id='tick-1'`)).rows[0];
        return { van_sor: !!r, allapot: r?.status, van_ticket_id: !!r?.ticket_id };
      },
    },
    {
      id: 'PUSH-02',
      name: '⚠️ az ÁTVÉTEL és a KÉZBESÍTÉS két külön állapot',
      expected: { harom_allapot: true, alapertelmezes: 'atveve' },
      hint: 'a kettő összemosása rejtette el, hogy egy push nem ért célba',
      run: async () => {
        const c = (await query(
          `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
            WHERE conname='push_deliveries_status_chk'`)).rows[0];
        const alap = (await query(
          `SELECT column_default FROM information_schema.columns
            WHERE table_name='push_deliveries' AND column_name='status'`)).rows[0];
        return {
          harom_allapot: ['atveve', 'kezbesitve', 'hibas'].every((x) => c.d.includes(x)),
          alapertelmezes: String(alap.column_default || '').includes('atveve') ? 'atveve' : '?',
        };
      },
    },
    {
      id: 'PUSH-03',
      name: 'a HIBÁS nyugta nem tűnik el: kód és üzenet is megmarad',
      expected: { allapot: 'hibas', van_kod: 'InvalidCredentials', van_uzenet: true },
      hint: 'sorozatos hiba esetén ez mutatja meg, hogy az APNs-hitelesítés hiányzik',
      run: async (ctx, s) => {
        await query(
          `INSERT INTO push_deliveries (user_id, expo_push_token, ticket_id, status, error_code, error_message, checked_at)
           VALUES ($1,'ExponentPushToken[PUSH-HIBA]','tick-2','hibas','InvalidCredentials',
                   'Could not find APNs credentials', NOW())`, [s.user]);
        const r = (await query(
          `SELECT status, error_code, error_message FROM push_deliveries WHERE ticket_id='tick-2'`)).rows[0];
        return { allapot: r?.status, van_kod: r?.error_code, van_uzenet: !!r?.error_message };
      },
    },
    {
      id: 'PUSH-04',
      name: 'az ÁLLAPOT-ÖSSZESÍTŐ külön mutatja a hibásat, és megnevezi a leggyakoribb okot',
      expected: { ok: true, kulon_hibas: 1, megnevezi: 'InvalidCredentials' },
      hint: 'egy összevont "elküldve" szám elrejtené a hibát',
      run: async () => {
        const st = await push.deliveryStats({ days: 7 });
        return {
          ok: Number.isFinite(st.atveve) && Number.isFinite(st.kezbesitve) && Number.isFinite(st.hibas),
          kulon_hibas: st.hibas,
          megnevezi: st.top_hibak?.[0]?.error_code,
        };
      },
    },
    {
      id: 'PUSH-05',
      name: 'a nyugta-lekérdező a FRISS sorokat kihagyja — az Expónak idő kell',
      expected: { frisset_kihagyja: 0 },
      hint: 'azonnal lekérdezve üres nyugtát kapnánk, és tévesen hibásnak hinnénk',
      run: async (ctx, s) => {
        await query('DELETE FROM push_deliveries');
        await query(
          `INSERT INTO push_deliveries (user_id, expo_push_token, ticket_id, status)
           VALUES ($1,'ExponentPushToken[PUSH-FRISS]','tick-3','atveve')`, [s.user]);
        // minAgeSeconds=15, a sor most keletkezett → nem szabad hozzányúlnia
        const r = await push.checkReceipts({ minAgeSeconds: 15 });
        return { frisset_kihagyja: r.checked };
      },
    },
    {
      id: 'PUSH-06',
      name: 'a visszatérés megkülönbözteti az ÁTVETTET az elutasítottól',
      expected: { van_accepted: true, van_rejected: true },
      hint: '"sent" önmagában félrevezető volt — most kimondja, mit jelent',
      run: async () => {
        const modul = require('fs').readFileSync(
          require.resolve('../../../src/services/pushNotification.service'), 'utf8');
        return {
          van_accepted: modul.includes('accepted:'),
          van_rejected: modul.includes('rejected:'),
        };
      },
    },
  ],
};
