const PDFDocument = require('pdfkit');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const formatCurrency = (amount, currency = 'HUF') => {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

const STATUS_LABELS = {
  draft: 'Piszkozat',
  sent: 'Elkuldve',
  paid: 'Kifizetve',
  overdue: 'Lejart',
  cancelled: 'Sztorno',
};

/**
 * Generate PDF for a single invoice
 * Returns a readable stream (PDFDocument)
 */
async function generateInvoicePDF(invoiceId) {
  const result = await query(
    `SELECT i.*,
      cc.name as cost_center_name, cc.code as cost_center_code,
      ic.name as category_name,
      u.first_name as created_by_first_name, u.last_name as created_by_last_name
     FROM invoices i
     LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
     LEFT JOIN invoice_categories ic ON i.category_id = ic.id
     LEFT JOIN users u ON i.created_by = u.id
     WHERE i.id = $1 AND i.deleted_at IS NULL`,
    [invoiceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const invoice = result.rows[0];

  // Get payments for this invoice
  const paymentsResult = await query(
    `SELECT p.*, u.first_name, u.last_name
     FROM payments p
     LEFT JOIN users u ON p.created_by = u.id
     WHERE p.invoice_id = $1
     ORDER BY p.payment_date DESC`,
    [invoiceId]
  );
  const payments = paymentsResult.rows;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Header
  doc.fontSize(20).text('SZAMLA', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(invoice.invoice_number || 'N/A', { align: 'center' });
  doc.moveDown(1);

  // Status badge
  doc.fontSize(10).fillColor('#666')
    .text(`Statusz: ${STATUS_LABELS[invoice.payment_status] || invoice.payment_status}`, { align: 'right' });
  doc.fillColor('#000');
  doc.moveDown(0.5);

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // Invoice details - two columns
  const leftX = 50;
  const rightX = 300;
  let y = doc.y;

  // Left column
  doc.fontSize(9).fillColor('#888').text('Szallito', leftX, y);
  doc.fontSize(11).fillColor('#000').text(invoice.vendor_name || '-', leftX, y + 14);

  if (invoice.vendor_tax_number) {
    doc.fontSize(9).fillColor('#888').text('Adoszam', leftX, y + 32);
    doc.fontSize(10).fillColor('#000').text(invoice.vendor_tax_number, leftX, y + 44);
  }

  // Right column
  doc.fontSize(9).fillColor('#888').text('Szamla datuma', rightX, y);
  doc.fontSize(11).fillColor('#000').text(formatDate(invoice.invoice_date), rightX, y + 14);

  doc.fontSize(9).fillColor('#888').text('Fizetesi hatarido', rightX, y + 32);
  doc.fontSize(11).fillColor('#000').text(formatDate(invoice.due_date), rightX, y + 44);

  doc.moveDown(5);

  // Client info (if available)
  if (invoice.client_name) {
    y = doc.y;
    doc.fontSize(9).fillColor('#888').text('Ugyfel', leftX, y);
    doc.fontSize(11).fillColor('#000').text(invoice.client_name, leftX, y + 14);
    doc.moveDown(2.5);
  }

  // Cost center
  if (invoice.cost_center_name) {
    y = doc.y;
    doc.fontSize(9).fillColor('#888').text('Koltsegkozpont', leftX, y);
    doc.fontSize(10).fillColor('#000').text(
      `${invoice.cost_center_name}${invoice.cost_center_code ? ' (' + invoice.cost_center_code + ')' : ''}`,
      leftX, y + 14
    );
    doc.moveDown(2.5);
  }

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // Line items table
  const lineItems = typeof invoice.line_items === 'string'
    ? JSON.parse(invoice.line_items)
    : invoice.line_items;

  if (lineItems && lineItems.length > 0) {
    doc.fontSize(12).text('Tetelek', leftX);
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const colWidths = [200, 60, 80, 80, 75];
    const colX = [50, 250, 310, 390, 470];
    const headers = ['Megnevezes', 'Mennyiseg', 'Egysegar', 'Netto', 'AFA'];

    doc.fontSize(8).fillColor('#888');
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: colWidths[i], align: i >= 2 ? 'right' : 'left' });
    });

    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#ddd').stroke();
    doc.strokeColor('#000');

    let rowY = tableTop + 20;
    doc.fontSize(9).fillColor('#000');
    lineItems.forEach((item) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
      doc.text(item.description || item.name || '-', colX[0], rowY, { width: colWidths[0] });
      doc.text(String(item.quantity || 1), colX[1], rowY, { width: colWidths[1] });
      doc.text(formatCurrency(item.unit_price), colX[2], rowY, { width: colWidths[2], align: 'right' });
      doc.text(formatCurrency(item.net_amount || (item.quantity || 1) * (item.unit_price || 0)), colX[3], rowY, { width: colWidths[3], align: 'right' });
      doc.text(formatCurrency(item.vat_amount || 0), colX[4], rowY, { width: colWidths[4], align: 'right' });
      rowY += 18;
    });

    doc.y = rowY;
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
  }

  // Totals
  y = doc.y;
  const totalsX = 380;
  doc.fontSize(10);

  doc.fillColor('#888').text('Netto osszeg:', totalsX, y);
  doc.fillColor('#000').text(formatCurrency(invoice.amount, invoice.currency), totalsX + 100, y, { align: 'right', width: 65 });

  if (invoice.vat_amount) {
    y += 18;
    doc.fillColor('#888').text('AFA:', totalsX, y);
    doc.fillColor('#000').text(formatCurrency(invoice.vat_amount, invoice.currency), totalsX + 100, y, { align: 'right', width: 65 });
  }

  y += 22;
  doc.fontSize(12).fillColor('#000').text('Brutto osszeg:', totalsX, y, { continued: false });
  doc.text(formatCurrency(invoice.total_amount || invoice.amount, invoice.currency), totalsX + 80, y, { align: 'right', width: 85 });

  doc.moveDown(2);

  // Payments section
  if (payments.length > 0) {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(12).text('Fizetesek', leftX);
    doc.moveDown(0.5);

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    payments.forEach((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      doc.fontSize(9)
        .text(`${formatDate(p.payment_date)} - ${formatCurrency(p.amount)} (${p.payment_method})${name ? ' - ' + name : ''}`, leftX);
    });

    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#888').text(`Osszes fizetve: ${formatCurrency(totalPaid)}`, leftX);
    const remaining = parseFloat(invoice.total_amount || invoice.amount || 0) - totalPaid;
    if (remaining > 0) {
      doc.text(`Fennmarado: ${formatCurrency(remaining)}`, leftX);
    }
    doc.fillColor('#000');
  }

  // Description / Notes
  if (invoice.description || invoice.notes) {
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.strokeColor('#000');
    doc.moveDown(0.5);

    if (invoice.description) {
      doc.fontSize(9).fillColor('#888').text('Leiras:', leftX);
      doc.fontSize(10).fillColor('#000').text(invoice.description, leftX);
      doc.moveDown(0.5);
    }

    if (invoice.notes) {
      doc.fontSize(9).fillColor('#888').text('Megjegyzes:', leftX);
      doc.fontSize(10).fillColor('#000').text(invoice.notes, leftX);
    }
  }

  // Footer
  doc.fontSize(8).fillColor('#aaa')
    .text(
      `Generalva: ${new Date().toLocaleString('hu-HU')} | HR-ERP Rendszer`,
      50, 770, { align: 'center', width: 495 }
    );

  doc.end();
  return { doc, invoice };
}

module.exports = { generateInvoicePDF };
