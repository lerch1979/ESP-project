/**
 * policy — az L-szint kapu (spec 1.5: "L-szint a kódban, nem a promptban").
 *
 * EZ A MODUL AZ, AMI NEMET MOND. Minden tervezett akció ezen megy át, és a válasz
 * vagy `execute` (most végrehajtható), vagy `planned` (terv, emberre vár), vagy
 * `blocked` (egyáltalán nem). A promptnak, az LLM-nek és a hívó kódnak semmi
 * ráhatása nincs — a döntés az `agent_action_policy` táblából és az üzemmódból jön.
 *
 * AZ 1. HÉTEN MINDEN SOR `enabled=false`, tehát ez a kapu MINDENT visszatart. Ez nem
 * hiányosság, hanem a spec 10. fejezetének szándéka: előbb a váz, aztán a mérés
 * (7.1 golden set), aztán 14 nap shadow, és csak utána élesítés — tételesen.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const crypto = require('crypto');
const mode = require('./mode');

/**
 * AZ ÖRÖK L1 ZÓNA — a spec 6. fejezetének utolsó sora: "Soha nem L2. Policy táblában
 * hard-coded max 1."
 *
 * Ez itt MÁSODIK réteg: az adatbázisban is CHECK constraint őrzi (mig 183). Miért
 * mindkettő? A CHECK a táblát védi az elgépelt UPDATE-től; ez a lista a KÓDOT védi
 * attól, hogy egy hibás vagy megkerült policy-sor (kézi INSERT, visszaállított
 * backup, migrációs hiba) L2-t engedjen valamire, ami pénzhez, szerződéshez,
 * munkaviszonyhoz vagy hatósághoz nyúl. Két független helyen kell hibázni ahhoz,
 * hogy baj legyen.
 */
const OROK_L1 = new Set([
  'draft_email_reply', 'extract_attachment_data', 'close_ticket',
  'change_room', 'terminate', 'unlock_account',
]);

const CACHE_MS = 30000;
let cache = { sorok: null, ido: 0 };

/** A teljes policy tábla, cache-elve. */
async function loadPolicy({ force = false } = {}) {
  if (!force && cache.sorok && Date.now() - cache.ido < CACHE_MS) return cache.sorok;
  const r = await query(
    `SELECT action_type, max_autonomy_level, min_confidence, enabled
       FROM agent_action_policy ORDER BY action_type`
  );
  const map = new Map();
  for (const s of r.rows) {
    map.set(s.action_type, {
      action_type: s.action_type,
      // A NUMERIC a pg-ből sztringként jön — ha nem alakítjuk számmá, a
      // `0.9 >= '0.900'` összehasonlítás sztring-összehasonlítás lenne, és
      // némán rossz eredményt adna. Ez a fajta hiba nem dob hibát, csak téved.
      max_autonomy_level: Number(s.max_autonomy_level),
      min_confidence: Number(s.min_confidence),
      enabled: s.enabled === true,
    });
  }
  cache = { sorok: map, ido: Date.now() };
  return map;
}

function cacheUrit() { cache = { sorok: null, ido: 0 }; }

/**
 * Az idempotencia-kulcs (spec 7.4): `source_id + action_type + hash`.
 *
 * A KULCS AZ, AMI A DUPLA VÉGREHAJTÁST LEHETETLENNÉ TESZI — de csak az
 * `agent_actions.idempotency_key` UNIQUE indexével együtt. A kód itt csak KISZÁMOLJA;
 * a "nem megy be kétszer" garanciát az adatbázis adja, mert egy jövőbeli átírás a
 * kódban lévő ellenőrzést kikerülhetné, az egyedi indexet nem.
 *
 * A payload hash-ébe a kulcsok SORRENDJE nem számíthat bele, különben ugyanaz az
 * akció két JSON-sorrenddel két külön kulcsot kapna — vagyis kétszer futna le.
 */
function kanonikus(ertek) {
  if (Array.isArray(ertek)) return ertek.map(kanonikus);
  if (ertek && typeof ertek === 'object') {
    return Object.keys(ertek).sort().reduce((o, k) => { o[k] = kanonikus(ertek[k]); return o; }, {});
  }
  return ertek;
}

function idempotencyKey(sourceId, actionType, payload = {}) {
  if (!sourceId || !actionType) {
    throw new Error('idempotencyKey: sourceId és actionType kötelező');
  }
  const h = crypto.createHash('sha256')
    .update(JSON.stringify(kanonikus(payload)))
    .digest('hex')
    .slice(0, 16);
  return `${sourceId}:${actionType}:${h}`;
}

/**
 * A KAPU. Egy tervezett akcióról megmondja, mi történhet vele.
 *
 * @param {{action_type:string, confidence?:number, force_review?:boolean,
 *          rule_llm_agree?:boolean, category?:string}} terv
 * @returns {Promise<{decision:'execute'|'planned'|'blocked', autonomy_level:number,
 *                    reason:string, policy:object|null}>}
 */
async function gate(terv, opts = {}) {
  const policy = opts.policy || await loadPolicy();
  const p = policy.get(terv.action_type) || null;
  const uzemmod = opts.mode || await mode.getMode();

  const nem = (decision, reason, szint) => ({
    decision, autonomy_level: szint ?? (p ? p.max_autonomy_level : 1), reason, policy: p,
  });

  // 1. ISMERETLEN AKCIÓTÍPUS → blokk. Nem "valószínűleg rendben van": amire nincs
  //    policy sor, arra nincs engedély. Ez zárja ki, hogy egy új akciótípus
  //    bevezetése véletlenül szabályozás nélkül fusson.
  if (!p) {
    logger.warn('Ismeretlen agent akciótípus — blokkolva', { action_type: terv.action_type });
    return nem('blocked', `nincs policy sor a(z) "${terv.action_type}" akcióra`, 1);
  }

  // 2. ÖRÖK L1 ZÓNA — a kód oldali második réteg. Ha a tábla mégis L2-t engedne,
  //    itt megállunk, és ezt HIBASZINTEN naplózzuk: az adatbázis CHECK-je szerint ez
  //    lehetetlen, tehát ha megtörténik, az bug (spec 7.5 riasztási lista).
  let maxSzint = p.max_autonomy_level;
  if (OROK_L1.has(terv.action_type) && maxSzint > 1) {
    logger.error('POLICY SÉRÜLÉS: örök-L1 akcióra L2 engedély van a táblában', {
      action_type: terv.action_type, max_autonomy_level: maxSzint,
    });
    maxSzint = 1;
  }

  // 3. ÜZEMMÓD. `off`-ban semmi; `shadow`-ban minden terv marad (ez a shadow lényege).
  if (uzemmod === 'off') return nem('blocked', 'AGENT_MODE=off', maxSzint);
  if (uzemmod !== 'live') return nem('planned', `AGENT_MODE=${uzemmod} — csak terv`, maxSzint);

  // 4. TÉTELES ENGEDÉLY. Élesítés akciónként történik, nem egyben.
  if (!p.enabled) return nem('planned', 'a policy sor nincs engedélyezve (enabled=false)', maxSzint);

  // 5. L1 = EMBER. Ezt nem a confidence dönti el: a lezárás, a szobacsere és a
  //    felmondás akkor sem az agent dolga, ha 100%-ig biztos benne.
  if (maxSzint <= 1) return nem('planned', `L${maxSzint}: ember dönt`, maxSzint);

  // 6. PÉNZ-SZÓ ÉS A KÉNYES KATEGÓRIÁK (spec 5., utolsó küszöb): "mindig review,
  //    FÜGGETLENÜL a confidence-től". Ezért van a confidence-vizsgálat ELŐTT.
  if (terv.force_review) return nem('planned', 'force_review (pl. pénz-szó, R090)', maxSzint);
  if (['admin', 'partner', 'authority'].includes(terv.category)) {
    return nem('planned', `a "${terv.category}" kategória mindig emberhez megy`, maxSzint);
  }

  // 7. CONFIDENCE. A küszöb a táblából jön (a `link_duplicate` 0.95-e nem a kódban van).
  const conf = typeof terv.confidence === 'number' ? terv.confidence : 0;
  if (conf < p.min_confidence) {
    return nem('planned', `confidence ${conf.toFixed(3)} < ${p.min_confidence.toFixed(3)}`, maxSzint);
  }

  // 8. RULE ÉS LLM EGYETÉRTÉSE (spec 5.): autonóm akcióhoz egyetértés kell. Ha a hívó
  //    NEM adja meg, nem feltételezzük — az ismeretlen nem "igen".
  if (terv.rule_llm_agree === false) {
    return nem('planned', 'a szabálymotor és az LLM nem ért egyet', maxSzint);
  }

  return { decision: 'execute', autonomy_level: maxSzint, reason: 'engedélyezve', policy: p };
}

module.exports = { loadPolicy, gate, idempotencyKey, kanonikus, cacheUrit, OROK_L1 };
