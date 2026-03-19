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

// ─── HTML Template ──────────────────────────────────────────────────

function buildHTML(report, lang = 'hu') {
  const t = loadTranslations(lang);
  const empName = `${esc(report.employee_first_name || '')} ${esc(report.employee_last_name || '')}`.trim() || 'N/A';
  const photoCount = (report.photo_urls || []).length;
  const plan = report.payment_plan || [];
  const photoText = (t.photoText || '').replace('{{count}}', photoCount || '___');

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
.sl { border-bottom: 1px solid #333; height: 22px; margin-bottom: 1px; }
.sn { font-size: 6.5pt; color: #555; }
.jog { font-size: 6pt; color: #777; margin-top: 4px; }
.ft { font-size: 5.5pt; color: #aaa; text-align: center; margin-top: 3px; border-top: 0.5px solid #ddd; padding-top: 2px; }
</style>
</head>
<body>

<div class="hdr">
  <h1>${esc(t.title)}</h1>
  <div class="m">${esc(t.docNumber)}: <strong>${esc(report.report_number)}</strong> &nbsp;|&nbsp; ${esc(t.date)}: <strong>${formatDate(report.created_at)}</strong></div>
</div>
<div class="dv"></div>

<div class="row">
  <div class="c">
    <div class="st">1. ${esc(t.s1)}</div>
    <div class="f"><b>${esc(t.employee)}:</b> ${empName}</div>
    <div class="f"><b>${esc(t.email)}:</b> ${esc(report.employee_email || 'N/A')}</div>
    <div class="f"><b>${esc(t.employer)}:</b> ${esc(report.contractor_name || 'N/A')}</div>
    <div class="f"><b>${esc(t.incidentDate)}:</b> ${formatDate(report.incident_date)}</div>
    <div class="f"><b>${esc(t.discoveryDate)}:</b> ${formatDate(report.discovery_date)}</div>
  </div>
  <div class="c">
    <div class="st">2. ${esc(t.s2)}</div>
    <div class="f"><b>${esc(t.accommodation)}:</b> ${esc(report.accommodation_id || 'N/A')}</div>
    <div class="f"><b>${esc(t.room)}:</b> ${esc(report.room_id || 'N/A')}</div>
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
<div style="font-size:7.5pt;margin:4px 0 8px 0;">${esc(t.settlementText)}</div>
<div class="td"></div>

<div class="st">7. ${esc(t.s7)}</div>
<div class="ny">${esc(t.declarationText)}${plan.length > 0 ? ` (${plan.length} months)` : ''}</div>

<div class="st">8. ${esc(t.s8)}</div>
<div class="sg">
  <div class="sb"><div class="sl"></div><div class="sn">${esc(t.sigEmployee)}</div><div class="sn">${esc(t.sigDate)}: ${report.employee_signature_date ? formatDate(report.employee_signature_date) : '____________________'}</div></div>
  <div class="sb"><div class="sl"></div><div class="sn">${esc(t.sigManager)}</div><div class="sn">${esc(t.sigDate)}: ${report.manager_signature_date ? formatDate(report.manager_signature_date) : '____________________'}</div></div>
  <div class="sb"><div class="sl"></div><div class="sn">${esc(t.sigWitness)}</div><div class="sn">${esc(t.sigName)}: ${esc(report.witness_name) || '____________________'}</div></div>
</div>

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

    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
    ];
    let chrome = null;
    for (const p of chromePaths) {
      if (fs.existsSync(p)) { chrome = p; break; }
    }
    if (!chrome) throw new Error('Chrome not found');

    execSync(`"${chrome}" --headless --disable-gpu --no-sandbox --print-to-pdf="${tmpPdf}" --print-to-pdf-no-header "file://${tmpHtml}"`, { timeout: 15000, stdio: 'ignore' });
    return fs.readFileSync(tmpPdf);
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

module.exports = { generatePDF, buildHTML, SUPPORTED_LANGS };
