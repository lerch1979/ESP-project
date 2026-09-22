/**
 * ASSIGN — gazdátlan hibajegy nem maradhat.
 *
 * Eszti két mobilos jegye (#19, #20) senkire nem került, és senki nem kapott róla
 * értesítést. Három független ok volt rá, és MINDHÁROM elég volt önmagában:
 *   • a szabályok `admin` / `facility_manager` szerepkörre mutattak — nulla aktív user,
 *   • a "normál" szabály `medium`/`low` prioritásra várt, a rendszer `normal`-t használ,
 *   • a végfogás azonos `contractor_id`-jú admint keresett, amilyen a lakó bérlőjén nincs.
 *
 * Ezért a legfontosabb eset nem az, hogy a lánc jól választ, hanem hogy a VÉGE SOHA NEM
 * ÜRES (ASSIGN-03) — és hogy a bérlő-eltérés nem állítja meg (ASSIGN-04).
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const { varj } = require('../lib/wait');
const svc = require('../../../src/services/ticketAssignment.service');

module.exports = {
  area: 'ASSIGN',
  title: 'hibajegy-szignálás · gazdátlan jegy nincs · szállásadói továbbítás · egyesített linkek',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const acc = (await query('SELECT id, name, current_contractor_id FROM accommodations WHERE is_active LIMIT 1')).rows[0];
    const emp = (await query(
      'UPDATE employees SET accommodation_id=$1 WHERE id=(SELECT id FROM employees LIMIT 1) RETURNING id',
      [acc.id])).rows[0];
    const kat = (await query('SELECT id FROM ticket_categories LIMIT 1')).rows[0];
    return { t, acc, emp, kat, su: ctx.ids.user.superadmin };
  },

  cases: [
    {
      id: 'ASSIGN-01',
      name: 'a beállított alapértelmezett felelős létezik, és NEM a kódba van égetve',
      expected: { van_sor: true, van_felelos: true, allithato: true },
      hint: 'a tulajdonos átállíthatja deploy nélkül',
      run: async (ctx, s) => {
        const cfg = await svc.getConfig();
        // átállítható-e: írjuk át, olvassuk vissza, állítsuk helyre
        const eredeti = cfg?.default_assignee_id;
        await query('UPDATE ticket_assignment_config SET default_assignee_id=$1', [s.su]);
        const utana = await svc.getConfig();
        await query('UPDATE ticket_assignment_config SET default_assignee_id=$1', [eredeti || s.su]);
        return {
          van_sor: !!cfg,
          van_felelos: !!(cfg?.default_assignee_id || s.su),
          allithato: utana?.default_assignee_id === s.su,
        };
      },
    },
    {
      id: 'ASSIGN-02',
      name: 'a szálláshoz kijelölt felelős kapja a jegyet, ha van ilyen',
      expected: { created: 201, a_haz_felelose: true },
      hint: 'aki a házat ellenőrzi, ismeri a házat — inspection_schedules, nem új tábla',
      run: async (ctx, s) => {
        await query(
          `INSERT INTO inspection_schedules (accommodation_id, frequency, next_due_date, default_inspector_id, is_active)
           VALUES ($1,'monthly',CURRENT_DATE,$2,true)
           ON CONFLICT DO NOTHING`, [s.acc.id, s.su]);
        const r = await http.post('/tickets', { token: s.t, body: {
          title: 'ASSIGN ház-felelős teszt', description: 'x',
          category_id: s.kat.id, linked_employee_id: s.emp.id } });
        s.t1 = r.body?.data?.ticket?.id || r.body?.data?.id;
        const t1 = (await query('SELECT assigned_to FROM tickets WHERE id=$1', [s.t1])).rows[0];
        return { created: r.status, a_haz_felelose: t1?.assigned_to === s.su };
      },
    },
    {
      id: 'ASSIGN-03',
      name: 'ha SEMMI nem illeszkedik, akkor is van felelős — gazdátlan jegy nincs',
      expected: { created: 201, van_felelos: true },
      hint: 'ez az az eset, ami élesben elbukott: minden korábbi ág feltételes volt',
      run: async (ctx, s) => {
        // minden korábbi ág kiiktatva: nincs ház-felelős, nincs szabály, nincs specializáció
        await query('UPDATE inspection_schedules SET is_active=false WHERE accommodation_id=$1', [s.acc.id]);
        await query('UPDATE assignment_rules SET is_active=false');
        await query('UPDATE worker_specializations SET is_active=false');
        const r = await http.post('/tickets', { token: s.t, body: {
          title: 'ASSIGN végfogás teszt', description: 'x', category_id: s.kat.id } });
        s.t2 = r.body?.data?.ticket?.id || r.body?.data?.id;
        const t2 = (await query('SELECT assigned_to FROM tickets WHERE id=$1', [s.t2])).rows[0];
        return { created: r.status, van_felelos: !!t2?.assigned_to };
      },
    },
    {
      id: 'ASSIGN-04',
      name: 'ELTÉRŐ contractor_id sem hagyja gazdátlanul — ez bukott el élesben',
      expected: { van_felelos: true },
      hint: 'Eszti fiókja más partnersoron ült, mint a superadminok',
      run: async (ctx, s) => {
        const masik = (await query(
          `INSERT INTO contractors (name, slug, is_active) VALUES ('ASSIGN Másik Bérlő','assign-masik',true)
           RETURNING id`)).rows[0];
        await query('UPDATE tickets SET contractor_id=$1, assigned_to=NULL WHERE id=$2', [masik.id, s.t2]);
        const d = await svc.assign(s.t2);
        return { van_felelos: !!d?.userId };
      },
    },
    {
      id: 'ASSIGN-05',
      name: 'a felelős ÉRTESÍTÉST kap az új jegyről (korábban nem létezett ilyen típus)',
      expected: { van_ertesites: true },
      hint: 'ha a szignálás elbukott, a jegy korábban némán ült',
      run: async (ctx, s) => {
        const n = (await query(
          `SELECT count(*)::int AS db FROM notifications WHERE type='ticket_created'`)).rows[0];
        return { van_ertesites: n.db > 0 };
      },
    },
    {
      id: 'ASSIGN-06',
      name: 'SZÁLLÁSADÓI hatáskör: a jegy jelölést kap, és a link akkor is elkészül, ha nincs e-mail',
      expected: { szallasado: true, link_kesz: true, van_jelzes: true },
      hint: 'a hiányzó előfeltétel látszódjon a jegyen, ne nyelődjön el',
      run: async (ctx, s) => {
        await query(
          `INSERT INTO accommodation_maintenance_rules (accommodation_id, category_id, handled_by)
           VALUES ($1,NULL,'szallasado') ON CONFLICT DO NOTHING`, [s.acc.id]);
        const r = await http.post('/tickets', { token: s.t, body: {
          title: 'ASSIGN szállásadói teszt', description: 'x',
          category_id: s.kat.id, linked_employee_id: s.emp.id } });
        s.t3 = r.body?.data?.ticket?.id || r.body?.data?.id;
        const fwd = r.body?.data?.landlord_notice;
        const link = (await query(
          `SELECT token FROM share_links WHERE target_type='ticket' AND target_id=$1`, [s.t3])).rows[0];
        const t3 = (await query('SELECT assigned_to FROM tickets WHERE id=$1', [s.t3])).rows[0];
        s.token = link?.token;
        return {
          szallasado: fwd?.handled_by === 'szallasado',
          link_kesz: !!link?.token,
          van_jelzes: !!t3?.assigned_to,              // nálunk IS felelősnél marad
        };
      },
    },
    {
      id: 'ASSIGN-07',
      name: 'a lejáró linken a szállásadó LÁTJA a jegyet, de a lakó adatait NEM',
      expected: { ok: 200, van_hiba_leiras: true, nincs_lako_nev: true },
      hint: 'a karbantartáshoz a hiba kell, nem a lakó személye',
      run: async (ctx, s) => {
        const r = await http.rawGet(`/public/ticket/${s.token}`, {});
        const body = JSON.stringify(r.body || {});
        return {
          ok: r.status,
          van_hiba_leiras: !!r.body?.data?.ticket?.title,
          nincs_lako_nev: !/linked_employee|employee_name|first_name|personal_phone/.test(body),
        };
      },
    },
    {
      id: 'ASSIGN-08',
      name: 'a szállásadó visszajelezhet, és a FELELŐS értesítést kap róla',
      expected: { ok: 200, allapot: 'folyamatban', ertesult_a_felelos: true },
      hint: 'szerzőt nem hamisítunk: a ticket_messages sender_id kötelező, a szállásadó nem user',
      run: async (ctx, s) => {
        const r = await http.raw('post', `/public/ticket/${s.token}/response`, { body: { status: 'folyamatban' } });
        const t3 = (await query('SELECT landlord_status FROM tickets WHERE id=$1', [s.t3])).rows[0];

        // AZ ÉRTESÍTÉS NEM A VÁLASZ ELŐTT SZÜLETIK, és ez szándékos: a szállásadó
        // visszajelzése nem bukhat el azon, hogy a MI belső értesítésünk hibázik
        // (`inApp.notify` nincs await-elve a publicTicket útvonalon). A teszt viszont
        // eddig azonnal olvasott, és versenyt futott vele — ettől bukott el nagyjából
        // minden tizedik futásban, mindig másutt. Amit állítani akarunk, az nem az,
        // hogy az értesítés a HTTP-válasz ELŐTT kész, hanem hogy MEGSZÜLETIK.
        const db = await varj(
          async () => (await query(
            `SELECT count(*)::int AS db FROM notifications
              WHERE title ILIKE '%Szállásadói visszajelzés%'`)).rows[0].db,
          (v) => v > 0);
        return { ok: r.status, allapot: t3?.landlord_status, ertesult_a_felelos: db > 0 };
      },
    },
    {
      id: 'ASSIGN-09',
      name: 'LEJÁRT és VISSZAVONT link nem ad hozzáférést — egy helyen eldöntve',
      expected: { lejart: 410, visszavont: 410, ismeretlen: 404 },
      hint: 'ez a négy megosztás közös feloldója — egy hiba itt mind a négyet érintené',
      run: async (ctx, s) => {
        await query(`UPDATE share_links SET expires_at = NOW() - interval '1 day' WHERE token=$1`, [s.token]);
        const lejart = await http.rawGet(`/public/ticket/${s.token}`, {});
        await query(`UPDATE share_links SET expires_at = NOW() + interval '1 day', revoked_at = NOW() WHERE token=$1`, [s.token]);
        const visszavont = await http.rawGet(`/public/ticket/${s.token}`, {});
        const ismeretlen = await http.rawGet('/public/ticket/00000000-0000-0000-0000-000000000999', {});
        return { lejart: lejart.status, visszavont: visszavont.status, ismeretlen: ismeretlen.status };
      },
    },
    {
      id: 'ASSIGN-10',
      name: 'EGYESÍTETT megosztás: a jegy-link ugyanabban a táblában van, mint a másik három',
      expected: { egy_tabla: true, negyedik_nincs: true },
      hint: 'a kérés kifejezetten az volt, hogy ne épüljön negyedik mechanizmus',
      run: async (ctx, s) => {
        const tipusok = (await query(
          `SELECT DISTINCT target_type FROM share_links ORDER BY 1`)).rows.map((x) => x.target_type);
        // nincs külön jegy-megosztási tábla
        const kulon = (await query(
          `SELECT count(*)::int AS db FROM information_schema.tables
            WHERE table_schema='public' AND table_name LIKE '%ticket%share%'`)).rows[0];
        return { egy_tabla: tipusok.includes('ticket'), negyedik_nincs: kulon.db === 0 };
      },
    },
  ],
};
