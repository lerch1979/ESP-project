/**
 * Report Generator Service
 *
 * Generates professional PDF and Excel dashboard reports
 * from analytics data. Used by the automated report distribution system.
 */

const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { logger } = require('../utils/logger');

// ──────────────────────────────────────────────
// COLORS & CONSTANTS
// ──────────────────────────────────────────────

const COLORS = {
  primary: '#1a5c2e',
  primaryLight: '#2d8a4e',
  secondary: '#2c3e50',
  accent: '#e67e22',
  success: '#27ae60',
  warning: '#f39c12',
  danger: '#e74c3c',
  info: '#3498db',
  muted: '#95a5a6',
  light: '#ecf0f1',
  white: '#ffffff',
  black: '#2c3e50',
  tableBorder: '#bdc3c7',
  tableHeader: '#1a5c2e',
  tableAlt: '#f8f9fa',
};

const GENDER_LABELS = { male: 'Férfi', female: 'Nő', other: 'Egyéb', unknown: 'N/A' };
const HUF = (n) => {
  if (n == null) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);
};
const NUM = (n) => (n != null ? Number(n).toLocaleString('hu-HU') : '0');
const PCT = (n) => (n != null ? `${Number(n)}%` : '0%');

// ──────────────────────────────────────────────
// PDF HELPERS
// ──────────────────────────────────────────────

function drawHeader(doc, title, subtitle) {
  // Green header bar
  doc.rect(0, 0, doc.page.width, 80).fill(COLORS.primary);
  doc.fontSize(22).fillColor(COLORS.white).text('Housing Solutions', 50, 20, { align: 'left' });
  doc.fontSize(10).fillColor('#a5d6a7').text('HR-ERP Rendszer', 50, 46);
  doc.fontSize(14).fillColor(COLORS.white).text(title, 300, 25, { align: 'right', width: 245 });
  if (subtitle) {
    doc.fontSize(9).fillColor('#a5d6a7').text(subtitle, 300, 48, { align: 'right', width: 245 });
  }
  doc.fillColor(COLORS.black);
  doc.y = 100;
}

function drawFooter(doc) {
  const y = doc.page.height - 30;
  doc.fontSize(7).fillColor(COLORS.muted)
    .text(
      `Generálva: ${new Date().toLocaleString('hu-HU')} | Housing Solutions HR-ERP | Bizalmas dokumentum`,
      50, y, { align: 'center', width: doc.page.width - 100 }
    );
  doc.fillColor(COLORS.black);
}

function drawSectionTitle(doc, title) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.5);
  doc.rect(50, doc.y, doc.page.width - 100, 24).fill(COLORS.primary);
  doc.fontSize(11).fillColor(COLORS.white).text(title, 60, doc.y + 6);
  doc.fillColor(COLORS.black);
  doc.y += 32;
}

function drawMetricCard(doc, x, y, width, label, value, color = COLORS.primary) {
  doc.rect(x, y, width, 50).lineWidth(1).strokeColor(COLORS.tableBorder).stroke();
  doc.rect(x, y, width, 4).fill(color);
  doc.fontSize(18).fillColor(color).text(String(value), x + 8, y + 12, { width: width - 16, align: 'center' });
  doc.fontSize(7).fillColor(COLORS.muted).text(label, x + 8, y + 34, { width: width - 16, align: 'center' });
  doc.fillColor(COLORS.black);
}

function drawMetricRow(doc, metrics) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  const startY = doc.y;
  const gap = 8;
  const cardW = (doc.page.width - 100 - gap * (metrics.length - 1)) / metrics.length;

  metrics.forEach((m, i) => {
    drawMetricCard(doc, 50 + i * (cardW + gap), startY, cardW, m.label, m.value, m.color || COLORS.primary);
  });

  doc.y = startY + 60;
}

function drawSimpleTable(doc, headers, rows, options = {}) {
  if (doc.y > doc.page.height - 100) doc.addPage();

  const colWidths = options.colWidths || headers.map(() => (doc.page.width - 100) / headers.length);
  const startX = 50;
  let y = doc.y;

  // Header row
  doc.rect(startX, y, doc.page.width - 100, 18).fill(COLORS.tableHeader);
  doc.fontSize(8).fillColor(COLORS.white);
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, y + 4, { width: colWidths[i] - 8, align: options.aligns?.[i] || 'left' });
    x += colWidths[i];
  });
  y += 18;

  // Data rows
  doc.fillColor(COLORS.black).fontSize(8);
  rows.forEach((row, rowIdx) => {
    if (y > doc.page.height - 50) {
      drawFooter(doc);
      doc.addPage();
      y = 50;
    }

    if (rowIdx % 2 === 1) {
      doc.rect(startX, y, doc.page.width - 100, 16).fill(COLORS.tableAlt);
      doc.fillColor(COLORS.black);
    }

    x = startX;
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x + 4, y + 3, { width: colWidths[i] - 8, align: options.aligns?.[i] || 'left' });
      x += colWidths[i];
    });
    y += 16;
  });

  doc.y = y + 8;
}

function drawBarChart(doc, items, options = {}) {
  if (doc.y > doc.page.height - 140) doc.addPage();

  const maxVal = Math.max(...items.map(i => i.value), 1);
  const barHeight = 14;
  const gap = 4;
  const labelWidth = options.labelWidth || 120;
  const chartWidth = doc.page.width - 100 - labelWidth - 60;
  const startX = 50 + labelWidth;
  let y = doc.y;

  items.slice(0, options.maxItems || 8).forEach((item) => {
    if (y > doc.page.height - 50) {
      drawFooter(doc);
      doc.addPage();
      y = 50;
    }

    const barW = (item.value / maxVal) * chartWidth;
    doc.fontSize(7).fillColor(COLORS.black)
      .text(item.label, 50, y + 2, { width: labelWidth - 8, align: 'right' });
    doc.rect(startX, y, Math.max(barW, 2), barHeight).fill(item.color || COLORS.primary);
    doc.fontSize(7).fillColor(COLORS.black)
      .text(options.formatter ? options.formatter(item.value) : NUM(item.value), startX + barW + 4, y + 2);
    y += barHeight + gap;
  });

  doc.y = y + 8;
}

// ──────────────────────────────────────────────
// PDF DASHBOARD REPORT
// ──────────────────────────────────────────────

function generateDashboardPDF(data) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const dateStr = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── PAGE 1: Overview ──
  drawHeader(doc, 'Napi Összesítő Riport', dateStr);

  // Employee metrics
  if (data.employees) {
    const e = data.employees;
    drawSectionTitle(doc, 'Munkavállalók');
    drawMetricRow(doc, [
      { label: 'Aktív munkavállalók', value: NUM(e.active_employees), color: COLORS.success },
      { label: 'Új felvétel (30 nap)', value: NUM(e.new_hires_30d), color: COLORS.info },
      { label: 'Lejáró vízum (30 nap)', value: NUM(e.visa_expiring_30d), color: COLORS.warning },
      { label: 'Lejáró szerződés (30 nap)', value: NUM(e.contracts_ending_30d), color: COLORS.danger },
    ]);

    if (e.byWorkplace?.length > 0) {
      doc.fontSize(9).fillColor(COLORS.secondary).text('Munkavállalók munkahelyenként:', 50, doc.y);
      doc.y += 12;
      drawBarChart(doc, e.byWorkplace.map(w => ({
        label: w.workplace || 'N/A',
        value: parseInt(w.count),
      })));
    }
  }

  // Financial metrics
  if (data.financial) {
    const f = data.financial;
    drawSectionTitle(doc, 'Pénzügyek');
    drawMetricRow(doc, [
      { label: 'Összes számla', value: HUF(f.total_amount), color: COLORS.primary },
      { label: 'Kifizetve', value: HUF(f.paid_amount), color: COLORS.success },
      { label: 'Függőben', value: HUF(f.pending_amount), color: COLORS.warning },
      { label: 'Lejárt', value: HUF(f.overdue_amount), color: COLORS.danger },
    ]);

    if (f.monthlyTrend?.length > 0) {
      doc.fontSize(9).fillColor(COLORS.secondary).text('Havi számlázási trend:', 50, doc.y);
      doc.y += 12;
      drawBarChart(doc, f.monthlyTrend.map(m => ({
        label: m.month,
        value: parseFloat(m.total),
      })), { formatter: HUF, labelWidth: 80 });
    }
  }

  // ── PAGE 2: Tickets & Accommodations ──
  doc.addPage();
  drawHeader(doc, 'Napi Összesítő Riport', 'Hibajegyek & Szálláshelyek');

  if (data.tickets) {
    const t = data.tickets;
    drawSectionTitle(doc, 'Hibajegyek');
    drawMetricRow(doc, [
      { label: 'Nyitott', value: NUM(t.open_tickets), color: COLORS.warning },
      { label: 'Lezárt', value: NUM(t.closed_tickets), color: COLORS.success },
      { label: 'Új (7 nap)', value: NUM(t.created_last_7d), color: COLORS.info },
      { label: 'Átl. megoldási idő', value: `${t.avg_resolution_hours || 0}h`, color: COLORS.secondary },
    ]);

    if (t.byStatus?.length > 0) {
      drawSimpleTable(doc,
        ['Státusz', 'Darab'],
        t.byStatus.map(s => [s.status, NUM(s.count)]),
        { colWidths: [300, 195], aligns: ['left', 'right'] }
      );
    }

    if (t.monthlyTrend?.length > 0) {
      doc.fontSize(9).fillColor(COLORS.secondary).text('Havi hibajegy trend:', 50, doc.y);
      doc.y += 12;
      drawSimpleTable(doc,
        ['Hónap', 'Létrehozva', 'Megoldva'],
        t.monthlyTrend.map(m => [m.month, NUM(m.created), NUM(m.resolved)]),
        { colWidths: [200, 150, 145], aligns: ['left', 'right', 'right'] }
      );
    }
  }

  if (data.accommodations) {
    const a = data.accommodations;
    drawSectionTitle(doc, 'Szálláshelyek');
    drawMetricRow(doc, [
      { label: 'Összes szálláshely', value: NUM(a.total_accommodations), color: COLORS.primary },
      { label: 'Kihasználtság', value: PCT(a.overall_occupancy_pct), color: COLORS.info },
      { label: 'Szabad', value: NUM(a.available), color: COLORS.success },
      { label: 'Karbantartás', value: NUM(a.maintenance), color: COLORS.warning },
    ]);

    if (a.byAccommodation?.length > 0) {
      drawSimpleTable(doc,
        ['Szálláshely', 'Kapacitás', 'Lakók', 'Kihasználtság'],
        a.byAccommodation.slice(0, 15).map(r => [
          r.name, NUM(r.capacity), NUM(r.occupants), PCT(r.occupancy_pct),
        ]),
        { colWidths: [200, 100, 100, 95], aligns: ['left', 'right', 'right', 'right'] }
      );
    }
  }

  // ── PAGE 3: Projects & Activity ──
  if (data.projects || data.activity) {
    doc.addPage();
    drawHeader(doc, 'Napi Összesítő Riport', 'Projektek & Aktivitás');

    if (data.projects) {
      const p = data.projects;
      drawSectionTitle(doc, 'Projektek');
      drawMetricRow(doc, [
        { label: 'Aktív projektek', value: NUM(p.active), color: COLORS.primary },
        { label: 'Befejezett', value: NUM(p.completed), color: COLORS.success },
        { label: 'Összes budget', value: HUF(p.total_budget), color: COLORS.info },
      ]);

      if (p.tasks) {
        doc.fontSize(9).fillColor(COLORS.secondary).text('Feladat állapotok:', 50, doc.y);
        doc.y += 12;
        drawBarChart(doc, [
          { label: 'Kész', value: parseInt(p.tasks.done) || 0, color: COLORS.success },
          { label: 'Folyamatban', value: parseInt(p.tasks.in_progress) || 0, color: COLORS.info },
          { label: 'Teendő', value: parseInt(p.tasks.todo) || 0, color: COLORS.warning },
          { label: 'Blokkolt', value: parseInt(p.tasks.blocked) || 0, color: COLORS.danger },
        ], { labelWidth: 90 });
      }
    }

    if (data.activity) {
      const act = data.activity;
      drawSectionTitle(doc, 'Rendszer aktivitás (7 nap)');
      drawMetricRow(doc, [
        { label: 'Összes művelet', value: NUM(act.total_actions), color: COLORS.primary },
        { label: 'Létrehozás', value: NUM(act.creates), color: COLORS.success },
        { label: 'Módosítás', value: NUM(act.updates), color: COLORS.info },
        { label: 'Törlés', value: NUM(act.deletes), color: COLORS.danger },
      ]);

      if (act.byResource?.length > 0) {
        doc.fontSize(9).fillColor(COLORS.secondary).text('Aktivitás erőforrás típusonként:', 50, doc.y);
        doc.y += 12;
        drawBarChart(doc, act.byResource.map(r => ({
          label: r.resource_type,
          value: parseInt(r.count),
          color: COLORS.info,
        })));
      }
    }
  }

  // Add footers to all pages
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
    // Page numbers
    doc.fontSize(7).fillColor(COLORS.muted)
      .text(`${i + 1} / ${pages.count}`, doc.page.width - 80, doc.page.height - 30, { width: 30, align: 'right' });
  }

  doc.end();
  return doc;
}

// ──────────────────────────────────────────────
// EXCEL DASHBOARD REPORT
// ──────────────────────────────────────────────

function generateDashboardExcel(data) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows = [
    ['HR-ERP Napi Összesítő', '', new Date().toLocaleDateString('hu-HU')],
    [],
    ['MUNKAVÁLLALÓK'],
    ['Aktív', data.employees?.active_employees || 0],
    ['Összes', data.employees?.total_employees || 0],
    ['Új felvétel (30 nap)', data.employees?.new_hires_30d || 0],
    ['Lejáró vízum (30 nap)', data.employees?.visa_expiring_30d || 0],
    ['Lejáró szerződés (30 nap)', data.employees?.contracts_ending_30d || 0],
    [],
    ['PÉNZÜGYEK'],
    ['Összes számlázott', parseFloat(data.financial?.total_amount) || 0],
    ['Kifizetve', parseFloat(data.financial?.paid_amount) || 0],
    ['Függőben', parseFloat(data.financial?.pending_amount) || 0],
    ['Lejárt', parseFloat(data.financial?.overdue_amount) || 0],
    [],
    ['HIBAJEGYEK'],
    ['Nyitott', data.tickets?.open_tickets || 0],
    ['Lezárt', data.tickets?.closed_tickets || 0],
    ['Átl. megoldási idő (óra)', data.tickets?.avg_resolution_hours || 0],
    [],
    ['SZÁLLÁSHELYEK'],
    ['Összes', data.accommodations?.total_accommodations || 0],
    ['Kihasználtság %', data.accommodations?.overall_occupancy_pct || 0],
    ['Szabad', data.accommodations?.available || 0],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Összesítő');

  // Sheet 2: Employee breakdown
  if (data.employees?.byWorkplace?.length > 0) {
    const wsEmp = XLSX.utils.json_to_sheet(data.employees.byWorkplace.map(w => ({
      'Munkahely': w.workplace,
      'Létszám': parseInt(w.count),
    })));
    XLSX.utils.book_append_sheet(wb, wsEmp, 'Munkahely bontás');
  }

  // Sheet 3: Financial trend
  if (data.financial?.monthlyTrend?.length > 0) {
    const wsFin = XLSX.utils.json_to_sheet(data.financial.monthlyTrend.map(m => ({
      'Hónap': m.month,
      'Összeg (HUF)': parseFloat(m.total),
      'Számlák száma': parseInt(m.count),
    })));
    XLSX.utils.book_append_sheet(wb, wsFin, 'Számlázás trend');
  }

  // Sheet 4: Invoices by category
  if (data.financial?.byCategory?.length > 0) {
    const wsCat = XLSX.utils.json_to_sheet(data.financial.byCategory.map(c => ({
      'Kategória': c.category,
      'Darab': parseInt(c.count),
      'Összeg (HUF)': parseFloat(c.total),
    })));
    XLSX.utils.book_append_sheet(wb, wsCat, 'Számla kategóriák');
  }

  // Sheet 5: Tickets by status
  if (data.tickets?.byStatus?.length > 0) {
    const wsTickets = XLSX.utils.json_to_sheet(data.tickets.byStatus.map(s => ({
      'Státusz': s.status,
      'Darab': parseInt(s.count),
    })));
    XLSX.utils.book_append_sheet(wb, wsTickets, 'Hibajegy státuszok');
  }

  // Sheet 6: Accommodation occupancy
  if (data.accommodations?.byAccommodation?.length > 0) {
    const wsAcc = XLSX.utils.json_to_sheet(data.accommodations.byAccommodation.map(a => ({
      'Szálláshely': a.name,
      'Kapacitás': parseInt(a.capacity),
      'Lakók': parseInt(a.occupants),
      'Kihasználtság %': parseInt(a.occupancy_pct),
    })));
    XLSX.utils.book_append_sheet(wb, wsAcc, 'Szálláshely kihasználtság');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ──────────────────────────────────────────────
// STREAM-TO-BUFFER HELPER
// ──────────────────────────────────────────────

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

module.exports = {
  generateDashboardPDF,
  generateDashboardExcel,
  pdfToBuffer,
};
