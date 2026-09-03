/**
 * Ajánlat PDF — a sendable offer document.
 *
 * Reuses the same house style as the settlement sheets: `reportGenerator`'s drawing
 * primitives and, critically, its DejaVu font registration. PDFKit's core fonts are
 * WinAnsi and contain neither ő (U+0151) nor ű (U+0171), so without this "Fizetendő"
 * renders as "Fiz" — the bug that cost a round to find on the settlement sheets, and
 * which would be worse here: this document goes to a prospect.
 *
 * The offer shows the client their own prices. It deliberately shows nothing of our
 * position — no probability, expected value, stage or owner — matching what the public
 * token view already withholds.
 */
const PDFDocument = require('pdfkit');
const rg = require('./reportGenerator.service');

const HU = (n) => (n == null ? '' : Number(n).toLocaleString('hu-HU', { maximumFractionDigits: 2 }));
const money = (n) => (n == null ? '—' : `${HU(n)} Ft`);
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—'
    : `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};

const BASIS_HU = { per_person: 'Fő/éjszaka', flat: 'Fix havi díj', per_bed_night: 'Ágy/éjszaka' };
const STATUS_HU = {
  draft: 'PISZKOZAT', sent: 'KIKÜLDVE', accepted: 'ELFOGADVA',
  rejected: 'ELUTASÍTVA', expired: 'LEJÁRT',
};

/** Human description of what a line actually prices. */
function lineTerms(l) {
  if (l.billing_basis === 'flat') return `${money(l.flat_amount)} / hó`;
  if (l.billing_basis === 'per_person') return `${money(l.rate_per_night)} / fő / éj`;
  const bits = [`${money(l.rate_used)} / foglalt ágy / éj`];
  if (l.rate_empty != null) bits.push(`üres ágy: ${money(l.rate_empty)}`);
  if (l.contracted_beds != null) bits.push(`lekötött ágy: ${l.contracted_beds}`);
  if (l.occupancy_floor_pct != null) bits.push(`min. kihasználtság: ${Math.round(Number(l.occupancy_floor_pct) * 100)}%`);
  return bits.join(' · ');
}

/**
 * @param {object} quote  as returned by sales.service.getQuote() (with `lines`)
 * @param {object} meta   { partner_name, opportunity_title }
 */
function renderQuotePdf(quote, meta = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'portrait' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  rg.useUnicodeFont(doc);   // ő/ű — see the header

  rg.drawHeader(doc, 'Árajánlat', `${meta.partner_name || ''} — v${quote.version}`);
  doc.moveDown(0.5);

  // A DRAFT must be unmistakable on paper: an offer sent by accident with numbers we
  // have not committed to is worse than a late offer.
  const isDraft = quote.status === 'draft';
  doc.rect(50, doc.y, doc.page.width - 100, 22).fill(isDraft ? '#ed6c02' : '#2e7d32');
  doc.fillColor('#ffffff').fontSize(10).text(
    isDraft
      ? 'PISZKOZAT — ez az ajánlat még nem véglegesített, a feltételek változhatnak'
      : `${STATUS_HU[quote.status] || quote.status}${quote.valid_until ? ` — érvényes: ${fmtDate(quote.valid_until)}` : ''}`,
    56, doc.y + 6, { width: doc.page.width - 112 });
  doc.fillColor('#000000');
  doc.y += 30;

  rg.drawSectionTitle(doc, 'Ajánlat tárgya');
  doc.fontSize(9).fillColor('#333')
     .text(meta.opportunity_title || '—', { width: doc.page.width - 100 })
     .text(`Ajánlat verziója: v${quote.version}${quote.sent_at ? `   ·   Kiküldve: ${fmtDate(quote.sent_at)}` : ''}`);
  doc.fillColor('#000000').moveDown(0.8);

  rg.drawSectionTitle(doc, 'Tételek');
  rg.drawSimpleTable(doc,
    ['Megnevezés', 'Szálláshely', 'Elszámolás', 'Nettó'],
    (quote.lines || []).map((l) => [
      l.description || '—',
      l.accommodation_name || 'Minden szálláshely',
      `${BASIS_HU[l.billing_basis] || l.billing_basis}`,
      money(l.line_net),
    ]),
    // sums to 495 = the usable width on A4 portrait; more clips the last cell
    { colWidths: [140, 120, 130, 105] });

  // The per-line terms need more room than a table cell, and they are the part a client
  // actually negotiates — so they get their own block rather than being truncated.
  doc.moveDown(0.6);
  doc.x = 50;
  rg.drawSectionTitle(doc, 'Elszámolási feltételek');
  doc.fontSize(8.5).fillColor('#333');
  for (const l of quote.lines || []) {
    doc.text(`• ${l.description || 'Tétel'}${l.accommodation_name ? ` (${l.accommodation_name})` : ''}: ${lineTerms(l)}`,
      50, doc.y, { width: doc.page.width - 100 });
  }
  doc.fillColor('#000000');

  doc.moveDown(1);
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.x = 50;
  rg.drawSimpleTable(doc, ['', 'Összeg'], [
    ['Nettó összesen', money(quote.net_amount)],
    [`ÁFA (${Math.round(Number(quote.vat_rate || 0) * 100)}%)`, money(quote.vat_amount)],
    ['Bruttó összesen', money(quote.gross_amount)],
  ], { colWidths: [340, 155] });

  doc.moveDown(0.8);
  doc.x = 50;
  if (quote.notes) {
    rg.drawSectionTitle(doc, 'Megjegyzés');
    doc.fontSize(9).fillColor('#333').text(quote.notes, 50, doc.y, { width: doc.page.width - 100 });
    doc.fillColor('#000000');
  }

  rg.drawFooter(doc);
  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function quoteFileBase(quote, meta = {}) {
  const who = (meta.partner_name || 'ajanlat').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `arajanlat-${who}-v${quote.version}`;
}

module.exports = { renderQuotePdf, quoteFileBase, _fmt: { lineTerms } };
