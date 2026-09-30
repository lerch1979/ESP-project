/**
 * mode — a kill switch (spec 1.6): `AGENT_MODE=off|shadow|live`.
 *
 *   off    → semmi. Nem dolgoz fel, nem naplóz, nem tervez.
 *   shadow → mindent kiszámol és naplóz, SEMMIT nem hajt végre.
 *   live   → L2-ig végrehajt (amit a policy tábla engedélyez).
 *
 * KÉT FORRÁS VAN, ÉS A SZIGORÚBB GYŐZ:
 *   • az env (`AGENT_MODE`, deploy-szintű), és
 *   • az adatbázis (`agent_triage_config.mode`, admin-kapcsoló).
 *
 * MIÉRT A SZIGORÚBB: egy éles incidensnél az env-ből le kell tudni fogni az agentet
 * úgy, hogy azt egy admin-kattintás NE tudja visszaengedni. Fordítva viszont működik:
 * env=live mellett a felületről shadow-ra vagy off-ra húzható. Vagyis az env a plafon,
 * a felület a pedál.
 *
 * ALAPÉRTELMEZÉS `off` — beleértve azt is, ha az env értéke hibás vagy hiányzik.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const MODOK = ['off', 'shadow', 'live'];
const SZIGOR = { off: 0, shadow: 1, live: 2 };   // kisebb = szigorúbb

/** Az env-ből olvasott plafon. Érvénytelen érték → `off`, és ezt kimondjuk. */
function envMode() {
  const nyers = (process.env.AGENT_MODE || '').trim().toLowerCase();
  if (!nyers) return 'off';
  if (!MODOK.includes(nyers)) {
    logger.warn('AGENT_MODE érvénytelen, "off"-ként kezelem', { ertek: nyers });
    return 'off';
  }
  return nyers;
}

// Rövid cache: az üzemmódot minden bejövő üzenetnél olvasnánk, de egy kapcsoló-váltás
// ne 10 percig érjen be. 15 másodperc: a bejövő forgalomhoz mérten elhanyagolható
// terhelés, a kapcsoló mégis "azonnalinak" érződik.
const CACHE_MS = 15000;
let cache = { mode: null, ido: 0 };

/**
 * Gondoskodik róla, hogy PONTOSAN EGY config sor legyen.
 *
 * MIÉRT KELL, HOLOTT A MIGRÁCIÓ BESZÚRJA: az `updated_by` a `users`-re hivatkozik, és
 * a FUNCTEST fixture katalógus-alapon törli mindazt, ami a `users.id`-re mutat — vagyis
 * a sor eltűnhet. Enélkül a `setMode` UPDATE-je **nulla soron némán sikeres** lenne: a
 * felület azt jelezné, hogy elmentette az üzemmódot, miközben semmi nem tárolódott.
 * Ez ugyanaz a néma-siker hibaosztály, amit a 2026-09-25-i körben irtottunk ki.
 */
async function biztositSor() {
  const r = await query(
    `INSERT INTO agent_triage_config (mode, reason)
     SELECT 'off', 'Automatikusan pótolt sor — a config sor hiányzott.'
      WHERE NOT EXISTS (SELECT 1 FROM agent_triage_config)
     RETURNING id`
  );
  if (r.rows.length) {
    logger.warn('agent_triage_config: hiányzott a config sor, pótoltam (mode=off)');
  }
}

/** A DB-ben tárolt kapcsoló. Hiba esetén `off` — bizonytalanságban nem futunk. */
async function dbMode() {
  try {
    const r = await query('SELECT mode FROM agent_triage_config LIMIT 1');
    if (!r.rows.length) return 'off';
    return MODOK.includes(r.rows[0].mode) ? r.rows[0].mode : 'off';
  } catch (error) {
    // A NÉMA NYELÉS ITT TILOS: ha a config olvasása elhasal, az agent leáll, és
    // tudni kell, miért — különben "az agent nem dolgozik" néven jön vissza a hiba.
    logger.error('agent_triage_config olvasása sikertelen — "off" üzemmód', {
      hiba: error.message,
    });
    return 'off';
  }
}

/** A tényleges üzemmód: a két forrás közül a SZIGORÚBB. */
async function getMode({ force = false } = {}) {
  if (!force && cache.mode && Date.now() - cache.ido < CACHE_MS) return cache.mode;
  const env = envMode();
  const db = await dbMode();
  const mode = SZIGOR[env] <= SZIGOR[db] ? env : db;
  cache = { mode, ido: Date.now() };
  return mode;
}

/**
 * Üzemmód állítása a felületről.
 *
 * A KÉRT ÉRTÉKET TÁROLJUK, nem a szigorítottat: ha az env miatt most nem érvényesül,
 * az env enyhítése után a szándék érvénybe lép. Az `effective` mezőben viszont
 * visszaadjuk, mi lesz a TÉNYLEGES üzemmód — a felület ezt mutassa, különben az admin
 * azt hiszi, elindította az agentet, holott az env lefogja.
 */
async function setMode(kert, { userId = null, reason = null } = {}) {
  if (!MODOK.includes(kert)) {
    throw new Error(`Érvénytelen üzemmód: ${kert}. Lehetséges: ${MODOK.join(', ')}`);
  }
  await biztositSor();
  const r = await query(
    `UPDATE agent_triage_config
        SET mode = $1, reason = $2, updated_by = $3, updated_at = NOW()
      RETURNING mode`,
    [kert, reason, userId]
  );
  // NÉMA SIKER KIZÁRVA: ha nem írtunk egy sort sem, azt HIBÁNAK kell jelenteni, nem
  // "elmentve"-nek. Egy kapcsoló, ami sikert jelez és nem tárol, a legrosszabb fajta.
  if (r.rows.length !== 1) {
    throw new Error('agent_triage_config: az üzemmód mentése 0 sort érintett — '
      + 'a beállítás NEM tárolódott.');
  }
  cache = { mode: null, ido: 0 };
  const effective = await getMode({ force: true });
  return { stored: kert, effective, env: envMode(), capped: effective !== kert };
}

/** `shadow` és `live` is feldolgoz; `off` nem. */
async function feldolgozhat() {
  return (await getMode()) !== 'off';
}

/** VÉGREHAJTANI csak `live`-ban szabad — shadow-ban minden `planned` marad. */
async function vegrehajthat() {
  return (await getMode()) === 'live';
}

function cacheUrit() { cache = { mode: null, ido: 0 }; }

module.exports = {
  MODOK, envMode, dbMode, getMode, setMode, feldolgozhat, vegrehajthat, cacheUrit,
  biztositSor,
};
