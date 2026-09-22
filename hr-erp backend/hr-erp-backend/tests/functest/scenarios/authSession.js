/**
 * AUTH — a telefonon tárolt belépés élettartama.
 *
 * AZ ESET (2026-09-22): "a Face ID sikeres, elfogadja, de mégsem jutok be." A szerver
 * naplójában NEM volt egyetlen elutasított kérés sem — az app el sem jutott a hálózatig.
 * A hiba a kliensen volt, de a vizsgálat három szerveroldali feltevést is érintett,
 * amiket azóta sem őriz semmi. Ez a terület azokat rögzíti.
 *
 * A LEGFONTOSABB, AMIT ITT KIMONDUNK: a jelszó megváltoztatása MA NEM érvényteleníti a
 * korábban kiadott tokeneket. Ez tudatos döntés kérdése, nem véletlen — ezért teszt őrzi.
 * Ha valaki bevezeti az érvénytelenítést, ez a teszt fog elbukni, és akkor a döntést
 * KI KELL MONDANI, nem csendben meghozni: az érvénytelenítés minden eszközön kilépteti
 * a felhasználót, ami biztonságilag helyes, üzemeltetésileg viszont váratlan.
 */
const jwt = require('jsonwebtoken');
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

const SECRET = () => process.env.JWT_SECRET;

module.exports = {
  area: 'AUTH',
  title: 'tárolt belépés · lejárat · frissítés · jelszóváltás',

  async setup(ctx) {
    const userId = ctx.ids.user.accommodated_employee;
    return { userId };
  },

  cases: [
    {
      id: 'AUTH-01',
      name: 'a jelszóváltás ELŐTT kiadott token a váltás UTÁN is érvényes',
      expected: { valtas_elott: 200, valtas_utan: 200 },
      hint: 'ez a MAI viselkedés; ha megváltozik, tudatos döntésnek kell lennie',
      run: async (ctx, s) => {
        const token = jwt.sign({ userId: s.userId }, SECRET(), { expiresIn: '2h' });
        const elotte = await http.get('/auth/me', { token });

        await query(
          `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [s.userId]);

        const utana = await http.get('/auth/me', { token });
        return { valtas_elott: elotte.status, valtas_utan: utana.status };
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
