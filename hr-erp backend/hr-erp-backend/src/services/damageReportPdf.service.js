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
.bl { font-size: 7.5pt; margin: 1px 0; }
.bt { font-weight: 700; font-size: 8.5pt; border-top: 1px solid #333; padding-top: 2px; margin-top: 2px; }
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
  <h1>KÁRIGÉNY JEGYZŐKÖNYV</h1>
  <div class="m">Szám: <strong>${esc(report.report_number)}</strong> &nbsp;|&nbsp; Kelt: <strong>${formatDate(report.created_at)}</strong></div>
</div>
<div class="dv"></div>

<!-- 1+2: AZONOSÍTÓ ADATOK + KÁR HELYSZÍNE -->
<div class="row">
  <div class="c">
    <div class="st">1. Azonosító adatok</div>
    <div class="f"><b>Munkavállaló:</b> ${empName}</div>
    <div class="f"><b>E-mail:</b> ${esc(report.employee_email || 'N/A')}</div>
    <div class="f"><b>Munkáltató:</b> ${esc(report.contractor_name || 'N/A')}</div>
    <div class="f"><b>Esemény dátuma:</b> ${formatDate(report.incident_date)}</div>
    <div class="f"><b>Felfedezés dátuma:</b> ${formatDate(report.discovery_date)}</div>
  </div>
  <div class="c">
    <div class="st">2. Kár helyszíne</div>
    <div class="f"><b>Szálláshely:</b> ${esc(report.accommodation_id || 'N/A')}</div>
    <div class="f"><b>Szoba/Egység:</b> ${esc(report.room_id || 'N/A')}</div>
    ${report.ticket_id ? `<div class="f"><b>Hibajegy:</b> #${esc(String(report.ticket_id).substring(0, 8))}</div>` : ''}
  </div>
</div>
<div class="td"></div>

<!-- 3: KÁR LEÍRÁSA -->
<div class="st">3. Kár leírása</div>
<div class="db">${esc(report.description || 'Nincs leírás megadva.')}</div>
<div class="td"></div>

<!-- 4: FOTÓDOKUMENTÁCIÓ -->
<div class="st">4. Fotódokumentáció</div>
<div class="f">Fotódokumentáció készült: <b>${photoCount || '___'} db</b> fénykép</div>
<div class="td"></div>

<!-- 5: FELRÓHATÓSÁG MEGÁLLAPÍTÁSA -->
<div class="st">5. Felróhatóság megállapítása</div>
<div style="font-size:7.5pt;margin:2px 0;">A fent leírt kár a lakó felróható magatartásából ered.</div>
<div style="font-size:7.5pt;margin:3px 0;">
  <span class="ck${report.employee_acknowledged ? ' on' : ''}">${report.employee_acknowledged ? '✓' : ''}</span> A lakó elismeri a felróhatóságot
</div>
<div class="f"><b>Lakó nyilatkozata:</b> _______________________________________________________________</div>
<div class="td"></div>

<!-- 6: KÁRRENDEZÉS -->
<div class="st">6. Kárrendezés</div>
<div style="font-size:7.5pt;margin:4px 0 8px 0;">A kár pontos összege később kerül megállapításra.</div>
<div class="td"></div>

<!-- 7: NYILATKOZAT -->
<div class="st">7. Nyilatkozat</div>
<div class="ny">Alulírott tudomásul veszem, hogy a fenti károk az én felróható magatartásomból eredtek. Elfogadom, hogy a kárösszeg legfeljebb a fizetésem 50%-áig havonta levonható (Mt. 177. §). A Munka törvénykönyve 166. § rendelkezései alapján a munkáltató jogosult a kártérítés érvényesítésére.${plan.length > 0 ? ` Törlesztés: ${plan.length} hónap.` : ''}</div>

<!-- 8: ALÁÍRÁSOK -->
<div class="st">8. Aláírások</div>
<div class="sg">
  <div class="sb"><div class="sl"></div><div class="sn">Munkavállaló (lakó)</div><div class="sn">Dátum: ${report.employee_signature_date ? formatDate(report.employee_signature_date) : '____________________'}</div></div>
  <div class="sb"><div class="sl"></div><div class="sn">Facility Manager</div><div class="sn">Dátum: ${report.manager_signature_date ? formatDate(report.manager_signature_date) : '____________________'}</div></div>
  <div class="sb"><div class="sl"></div><div class="sn">Tanú</div><div class="sn">Név: ${esc(report.witness_name) || '____________________'}</div></div>
</div>

<!-- 9: JOGI HIVATKOZÁSOK -->
<div class="jog">
  <b>9. Jogi hivatkozások:</b> Mt. 166. § (kártérítési kötelezettség) · Mt. 177. § (munkabérből levonás max. 50%) · Ptk. 6:142. § (teljes kártérítés) · Ptk. 6:143. § (kártérítés módja)
</div>
<div class="ft">Housing Solutions Kft. — Munkaerő Stabilitási Platform · ${new Date().toISOString().replace('T', ' ').substring(0, 19)}</div>

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
