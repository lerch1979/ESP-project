/**
 * passwordScope — melyik jelszószabály vonatkozik erre a felhasználóra.
 *
 * KÉT SZINT VAN, mert a két csoport kockázata és helyzete is más:
 *
 *   'szemelyzet' — szuperadmin, admin, vagy akinek BÁRMILYEN pénzügyi joga van.
 *       Ők ~300 ember személyes és pénzügyi adatához férnek hozzá. Náluk a szigorú
 *       szabály ára (hosszabb jelszó, jelszókezelő) elenyésző ahhoz képest, amit véd.
 *
 *   'lako' — mindenki más. Ők a belépésüket PAPÍRON kapják, telefonon gépelik be, öt
 *       nyelven, és az első képernyőn találkoznak vele. Náluk egy 12 karakteres,
 *       speciális karaktert követelő szabály nem biztonságot ad, hanem elakadást — a
 *       leggyakoribb kimenetele pedig az, hogy a jelszó felkerül egy papírra, vagyis
 *       pont az, ami ellen az egész védekezés szól.
 *
 * A BESOROLÁS A JOGOSULTSÁGBÓL JÖN, NEM A SZEREPKÖR NEVÉBŐL. Egy új szerepkör, ami
 * pénzügyi jogot kap, magától a szigorú ágra kerül — nem kell hozzá senkinek eszébe
 * jutnia, hogy ezt a fájlt is frissítse. Ez a fajta hallgatólagos kimaradás okozza a
 * legtöbb jogosultsági rést.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { getUserPermissions } = require('../middleware/permission');

const SZIGORU_SZEREPEK = ['superadmin', 'admin'];

/**
 * @param {string} userId
 * @returns {Promise<'szemelyzet'|'lako'>}
 */
async function scopeFor(userId) {
  try {
    const r = await query(
      `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`, [userId]);
    const szerepek = r.rows.map((x) => x.slug);

    if (szerepek.some((s) => SZIGORU_SZEREPEK.includes(s))) return 'szemelyzet';

    // A szuperadminnak nincs külön jogosultság-sora (mindent megkap), de őt a fenti ág
    // már elkapta — ide csak az jut el, akinek tételes joglistája van.
    const jogok = await getUserPermissions(userId);
    if (jogok.some((p) => String(p).startsWith('finance.'))) return 'szemelyzet';

    return 'lako';
  } catch (err) {
    // HIBA ESETÉN A SZIGORÚBB ÁG. Ha nem tudjuk eldönteni, ki ez a felhasználó, akkor
    // nem feltételezünk róla a kedvezőbbet — egy elérhetetlen jogosultság-lekérdezés
    // nem lazíthat a szabályon.
    logger.warn(`[passwordScope] nem sikerült besorolni (${userId}): ${err.message} — szigorú ág`);
    return 'szemelyzet';
  }
}

module.exports = { scopeFor, SZIGORU_SZEREPEK };
