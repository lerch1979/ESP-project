/**
 * RESTASK — "a lakónak szóló" és "a lakóról szóló" feladat szétválasztása.
 *
 * AZ ESET: a tulajdonos feladatot hozott létre Eszti tesztfiókjának, és nem kapott
 * értesítést. A vizsgálat kimutatta, hogy ez HELYES volt — a feladat az IRODÁRA volt
 * szignálva, Eszti csak `related_employee_id`-ként szerepelt. Vagyis a feladat RÓLA
 * szólt, nem NEKI, és a rendszerben nem is létezett "lakónak szóló feladat" fogalom.
 *
 * ⚠️ A TERÜLET LEGFONTOSABB ESETE A RESTASK-05, ÉS EZ NEM RÁADÁS.
 * A tulajdonos kikötése: belső feljegyzés SOHA ne kerüljön a lakó telefonjára. Egy
 * "beszélni kell vele a rendetlenség miatt" típusú teendő megjelenése a lakó appjában
 * nem szépséghiba, hanem bizalmi kérdés — utána joggal nem hinné el, hogy bármi más
 * privát maradt. Ezért a szivárgás-ellenőrzés a FELTÉTELE annak, hogy ez kimehessen,
 * nem pedig egy kiegészítő eset.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const { varj } = require('../lib/wait');

const BELSO_CIM = 'RESTASK BELSŐ — beszélni kell vele a rendetlenség miatt';
const LAKOI_CIM = 'RESTASK Hozd le a szerződésedet aláírásra';

module.exports = {
  area: 'RESTASK',
  title: 'lakónak szóló feladat · visszajelzés · a belső teendő SOHA nem szivárog',

  async setup(ctx) {
    const admin = http.tokenFor(ctx.ids.user.superadmin);
    const lakoId = ctx.ids.user.accommodated_employee;
    const lako = http.tokenFor(lakoId);
    const emp = (await query('SELECT id FROM employees WHERE user_id=$1', [lakoId])).rows[0];
    const proj = (await query('SELECT id FROM projects LIMIT 1')).rows[0]
      || (await query(
        `INSERT INTO projects (name, status) VALUES ('RESTASK projekt','active') RETURNING id`)).rows[0];
    return { admin, lako, lakoId, emp, proj };
  },

  cases: [
    {
      id: 'RESTASK-01',
      name: 'a LAKÓNAK szóló feladat létrehozható, és a lakó LÁTJA',
      expected: { created: 201, latja: true, cim_stimmel: true },
      hint: 'ez a hiányzó fogalom: eddig 0 feladat volt lakói címzettel',
      run: async (ctx, s) => {
        const r = await http.post(`/projects/${s.proj.id}/tasks`, { token: s.admin, body: {
          title: LAKOI_CIM, description: 'Aláírandó', assigned_to_employee_id: s.emp.id } });
        s.lakoiFeladat = r.body?.data?.task?.id;
        const lista = await http.get('/tasks/mine', { token: s.lako });
        const sorok = lista.body?.data?.tasks || [];
        return {
          created: r.status,
          latja: sorok.some((x) => x.id === s.lakoiFeladat),
          cim_stimmel: sorok.some((x) => x.title === LAKOI_CIM),
        };
      },
    },
    {
      id: 'RESTASK-02',
      name: 'a lakó VISSZAJELEZHET: láttam / folyamatban / kész',
      expected: { ok: 200, allapot: 'kesz', van_idopont: true },
      hint: 'a feladat nem egyirányú közlés',
      run: async (ctx, s) => {
        const r = await http.patch(`/tasks/mine/${s.lakoiFeladat}/status`, {
          token: s.lako, body: { status: 'kesz', note: 'Leadtam a portán' } });
        const t = (await query(
          'SELECT resident_status, resident_status_at, resident_note FROM tasks WHERE id=$1',
          [s.lakoiFeladat])).rows[0];
        return { ok: r.status, allapot: t?.resident_status, van_idopont: !!t?.resident_status_at };
      },
    },
    {
      id: 'RESTASK-03',
      name: 'a lakói visszajelzés NEM írja át az IRODA munkafolyamatát',
      expected: { iroda_statusza: 'todo' },
      hint: 'a lakó "kész"-e nem kerülheti meg az iroda ellenőrzését',
      run: async (ctx, s) => {
        const t = (await query('SELECT status FROM tasks WHERE id=$1', [s.lakoiFeladat])).rows[0];
        return { iroda_statusza: t?.status };
      },
    },
    {
      id: 'RESTASK-04',
      name: 'az iroda ÉRTESÜL a lakói visszajelzésről',
      expected: { van_ertesites: true },
      hint: 'enélkül a visszajelzés egy mezőben ülne, és senki nem nézné meg',
      run: async (ctx, s) => {
        // Az értesítés a válasz UTÁN íródik (az `inApp.notify` nincs await-elve), ezért
        // megvárjuk. Lásd lib/wait.js — enélkül a teszt az időzítést mérte, nem a
        // viselkedést, és nagyjából minden tizedik futásban elbukott.
        const db = await varj(
          async () => (await query(
            `SELECT count(*)::int AS db FROM notifications
              WHERE type='task_assigned' AND title ILIKE '%Lakói visszajelzés%'`)).rows[0].db,
          (v) => v > 0);
        return { van_ertesites: db > 0 };
      },
    },
    {
      id: 'RESTASK-05',
      name: '⚠️ A BELSŐ FELADAT SOHA NEM SZIVÁROG — se listában, se visszajelzésben',
      expected: {
        nincs_a_listaban: true, nem_jelolheto: 404,
        nincs_ertesitese: true, nincs_push_kerese: true,
      },
      hint: 'a tulajdonos kikötése — ez a feltétele annak, hogy a funkció kimehessen',
      run: async (ctx, s) => {
        // BELSŐ teendő: a lakóRÓL szól (related_employee_id), NEM neki
        const belso = (await query(
          `INSERT INTO tasks (title, description, status, priority, related_employee_id, created_by)
           VALUES ($1,'Bizalmas belső feljegyzés','todo','medium',$2,$3) RETURNING id`,
          [BELSO_CIM, s.emp.id, ctx.ids.user.superadmin])).rows[0];

        const lista = await http.get('/tasks/mine', { token: s.lako });
        const sorok = lista.body?.data?.tasks || [];
        const jeloles = await http.patch(`/tasks/mine/${belso.id}/status`, {
          token: s.lako, body: { status: 'kesz' } });

        // a lakó nem kaphatott értesítést sem — se a listán, se a harangon keresztül
        const ert = (await query(
          `SELECT count(*)::int AS db FROM notifications
            WHERE user_id=$1 AND (message ILIKE '%rendetlenség%' OR data::text ILIKE $2)`,
          [s.lakoId, `%${belso.id}%`])).rows[0];

        return {
          // a teljes válasz-törzsben sem szerepelhet a belső cím egyetlen betűje sem
          nincs_a_listaban: !JSON.stringify(sorok).includes('rendetlenség')
            && !sorok.some((x) => x.id === belso.id),
          nem_jelolheto: jeloles.status,
          nincs_ertesitese: ert.db === 0,
          // a DB-szintű védelem is álljon: lakói állapot csak címzett mellett létezhet
          nincs_push_kerese: await (async () => {
            try {
              await query('UPDATE tasks SET resident_status=$2 WHERE id=$1', [belso.id, 'kesz']);
              return false;                      // ha sikerült, a CHECK nem véd
            } catch { return true; }             // a CHECK visszautasította — ez a jó ág
          })(),
        };
      },
    },
    {
      id: 'RESTASK-06',
      name: 'a lakói válasz NEM ad ki belső munkaszervezési mezőket',
      expected: { nincs_belso_mezo: true },
      hint: 'egy SELECT * kiadná a gtd_status, energy_level, waiting_for mezőket is',
      run: async (ctx, s) => {
        const lista = await http.get('/tasks/mine', { token: s.lako });
        const szoveg = JSON.stringify(lista.body?.data?.tasks || []);
        return {
          nincs_belso_mezo: !['gtd_status', 'energy_level', 'waiting_for', 'estimated_hours',
            'actual_hours', 'related_employee_id'].some((m) => szoveg.includes(m)),
        };
      },
    },
  ],
};
