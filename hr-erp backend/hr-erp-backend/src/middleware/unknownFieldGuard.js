/**
 * unknownFieldGuard — az „ismeretlen mező" szabály, FOKOZATOS bevezetéssel.
 *
 * A PROBLÉMA: a szerkesztő végpontok kézzel felsorolt mezőlistából olvassák a kérés
 * törzsét, és ami nincs a listán, az CSENDBEN elvész. A szerver 200-at ad, a felület
 * zöld sikert jelez, a mentés viszont nem történt meg. Ma 91 szerkesztő végpontból
 * 62 dolgozik így — ez a kódbázis alapértelmezése, nem kivétel.
 *
 * MIÉRT NEM KAPCSOLJUK RÖGTÖN ÉLESRE (tulajdonosi döntés, 2026-09-24):
 * több űrlap a TELJES `form` objektumot küldi (`{ ...form }`), köztük olyan mezőket is,
 * amiket szándékosan nem mentünk (belső sorszám, csak megjelenítési jelölők). Azonnali
 * elutasítással a bevezetés napján minden ilyen űrlap 400-ba futna — vagyis a javítás
 * okozna üzemzavart. Ezért:
 *
 *   1. FÁZIS (most): csak NAPLÓZ. Megmutatja, MELYIK végponton MELYIK mező menne a
 *      szemétbe. Ebből derül ki, hol kell a kétrészes engedélylistát kiegészíteni.
 *   2. FÁZIS (később, külön döntéssel): `UNKNOWN_FIELD_ENFORCE=true` → 400-as elutasítás.
 *
 * A kétrészes lista azért kell, mert két különböző dolgot kell megkülönböztetni:
 *   MENTHETO            — ezt eltároljuk;
 *   FIGYELMEN_KIVUL     — ezt a felület küldi, de tudatosan nem mentjük (nem hiba).
 * Ami egyikben sincs, az a gyanús: arról senki nem döntött.
 */
const { logger } = require('../utils/logger');

const ELES = String(process.env.UNKNOWN_FIELD_ENFORCE || '').toLowerCase() === 'true';

// Minden kérésben ott van, sosem mentendő — ne zajongjon miattuk.
const ALTALANOS = new Set(['id', '_id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

/**
 * @param {object} body          a kérés törzse
 * @param {string[]} mentheto    amit a végpont eltárol
 * @param {string[]} figyelmenKivul  amit a felület küld, de tudatosan nem mentünk
 * @param {object} req           a naplóbejegyzéshez (útvonal, felhasználó)
 * @returns {{ismeretlen: string[]}}
 */
function ellenoriz(body, mentheto = [], figyelmenKivul = [], req = null) {
  if (!body || typeof body !== 'object') return { ismeretlen: [] };
  const ok = new Set([...mentheto, ...figyelmenKivul, ...ALTALANOS]);
  const ismeretlen = Object.keys(body).filter((k) => !ok.has(k));

  if (ismeretlen.length && req) {
    logger.warn(`[ismeretlen-mező] ${req.method} ${req.originalUrl} — `
      + `a kérés olyan mezőt hozott, amiről senki nem döntött: ${ismeretlen.join(', ')} `
      + `(felhasználó: ${req.user?.email || '?'}) `
      + `${ELES ? '→ ELUTASÍTVA' : '→ most csak naplózás, a mentés folytatódik'}`);
  }
  return { ismeretlen };
}

/**
 * Végponton belüli használat. Az 1. fázisban SOHA nem utasít el — visszaadja, hogy
 * volt-e ismeretlen mező, a hívó pedig nyugodtan folytathatja.
 * @returns {boolean} true, ha a kérést el KELL utasítani (csak éles módban)
 */
function blokkol(res, body, mentheto, figyelmenKivul, req) {
  const { ismeretlen } = ellenoriz(body, mentheto, figyelmenKivul, req);
  if (!ismeretlen.length || !ELES) return false;
  res.status(400).json({
    success: false,
    code: 'UNKNOWN_FIELD',
    message: `Ismeretlen vagy nem szerkeszthető mező: ${ismeretlen.join(', ')}. `
      + 'A mentés NEM történt meg.',
  });
  return true;
}

module.exports = { ellenoriz, blokkol, ELES };
