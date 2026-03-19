/**
 * Damage Report PDF Generation — Kárigény Jegyzőkönyv
 * HTML → Chrome Headless PDF for full Hungarian character support.
 * Mt. 166.§, 177.§, Ptk. 6:142.§ compliant — fits on 1 page.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../utils/logger');

const LIABILITY_LABELS = {
  intentional: 'Szándékos károkozás',
  negligence: 'Gondatlanság',
  normal_wear: 'Rendeltetésszerű használat / természetes elhasználódás',
  force_majeure: 'Vis maior (elháríthatatlan külső ok)',
};

const STATUS_LABELS = {
  draft: 'Tervezet', pending_review: 'Felülvizsgálat alatt',
  pending_acknowledgment: 'Aláírásra vár', acknowledged: 'Tudomásul véve',
  in_payment: 'Fizetés alatt', paid: 'Kifizetve',
  disputed: 'Vitatott', cancelled: 'Visszavonva',
};

function formatDate(date) {
  if (!date) return '_______________';
  const d = new Date(date);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

function formatCurrency(amount) {
  return `${Math.round(amount || 0).toLocaleString('hu-HU')} Ft`;
}

function esc(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── HTML Template (1-page, condensed) ──────────────────────────────

function buildHTML(report) {
  const empName = `${esc(report.employee_first_name || '')} ${esc(report.employee_last_name || '')}`.trim() || 'N/A';
  const items = report.damage_items || [];
  const photoCount = (report.photo_urls || []).length;
  const plan = report.payment_plan || [];

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<style>
@page { size: A4; margin: 20mm 18mm 15mm 18mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.35; color: #1a1a1a; }
.header { text-align: center; margin-bottom: 5px; }
.header h1 { font-size: 14pt; font-weight: 800; color: #1E40AF; margin-bottom: 2px; letter-spacing: 1px; }
.header .meta { font-size: 7.5pt; color: #555; }
.divider { border-top: 2px solid #1E40AF; margin: 4px 0; }
.thin-div { border-top: 0.5px solid #ccc; margin: 3px 0; }
.two-col { display: flex; gap: 14px; }
.two-col .col { flex: 1; }
.stitle { font-size: 9pt; font-weight: 700; color: #1E40AF; margin: 5px 0 2px 0; text-transform: uppercase; letter-spacing: 0.3px; }
.f { margin-bottom: 1px; font-size: 7.5pt; }
.f .l { font-weight: 600; color: #555; }
.dbox { border: 0.5px solid #ddd; padding: 3px 5px; min-height: 22px; font-size: 7.5pt; margin: 2px 0; }
.cb { display: inline-block; width: 9px; height: 9px; border: 1px solid #333; margin-right: 3px; vertical-align: middle; text-align: center; font-size: 6pt; line-height: 9px; }
.cb.on { background: #1E40AF; color: white; }
.cost { font-size: 7.5pt; margin: 1px 0; }
.cost-total { font-weight: 700; font-size: 8.5pt; border-top: 1px solid #333; padding-top: 2px; margin-top: 2px; }
.stmt { font-size: 6.5pt; color: #333; line-height: 1.25; margin: 3px 0; padding: 3px 5px; background: #f8f9fa; border-left: 2px solid #1E40AF; }
.sigs { display: flex; gap: 14px; margin-top: 6px; }
.sig { flex: 1; text-align: center; }
.sig-line { border-bottom: 1px solid #333; height: 24px; margin-bottom: 1px; }
.sig-lbl { font-size: 6.5pt; color: #555; }
.sig-dt { font-size: 6.5pt; color: #555; }
.legal { font-size: 6pt; color: #777; margin-top: 5px; }
.footer { font-size: 5.5pt; color: #aaa; text-align: center; margin-top: 4px; border-top: 0.5px solid #ddd; padding-top: 2px; }
</style>
</head>
<body>

<div class="header">
  <h1>KÁRIGÉNY JEGYZŐKÖNYV</h1>
  <div class="meta">Szám: <strong>${esc(report.report_number)}</strong> &nbsp;|&nbsp; Kelt: <strong>${formatDate(report.created_at)}</strong></div>
</div>
<div class="divider"></div>

<div class="two-col">
  <div class="col">
    <div class="stitle">1. Azonosító adatok</div>
    <div class="f"><span class="l">Munkavállaló:</span> ${empName}</div>
    <div class="f"><span class="l">E-mail:</span> ${esc(report.employee_email || 'N/A')}</div>
    <div class="f"><span class="l">Munkáltató:</span> ${esc(report.contractor_name || 'N/A')}</div>
    <div class="f"><span class="l">Esemény dátuma:</span> ${formatDate(report.incident_date)}</div>
    <div class="f"><span class="l">Felfedezés:</span> ${formatDate(report.discovery_date)}</div>
  </div>
  <div class="col">
    <div class="stitle">2. Kár helyszíne</div>
    <div class="f"><span class="l">Szálláshely:</span> ${esc(report.accommodation_id || 'N/A')}</div>
    <div class="f"><span class="l">Szoba/Egység:</span> ${esc(report.room_id || 'N/A')}</div>
    ${report.ticket_id ? `<div class="f"><span class="l">Hibajegy:</span> #${esc(String(report.ticket_id).substring(0, 8))}</div>` : ''}
    <div class="f"><span class="l">Fotók:</span> ${photoCount} db melléklet</div>
  </div>
</div>
<div class="thin-div"></div>

<div class="stitle">3. Kár leírása</div>
<div class="dbox">${esc(report.description || 'Nincs leírás megadva.')}</div>
<div class="thin-div"></div>

<div class="stitle">5. Felróhatóság megállapítása</div>
<div style="font-size:7.5pt;margin:2px 0;">A fent leírt kár a lakó felróható magatartásából ered.</div>
<div style="font-size:7.5pt;margin:2px 0;">
  <span class="cb${report.employee_acknowledged ? ' on' : ''}">${report.employee_acknowledged ? '✓' : ''}</span> A lakó elismeri a felróhatóságot
</div>
<div class="f"><span class="l">Lakó nyilatkozata:</span> _______________________________________________________________</div>
<div class="thin-div"></div>

<div class="stitle">6. Kárfelmérés</div>
<div style="font-size:7.5pt;margin:2px 0;">A kár elhárítása folyamatban van / megtörtént. A kárelhárítással járó költségeket számla alapján igazoljuk le.</div>
${items.length > 0 ? items.map(i => `<div class="cost">${esc(i.name)}: <strong>${formatCurrency(i.cost)}</strong>${i.description ? ` <span style="color:#777">(${esc(i.description)})</span>` : ''}</div>`).join('') + `<div class="cost-total">Becsült kárösszeg: ${formatCurrency(report.total_cost)}</div>` : `<div class="cost">Várható kárösszeg (becsült): _________________ Ft</div><div class="cost">Végleges kárösszeg (számlával igazolva): _________________ Ft</div>`}
<div class="thin-div"></div>

<div class="stitle">7. Munkavállalói nyilatkozat</div>
<div class="stmt">Alulírott munkavállaló kijelentem, hogy a fenti kárigény jegyzőkönyvet megismertem, annak tartalmát tudomásul vettem. A Munka törvénykönyve 166. § és 177. § rendelkezései alapján a munkáltató jogosult a kártérítés összegét a munkabéremből levonni (havi bruttó bér max. 50%-áig).${plan.length > 0 ? ` Törlesztés: ${plan.length} hónap.` : ''}</div>

<div class="stitle">8. Aláírások</div>
<div class="sigs">
  <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Munkavállaló (lakó)</div><div class="sig-dt">Dátum: ${report.employee_signature_date ? formatDate(report.employee_signature_date) : '____________________'}</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Munkáltatói képviselő</div><div class="sig-dt">Dátum: ${report.manager_signature_date ? formatDate(report.manager_signature_date) : '____________________'}</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Tanú</div><div class="sig-dt">Név: ${esc(report.witness_name) || '____________________'}</div></div>
</div>

<div class="legal">Jogi hivatkozások: Mt. 166. § (kártérítési kötelezettség) · Mt. 177. § (munkabérből levonás max. 50%) · Ptk. 6:142. § (teljes kártérítés) · Ptk. 6:143. § (kártérítés módja)</div>
<div class="footer">Housing Solutions Kft. — Munkaerő Stabilitási Platform · ${new Date().toISOString().replace('T', ' ').substring(0, 19)}</div>

</body></html>`;
}

// ─── PDF Generation ─────────────────────────────────────────────────

async function generatePDF(report) {
  const html = buildHTML(report);
  const tmpHtml = path.join(os.tmpdir(), `dr_${report.id || Date.now()}.html`);
  const tmpPdf = path.join(os.tmpdir(), `dr_${report.id || Date.now()}.pdf`);

  try {
    fs.writeFileSync(tmpHtml, html, 'utf8');

    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome', '/usr/bin/chromium-browser', 'google-chrome',
    ];
    let chrome = null;
    for (const p of chromePaths) {
      try {
        if (p.startsWith('/') ? fs.existsSync(p) : !execSync(`which ${p}`, { stdio: 'ignore' })) { chrome = p; break; }
      } catch { /* next */ }
    }

    if (!chrome) throw new Error('Chrome not found for PDF generation');

    execSync(`"${chrome}" --headless --disable-gpu --no-sandbox --print-to-pdf="${tmpPdf}" --print-to-pdf-no-header "file://${tmpHtml}"`, { timeout: 15000, stdio: 'ignore' });

    return fs.readFileSync(tmpPdf);
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

module.exports = { generatePDF, buildHTML, LIABILITY_LABELS, STATUS_LABELS };
