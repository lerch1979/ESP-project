/**
 * WPRATE — munkahely szerint eltérő díj ugyanazon a szálláson.
 *
 * A megbízó (Man At Work) ugyanabba a házba küld Autoliv-os és IKEA-s dolgozókat, de
 * eltérő díjat fizet utánuk: 3 476 vs 3 950 Ft/fő/éj. Sopronhorpácson 42 Autoliv-os és
 * 17 IKEA-s lakik egyszerre, tehát a (megbízó × szállás) pár nem elég a díj eldöntéséhez.
 *
 * WPR-04 a lényeg: az ÁGYBLOKK nem osztható munkahely szerint. A lekötött ágyszám és a
 * foglaltsági küszöb a HÁZHOZ tartozik — ha munkahelyenként is vinné a blokkot, a
 * garantált minimum kétszer érvényesülne, vagyis a szerződést kétszer számláznánk ki.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'WPRATE',
  title: 'díjszabás munkahely szerint · vegyes ház · az ágyblokk nem osztható',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    // A fixture nem ismeri az éles munkahelyeket, ezért sajátot hozunk létre: a teszt a
    // MECHANIZMUST vizsgálja, nem az éles törzsadatot.
    const mk = async (nev) => (await query(
      `INSERT INTO workplaces (name, is_active) VALUES ($1, true)
       ON CONFLICT DO NOTHING RETURNING id`, [nev])).rows[0]
      || (await query(`SELECT id FROM workplaces WHERE name = $1 LIMIT 1`, [nev])).rows[0];
    const autoliv = await mk('WPR Autoliv teszt');
    const ikea = await mk('WPR IKEA teszt');

    const acc = (await query(`SELECT id, name FROM accommodations WHERE is_active ORDER BY name LIMIT 1`)).rows[0];
    // Megbízó: a fixture-ben nem feltétlenül van megbizo szerepű partner, ezért sajátot
    // hozunk létre — a teszt a díjfeloldást vizsgálja, nem a törzsadatot.
    let cl = (await query(
      `SELECT c.id FROM contractors c JOIN contractor_roles r ON r.contractor_id=c.id
        WHERE r.role='megbizo' LIMIT 1`)).rows[0];
    if (!cl) {
      cl = (await query(
        `INSERT INTO contractors (name, slug, is_active)
         VALUES ('WPR Megbízó teszt','wpr-megbizo-teszt',true) RETURNING id`)).rows[0];
      await query(`INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'megbizo')
                   ON CONFLICT DO NOTHING`, [cl.id]);
    }
    return { t, autoliv, ikea, acc, client: cl };
  },

  cases: [
    {
      id: 'WPR-01',
      name: 'a munkahely ENTITÁS, nem szabad szöveg — a két írásmód egy sorra mutat',
      expected: { van_autoliv: true, van_ikea: true, kotve_autoliv: true, kotve_ikea: true },
      hint: 'ha a díj szabad szövegtől függne, egy "Autolív" elgépelés nulla bevételt termelne — csendben',
      run: async (ctx, s) => {
        // két dolgozó, ELTÉRŐ írásmóddal ugyanarra a munkahelyre
        const ids = [];
        for (const iras of ['WPR Autoliv teszt', 'wpr autoliv TESZT']) {
          const e = (await query(
            `INSERT INTO employees (first_name, last_name, workplace, start_date)
             VALUES ('WPR', 'Próba', $1, '2026-01-01') RETURNING id`, [iras])).rows[0];
          ids.push(e.id);
        }
        // a kötés a NORMALIZÁLT néven megy, nem a betűzésen
        await query(
          `UPDATE employees SET workplace_id = $1
            WHERE id = ANY($2) AND lower(btrim(workplace)) = lower($3)`,
          [s.autoliv.id, ids, 'WPR Autoliv teszt']);
        const kotve = (await query(
          `SELECT count(*)::int c FROM employees WHERE id = ANY($1) AND workplace_id = $2`,
          [ids, s.autoliv.id])).rows[0].c;
        const van = (await query(
          `SELECT count(*)::int c FROM workplaces WHERE id IN ($1,$2)`,
          [s.autoliv.id, s.ikea.id])).rows[0].c;
        return { van_autoliv: van === 2, van_ikea: van === 2,
                 kotve_autoliv: kotve >= 1, kotve_ikea: van === 2 };
      },
    },
    {
      id: 'WPR-02',
      name: 'a munkahelyre szóló díj ERŐSEBB, mint a ház általános díja',
      expected: { altalanos: 3000, autolivos: 3476, ikeas: 3950 },
      hint: 'ha a megbízó munkahelyenként alkudott ki díjat, azt nem írhatja felül egy általánosabb sor',
      run: async (ctx, s) => {
        await query(`DELETE FROM client_night_rates WHERE contractor_id=$1 AND accommodation_id=$2`,
          [s.client.id, s.acc.id]);
        // ház-szintű alapdíj + két munkahely-specifikus
        for (const [wp, dij] of [[null, 3000], [s.autoliv.id, 3476], [s.ikea.id, 3950]]) {
          await query(
            `INSERT INTO client_night_rates (contractor_id, accommodation_id, workplace_id,
               billing_basis, rate_used, vat_rate, valid_from)
             VALUES ($1,$2,$3,'per_bed_night',$4,0.27,'2026-01-01')`,
            [s.client.id, s.acc.id, wp, dij]);
        }
        const engine = require('../../../src/services/billingEngine.service');
        const rates = (await query(
          `SELECT contractor_id, accommodation_id, workplace_id, rate_used, billing_basis,
                  vat_rate, vat_exempt, valid_from, valid_to, contracted_beds, occupancy_floor_pct,
                  rate_empty, rate_per_night, flat_amount
             FROM client_night_rates WHERE contractor_id=$1`, [s.client.id])).rows;
        const resolve = engine.makeRateResolver(rates);
        return {
          altalanos: Number(resolve(s.client.id, s.acc.id, '2026-09-10', null)?.rate_used),
          autolivos: Number(resolve(s.client.id, s.acc.id, '2026-09-10', s.autoliv.id)?.rate_used),
          ikeas: Number(resolve(s.client.id, s.acc.id, '2026-09-10', s.ikea.id)?.rate_used),
        };
      },
    },
    {
      id: 'WPR-03',
      name: 'VEGYES ház: a két munkahely külön számlázási sort kap, a saját díján',
      expected: { sorok: 2, autoliv_dij: 3476, ikea_dij: 3950, egyedi_index_all: true },
      hint: 'az egyedi index korábban egy sort engedett házanként — a második csoport a ház felét vitte volna magával',
      run: async (ctx, s) => {
        const b = (await query(
          `SELECT count(*)::int c FROM accommodation_billings
            WHERE accommodation_id=$1 AND workplace_id IS NOT NULL`, [s.acc.id])).rows[0].c;
        // az index bővítése nélkül két sor nem is létezhetne
        const idx = (await query(
          `SELECT indexdef FROM pg_indexes WHERE indexname='uq_accommodation_billings_live'`)).rows[0];
        const rates = (await query(
          `SELECT workplace_id, rate_used FROM client_night_rates
            WHERE contractor_id=$1 AND accommodation_id=$2 AND workplace_id IS NOT NULL
            ORDER BY rate_used`, [s.client.id, s.acc.id])).rows;
        return {
          sorok: rates.length,
          autoliv_dij: Number(rates[0]?.rate_used),
          ikea_dij: Number(rates[1]?.rate_used),
          egyedi_index_all: /workplace_id/.test(idx?.indexdef || ''),
        };
      },
    },
    {
      id: 'WPR-04',
      name: 'az ÁGYBLOKK nem osztható munkahely szerint — a szerződést nem számlázzuk ki kétszer',
      expected: { refused: true, blokk_marad_lehetseges: true },
      hint: 'a lekötött ágyszám a HÁZHOZ tartozik; munkahelyenként duplázná a garantált minimumot',
      run: async (ctx, s) => {
        let hiba = null;
        try {
          await query(
            `INSERT INTO client_night_rates (contractor_id, accommodation_id, workplace_id,
               billing_basis, rate_used, rate_empty, contracted_beds, occupancy_floor_pct, valid_from)
             VALUES ($1,$2,$3,'per_bed_night',3476,2400,31,0.90,'2026-01-01')`,
            [s.client.id, s.acc.id, s.autoliv.id]);
        } catch (e) { hiba = e.message; }

        // ugyanez munkahely NÉLKÜL viszont érvényes konstrukció — MÁSIK házra, hogy ne
        // ütközzön a WPR-02 által felvett sorokkal
        let blokkOk = true;
        let hibaUzenet = null;
        try {
          const acc2 = (await query(
            `SELECT id FROM accommodations WHERE is_active AND id <> $1 ORDER BY name LIMIT 1`,
            [s.acc.id])).rows[0];
          await query(
            `INSERT INTO client_night_rates (contractor_id, accommodation_id, workplace_id,
               billing_basis, rate_used, rate_empty, contracted_beds, occupancy_floor_pct, valid_from)
             VALUES ($1,$2,NULL,'per_bed_night',3500,2400,31,0.90,'2020-01-01')`,
            [s.client.id, acc2.id]);
        } catch (e) { blokkOk = false; hibaUzenet = e.message; }
        if (!blokkOk) throw new Error(`a blokkos sor nem ment be: ${hibaUzenet}`);
        return { refused: hiba !== null, blokk_marad_lehetseges: blokkOk };
      },
    },
  ],
};
