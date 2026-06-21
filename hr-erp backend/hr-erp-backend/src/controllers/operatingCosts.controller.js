const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const operatingCostsService = require('../services/operatingCosts.service');
const { CATEGORY_LABELS } = require('../services/operatingCosts.service');
const { VALID_CATEGORIES } = require('../models/expense.model');
const { logger } = require('../utils/logger');

function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(n) + ' Ft';
}

/**
 * GET /api/v1/operating-costs/by-accommodation?month=YYYY-MM
 *   &accommodation_id=<uuid>   (optional)
 */
const byAccommodation = async (req, res) => {
  try {
    const result = await operatingCostsService.getByAccommodation({
      month: req.query.month,
      accommodation_id: req.query.accommodation_id,
    });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error('Üzemeltetési költség lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Üzemeltetési költség lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/operating-costs/export?month=YYYY-MM&format=xlsx|pdf
 * Streams a per-szálló operating-cost report (category split + unit economics).
 */
const exportReport = async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const result = await operatingCostsService.getByAccommodation({
      month: req.query.month,
      accommodation_id: req.query.accommodation_id,
    });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    const { month, summary, by_accommodation } = result.data;
    const fileBase = `uzemeltetesi-koltsegek-${month}`;

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      buildPdf(res, { month, summary, by_accommodation });
      return undefined;
    }

    // Default: xlsx
    const buf = buildExcelBuffer({ month, summary, by_accommodation });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    res.setHeader('Content-Length', buf.length);
    return res.send(buf);
  } catch (error) {
    logger.error('Üzemeltetési költség export hiba:', error);
    return res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

function buildExcelBuffer({ month, summary, by_accommodation }) {
  const wb = XLSX.utils.book_new();

  const rows = by_accommodation.map((r) => {
    const row = { Szállás: r.accommodation_name || '—' };
    for (const c of VALID_CATEGORIES) row[CATEGORY_LABELS[c]] = r.expenses[c] || 0;
    row['Összes költség'] = r.expenses.total || 0;
    row['Lakónapok'] = r.occupant_nights || 0;
    row['Ft / lakónap'] = r.cost_per_night == null ? '' : r.cost_per_night;
    return row;
  });

  // Totals row.
  const totalRow = { Szállás: 'ÖSSZESEN' };
  for (const c of VALID_CATEGORIES) totalRow[CATEGORY_LABELS[c]] = summary.by_category[c] || 0;
  totalRow['Összes költség'] = summary.total_cost || 0;
  totalRow['Lakónapok'] = summary.total_occupant_nights || 0;
  totalRow['Ft / lakónap'] = summary.cost_per_night == null ? '' : summary.cost_per_night;
  rows.push(totalRow);

  const ws = XLSX.utils.json_to_sheet(rows);
  if (rows.length > 0) {
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: k === 'Szállás' ? 24 : 14 }));
  }
  XLSX.utils.book_append_sheet(wb, ws, `Üzemeltetés ${month}`);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPdf(res, { month, summary, by_accommodation }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(16).text(`Üzemeltetési költségek — ${month}`, { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#555').text(
    `Összes költség: ${fmtMoney(summary.total_cost)}  ·  Lakónapok: ${summary.total_occupant_nights}  ·  Ft/lakónap: ${summary.cost_per_night == null ? '—' : fmtMoney(summary.cost_per_night)}`,
  );
  doc.moveDown(0.6);
  doc.fillColor('#000');

  const cols = [
    { key: 'name', label: 'Szállás', w: 150, align: 'left' },
    ...VALID_CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c], w: 80, align: 'right' })),
    { key: 'total', label: 'Összes', w: 85, align: 'right' },
    { key: 'nights', label: 'Lakónap', w: 60, align: 'right' },
    { key: 'cpn', label: 'Ft/lakónap', w: 75, align: 'right' },
  ];

  const startX = doc.page.margins.left;
  let y = doc.y;

  const drawRow = (cells, opts = {}) => {
    let x = startX;
    doc.fontSize(opts.bold ? 9 : 8);
    if (opts.bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
    for (const col of cols) {
      doc.text(String(cells[col.key] ?? ''), x + 2, y + 2, { width: col.w - 4, align: col.align });
      x += col.w;
    }
    y += 16;
    doc.moveTo(startX, y).lineTo(x, y).strokeColor('#e5e7eb').stroke();
  };

  drawRow(Object.fromEntries(cols.map((c) => [c.key, c.label])), { bold: true });
  for (const r of by_accommodation) {
    if (y > doc.page.height - 60) { doc.addPage(); y = doc.page.margins.top; }
    drawRow({
      name: r.accommodation_name || '—',
      ...Object.fromEntries(VALID_CATEGORIES.map((c) => [c, fmtMoney(r.expenses[c])])),
      total: fmtMoney(r.expenses.total),
      nights: r.occupant_nights,
      cpn: r.cost_per_night == null ? '—' : fmtMoney(r.cost_per_night),
    });
  }
  drawRow({
    name: 'ÖSSZESEN',
    ...Object.fromEntries(VALID_CATEGORIES.map((c) => [c, fmtMoney(summary.by_category[c])])),
    total: fmtMoney(summary.total_cost),
    nights: summary.total_occupant_nights,
    cpn: summary.cost_per_night == null ? '—' : fmtMoney(summary.cost_per_night),
  }, { bold: true });

  doc.end();
}

module.exports = { byAccommodation, exportReport };
