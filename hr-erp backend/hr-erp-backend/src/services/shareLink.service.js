/**
 * EGYESÍTETT megosztási linkek — egy tábla, egy feloldó, négy felhasználási hely.
 *
 * MIÉRT VAN EZ EGYÁLTALÁN
 * -----------------------
 * A rendszerben három, egymástól független megosztási mechanizmus élt — könyvelői
 * hozzáférés (mig 117), elszámoló lap (mig 149), árajánlat (mig 150) —, mindhárom
 * ugyanazzal a biztonsági alakzattal: uuid token az URL-ben, `expires_at` ÉS `revoked_at`
 * minden publikus olvasásnál, csonkolt token a naplóban, megtekintés-számláló. Három
 * másolat azt jelenti, hogy egy javítás — vagy egy megtalált hiba — nem ér el a másik
 * kettőhöz. A tulajdonos 2026-09-03-án úgy döntött, hogy Phase 4-ben egyesítjük.
 *
 * A hibajegy-megosztás azért hozta ezt előre, mert a kérés kifejezetten az volt, hogy NE
 * épüljön negyedik mechanizmus. Így a jegy-link az egyesített tábla első ügyfele lett.
 *
 * MIT GARANTÁL A FELOLDÓ: a lejárat és a visszavonás EGY helyen dől el. Ha ez a függvény
 * helyes, mind a négy megosztás helyes; ha hibás, egy helyen kell javítani.
 */
const crypto = require('crypto');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/** A naplóba SOHA nem kerül teljes token — egy logfájl-szivárgás így nem ad hozzáférést. */
const maskToken = (t) => (t ? `${String(t).slice(0, 8)}…` : '—');

/**
 * Új link. A lejárat KÖTELEZŐ: egy örökké élő megosztás olyan hozzáférés, amiről
 * mindenki elfelejti, hogy létezik.
 */
async function mint({ targetType, targetId = null, context = {}, expiresInDays = 30,
                      createdBy = null, notes = null }) {
  if (!(expiresInDays > 0)) return { error: 'A lejárat kötelező (nap)', status: 400 };
  const token = crypto.randomUUID();
  const r = await query(
    `INSERT INTO share_links (token, target_type, target_id, context, expires_at, created_by, notes)
     VALUES ($1,$2,$3,$4::jsonb, NOW() + ($5 || ' days')::interval, $6, $7)
     RETURNING *`,
    [token, targetType, targetId, JSON.stringify(context || {}), String(expiresInDays), createdBy, notes]);
  logger.info(`[shareLink] új ${targetType} link ${maskToken(token)} (${expiresInDays} nap)`);
  return { data: r.rows[0] };
}

/**
 * Feloldás. EZ AZ EGYETLEN HELY, ahol egy publikus token hozzáféréssé válik.
 *
 * A három ellenőrzés — létezik / nincs visszavonva / nem járt le — külön üzenetet ad,
 * mert a hívó fél számára más a teendő: egy lejárt linkre újat kell kérni, egy
 * visszavontra nem.
 */
async function resolve(token, { targetType = null, ip = null } = {}) {
  if (!token || typeof token !== 'string') return { error: 'Hiányzó azonosító', status: 400 };

  const r = await query('SELECT * FROM share_links WHERE token = $1', [token]);
  const link = r.rows[0];
  if (!link) {
    logger.warn(`[shareLink] ismeretlen token ${maskToken(token)}`);
    return { error: 'A link nem érvényes', status: 404 };
  }
  if (targetType && link.target_type !== targetType) {
    // Nem árulja el, hogy a token létezik, csak más típusra — az információszivárgás is szivárgás.
    return { error: 'A link nem érvényes', status: 404 };
  }
  if (link.revoked_at) return { error: 'A linket visszavonták', status: 410 };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { error: 'A link lejárt', status: 410 };
  }

  // Megtekintés rögzítése. Nem a kérés útjában: ha ez elszáll, a tartalom akkor is menjen.
  query(`UPDATE share_links SET view_count = view_count + 1, last_viewed_at = NOW(),
                last_viewed_ip = COALESCE($2, last_viewed_ip) WHERE id = $1`,
  [link.id, ip]).catch((e) => logger.warn('[shareLink] megtekintés-számláló:', e.message));

  return { data: link };
}

async function revoke(id, userId = null) {
  const r = await query(
    `UPDATE share_links SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING *`, [id]);
  if (r.rows.length === 0) return { error: 'Nem található vagy már visszavonva', status: 404 };
  logger.info(`[shareLink] visszavonva ${maskToken(r.rows[0].token)} (user ${userId || '?'})`);
  return { data: r.rows[0] };
}

/** Egy célpont élő linkjei — a felületen ebből látszik, kinek van még hozzáférése. */
async function listFor(targetType, targetId = null) {
  const r = await query(
    `SELECT * FROM share_links
      WHERE target_type = $1 AND ($2::uuid IS NULL OR target_id = $2)
      ORDER BY created_at DESC`, [targetType, targetId]);
  return r.rows.map((x) => ({
    ...x,
    token: undefined,                       // a listába SOHA nem megy vissza a token
    token_masked: maskToken(x.token),
    active: !x.revoked_at && (!x.expires_at || new Date(x.expires_at) >= new Date()),
  }));
}

module.exports = { mint, resolve, revoke, listFor, maskToken };
