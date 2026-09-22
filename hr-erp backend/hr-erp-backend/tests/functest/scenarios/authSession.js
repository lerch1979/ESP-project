/**
 * AUTH — a telefonon tárolt belépés élettartama.
 *
 * AZ ESET (2026-09-22): "a Face ID sikeres, elfogadja, de mégsem jutok be." A szerver
 * naplójában NEM volt egyetlen elutasított kérés sem — az app el sem jutott a hálózatig.
 * A hiba a kliensen volt, de a vizsgálat három szerveroldali feltevést is érintett,
 * amiket azóta sem őriz semmi. Ez a terület azokat rögzíti.
 *
 * 2026-09-22, DÖNTÉS UTÁN: a jelszóváltás mostantól MINDEN korábban kiadott tokent
 * érvénytelenít. A szabály három ága külön esetet kapott, mert a kettő közti KÜLÖNBSÉG
 * a lényeg, és az csúszik el legkönnyebben egy későbbi átíráskor:
 *
 *   • saját jelszóváltás      → a hívó eszköze BENT marad (friss token-párt kap),
 *                               a többi eszköz kilép;
 *   • admin-visszaállítás     → MINDEN munkamenet kilép, kivétel nélkül;
 *   • a frissítési út (refresh) ugyanígy záródik — enélkül a 30 napos refresh tokennel
 *     a váltás után is új belépési tokent lehetne váltani, és az egész díszlet lenne.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const rule = require('../../../src/utils/passwordRule');
const policy = require('../../../src/middleware/passwordPolicy');
const { scopeFor } = require('../../../src/utils/passwordScope');

const SECRET = () => process.env.JWT_SECRET;

// A fixture-felhasználó `password_changed_at`-je a LÉTREHOZÁS pillanata (az oszlop
// alapértelmezése CURRENT_TIMESTAMP). Egy "egy órával korábbi" token ezért eleve
// régebbi a fióknál — nem a szabály miatt, hanem mert a fiók percekkel ezelőtt
// született. A kiindulást tehát a múltba kell tenni, különben a teszt a saját
// beállítását méri, nem a viselkedést.
async function jelszovaltasAMultba(userId, nap = 2) {
  await query(
    `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP - ($2 || ' days')::interval
      WHERE id = $1`, [userId, String(nap)]);
}

module.exports = {
  area: 'AUTH',
  title: 'tárolt belépés · lejárat · frissítés · jelszóváltás',

  async setup(ctx) {
    const userId = ctx.ids.user.accommodated_employee;
    // Az EREDETI állapot elmentése. Ez a terület a KÖZÖS fixture-lakó jelszavát írja át
    // és a kötelező-csere jelzőjét kapcsolgatja — ha így hagynánk, a később futó
    // területek (RESTICK, RESTASK) 403-at kapnának, és a bukás a futási sorrendtől
    // függene. A visszaállítást a teardown végzi.
    const r = await query(
      `SELECT password_hash, password_changed_at, must_change_password
         FROM users WHERE id = $1`, [userId]);
    return { userId, eredeti: r.rows[0] };
  },

  async teardown(ctx, s) {
    if (!s?.eredeti) return;
    await query(
      `UPDATE users SET password_hash = $1, password_changed_at = $2,
              must_change_password = $3
        WHERE id = $4`,
      [s.eredeti.password_hash, s.eredeti.password_changed_at,
       s.eredeti.must_change_password, s.userId]);
  },

  cases: [
    {
      id: 'AUTH-01',
      name: 'a jelszóváltás ELŐTT kiadott token a váltás UTÁN ÉRVÉNYTELEN',
      expected: { valtas_elott: 200, valtas_utan: 401, kod: 'PASSWORD_CHANGED' },
      hint: 'enélkül egy ellopott eszköz a jelszóváltás után is dolgozna — 8 órán át',
      run: async (ctx, s) => {
        await jelszovaltasAMultba(s.userId);
        // Egy órával korábbi kiadás: így a másodperc-kerekítés tűrése nem játszik bele.
        const iat = Math.floor(Date.now() / 1000) - 3600;
        const token = jwt.sign({ userId: s.userId, iat }, SECRET(), { expiresIn: '8h' });
        const elotte = await http.get('/auth/me', { token });

        await query(
          `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [s.userId]);

        const utana = await http.get('/auth/me', { token });
        return {
          valtas_elott: elotte.status,
          valtas_utan: utana.status,
          kod: utana.body?.code,
        };
      },
    },
    {
      id: 'AUTH-06',
      name: 'a jelszóváltás UTÁN kiadott token érvényes marad',
      expected: { status: 200 },
      hint: 'a tűrés nélkül a frissen kiadott tokent dobnánk el — vagyis az ellenkezőjét',
      run: async (ctx, s) => {
        await query(
          `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [s.userId]);
        const token = jwt.sign({ userId: s.userId }, SECRET(), { expiresIn: '8h' });
        const r = await http.get('/auth/me', { token });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-07',
      name: 'SAJÁT jelszóváltás: a hívó eszköze BENT marad, a régi token viszont kiesik',
      expected: { valtas: 200, regi_token: 401, uj_token: 200 },
      hint: 'a felhasználó a gép előtt ül és a régi jelszavával igazolta magát — ne dobjuk ki',
      run: async (ctx, s) => {
        const hash = await bcrypt.hash('RegiJelszo123', await bcrypt.genSalt(10));
        await query(
          `UPDATE users SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP - interval '1 hour'
            WHERE id = $2`, [hash, s.userId]);

        const iat = Math.floor(Date.now() / 1000) - 60;
        const regi = jwt.sign({ userId: s.userId, iat }, SECRET(), { expiresIn: '8h' });

        const valtas = await http.post('/auth/change-password', {
          token: regi,
          body: { currentPassword: 'RegiJelszo123', newPassword: 'UjJelszo456' },
        });
        const uj = valtas.body?.data?.token;

        const regiUtan = await http.get('/auth/me', { token: regi });
        const ujUtan = uj ? await http.get('/auth/me', { token: uj }) : { status: 0 };
        return { valtas: valtas.status, regi_token: regiUtan.status, uj_token: ujUtan.status };
      },
    },
    {
      id: 'AUTH-08',
      name: 'saját jelszóváltás ROSSZ jelenlegi jelszóval elbukik',
      expected: { status: 401 },
      hint: 'enélkül egy eltulajdonított munkamenet kizárná a tulajdonost a fiókjából',
      run: async (ctx, s) => {
        const token = jwt.sign({ userId: s.userId }, SECRET(), { expiresIn: '8h' });
        const r = await http.post('/auth/change-password', {
          token,
          body: { currentPassword: 'ez-nem-a-jelszo', newPassword: 'BarmiMas789' },
        });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-09',
      name: 'ADMIN jelszó-visszaállítás: MINDEN munkamenet kilép, kivétel nélkül',
      expected: { elotte: 200, utana: 401 },
      hint: 'ezt az utat épp akkor használjuk, amikor a fiókhoz más is hozzáférhetett',
      run: async (ctx, s) => {
        await jelszovaltasAMultba(s.userId);
        const iat = Math.floor(Date.now() / 1000) - 3600;
        const token = jwt.sign({ userId: s.userId, iat }, SECRET(), { expiresIn: '8h' });
        const elotte = await http.get('/auth/me', { token });

        const admin = http.tokenFor(ctx.ids.user.superadmin);
        await http.put(`/users/${s.userId}`, {
          token: admin, body: { password: 'AdminAltalAdott99' },
        });

        const utana = await http.get('/auth/me', { token });
        // A visszaállítás bekapcsolja a kötelező cserét is — itt nem azt mérjük
        // (azt az AUTH-15 teszi), és bent hagyva a következő eseteket zárná el.
        await query('UPDATE users SET must_change_password = false WHERE id = $1', [s.userId]);
        return { elotte: elotte.status, utana: utana.status };
      },
    },
    {
      id: 'AUTH-10',
      name: 'a RÉGI refresh token a jelszóváltás után nem vált új belépést',
      expected: { status: 401, kod: 'PASSWORD_CHANGED' },
      hint: 'a refresh 30 napig él; ha ezt nem zárjuk, az érvénytelenítés díszlet',
      run: async (ctx, s) => {
        await jelszovaltasAMultba(s.userId);
        const iat = Math.floor(Date.now() / 1000) - 3600;
        const regiRefresh = jwt.sign({ userId: s.userId, iat }, SECRET(), { expiresIn: '30d' });
        await query(
          `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [s.userId]);
        const r = await http.post('/auth/refresh', { body: { refreshToken: regiRefresh } });
        return { status: r.status, kod: r.body?.code };
      },
    },
    {
      id: 'AUTH-11',
      name: 'ideiglenes jelszóval a felhasználó SEMMIT nem lát a cseréig',
      expected: { sajat_jegyek: 403, kod: 'MUST_CHANGE_PASSWORD', me_atmegy: 200 },
      hint: 'a korlát a szerveren van; egy kliensoldali terelés böngészőből megkerülhető',
      run: async (ctx, s) => {
        await query('UPDATE users SET must_change_password = true WHERE id = $1', [s.userId]);
        const token = http.tokenFor(s.userId);
        const jegyek = await http.get('/tickets/my', { token });
        const me = await http.get('/auth/me', { token });
        await query('UPDATE users SET must_change_password = false WHERE id = $1', [s.userId]);
        return { sajat_jegyek: jegyek.status, kod: jegyek.body?.code, me_atmegy: me.status };
      },
    },
    {
      id: 'AUTH-12',
      name: 'a csere LEVESZI a kötelezettséget, és onnantól minden megnyílik',
      expected: { csere: 200, jelzo_utana: false, jegyek_utana: 200 },
      hint: 'ha a jelző fent maradna, a felhasználó a csere után is ki lenne zárva',
      run: async (ctx, s) => {
        const hash = await bcrypt.hash('IdeiglenesAB12', await bcrypt.genSalt(10));
        await query(
          `UPDATE users SET password_hash = $1, must_change_password = true,
                  password_changed_at = CURRENT_TIMESTAMP - interval '1 hour'
            WHERE id = $2`, [hash, s.userId]);

        const token = jwt.sign({ userId: s.userId, iat: Math.floor(Date.now() / 1000) - 60 },
          SECRET(), { expiresIn: '8h' });
        const csere = await http.post('/auth/change-password', {
          token, body: { currentPassword: 'IdeiglenesAB12', newPassword: 'SajatJelszo77' },
        });
        const jelzo = (await query(
          'SELECT must_change_password FROM users WHERE id = $1', [s.userId]))
          .rows[0].must_change_password;
        const uj = csere.body?.data?.token;
        const jegyek = uj ? await http.get('/tickets/my', { token: uj }) : { status: 0 };
        return { csere: csere.status, jelzo_utana: jelzo, jegyek_utana: jegyek.status };
      },
    },
    {
      id: 'AUTH-13',
      name: 'az IDEIGLENES jelszó nem tartható meg új jelszóként',
      expected: { status: 400 },
      hint: 'enélkül a kötelező csere teljesíthető lenne a papírra írt jelszó megtartásával',
      run: async (ctx, s) => {
        const hash = await bcrypt.hash('PapironKapott9', await bcrypt.genSalt(10));
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, s.userId]);
        const token = http.tokenFor(s.userId);
        const r = await http.post('/auth/change-password', {
          token, body: { currentPassword: 'PapironKapott9', newPassword: 'PapironKapott9' },
        });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-14',
      name: 'a túl rövid új jelszót elutasítja',
      expected: { status: 400 },
      hint: 'a minimum 8 karakter — papírról, telefonon gépelő lakóra szabva',
      run: async (ctx, s) => {
        const hash = await bcrypt.hash('MegfeleloJelszo1', await bcrypt.genSalt(10));
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, s.userId]);
        const token = http.tokenFor(s.userId);
        const r = await http.post('/auth/change-password', {
          token, body: { currentPassword: 'MegfeleloJelszo1', newPassword: 'rovid1' },
        });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-15',
      name: 'admin jelszó-visszaállítás UTÁN kötelező a csere',
      expected: { jelzo: true },
      hint: 'a visszaállított jelszót az adminisztrátor ismeri — nem maradhat élesben',
      run: async (ctx, s) => {
        await query('UPDATE users SET must_change_password = false WHERE id = $1', [s.userId]);
        const admin = http.tokenFor(ctx.ids.user.superadmin);
        await http.put(`/users/${s.userId}`, {
          token: admin, body: { password: 'AdminAltalAdott42' },
        });
        const jelzo = (await query(
          'SELECT must_change_password FROM users WHERE id = $1', [s.userId]))
          .rows[0].must_change_password;
        await query('UPDATE users SET must_change_password = false WHERE id = $1', [s.userId]);
        return { jelzo };
      },
    },
    {
      id: 'AUTH-16',
      name: 'SZEMÉLYZET: 12 karakter és négy karakterosztály kell',
      expected: { rovid_de_osztalyos: false, hosszu_de_egyszeru: false, megfelelo: true },
      hint: 'ők ~300 ember személyes és pénzügyi adatához férnek hozzá',
      run: async () => {
        const e = (pw) => rule.ellenorizScope('szemelyzet', pw, { jelenlegi: 'Masik99Jelszo!' }).valid;
        return {
          rovid_de_osztalyos: e('Rovid1!a'),
          hosszu_de_egyszeru: e('csupakisbetusesosszu'),
          megfelelo: e('Hosszu12Jelszo!'),
        };
      },
    },
    {
      id: 'AUTH-17',
      name: 'LAKÓ: 8 karakter elég, karakterosztály NEM kötelező',
      expected: { rovid: false, nyolc_betu: true, ugyanaz: false },
      hint: 'papírról, telefonon, idegen nyelven gépel — a szigor itt elakadást okoz',
      run: async () => {
        const e = (pw) => rule.ellenorizScope('lako', pw, { jelenlegi: 'ideiglenes1' }).valid;
        return { rovid: e('rovid1'), nyolc_betu: e('sajatjelszo'), ugyanaz: e('ideiglenes1') };
      },
    },
    {
      id: 'AUTH-18',
      name: 'csak a LAKÓ megengedő — mindenki más, és a szerepkör nélküli is, szigorú',
      expected: {
        lako: 'lako', superadmin: 'szemelyzet',
        karbantarto: 'szemelyzet', szerepkor_nelkul: 'szemelyzet',
      },
      hint: 'a lista fordítva működik: egy ÚJ szerepkör alapból a szigorú ágra esik',
      run: async (ctx, s) => {
        const lako = await scopeFor(ctx.ids.user.accommodated_employee);
        const superadmin = await scopeFor(ctx.ids.user.superadmin);

        // Ideiglenesen karbantartóvá tesszük a fixture-lakót, hogy a NEM-lakói ágat
        // valódi adaton mérjük. A teardown a jelszót állítja vissza, a szerepkört itt
        // kell — különben a későbbi RESTICK/RESTASK területek lakói jogait vinné el.
        const eredeti = (await query(
          'SELECT role_id FROM user_roles WHERE user_id = $1', [s.userId])).rows;
        const karb = (await query(
          "SELECT id FROM roles WHERE slug = 'maintenance_worker'")).rows[0];
        let karbantarto = 'n/a';
        if (karb) {
          await query('UPDATE user_roles SET role_id = $2 WHERE user_id = $1',
            [s.userId, karb.id]);
          karbantarto = await scopeFor(s.userId);
          for (const e of eredeti) {
            await query('UPDATE user_roles SET role_id = $2 WHERE user_id = $1',
              [s.userId, e.role_id]);
          }
        }

        // Szerepkör nélküli fiók: nem tudjuk, mit érhet el → szigorú.
        const arva = (await query(
          `INSERT INTO users (email, password_hash, first_name, last_name, contractor_id)
           VALUES ($1,'x','FT','Árva',$2) RETURNING id`,
          [`ft-arva-${Date.now()}@teszt.local`, ctx.ids.contractor])).rows[0];
        const szerepkorNelkul = await scopeFor(arva.id);
        await query('DELETE FROM users WHERE id = $1', [arva.id]);

        return { lako, superadmin, karbantarto, szerepkor_nelkul: szerepkorNelkul };
      },
    },
    {
      id: 'AUTH-25',
      name: '⚠️ a SZIGORÍTÁS NEM ZÁRJA KI a meglévő fiókokat — a régi jelszóval be lehet lépni',
      expected: { belepes: 200, szigoru_ag: 'szemelyzet', csereig_ervenyes: true },
      hint: 'a szabály CSAK a jelszóváltásnál fut; a belépés nem méri a régi jelszót hozzá',
      run: async (ctx, s) => {
        // A fixture-felhasználónak adunk egy RÖVID, az új szabálynak NEM megfelelő
        // jelszót, majd nem-lakói szerepkört. Így pont az a helyzet áll elő, amitől
        // tartani kell: szigorú ág + szabálytalan meglévő jelszó.
        const hash = await bcrypt.hash('rovid12', await bcrypt.genSalt(10));
        await query(
          `UPDATE users SET password_hash = $1, failed_login_attempts = 0,
                  locked_until = NULL, password_changed_at = CURRENT_TIMESTAMP - interval '1 day'
            WHERE id = $2`, [hash, s.userId]);
        const eredeti = (await query(
          'SELECT role_id FROM user_roles WHERE user_id = $1', [s.userId])).rows;
        const karb = (await query(
          "SELECT id FROM roles WHERE slug = 'maintenance_worker'")).rows[0];
        if (karb) {
          await query('UPDATE user_roles SET role_id = $2 WHERE user_id = $1',
            [s.userId, karb.id]);
        }

        const scope = await scopeFor(s.userId);
        const email = (await query('SELECT email FROM users WHERE id = $1', [s.userId]))
          .rows[0].email;
        const be = await http.post('/auth/login', { body: { email, password: 'rovid12' } });

        // …és a KÖVETKEZŐ jelszóváltásnál már meg kell felelnie.
        const csere = await http.post('/auth/change-password', {
          token: http.tokenFor(s.userId),
          body: { currentPassword: 'rovid12', newPassword: 'megmindigrovid' },
        });

        for (const e of eredeti) {
          await query('UPDATE user_roles SET role_id = $2 WHERE user_id = $1',
            [s.userId, e.role_id]);
        }
        return {
          belepes: be.status,
          szigoru_ag: scope,
          csereig_ervenyes: be.status === 200 && csere.status === 400,
        };
      },
    },
    {
      id: 'AUTH-19',
      name: 'a zárolás IDŐALAPÚ és megmondja, MEDDIG tart',
      expected: { zarolt: true, van_percszam: true, ertelmes: true },
      hint: 'egy időtartam nélküli "zárolva" ugyanolyan tehetetlen, mintha végleges lenne',
      run: async (ctx, s) => {
        await query(
          `UPDATE users SET locked_until = NOW() + interval '15 minutes' WHERE id = $1`,
          [s.userId]);
        const st = await policy.lockStatus(s.userId);
        await query('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1',
          [s.userId]);
        return {
          zarolt: st.locked,
          van_percszam: typeof st.percek === 'number' && st.percek > 0,
          ertelmes: st.percek >= 14 && st.percek <= 15,
        };
      },
    },
    {
      id: 'AUTH-20',
      name: 'a LEJÁRT zárolás magától feloldódik — nem kell az irodát hívni',
      expected: { locked: false, percek: 0 },
      hint: 'ez a különbség az időalapú és a végleges zárolás között',
      run: async (ctx, s) => {
        await query(
          `UPDATE users SET locked_until = NOW() - interval '1 minute' WHERE id = $1`,
          [s.userId]);
        const st = await policy.lockStatus(s.userId);
        await query('UPDATE users SET locked_until = NULL WHERE id = $1', [s.userId]);
        return st;
      },
    },
    {
      id: 'AUTH-21',
      name: 'a 90 napos kötelező csere NINCS bekötve',
      expected: { sehol_nem_fut: true },
      hint: 'tulajdonosi döntés: cserét gyanú esetén rendelünk el, nem naptár szerint',
      run: async (ctx) => {
        const fs = require('fs');
        const path = require('path');
        const src = path.join(ctx.ROOT, 'src');
        let talalat = 0;
        const bejar = (d) => {
          for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const teljes = path.join(d, f.name);
            if (f.isDirectory()) { bejar(teljes); continue; }
            if (!f.name.endsWith('.js')) continue;
            if (teljes.endsWith(path.join('middleware', 'passwordPolicy.js'))) continue;
            if (/checkPasswordExpiry/.test(fs.readFileSync(teljes, 'utf8'))) talalat++;
          }
        };
        bejar(src);
        return { sehol_nem_fut: talalat === 0 };
      },
    },
    {
      id: 'AUTH-22',
      name: 'VÉGPONT-SZINTŰ bizonyíték: 10 rossz próba után a lakói fiók zárolódik',
      expected: { tizedik: 423, kod: 'ACCOUNT_LOCKED', van_perc: true, jo_jelszo_is_423: 423 },
      hint: 'a zárolást a jelszó ELŐTT nézzük — különben a helyes jelszó is "hibás"-nak tűnne',
      run: async (ctx, s) => {
        const hash = await bcrypt.hash('LakoJelszo123', await bcrypt.genSalt(10));
        await query(
          `UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL
            WHERE id = $2`, [hash, s.userId]);
        const email = (await query('SELECT email FROM users WHERE id = $1', [s.userId]))
          .rows[0].email;

        let utolso = null;
        for (let i = 0; i < 10; i++) {
          utolso = await http.post('/auth/login', { body: { email, password: 'rossz-jelszo' } });
        }
        // A HELYES jelszó sem enged be, amíg tart a zárlat — ez a lényeg.
        const joJelszoval = await http.post('/auth/login',
          { body: { email, password: 'LakoJelszo123' } });

        await query(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
          [s.userId]);

        return {
          tizedik: utolso.status,
          kod: utolso.body?.code,
          van_perc: typeof utolso.body?.minutes === 'number' && utolso.body.minutes > 0,
          jo_jelszo_is_423: joJelszoval.status,
        };
      },
    },
    {
      id: 'AUTH-23',
      name: 'a hibaüzenet NEM árulja el, hány próba van hátra',
      expected: { nincs_szamlalo: true },
      hint: 'aki próbálgat, abból tudná, mikor álljon meg a zárlat elkerüléséhez',
      run: async (ctx, s) => {
        await query(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
          [s.userId]);
        const email = (await query('SELECT email FROM users WHERE id = $1', [s.userId]))
          .rows[0].email;
        const r = await http.post('/auth/login', { body: { email, password: 'rossz' } });
        await query(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
          [s.userId]);
        const szoveg = JSON.stringify(r.body || {});
        return { nincs_szamlalo: !/\d+\s*(próba|kísérlet|attempt)/i.test(szoveg) };
      },
    },
    {
      id: 'AUTH-24',
      name: 'a szerver MEGMONDJA a kliensnek, milyen jelszót vár',
      expected: { lako_min: 8, lako_komplex: false, szem_min: 12, szem_komplex: true, van_szoveg: true },
      hint: 'fix kliensoldali szöveggel a személyzet zöld utat kapna egy elutasítandó jelszóra',
      run: async () => {
        const l = rule.szabalyLeiras('lako');
        const sz = rule.szabalyLeiras('szemelyzet');
        return {
          lako_min: l.min, lako_komplex: l.complexity,
          szem_min: sz.min, szem_komplex: sz.complexity,
          van_szoveg: Boolean(l.hint) && Boolean(sz.hint) && l.hint !== sz.hint,
        };
      },
    },
    {
      id: 'AUTH-02',
      name: 'a LEJÁRT token 401-et kap — enélkül a kliens nem tudná, mikor frissítsen',
      expected: { status: 401 },
      hint: 'a mobil erre a 401-re indítja a frissítést; ha 200 jönne, sosem frissítene',
      run: async () => {
        const lejart = jwt.sign({ userId: '00000000-0000-0000-0000-000000000000' },
          SECRET(), { expiresIn: '-1h' });
        const r = await http.get('/auth/me', { token: lejart });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-03',
      name: 'érvényes refresh tokenből ÚJ belépési token jön',
      expected: { status: 200, kapott_uj_tokent: true },
      hint: 'ez a mentőág: a 8 órás lejárat után ettől nem kell újra jelszót kérni',
      run: async (ctx, s) => {
        const refreshToken = jwt.sign({ userId: s.userId }, SECRET(), { expiresIn: '30d' });
        const r = await http.post('/auth/refresh', { body: { refreshToken } });
        const uj = r.body?.data?.token || r.body?.token;
        return { status: r.status, kapott_uj_tokent: !!uj };
      },
    },
    {
      id: 'AUTH-04',
      name: 'ÉRVÉNYTELEN refresh token 401 — a kliens innen tudja, hogy jelszó kell',
      expected: { status: 401 },
      hint: 'ez a pont dobja el a telefonon tárolt belépést; némán nem szabad elbuknia',
      run: async () => {
        const r = await http.post('/auth/refresh', { body: { refreshToken: 'ez-nem-token' } });
        return { status: r.status };
      },
    },
    {
      id: 'AUTH-05',
      name: 'refresh token NÉLKÜL nem jár új belépés',
      expected: { status: 400 },
      hint: 'a mobil ilyenkor hálózat nélkül, helyben dobja el a tárolt belépést',
      run: async () => {
        const r = await http.post('/auth/refresh', { body: {} });
        return { status: r.status };
      },
    },
  ],
};
