/**
 * residentSignature — a lakó a SAJÁT telefonján ír alá.
 *
 * MIÉRT KÜLÖN KONTROLLER a személyzeti úttól: mert a JOGOSULTSÁG kérdése gyökeresen
 * más. A személyzeti úton a munkatárs bármelyik jegyzőkönyvet aláíratja, mert ő kezeli
 * őket. Itt viszont a lakó maga kezdeményez, tehát tételesen el kell dönteni, hogy az
 * adott dokumentum RÁ vonatkozik-e — különben bárki aláírhatná bárki kárjegyzőkönyvét,
 * és pont a bizonyító erő veszne el.
 *
 * AMI ITT MÁS, ÉS AMIÉRT JOGILAG ERŐSEBB:
 *   • a lakó a SAJÁT fiókjából lép be (nem mi adjuk oda a telefont);
 *   • a SAJÁT nyelvén olvassa, amit az appja amúgy is beállított;
 *   • `signed_on = 'own_phone'`, `operator_user_id` = ő maga.
 * A személyzeti eszközön az operátor mi vagyunk — itt a lakó. Egy vitában ez a
 * különbség számít.
 */
const signatures = require('../services/signature.service');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const helpers = require('./signature.controller.helpers');

/** A bejelentkezett felhasználóhoz tartozó dolgozói sor. */
async function sajatDolgozo(userId) {
  const r = await query(
    `SELECT id, first_name, last_name, accommodation_id, user_id
       FROM employees WHERE user_id = $1`,
    [userId]);
  return r.rows[0] || null;
}

/**
 * RÁ VONATKOZIK-E a dokumentum? Ez a biztonsági mag.
 *
 * Szándékosan tételes, típusonként: egy általános "van hozzá köze" szabály előbb-utóbb
 * túl tágra sikerülne, és egy vegyes szálláson más cég dolgozójának jegyzőkönyvét is
 * aláírhatóvá tenné.
 */
async function ravonatkozik(subjectType, subjectId, emp) {
  if (!emp) return false;

  if (subjectType === 'damage_report') {
    const r = await query(
      `SELECT 1 FROM damage_reports
        WHERE id = $1 AND (responsible_employee_id = $2 OR employee_id = $2)`,
      [subjectId, emp.id]);
    return r.rows.length > 0;
  }
  if (subjectType === 'compensation_resident') {
    const r = await query(
      'SELECT 1 FROM compensation_residents WHERE id = $1 AND resident_id = $2',
      [subjectId, emp.id]);
    return r.rows.length > 0;
  }
  if (subjectType === 'inspection') {
    // Az ellenőrzés a SZÁLLÁSRA szól: aki ott lakik, arra vonatkozik. Névsor nincs
    // hozzá (a ház-hatókörű jegyeknél tanult elv), ezért a lakcím a kapocs.
    if (!emp.accommodation_id) return false;
    const r = await query(
      'SELECT 1 FROM inspections WHERE id = $1 AND accommodation_id = $2',
      [subjectId, emp.accommodation_id]);
    return r.rows.length > 0;
  }
  if (subjectType === 'sent_document') {
    // A kapocs a CÍMZETT-sor: neki küldték ki, és a dokumentum aláírást kér.
    const r = await query(
      `SELECT 1 FROM video_announcement_recipients r2
         JOIN video_announcements a ON a.id = r2.announcement_id
         JOIN videos v ON v.id = a.video_id
        WHERE r2.id = $1 AND r2.user_id = $2
          AND v.kind = 'document' AND v.requires_signature`,
      [subjectId, emp.user_id]);
    return r.rows.length > 0;
  }
  if (subjectType === 'document') {
    const r = await query(
      'SELECT 1 FROM documents WHERE id = $1 AND employee_id = $2', [subjectId, emp.id]);
    return r.rows.length > 0;
  }
  return false;
}

/**
 * GET /signatures/my/pending — mi vár aláírásra?
 *
 * Csak az kerül bele, amire a lakó TÉNYLEGESEN alá tud írni, és amit még nem írt alá.
 * Egy lista, amiben olyasmi is szerepel, amit nem tud elintézni, rosszabb az üresnél.
 */
const pending = async (req, res) => {
  try {
    const emp = await sajatDolgozo(req.user.id);
    if (!emp) return res.json({ success: true, data: { items: [] } });

    const r = await query(
      `WITH sajat AS (
         SELECT 'damage_report'::varchar AS t, dr.id, dr.report_number AS azonosito,
                dr.description AS leiras, dr.created_at
           FROM damage_reports dr
          WHERE (dr.responsible_employee_id = $1 OR dr.employee_id = $1)
            AND dr.status NOT IN ('cancelled')
         UNION ALL
         SELECT 'compensation_resident', cr.id, c.compensation_number,
                c.description, cr.created_at
           FROM compensation_residents cr
           JOIN compensations c ON c.id = cr.compensation_id
          WHERE cr.resident_id = $1
         UNION ALL
         SELECT 'inspection', i.id, i.inspection_number, i.general_notes, i.created_at
           FROM inspections i
          WHERE i.accommodation_id = $2 AND i.status = 'completed'
         UNION ALL
         -- KIKÜLDÖTT DOKUMENTUM (házirend, tájékoztató), ha aláírást kér.
         SELECT 'sent_document', r2.id, v.title, v.description, r2.created_at
           FROM video_announcement_recipients r2
           JOIN video_announcements a ON a.id = r2.announcement_id
           JOIN videos v ON v.id = a.video_id
          WHERE r2.user_id = $3 AND v.kind = 'document' AND v.requires_signature
       )
       SELECT s.* FROM sajat s
        WHERE NOT EXISTS (
          SELECT 1 FROM document_signatures ds
           WHERE ds.subject_type = s.t AND ds.subject_id = s.id
             AND ds.signer_role = 'resident')
        ORDER BY s.created_at DESC LIMIT 50`,
      [emp.id, emp.accommodation_id, emp.user_id]);

    res.json({ success: true, data: { items: r.rows } });
  } catch (e) {
    logger.error(`[residentSignature.pending] ${e.message}`);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /signatures/my/:subjectType/:subjectId/text — a nyilatkozat a SAJÁT nyelvén. */
const myText = async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const emp = await sajatDolgozo(req.user.id);
    if (!(await ravonatkozik(subjectType, subjectId, emp))) {
      // "Nem található", nem "nincs jogosultság": a létezés ténye sem szivároghat ki.
      return res.status(404).json({ success: false, message: 'A dokumentum nem található' });
    }
    const nyelv = req.query.language || req.user.preferredLanguage || 'hu';
    const params = subjectType === 'inspection'
      ? await helpers.ellenorzesParamok(subjectId) : {};
    const { text } = signatures.nyilatkozat(subjectType, 'resident', nyelv, params);
    res.json({ success: true, data: { text, language: nyelv } });
  } catch (e) {
    logger.error(`[residentSignature.myText] ${e.message}`);
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

/** POST /signatures/my/:subjectType/:subjectId — a lakó aláír. */
const mySign = async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const emp = await sajatDolgozo(req.user.id);
    if (!(await ravonatkozik(subjectType, subjectId, emp))) {
      return res.status(404).json({ success: false, message: 'A dokumentum nem található' });
    }

    const kep = await helpers.pillanatkep(subjectType, subjectId);
    if (!kep) return res.status(404).json({ success: false, message: 'A dokumentum nem található' });

    const nyelv = req.body.language || req.user.preferredLanguage || 'hu';
    const r = await signatures.sign({
      subjectType, subjectId,
      signerRole: 'resident',
      signerName: `${emp.first_name} ${emp.last_name}`,
      signerEmployeeId: emp.id,
      signerUserId: req.user.id,
      language: nyelv,
      textParams: subjectType === 'inspection'
        ? await helpers.ellenorzesParamok(subjectId) : {},
      snapshot: kep,
      signaturePng: req.body.signature,
      refusalReason: req.body.refusal_reason,
      // A LÉNYEG: saját telefon, saját fiók. A kezelő ŐMAGA, nem mi.
      signedOn: 'own_phone',
      req,
      operatorUserId: req.user.id,
    });

    res.status(201).json({ success: true, data: r });
    helpers.megorzes(subjectType, subjectId, nyelv, r.id).catch((e) => {
      logger.warn(`[residentSignature] a megőrzés nem sikerült: ${e.message}`);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    if (e.code === '23505') {
      return res.status(409).json({
        success: false, message: 'Ezt a dokumentumot már aláírtad.',
      });
    }
    logger.error(`[residentSignature.mySign] ${e.message}`);
    res.status(500).json({ success: false, message: 'Az aláírás rögzítése nem sikerült' });
  }
};

module.exports = { pending, myText, mySign, ravonatkozik, sajatDolgozo };
