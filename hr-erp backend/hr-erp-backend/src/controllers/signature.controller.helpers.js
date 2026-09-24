/**
 * signature.controller.helpers — a személyzeti és a LAKÓI aláírás-út közös darabjai.
 *
 * MIÉRT KÜLÖN FÁJL: a két kontroller ugyanazt a három dolgot csinálja (nyilatkozat-
 * paraméterek, pillanatkép, megőrzés), de a jogosultságuk gyökeresen más. Ha a lakói
 * út MÁSOLNÁ ezeket, a másolat idővel szétcsúszna — és a szétcsúszás pont a ritkábban
 * olvasott ágon, a lakói oldalon maradna észrevétlen.
 */
const { query } = require('../database/connection');
const signatures = require('../services/signature.service');
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
  if (subjectType === 'sent_document') {
    // A pillanatkép a CÍMZETT-sorból és a dokumentumból áll: mit kapott, milyen
    // nyelven, és melyik kiküldésből — ez az, amit a lakó a képernyőn is látott.
    const r = await query(
      `SELECT v.title, v.description, r2.language, d.title AS document_title,
              d.document_type, a.sent_at
         FROM video_announcement_recipients r2
         JOIN video_announcements a ON a.id = r2.announcement_id
         JOIN videos v ON v.id = a.video_id
         LEFT JOIN documents d ON d.id = v.document_id
        WHERE r2.id = $1`, [subjectId]);
    return r.rows[0] || null;
  }
  if (subjectType === 'document') {
    const r = await query(
      'SELECT title, document_type, description FROM documents WHERE id = $1', [subjectId]);
    return r.rows[0] || null;
  }
  return null;
}

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

module.exports = { ellenorzesParamok, pillanatkep, megorzes };
