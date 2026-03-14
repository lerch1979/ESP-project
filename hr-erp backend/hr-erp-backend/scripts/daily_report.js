#!/usr/bin/env node
/**
 * Daily Report Generator & Distributor
 *
 * Generates a comprehensive PDF + Excel dashboard report
 * and emails it to configured recipients.
 *
 * Usage:
 *   node scripts/daily_report.js                    # Generate + email
 *   node scripts/daily_report.js --dry-run          # Generate only, save to disk
 *   node scripts/daily_report.js --pdf-only         # PDF only
 *   node scripts/daily_report.js --excel-only       # Excel only
 *   node scripts/daily_report.js --to user@test.com # Override recipients
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const analyticsService = require('../src/services/analytics.service');
const { generateDashboardPDF, generateDashboardExcel, pdfToBuffer } = require('../src/services/reportGenerator.service');
const { sendEmail } = require('../src/utils/emailService');
const { logger } = require('../src/utils/logger');

// ──────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const pdfOnly = args.includes('--pdf-only');
const excelOnly = args.includes('--excel-only');
const toIdx = args.indexOf('--to');
const overrideRecipients = toIdx !== -1 ? args[toIdx + 1]?.split(',') : null;

// Default recipients from env
const DEFAULT_RECIPIENTS = (process.env.REPORT_RECIPIENTS || process.env.CEO_EMAIL || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

const recipients = overrideRecipients || DEFAULT_RECIPIENTS;

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const dateStr = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
  const fileDate = new Date().toISOString().slice(0, 10);

  console.log(`\n📊 HR-ERP Napi Riport Generátor`);
  console.log(`   Dátum: ${dateStr}`);
  console.log(`   Mód: ${isDryRun ? 'Dry-run (mentés lemezre)' : 'Generálás + Email küldés'}`);
  if (!isDryRun) console.log(`   Címzettek: ${recipients.length > 0 ? recipients.join(', ') : '⚠️  Nincs címzett!'}`);
  console.log();

  // Step 1: Collect analytics data
  console.log('📈 Adatok gyűjtése...');
  let data;
  try {
    data = await analyticsService.getDashboardMetrics();
    console.log('   ✅ Adatok sikeresen összegyűjtve');
  } catch (error) {
    console.error('   ❌ Hiba az adatgyűjtés során:', error.message);
    logger.error('Daily report data collection failed:', error);
    process.exit(1);
  }

  // Step 2: Generate reports
  const attachments = [];
  const outputDir = path.join(__dirname, '..', 'reports');
  if (isDryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // PDF report
  if (!excelOnly) {
    console.log('📄 PDF riport generálása...');
    try {
      const pdfDoc = generateDashboardPDF(data);
      const pdfBuffer = await pdfToBuffer(pdfDoc);
      const pdfFilename = `HR-ERP_Napi_Riport_${fileDate}.pdf`;

      if (isDryRun) {
        const pdfPath = path.join(outputDir, pdfFilename);
        fs.writeFileSync(pdfPath, pdfBuffer);
        console.log(`   ✅ PDF mentve: ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
      } else {
        attachments.push({
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
        console.log(`   ✅ PDF elkészült (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
      }
    } catch (error) {
      console.error('   ❌ PDF generálási hiba:', error.message);
      logger.error('PDF generation failed:', error);
    }
  }

  // Excel report
  if (!pdfOnly) {
    console.log('📊 Excel riport generálása...');
    try {
      const xlsxBuffer = generateDashboardExcel(data);
      const xlsxFilename = `HR-ERP_Napi_Riport_${fileDate}.xlsx`;

      if (isDryRun) {
        const xlsxPath = path.join(outputDir, xlsxFilename);
        fs.writeFileSync(xlsxPath, xlsxBuffer);
        console.log(`   ✅ Excel mentve: ${xlsxPath} (${(xlsxBuffer.length / 1024).toFixed(1)} KB)`);
      } else {
        attachments.push({
          filename: xlsxFilename,
          content: xlsxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        console.log(`   ✅ Excel elkészült (${(xlsxBuffer.length / 1024).toFixed(1)} KB)`);
      }
    } catch (error) {
      console.error('   ❌ Excel generálási hiba:', error.message);
      logger.error('Excel generation failed:', error);
    }
  }

  // Step 3: Send emails
  if (!isDryRun && recipients.length > 0 && attachments.length > 0) {
    console.log('📧 Email küldése...');

    const summaryHtml = buildEmailSummary(data, dateStr);

    for (const recipient of recipients) {
      try {
        const result = await sendEmail({
          to: recipient,
          subject: `📊 HR-ERP Napi Összesítő - ${dateStr}`,
          html: summaryHtml,
          attachments,
        });

        if (result.success) {
          console.log(`   ✅ Elküldve: ${recipient}`);
        } else {
          console.error(`   ❌ Sikertelen: ${recipient} - ${result.error}`);
        }
      } catch (error) {
        console.error(`   ❌ Hiba: ${recipient} - ${error.message}`);
      }
    }
  } else if (!isDryRun && recipients.length === 0) {
    console.log('⚠️  Nincs címzett konfigurálva. Állítsd be: REPORT_RECIPIENTS=email@example.com a .env fájlban');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Kész! (${elapsed}s)\n`);
  process.exit(0);
}

// ──────────────────────────────────────────────
// Email HTML body
// ──────────────────────────────────────────────

function buildEmailSummary(data, dateStr) {
  const e = data.employees || {};
  const f = data.financial || {};
  const t = data.tickets || {};
  const a = data.accommodations || {};

  const huf = (n) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n || 0);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #1a5c2e, #2d8a4e); padding: 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Housing Solutions HR-ERP</h1>
        <p style="color: #a5d6a7; margin: 6px 0 0; font-size: 13px;">Napi Összesítő Riport - ${dateStr}</p>
      </div>

      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 12px; text-align: center; background: #f0fdf4; border-radius: 8px; width: 25%;">
              <div style="font-size: 24px; font-weight: bold; color: #1a5c2e;">${e.active_employees || 0}</div>
              <div style="font-size: 11px; color: #666;">Aktív munkavállaló</div>
            </td>
            <td style="width: 4%;"></td>
            <td style="padding: 12px; text-align: center; background: #fefce8; border-radius: 8px; width: 25%;">
              <div style="font-size: 24px; font-weight: bold; color: #ca8a04;">${t.open_tickets || 0}</div>
              <div style="font-size: 11px; color: #666;">Nyitott hibajegy</div>
            </td>
            <td style="width: 4%;"></td>
            <td style="padding: 12px; text-align: center; background: #eff6ff; border-radius: 8px; width: 25%;">
              <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${a.overall_occupancy_pct || 0}%</div>
              <div style="font-size: 11px; color: #666;">Kihasználtság</div>
            </td>
          </tr>
        </table>

        <h3 style="color: #1a5c2e; border-bottom: 2px solid #1a5c2e; padding-bottom: 6px; margin-top: 24px;">Pénzügyek</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td style="padding: 6px 0;">Összes számlázott:</td><td style="text-align: right; font-weight: bold;">${huf(f.total_amount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #16a34a;">Kifizetve:</td><td style="text-align: right; color: #16a34a;">${huf(f.paid_amount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #ca8a04;">Függőben:</td><td style="text-align: right; color: #ca8a04;">${huf(f.pending_amount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #dc2626;">Lejárt:</td><td style="text-align: right; color: #dc2626;">${huf(f.overdue_amount)}</td></tr>
        </table>

        <h3 style="color: #1a5c2e; border-bottom: 2px solid #1a5c2e; padding-bottom: 6px; margin-top: 24px;">Figyelmeztetések</h3>
        <ul style="font-size: 13px; color: #374151; line-height: 1.8;">
          ${parseInt(e.visa_expiring_30d) > 0 ? `<li>⚠️ <strong>${e.visa_expiring_30d}</strong> vízum lejár 30 napon belül</li>` : ''}
          ${parseInt(e.contracts_ending_30d) > 0 ? `<li>⚠️ <strong>${e.contracts_ending_30d}</strong> szerződés lejár 30 napon belül</li>` : ''}
          ${parseInt(f.overdue_count) > 0 ? `<li>🔴 <strong>${f.overdue_count}</strong> lejárt határidejű számla</li>` : ''}
          ${parseInt(e.visa_expiring_30d) === 0 && parseInt(e.contracts_ending_30d) === 0 && parseInt(f.overdue_count) === 0
            ? '<li>✅ Nincs sürgős figyelmeztetés</li>' : ''}
        </ul>

        <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
          A részletes PDF és Excel riport csatolva található.<br>
          Generálva: ${new Date().toLocaleString('hu-HU')}
        </p>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
