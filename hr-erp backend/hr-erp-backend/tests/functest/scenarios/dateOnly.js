/**
 * DATE — a naptári nap nem csúszhat el az időzónától.
 *
 * A HIBA, AMI ÖTSZÖR JÖTT VISSZA
 * ------------------------------
 * A pg alapból JS `Date`-té alakította a DATE oszlopokat, LOKÁLIS éjfélre. Egy
 * `toISOString()` ezen Budapesten EGY NAPPAL VISSZATOLT:
 *
 *     2026-10-01 00:00 CEST  →  "2026-09-30T22:00:00Z"  →  "2026-09-30"
 *
 * Ez rontott el 209 születési dátumot az áprilisi importnál, és négy saját szkript
 * kimenetét 2026 szeptemberében. Minden javítás HELYI volt (kézi dátumrész-formázás),
 * ezért minden új hívási hely újra elkövethette.
 *
 * 2026-09-22 óta a DATE SZÖVEGKÉNT jön ('YYYY-MM-DD', `setTypeParser(1082)`), tehát az
 * időzóna bele sem tud nyúlni. Ez a terület azt őrzi, hogy ez így is maradjon.
 *
 * MIÉRT ÉPP HÓNAP- ÉS ÉVHATÁR: az egynapos csúszás CSAK ott látszik. Egy hónap közepén
 * a rossz és a jó eredmény is ugyanabba a hónapba esik, tehát egy 15-ei dátummal írt
 * teszt akkor is zöld lenne, ha a hiba visszajön.
 */
const { query } = require('../../../src/database/connection');
const { ymd, ym, addDays, diffDays, today } = require('../../../src/utils/dateOnly');

module.exports = {
  area: 'DATE',
  title: 'naptári nap · hónap- és évhatár · az időzóna nem tud belenyúlni',

  async setup() { return {}; },

  cases: [
    {
      id: 'DATE-01',
      name: 'a DATE oszlop SZÖVEGKÉNT jön vissza, nem Date objektumként',
      expected: { tipus: 'string', ertek: '2026-10-01' },
      hint: 'ez a gyökérjavítás: Date objektumon az időzóna tud csúsztatni',
      run: async () => {
        const r = await query("SELECT '2026-10-01'::date AS d");
        return { tipus: typeof r.rows[0].d, ertek: r.rows[0].d };
      },
    },
    {
      id: 'DATE-02',
      name: 'HÓNAPHATÁR: a hónap első napja nem csúszik vissza az előző hónapba',
      expected: { okt1: '2026-10-01', okt1_honap: '2026-10', jan1: '2027-01-01', jan1_honap: '2027-01' },
      hint: 'a régi hiba itt adott volna 2026-09-30-at és 2026-12-31-et',
      run: async () => {
        const r = await query(
          "SELECT '2026-10-01'::date AS okt, '2027-01-01'::date AS jan");
        return {
          okt1: ymd(r.rows[0].okt), okt1_honap: ym(r.rows[0].okt),
          jan1: ymd(r.rows[0].jan), jan1_honap: ym(r.rows[0].jan),
        };
      },
    },
    {
      id: 'DATE-03',
      name: 'a hónap UTOLSÓ napja sem csúszik át a következőbe',
      expected: { szept30: '2026-09-30', honap: '2026-09', dec31: '2026-12-31', ev: '2026-12' },
      hint: 'a másik irány — egy előretoló hiba itt látszana',
      run: async () => {
        const r = await query("SELECT '2026-09-30'::date AS a, '2026-12-31'::date AS b");
        return {
          szept30: ymd(r.rows[0].a), honap: ym(r.rows[0].a),
          dec31: ymd(r.rows[0].b), ev: ym(r.rows[0].b),
        };
      },
    },
    {
      id: 'DATE-04',
      name: 'VALÓDI TÁBLÁBÓL olvasva is pontos a hónaphatár',
      expected: { beirt: '2026-10-01', kiolvasott: '2026-10-01', egyezik: true },
      hint: 'a szintetikus cast mellett egy tényleges oda-vissza út is kell',
      run: async () => {
        const acc = (await query('SELECT id FROM accommodations LIMIT 1')).rows[0];
        const emp = (await query('SELECT id FROM employees LIMIT 1')).rows[0];
        const BE = '2026-10-01';
        const ins = await query(
          `INSERT INTO employee_accommodation_history (employee_id, accommodation_id, check_in_date, reason)
           VALUES ($1,$2,$3::date,'DATE functest') RETURNING id`, [emp.id, acc.id, BE]);
        const ki = (await query(
          'SELECT check_in_date FROM employee_accommodation_history WHERE id=$1', [ins.rows[0].id])).rows[0];
        await query('DELETE FROM employee_accommodation_history WHERE id=$1', [ins.rows[0].id]);
        return { beirt: BE, kiolvasott: ymd(ki.check_in_date), egyezik: ki.check_in_date === BE };
      },
    },
    {
      id: 'DATE-05',
      name: 'NYÁRI IDŐSZÁMÍTÁS: az óraátállítás hetében sem csúszik a napszámítás',
      expected: { harom_nap: '2026-10-27', vissza: '2026-10-24', kulonbseg: 3 },
      hint: 'a `+ n * 86400000` aritmetika az októberi váltáskor egy napot téved',
      run: async () => ({
        // 2026-10-25-én áll vissza az óra Magyarországon
        harom_nap: addDays('2026-10-24', 3),
        vissza: addDays('2026-10-27', -3),
        kulonbseg: diffDays('2026-10-27', '2026-10-24'),
      }),
    },
    {
      id: 'DATE-06',
      name: 'a MAI nap helyi idő szerint — nem UTC szerint',
      expected: { egyezik_a_dbvel: true, jo_alaku: true },
      hint: 'a toISOString()-alapú "ma" 00:00 és 02:00 között az előző napot adná',
      run: async () => {
        const db = (await query('SELECT CURRENT_DATE AS d')).rows[0].d;
        const sajat = today();
        return { egyezik_a_dbvel: sajat === db, jo_alaku: /^\d{4}-\d{2}-\d{2}$/.test(sajat) };
      },
    },
    {
      id: 'DATE-07',
      name: 'a timestamp NEM változott: ott továbbra is Date objektum jön',
      expected: { date_szoveg: true, timestamp_date: true },
      hint: 'a javítás csak a naptári napot érinti — időpontnál a Date a helyes forma',
      run: async () => {
        const r = await query("SELECT '2026-10-01'::date AS d, NOW() AS ts");
        return {
          date_szoveg: typeof r.rows[0].d === 'string',
          timestamp_date: r.rows[0].ts instanceof Date,
        };
      },
    },
  ],
};
