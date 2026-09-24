/**
 * signature.service — az EGYETLEN hely, ahol aláírás keletkezik.
 *
 * Négyféle dokumentumot szolgál ki (kárjegyzőkönyv, ellenőrzés, kárigény, általános
 * dokumentum) ugyanazzal a mechanizmussal. Ugyanaz az elv, mint a megosztó linkeknél:
 * ha négy helyen íródna aláírás, négy helyen csúszna el a bizonyító erő — és mindig
 * azon a ritkábban olvasott ágon, ahol senki nem nézi.
 *
 * AMIT EZ A SZOLGÁLTATÁS GARANTÁL, és amit ezért nem lehet megkerülni:
 *   • a szöveget SZÓ SZERINT tárolja, nem sablon-hivatkozásként;
 *   • a nyelvet az aláírás pillanatában rögzíti;
 *   • az eszközt, az IP-t és a kezelőt kötelezően kéri — hiányuk hiba, nem üres mező;
 *   • a megjelenített adatok pillanatképéből ujjlenyomatot képez, amiből a dokumentum
 *     később reprodukálható és ellenőrizhető.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const NYELVEK = ['hu', 'en', 'uk', 'tl', 'de'];
const TARGYAK = ['damage_report', 'inspection', 'compensation_resident', 'document'];
const SZEREPEK = ['resident', 'staff', 'witness'];

// ─── A nyilatkozat szövege ───────────────────────────────────────────────────

function szovegFajl(nyelv) {
  const biztos = NYELVEK.includes(nyelv) ? nyelv : 'hu';
  return path.join(__dirname, '..', 'locales', biztos, 'signatureTexts.json');
}

/**
 * A szerephez és dokumentumtípushoz tartozó nyilatkozat, a kért nyelven.
 *
 * NINCS CSENDES VISSZAESÉS MAGYARRA. Ha egy nyelvhez hiányzik a szöveg, az HIBA:
 * egy ukrán lakónak magyar nyilatkozatot aláíratni pontosan az a helyzet, amit el
 * akarunk kerülni — a tulajdonos szavaival "jogilag értéktelen".
 */
function nyilatkozat(subjectType, signerRole, nyelv) {
  if (!NYELVEK.includes(nyelv)) {
    throw Object.assign(new Error(`Ismeretlen nyelv: ${nyelv}`), { status: 400 });
  }
  const d = JSON.parse(fs.readFileSync(szovegFajl(nyelv), 'utf8'));
  const kulcs = signerRole === 'resident' ? `${subjectType}.resident` : signerRole;
  const szoveg = d.texts[kulcs];
  if (!szoveg) {
    throw Object.assign(
      new Error(`Hiányzik a nyilatkozat szövege: ${kulcs} (${nyelv})`), { status: 500 });
  }
  return { text: szoveg, version: d.version };
}

/** Mind az 5 nyelven — a felület ezt mutatja, hogy a lakó a sajátját válassza. */
function nyilatkozatMind(subjectType, signerRole) {
  const ki = {};
  for (const ny of NYELVEK) ki[ny] = nyilatkozat(subjectType, signerRole, ny).text;
  return ki;
}

// ─── Ujjlenyomat ─────────────────────────────────────────────────────────────

/**
 * A (szöveg + adatok) kanonikus ujjlenyomata.
 *
 * A kulcsok rendezése nem kozmetika: JSON.stringify a beszúrási sorrendet őrzi, tehát
 * ugyanaz az adat kétféle hash-t adna aszerint, hogy milyen sorrendben építettük fel.
 * Egy ellenőrizhetetlen ujjlenyomat rosszabb a semminél.
 */
function kanonikus(ertek) {
  if (Array.isArray(ertek)) return ertek.map(kanonikus);
  if (ertek && typeof ertek === 'object' && !(ertek instanceof Date)) {
    return Object.keys(ertek).sort().reduce((acc, k) => {
      acc[k] = kanonikus(ertek[k]); return acc;
    }, {});
  }
  return ertek;
}

function ujjlenyomat(szoveg, pillanatkep) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ t: szoveg, s: kanonikus(pillanatkep) }))
    .digest('hex');
}

// ─── Rögzítés ────────────────────────────────────────────────────────────────

function kotelezo(ertek, nev) {
  if (ertek === undefined || ertek === null || String(ertek).trim() === '') {
    throw Object.assign(
      new Error(`A bizonyító erőhöz kötelező adat hiányzik: ${nev}. `
        + 'Ez utólag nem pótolható, ezért az aláírás nem rögzíthető nélküle.'),
      { status: 400 });
  }
  return ertek;
}

/**
 * Aláírás rögzítése.
 *
 * @param {object} p
 * @param {'damage_report'|'inspection'|'compensation_resident'|'document'} p.subjectType
 * @param {string} p.subjectId
 * @param {'resident'|'staff'|'witness'} p.signerRole
 * @param {string} p.signerName          a tanú nem felhasználónk — a nevét mindig kérjük
 * @param {string} [p.signerEmployeeId]
 * @param {string} [p.signerUserId]
 * @param {string} p.language            amilyen nyelven ELOLVASTA
 * @param {object} p.snapshot            a megjelenített adatok, ahogy látta
 * @param {string} [p.signaturePng]      data:image/png;base64,… — megtagadásnál üres
 * @param {string} [p.refusalReason]     megtagadás esetén
 * @param {'staff_device'|'own_phone'} p.signedOn
 * @param {object} p.req                 az IP és a user-agent forrása
 * @param {string} p.operatorUserId      ki volt belépve a készüléken
 */
async function sign(p) {
  if (!TARGYAK.includes(p.subjectType)) {
    throw Object.assign(new Error(`Ismeretlen dokumentumtípus: ${p.subjectType}`), { status: 400 });
  }
  if (!SZEREPEK.includes(p.signerRole)) {
    throw Object.assign(new Error(`Ismeretlen aláírói szerep: ${p.signerRole}`), { status: 400 });
  }
  const megtagadas = !p.signaturePng;
  if (megtagadas && !p.refusalReason) {
    throw Object.assign(
      new Error('Aláírás vagy a megtagadás indoka szükséges. Üres sornak nincs bizonyító ereje.'),
      { status: 400 });
  }

  const nyelv = kotelezo(p.language, 'nyelv');
  const { text, version } = nyilatkozat(p.subjectType, p.signerRole, nyelv);
  const pillanatkep = p.snapshot || {};
  const hash = ujjlenyomat(text, pillanatkep);

  // Az `ip` oszlop inet típusú: egy üres sztring hibát dobna, a `req.ip` viszont
  // proxy mögött 'x-forwarded-for'-ból jön. A Caddy mögött ez mindig kitöltött.
  const ip = kotelezo(p.req?.ip || p.req?.headers?.['x-forwarded-for'], 'IP-cím');
  const ua = kotelezo(p.req?.headers?.['user-agent'], 'eszköz (user-agent)');
  const kezelo = kotelezo(p.operatorUserId, 'kezelő felhasználó');
  const signedOn = kotelezo(p.signedOn, 'aláírás helye (készülék)');

  const r = await query(
    `INSERT INTO document_signatures (
       subject_type, subject_id, signer_role, signer_employee_id, signer_user_id,
       signer_name, signed_text, signed_text_version, language, signed_snapshot,
       content_sha256, signed_on, ip, user_agent, operator_user_id,
       signature_png, refused_at, refusal_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               ${megtagadas ? 'NOW()' : 'NULL'}, $17)
     RETURNING id, signed_at, content_sha256`,
    [p.subjectType, p.subjectId, p.signerRole, p.signerEmployeeId || null,
     p.signerUserId || null, kotelezo(p.signerName, 'aláíró neve'), text, version, nyelv,
     JSON.stringify(pillanatkep), hash, signedOn, String(ip).split(',')[0].trim(), ua, kezelo,
     megtagadas ? null : p.signaturePng, p.refusalReason || null]);

  logger.info(`[signature] ${p.subjectType}/${p.subjectId} — ${p.signerRole} `
    + `${megtagadas ? 'MEGTAGADTA' : 'aláírta'} (${nyelv}, ${signedOn})`);
  return r.rows[0];
}

/** Egy dokumentum aláírásai. A PNG-t is visszaadja — a PDF abba rajzolja bele. */
async function listFor(subjectType, subjectId) {
  const r = await query(
    `SELECT id, signer_role, signer_name, signer_employee_id, language,
            signed_text, signed_text_version, signed_at, signed_on,
            content_sha256, signature_png, refused_at, refusal_reason
       FROM document_signatures
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY signed_at`, [subjectType, subjectId]);
  return r.rows;
}

/**
 * Ellenőrzés: a most megjelenített adatok megegyeznek-e azzal, amit aláírtak?
 * Ez az, amivel egy vitában bizonyítható, hogy a bemutatott dokumentum ugyanaz.
 */
async function verify(signatureId, mostaniSnapshot) {
  const r = await query(
    'SELECT signed_text, content_sha256 FROM document_signatures WHERE id = $1',
    [signatureId]);
  if (!r.rows[0]) return { ok: false, ok_ok: 'nincs ilyen aláírás' };
  const most = ujjlenyomat(r.rows[0].signed_text, mostaniSnapshot);
  return { ok: most === r.rows[0].content_sha256, tarolt: r.rows[0].content_sha256, most };
}

module.exports = {
  sign, listFor, verify, nyilatkozat, nyilatkozatMind, ujjlenyomat,
  NYELVEK, TARGYAK, SZEREPEK,
};
