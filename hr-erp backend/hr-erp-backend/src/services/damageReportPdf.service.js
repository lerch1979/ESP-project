/**
 * Damage Report PDF Generation — Multilingual (5 languages)
 * HTML → Chrome Headless PDF for full Unicode support.
 * Mt. 166.§, 177.§, Ptk. 6:142.§ compliant — fits on 1 page.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../utils/logger');

const SUPPORTED_LANGS = ['hu', 'en', 'tl', 'uk', 'de'];

function loadTranslations(lang) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'hu';
  const filePath = path.join(__dirname, '..', 'locales', safeLang, 'damageReport.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    // Fallback to Hungarian
    const fallback = path.join(__dirname, '..', 'locales', 'hu', 'damageReport.json');
    return JSON.parse(fs.readFileSync(fallback, 'utf8'));
  }
}

function formatDate(date) {
  if (!date) return '_______________';
  const d = new Date(date);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

function esc(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Aláírás-blokkok ────────────────────────────────────────────────
//
// AZ ALÁÍRÁSKÉP EDDIG NEM KERÜLT BELE A PDF-BE: a sablon egy üres vonalat rajzolt és
// mellé a dátumot. Vagyis még ha rögzítettük volna is az aláírást, a dokumentumon nem
// látszott — a "digitálisan aláírt jegyzőkönyv" a gyakorlatban egy kinyomtatandó,
// kézzel aláírandó papír maradt.
//
// A kép az egységes tárból (mig 177) jön, a `report.signatures` tömbben.

function sigBlokk(report, t, szerep, cimke) {
  const a = (report.signatures || []).find((x) => x.signer_role === szerep);
  let belso;
  if (a && a.refused_at) {
    // A MEGTAGADÁST IS KI KELL ÍRNI. Egy üres vonal azt sugallná, hogy elfelejtették
    // aláíratni — a megtagadás viszont érdemi tény, és egy vitában ez számít.
    belso = `<div class="sl refused">${esc(t.sigRefused || 'Az aláírást megtagadta')}</div>`;
  } else if (a && a.signature_png) {
    belso = `<div class="sl"><img src="${a.signature_png}" alt="" /></div>`;
  } else {
    belso = '<div class="sl"></div>';
  }
  const datum = a ? formatDate(a.signed_at) : '____________________';
  const nev = a ? esc(a.signer_name) : '';
  return `<div class="sb">${belso}<div class="sn">${esc(cimke)}</div>`
    + `${nev ? `<div class="sn">${nev}</div>` : ''}`
    + `<div class="sn">${esc(t.sigDate)}: ${datum}</div></div>`;
}

/**
 * A bizonyító erő részletei a lap alján: MIT, MILYEN NYELVEN írt alá, és mikor.
 * Enélkül a PDF-ből nem derülne ki az, ami egy vitában a leginkább számít.
 */
function alairasReszletek(report, t) {
  const sorok = (report.signatures || []).filter((a) => !a.refused_at);
  if (sorok.length === 0) return '';
  const lista = sorok.map((a) => `<div class="sd">
      <b>${esc(a.signer_name)}</b> · ${esc(a.language.toUpperCase())} ·
      ${formatDate(a.signed_at)} · ${esc(a.content_sha256.slice(0, 16))}…<br/>
      <i>${esc(a.signed_text)}</i>
    </div>`).join('');
  return `<div class="st">${esc(t.sigDeclared || 'Aláírt nyilatkozatok')}</div>${lista}`;
}

// ─── HTML Template ──────────────────────────────────────────────────

function buildHTML(report, lang = 'hu') {
  const t = loadTranslations(lang);
  // Damage-causer name resolution priority (migration 105):
  //   1) responsible_employee_* — direct FK to employees(id), the canonical column
  //   2) linked_employee_*      — old reports that came from a ticket but
  //                               weren't backfilled before edit
  //   3) employee_*             — legacy users(id) join, mostly admin/staff
  // Whichever path provides the name also implies the email + accommodation
  // are sourced from the same population (or blanked out).
  let useResp = !!(report.responsible_employee_first_name || report.responsible_employee_last_name);
  let useLinked = !useResp && !!(report.linked_employee_first_name || report.linked_employee_last_name);
  const empFirst = useResp   ? report.responsible_employee_first_name
                  : useLinked ? report.linked_employee_first_name
                  : report.employee_first_name;
  const empLast  = useResp   ? report.responsible_employee_last_name
                  : useLinked ? report.linked_employee_last_name
                  : report.employee_last_name;
  const empName = `${esc(empFirst || '')} ${esc(empLast || '')}`.trim() || 'N/A';
  // Treat any employees-table sourcing as "no sensible email row" — the
  // employees table doesn't carry one for residents.
  const useLinked_or_resp = useResp || useLinked;
  const photoCount = (report.photo_urls || []).length;
  const plan = report.payment_plan || [];
  const photoText = (t.photoText || '').replace('{{count}}', photoCount || '___');

  // ── Section 6 cost table ──────────────────────────────────────────
  // Renders a compact 2-column grid only when at least one cost-related
  // field is populated. Falls back to the original boilerplate text
  // otherwise so legacy reports keep printing as they always did.
  const num = (n) => (n === null || n === undefined || n === '') ? null : Number(n);
  const cur = t.currency || 'HUF';
  const fmtMoney = (n) => n == null ? '—' : `${new Intl.NumberFormat('hu-HU').format(n)} ${cur}`;
  const fmtPct   = (n) => n == null ? '—' : `${n}%`;
  const liabilityText = report.liability_type
    ? (t[`liability_${report.liability_type}`] || report.liability_type)
    : '—';
  const totalCost = num(report.total_cost);
  const faultPct  = num(report.fault_percentage);
  const empSalary = num(report.employee_salary);
  const hasCostData = totalCost != null || faultPct != null || empSalary != null
    || (report.liability_type && report.liability_type !== '');

  const costSection = hasCostData ? `
    <div style="display:flex;gap:8px;margin:3px 0;font-size:7.5pt;flex-wrap:wrap;">
      <div style="flex:1 1 45%;min-width:140px;border:0.5px solid #ddd;padding:3px 5px;">
        <b>${esc(t.totalCost || 'Total cost')}:</b> ${esc(fmtMoney(totalCost))}
      </div>
      <div style="flex:1 1 45%;min-width:140px;border:0.5px solid #ddd;padding:3px 5px;">
        <b>${esc(t.faultPercentage || 'Fault %')}:</b> ${esc(fmtPct(faultPct))}
      </div>
      <div style="flex:1 1 45%;min-width:140px;border:0.5px solid #ddd;padding:3px 5px;">
        <b>${esc(t.liabilityType || 'Liability')}:</b> ${esc(liabilityText)}
      </div>
      <div style="flex:1 1 45%;min-width:140px;border:0.5px solid #ddd;padding:3px 5px;">
        <b>${esc(t.employeeSalary || 'Salary')}:</b> ${esc(fmtMoney(empSalary))}
      </div>
    </div>
  ` : `<div style="font-size:7.5pt;margin:4px 0 8px 0;">${esc(t.settlementText)}</div>`;

  // Status pill for the header (small, only if we have a translation key
  // for this status — otherwise omit so we don't print raw slugs).
  const statusLabel = report.status ? (t[`status_${report.status}`] || '') : '';
  const statusPill = statusLabel
    ? ` &nbsp;|&nbsp; ${esc(t.statusLabel || 'Status')}: <strong>${esc(statusLabel)}</strong>`
    : '';

  // Notes block — only render if there's actual content.
  const notesBlock = (report.notes && String(report.notes).trim()) ? `
    <div class="st">${esc(t.notesLabel || 'Notes')}</div>
    <div class="db" style="white-space:pre-wrap;">${esc(report.notes)}</div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
@page { size: A4; margin: 18mm 16mm 14mm 16mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.3; color: #1a1a1a; }
.hdr { text-align: center; margin-bottom: 4px; }
.hdr h1 { font-size: 14pt; font-weight: 800; color: #1E40AF; margin-bottom: 1px; letter-spacing: 1px; }
.hdr .m { font-size: 7.5pt; color: #555; }
.dv { border-top: 2px solid #1E40AF; margin: 3px 0; }
.td { border-top: 0.5px solid #ccc; margin: 3px 0; }
.row { display: flex; gap: 12px; }
.row .c { flex: 1; }
.st { font-size: 9pt; font-weight: 700; color: #1E40AF; margin: 5px 0 2px 0; text-transform: uppercase; letter-spacing: 0.3px; }
.f { margin-bottom: 1px; font-size: 7.5pt; }
.f b { font-weight: 600; color: #555; }
.db { border: 0.5px solid #ddd; padding: 3px 5px; min-height: 20px; font-size: 7.5pt; margin: 2px 0; }
.ck { display: inline-block; width: 9px; height: 9px; border: 1px solid #333; margin-right: 3px; vertical-align: middle; text-align: center; font-size: 6pt; line-height: 9px; }
.ck.on { background: #1E40AF; color: white; }
.ny { font-size: 6.5pt; color: #333; line-height: 1.25; margin: 3px 0; padding: 3px 5px; background: #f8f9fa; border-left: 2px solid #1E40AF; }
.sg { display: flex; gap: 12px; margin-top: 5px; }
.sb { flex: 1; text-align: center; }
.sl { border-bottom: 1px solid #333; height: 30px; margin-bottom: 1px;
       display: flex; align-items: flex-end; justify-content: center; }
.sl img { max-height: 30px; max-width: 100%; }
.sl.refused { font-size: 7pt; color: #a00; align-items: center; }
.sd { font-size: 6.5pt; color: #333; margin: 2px 0; line-height: 1.25; }
.sn { font-size: 6.5pt; color: #555; }
.jog { font-size: 6pt; color: #777; margin-top: 4px; }
.ft { font-size: 5.5pt; color: #aaa; text-align: center; margin-top: 3px; border-top: 0.5px solid #ddd; padding-top: 2px; }
</style>
</head>
<body>

<div class="hdr">
  <h1>${esc(t.title)}</h1>
  <div class="m">${esc(t.docNumber)}: <strong>${esc(report.report_number)}</strong> &nbsp;|&nbsp; ${esc(t.date)}: <strong>${formatDate(report.created_at)}</strong>${statusPill}</div>
</div>
<div class="dv"></div>

<div class="row">
  <div class="c">
    <div class="st">1. ${esc(t.s1)}</div>
    <div class="f"><b>${esc(t.employee)}:</b> ${empName}</div>
    <div class="f"><b>${esc(t.email)}:</b> ${esc(useLinked_or_resp ? '—' : (report.employee_email || 'N/A'))}</div>
    <div class="f"><b>${esc(t.employer)}:</b> ${esc(report.contractor_name || 'N/A')}</div>
    <div class="f"><b>${esc(t.incidentDate)}:</b> ${formatDate(report.incident_date)}</div>
    <div class="f"><b>${esc(t.discoveryDate)}:</b> ${formatDate(report.discovery_date)}</div>
  </div>
  <div class="c">
    <div class="st">2. ${esc(t.s2)}</div>
    <div class="f"><b>${esc(t.accommodation)}:</b> ${esc(report.accommodation_name || report.responsible_employee_accommodation || report.linked_employee_accommodation || 'N/A')}</div>
    <div class="f"><b>${esc(t.room)}:</b> ${esc(report.room_id || report.responsible_employee_room || report.linked_employee_room || 'N/A')}</div>
    ${report.ticket_id ? `<div class="f"><b>${esc(t.ticket)}:</b> #${esc(String(report.ticket_id).substring(0, 8))}</div>` : ''}
  </div>
</div>
<div class="td"></div>

<div class="st">3. ${esc(t.s3)}</div>
<div class="db">${esc(report.description || '')}</div>
<div class="td"></div>

<div class="st">4. ${esc(t.s4)}</div>
<div class="f">${esc(photoText)}</div>
<div class="td"></div>

<div class="st">5. ${esc(t.s5)}</div>
<div style="font-size:7.5pt;margin:2px 0;">${esc(t.liabilityText)}</div>
<div style="font-size:7.5pt;margin:3px 0;">
  <span class="ck${report.employee_acknowledged ? ' on' : ''}">${report.employee_acknowledged ? '✓' : ''}</span> ${esc(t.liabilityCheckbox)}
</div>
<div class="f"><b>${esc(t.tenantStatement)}:</b> _______________________________________________________________</div>
<div class="td"></div>

<div class="st">6. ${esc(t.s6)}</div>
${costSection}
<div class="td"></div>

<div class="st">7. ${esc(t.s7)}</div>
<div class="ny">${esc(t.declarationText)}${plan.length > 0 ? ` (${plan.length} months)` : ''}</div>

<div class="st">8. ${esc(t.s8)}</div>
<div class="sg">
  ${sigBlokk(report, t, 'resident', t.sigEmployee)}
  ${sigBlokk(report, t, 'staff', t.sigManager)}
  ${sigBlokk(report, t, 'witness', t.sigWitness)}
</div>
${alairasReszletek(report, t)}

${notesBlock}
<div class="jog"><b>9. ${esc(t.s9)}:</b> ${esc(t.legalText)}</div>
<div class="ft">${esc(t.generatedBy)} · ${new Date().toISOString().replace('T', ' ').substring(0, 19)}</div>

</body></html>`;
}

// ─── PDF Generation ─────────────────────────────────────────────────

async function generatePDF(report, lang = 'hu') {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'hu';
  const html = buildHTML(report, safeLang);
  const tmpHtml = path.join(os.tmpdir(), `dr_${report.id || Date.now()}_${safeLang}.html`);
  const tmpPdf = path.join(os.tmpdir(), `dr_${report.id || Date.now()}_${safeLang}.pdf`);

  try {
    fs.writeFileSync(tmpHtml, html, 'utf8');

    // UGYANAZ AZ ÚTLISTA, mint a közös renderelőben — a CHROME_BIN elöl, mert a
    // konténerben az Alpine chromium van. Enélkül a kárjegyzőkönyv élesben "Chrome
    // not found"-dal bukott volna el az első aláíratásnál.
    const chromePaths = [
      process.env.CHROME_BIN,
      '/usr/bin/chromium-browser', '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    let chrome = null;
    for (const p of chromePaths) {
      if (fs.existsSync(p)) { chrome = p; break; }
    }
    if (!chrome) throw new Error('Chrome not found');

    // UGYANAZ A HIBA ITT IS: a Chrome 153 a `--print-to-pdf-no-header` mellett is
    // rányomtatta a szerver fájlútvonalát a kárjegyzőkönyvre. Ez eddig észrevétlen
    // volt, mert a kódból nem látszik — csak a kinyomtatott lapon.
    execSync(`"${chrome}" --headless --disable-gpu --no-sandbox --print-to-pdf="${tmpPdf}" `
      + `--print-to-pdf-no-header --no-pdf-header-footer "file://${tmpHtml}"`,
      { timeout: 15000, stdio: 'ignore' });
    return fs.readFileSync(tmpPdf);
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

module.exports = { generatePDF, buildHTML, SUPPORTED_LANGS };
