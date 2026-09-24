/**
 * signature.controller — EGY végpontcsalád mind a négy dokumentumtípusra.
 *
 * Szándékosan nem dokumentumtípusonként külön útvonal: a négy típus különbsége a
 * nyilatkozat SZÖVEGE, nem a folyamat. Négy útvonalból három előbb-utóbb lemaradna
 * egy javításról.
 */
const signatures = require('../services/signature.service');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inspHtmlPdf = require('../services/inspectionHtmlPdf.service');
const signedArchive = require('../services/signedArchive.service');

/**
 * Az ellenőrzési nyilatkozat paraméterei — az ÉLŐ konfigurációból.
 *
 * A bírság ma ki van kapcsolva, de amikor élesítik, a jogalap az lesz, hogy a lakó
 * TUDTA, mit ír alá. Ezért a szöveg nem általánosságban beszél következményről, hanem
 * kimondja: mi az eredmény, mi számít "nem megfelelő"-nek, hányadik alkalomnál, és
 * mennyi. Az értékek a `hygiene_fine_config`-ból jönnek — ha az összeg változik, a
 * szöveg is más lesz, és az aláírt példány azt őrzi, ami AKKOR élt.
 */
async function ellenorzesParamok(subjectId) {
  const cfg = (await query(
    `SELECT consecutive_fails, fail_hygiene_max, fine_amount
       FROM hygiene_fine_config LIMIT 1`)).rows[0] || {};
  const insp = (await query(
    'SELECT grade, hygiene_score, total_score FROM inspections WHERE id = $1',
    [subjectId])).rows[0] || {};

  // A pontszám hiánya NEM tölthető ki tetszőlegesen: ha nincs, azt mondjuk ki.
  const pont = insp.hygiene_score ?? insp.total_score;
  return {
    eredmeny_kulcs: insp.grade || 'ismeretlen',
    pontszam: pont ?? '—',
    kuszob: cfg.fail_hygiene_max ?? 15,
    alkalom: cfg.consecutive_fails ?? 2,
    osszeg: Number(cfg.fine_amount ?? 10000).toLocaleString('hu-HU'),
  };
}

/**
 * A dokumentum pillanatképe — ez kerül az aláírás mellé, és ebből reprodukálható
 * később a PDF. Csak azt tesszük bele, ami a képernyőn is látszott: ha olyan adatot
 * rögzítenénk, amit az aláíró nem látott, az ellene szólna egy vitában.
 */
async function pillanatkep(subjectType, subjectId) {
  if (subjectType === 'damage_report') {
    const r = await query(
      `SELECT report_number, incident_date, description, total_cost, fault_percentage,
              liability_type, damage_items
         FROM damage_reports WHERE id = $1`, [subjectId]);
    return r.rows[0] || null;
  }
  if (subjectType === 'compensation_resident') {
    const r = await query(
      `SELECT cr.resident_name, cr.amount_assigned, cr.status,
              c.compensation_number, c.description, c.amount_gross
         FROM compensation_residents cr
         JOIN compensations c ON c.id = cr.compensation_id
        WHERE cr.id = $1`, [subjectId]);
    return r.rows[0] || null;
  }
  if (subjectType === 'inspection') {
    const r = await query(
      `SELECT inspection_number, inspection_type, scheduled_at, total_score, grade,
              general_notes
         FROM inspections WHERE id = $1`, [subjectId]);
    return r.rows[0] || null;
  }
  if (subjectType === 'document') {
    const r = await query(
      'SELECT title, document_type, description FROM documents WHERE id = $1', [subjectId]);
    return r.rows[0] || null;
  }
  return null;
}

/** A nyilatkozat szövege mind az 5 nyelven — ezt mutatja a felület aláírás előtt. */
const getTexts = async (req, res) => {
  try {
    const { subjectType, signerRole, subjectId } = req.query;
    if (!signatures.TARGYAK.includes(subjectType)
        || !signatures.SZEREPEK.includes(signerRole)) {
      return res.status(400).json({ success: false, message: 'Ismeretlen típus vagy szerep' });
    }
    // Az ellenőrzésnél a szöveg a KONKRÉT eredményt tartalmazza, tehát tudnunk kell,
    // melyik ellenőrzésről van szó. A felület ugyanazt a szöveget mutatja, amit aztán
    // aláír — ha a kettő eltérne, az aláírás nem arról szólna, amit elolvasott.
    const params = (subjectType === 'inspection' && signerRole === 'resident' && subjectId)
      ? await ellenorzesParamok(subjectId) : {};
    res.json({
      success: true,
      data: { texts: signatures.nyilatkozatMind(subjectType, signerRole, params) },
    });
  } catch (e) {
    logger.error(`[signature.getTexts] ${e.message}`);
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

const list = async (req, res) => {
  try {
    const rows = await signatures.listFor(req.params.subjectType, req.params.subjectId);
    res.json({ success: true, data: { signatures: rows } });
  } catch (e) {
    logger.error(`[signature.list] ${e.message}`);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const create = async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const {
      signer_role, signer_name, signer_employee_id, signer_user_id,
      language, signature_png, refusal_reason, signed_on,
    } = req.body;

    const kep = await pillanatkep(subjectType, subjectId);
    if (!kep) {
      return res.status(404).json({ success: false, message: 'A dokumentum nem található' });
    }

    const r = await signatures.sign({
      subjectType, subjectId,
      signerRole: signer_role,
      signerName: signer_name,
      signerEmployeeId: signer_employee_id,
      signerUserId: signer_user_id,
      language,
      textParams: (subjectType === 'inspection' && signer_role === 'resident')
        ? await ellenorzesParamok(subjectId) : {},
      snapshot: kep,
      signaturePng: signature_png,
      refusalReason: refusal_reason,
      // Alapeset a személyzeti készülék: a szállásfelelős odaadja a telefont. A saját
      // telefonos aláírást a lakói végpont állítja 'own_phone'-ra.
      signedOn: signed_on || 'staff_device',
      req,
      operatorUserId: req.user.id,
    });
    // AZ ALÁÍRT PÉLDÁNY MEGŐRZÉSE — a válasz UTÁN, a kérés útján KÍVÜL.
    // A PDF-gyártás Chrome-ot indít: lassú, és elbukhat. A helyszínen álló lakó
    // aláírása nem múlhat ezen, ezért előbb válaszolunk, és csak utána archiválunk.
    // Ha nem sikerül, a letöltés a pillanatképből renderel — a tartalom akkor is hű.
    res.status(201).json({ success: true, data: r });
    megorzes(subjectType, subjectId, language, r.id).catch((e) => {
      logger.warn(`[signature] a megőrzés nem sikerült (${subjectType}/${subjectId}): ${e.message}`);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    // Az egyedi index: egy szerep egyszer ír alá. Ez NEM technikai hiba, hanem
    // érdemi állapot — mondjuk is ki, ne "Hiba történt"-et.
    if (e.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Ez a szerep már aláírta ezt a dokumentumot. '
          + 'Újraaláíráshoz a meglévőt vissza kell vonni.',
      });
    }
    logger.error(`[signature.create] ${e.message}`);
    res.status(500).json({ success: false, message: 'Az aláírás rögzítése nem sikerült' });
  }
};

/**
 * Az aláírt dokumentum bájtazonos megőrzése.
 *
 * Csak az ELLENŐRZÉSI jegyzőkönyvre és a kárjegyzőkönyvre van értelme: azokból készül
 * papír, amit a lakó kezébe adunk. A kárigénynél a felszólítás külön kerül ki.
 */
async function megorzes(subjectType, subjectId, language, signatureId) {
  if (subjectType === 'inspection') {
    const { pdf, templateVersion } =
      await inspHtmlPdf.generateInspection(subjectId, 'legal', language);
    await signedArchive.archive({
      subjectType, subjectId, docKind: 'legal', language, signatureId,
      pdfBuffer: pdf, templateVersion });
    return;
  }
  if (subjectType === 'damage_report') {
    const damage = require('../services/damageReport.service');
    const drPdf = require('../services/damageReportPdf.service');
    const report = await damage.getById(subjectId);
    report.signatures = await signatures.listFor('damage_report', subjectId);
    const pdf = await drPdf.generatePDF(report, language);
    await signedArchive.archive({
      subjectType, subjectId, docKind: 'legal', language, signatureId,
      pdfBuffer: pdf, templateVersion: 'damageReport-html-1' });
  }
}

module.exports = { getTexts, list, create };
