/**
 * signedArchive — az aláírt dokumentum megőrzése és visszaadása.
 *
 * A SZABÁLY EGY MONDATBAN: ha egy dokumentumot aláírtak, a letöltés az AKKOR renderelt
 * példányt adja vissza, nem egy frisset.
 *
 * Miért nem elég "majd újragenráljuk ugyanabból az adatból": mert a SABLON is változik.
 * A mostani HTML-átállás után ugyanaz az adat más elrendezésben, más tördeléssel, más
 * betűvel jelenne meg. Egy vitában a másik fél papírja és a mi nyomtatásunk nem
 * egyezne — nem hamisítás miatt, hanem mert sosem őriztük meg, amit aláírtak.
 *
 * HÁROM SZINT, ebben a sorrendben:
 *   1. megőrzött PDF (bájtazonos)                    → ezt adjuk, ha van;
 *   2. újrarenderelés az aláírás PILLANATKÉPÉBŐL     → a tartalom hű, a forma új;
 *   3. friss renderelés az aktuális adatból          → csak alá NEM írt dokumentumnál.
 * A 2. szint azért kell, mert a mig 178 ELŐTT aláírt dokumentumokhoz nincs megőrzött
 * példány — azoknál a pillanatkép az, amink van.
 */
const crypto = require('crypto');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Megőrzés. A hívó az aláírás UTÁN, a válasz útján KÍVÜL hívja: a PDF-gyártás
 * Chrome-ot indít, és a helyszínen álló lakó aláírása nem múlhat ezen.
 */
async function archive({ subjectType, subjectId, docKind, language, signatureId,
                         pdfBuffer, templateVersion }) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('Üres PDF-et nem őrzünk meg — az semmit nem bizonyítana.');
  }
  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const r = await query(
    `INSERT INTO signed_document_archive
       (subject_type, subject_id, doc_kind, language, signature_id,
        pdf_bytes, pdf_sha256, byte_size, template_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT DO NOTHING
     RETURNING id, pdf_sha256, byte_size`,
    [subjectType, subjectId, docKind, language, signatureId || null,
     pdfBuffer, hash, pdfBuffer.length, templateVersion || 'ismeretlen']);

  if (r.rows[0]) {
    logger.info(`[signedArchive] megőrizve: ${subjectType}/${subjectId}/${docKind}/${language} `
      + `— ${r.rows[0].byte_size} bájt, sha=${hash.slice(0, 16)}…`);
  }
  return r.rows[0] || null;
}

/** A megőrzött példány, ha van. */
async function fetchArchived(subjectType, subjectId, docKind, language) {
  const r = await query(
    `SELECT pdf_bytes, pdf_sha256, template_version, created_at, language
       FROM signed_document_archive
      WHERE subject_type = $1 AND subject_id = $2 AND doc_kind = $3
        AND ($4::varchar IS NULL OR language = $4)
      ORDER BY created_at DESC LIMIT 1`,
    [subjectType, subjectId, docKind, language || null]);
  return r.rows[0] || null;
}

/**
 * Van-e aláírás, és ha igen, melyik nyelven? A letöltés ebből tudja meg, hogy
 * a dokumentumot NEM szabad frissen renderelni.
 */
async function signedState(subjectType, subjectId) {
  const r = await query(
    `SELECT id, language, signed_snapshot, signed_at
       FROM document_signatures
      WHERE subject_type = $1 AND subject_id = $2 AND refused_at IS NULL
      ORDER BY CASE signer_role WHEN 'resident' THEN 0 ELSE 1 END, signed_at
      LIMIT 1`, [subjectType, subjectId]);
  return r.rows[0] || null;
}

/**
 * A letöltési út döntése. A hívó ebből tudja, mit kell tennie.
 * @returns {{mod:'archivalt'|'pillanatkepbol'|'friss', ...}}
 */
async function resolveForDownload(subjectType, subjectId, docKind, kertNyelv) {
  const alairas = await signedState(subjectType, subjectId);
  if (!alairas) return { mod: 'friss', language: kertNyelv || 'hu' };

  // ALÁÍRT dokumentum: a nyelv NEM a letöltő választása. Amit ukránul írtak alá, az
  // ukránul hiteles — egy magyarul letöltött példány más szöveget mutatna.
  const nyelv = alairas.language;
  const arch = await fetchArchived(subjectType, subjectId, docKind, nyelv);
  if (arch) {
    return { mod: 'archivalt', language: nyelv, pdf: arch.pdf_bytes,
             sha256: arch.pdf_sha256, templateVersion: arch.template_version,
             archivedAt: arch.created_at };
  }
  return { mod: 'pillanatkepbol', language: nyelv,
           snapshot: alairas.signed_snapshot, signatureId: alairas.id };
}

module.exports = { archive, fetchArchived, signedState, resolveForDownload };
