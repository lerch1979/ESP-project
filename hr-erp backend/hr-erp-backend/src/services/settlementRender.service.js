/**
 * Rendering for the monthly settlement sheets — xlsx and pdf.
 *
 * Reuses what already exists rather than growing a third export stack:
 *   • xlsx — `excel.service`'s buildSheet/addBook (auto column widths, title, summary)
 *   • pdf  — `reportGenerator.service`'s drawHeader / drawSectionTitle / drawSimpleTable
 *
 * Both outputs state the month's state (ZÁRT / PISZKOZAT) prominently. A sheet rendered
 * from an OPEN month can still change — the engine may re-bill it — and a document that
 * goes to a partner must not imply a finality it does not have.
 */
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { _helpers, } = require('./settlementSheet.service');
const excel = require('./excel.service');
const rg = require('./reportGenerator.service');

const HU = (n) => (n == null ? '' : Number(n).toLocaleString('hu-HU', { maximumFractionDigits: 2 }));
const money = (n) => (n == null ? '' : `${HU(n)} Ft`);
const dayNum = (iso) => Number(String(iso).slice(-2));

const BASIS_HU = { flat: 'Fix havi díj', per_bed_night: 'Ágy/éj', mixed: 'Vegyes', per_person: 'Fő/éj' };
const LINE_HU = {
  viz_csatorna: 'Víz és csatorna', internet: 'Internet', aram: 'Áram',
  gaz: 'Gáz', kozos_koltseg: 'Közös költség', hulladekszallitas: 'Hulladékszállítás',
};

function stateBanner(state) {
  return state.closed
    ? `ZÁRT HÓNAP — a számok véglegesek (lezárva: ${String(state.finalizedAt || '').slice(0, 10)})`
    : 'PISZKOZAT — a hónap még nincs lezárva, a számok változhatnak';
}

function title(sheet) {
  const who = sheet.partner?.name || '';
  return sheet.kind === 'landlord'
    ? `Szállásadói elszámolás — ${who} — ${sheet.month}`
    : `Megbízói szállástábla — ${who} — ${sheet.month}`;
}

// ── the day-grid, modelled on the manual szállástábla ───────────────────────
//
// Manual column order kept: Munkahely | Szálláshely | Szobaszám | Név | 1..N | Összes.
// Site and room are their OWN columns — the manual sheet repeats them inside the Név
// cell, which makes the name column unsortable and unfilterable.
//
// `emptyRows` (Név = "Üres") are appended per site when the client's rate has a
// contracted block. Their daily cell is a COUNT of empty beds, not a 1/0 flag — see
// emptyBedRows() for why. A totals row closes the sheet so nobody sums 300 lines.
function gridSheet(sheet, { emptyRows = [] } = {}) {
  const { days, people } = sheet.grid;

  const columns = [
    { key: 'workplace', label: 'Munkahely' },
    { key: 'accommodation_name', label: 'Szálláshely' },
    { key: 'room_number', label: 'Szobaszám' },
    { key: 'name', label: 'Név' },
    ...days.map((d, i) => ({ key: `d${i}`, label: String(dayNum(d)), type: 'number' })),
    { key: 'bed_nights', label: 'Összes éjszaka', type: 'number' },
  ];

  const rows = [];
  for (const p of people) {
    const row = {
      workplace: p.workplace || '',
      accommodation_name: p.accommodation_name || '',
      room_number: p.room_number || '',
      name: p.name,
      bed_nights: p.bed_nights,
    };
    p.grid.forEach((on, i) => { row[`d${i}`] = on ? 1 : null; });
    rows.push(row);
  }
  for (const e of emptyRows) {
    const row = {
      workplace: '', accommodation_name: e.accommodation_name || '',
      room_number: '', name: 'Üres', bed_nights: e.bed_nights,
    };
    e.counts.forEach((n, i) => { row[`d${i}`] = n || null; });
    rows.push(row);
  }

  // Totals row: per-day headcount plus the month's bed-nights.
  const totalsRow = { workplace: '', accommodation_name: '', room_number: '', name: 'ÖSSZESEN' };
  days.forEach((_, i) => {
    const occ = people.reduce((n, p) => n + (p.grid[i] ? 1 : 0), 0);
    const emp = emptyRows.reduce((n, e) => n + (e.counts[i] || 0), 0);
    totalsRow[`d${i}`] = occ + emp || null;
  });
  totalsRow.bed_nights = rows.reduce((n, r) => n + (r.bed_nights || 0), 0);
  rows.push(totalsRow);

  const occupiedNights = people.reduce((n, p) => n + p.bed_nights, 0);
  const emptyNights = emptyRows.reduce((n, e) => n + e.bed_nights, 0);

  return excel._helpers.buildSheet({
    columns, rows, sheetName: 'Napi jelenlét',
    title: `Napi jelenlét — ${sheet.partner?.name || ''} — ${sheet.month}   |   ${stateBanner(sheet.state)}`,
    summary: [
      ['Foglalt ágyéjszaka', occupiedNights],
      ...(emptyRows.length ? [['Üres (számlázott) ágyéjszaka', emptyNights]] : []),
      ['Összesen', occupiedNights + emptyNights],
      ['Fő', people.length],
    ],
  });
}

// ── xlsx ────────────────────────────────────────────────────────────────────
function landlordXlsx(sheet) {
  const overview = excel._helpers.buildSheet({
    sheetName: 'Összesítő',
    title: `${title(sheet)}  |  ${stateBanner(sheet.state)}`,
    columns: [
      { key: 'accommodation_name', label: 'Szálláshely' },
      { key: 'address', label: 'Cím' },
      { key: 'rent_basis', label: 'Díjalap', render: (r) => BASIS_HU[r.rent_basis] || r.rent_basis || '—' },
      { key: 'rent_rate_used', label: 'Díj (Ft/ágy/éj)', type: 'money' },
      { key: 'bed_nights', label: 'Ágyéjszaka', type: 'number' },
      { key: 'cost_total', label: 'Fizetendő', type: 'money' },
    ],
    rows: sheet.accommodations,
    summary: [
      ['Ágyéjszaka összesen', sheet.totals.bed_nights],
      ['FIZETENDŐ ÖSSZESEN', sheet.totals.cost_total],
    ],
  });

  const utils = excel._helpers.buildSheet({
    sheetName: 'Rezsi (mi fizetjük)',
    title: 'Rezsi tételek, amelyeket MI fizetünk',
    columns: [
      { key: 'accommodation', label: 'Szálláshely' },
      { key: 'line', label: 'Tétel', render: (r) => LINE_HU[r.line] || r.line },
      { key: 'amount', label: 'Összeg', type: 'money' },
    ],
    rows: sheet.accommodations.flatMap((a) =>
      (a.utility_lines_we_pay || []).map((l) => ({
        accommodation: a.accommodation_name, line: l.line ?? l, amount: l.amount ?? null,
      }))),
  });

  return excel.addBook([overview, gridSheet(sheet), utils]);
}

function clientXlsx(sheet) {
  const overview = excel._helpers.buildSheet({
    sheetName: 'Összesítő',
    title: `${title(sheet)}  |  ${stateBanner(sheet.state)}`,
    columns: [
      { key: 'accommodation_name', label: 'Szálláshely' },
      { key: 'billing_basis', label: 'Számlázás alapja', render: (r) => BASIS_HU[r.billing_basis] || r.billing_basis || '—' },
      { key: 'occupied_bed_nights', label: 'Foglalt ágyéj', type: 'number' },
      { key: 'reduced_bed_nights', label: 'Üresen számlázott', type: 'number' },
      { key: 'contracted_beds', label: 'Lekötött ágy', type: 'number' },
      { key: 'floor_pct', label: 'Min. kihasz. %', render: (r) => (r.floor_pct == null ? '' : Math.round(r.floor_pct * 100)) },
      { key: 'rate_used', label: 'Díj (foglalt)', type: 'money' },
      { key: 'rate_empty', label: 'Díj (üres)', type: 'money' },
      { key: 'net', label: 'Nettó', type: 'money' },
      { key: 'vat', label: 'ÁFA', type: 'money' },
      { key: 'gross', label: 'Bruttó', type: 'money' },
    ],
    rows: sheet.sites,
    summary: [
      ['Foglalt ágyéjszaka', sheet.totals.occupied_bed_nights],
      ['Üresen számlázott ágyéjszaka', sheet.totals.reduced_bed_nights],
      ['Nettó összesen', sheet.totals.net],
      ['ÁFA összesen', sheet.totals.vat],
      ['BRUTTÓ ÖSSZESEN', sheet.totals.gross],
    ],
  });

  const people = excel._helpers.buildSheet({
    sheetName: 'Elszámolt fő',
    title: 'Elszámolt munkavállalók (a számítás időpontjában rögzítve)',
    columns: [
      { key: 'accommodation', label: 'Szálláshely' },
      { key: 'room_number', label: 'Szoba' },
      { key: 'name', label: 'Név' },
      { key: 'days', label: 'Éjszaka', type: 'number' },
    ],
    rows: sheet.sites.flatMap((s) => s.people.map((p) => ({
      accommodation: s.accommodation_name, room_number: p.room_number || '', name: p.name, days: p.days,
    }))),
  });

  const extras = excel._helpers.buildSheet({
    sheetName: 'Egyéb tételek',
    title: 'Kártérítés és továbbszámlázott rezsi',
    columns: [
      { key: 'kind', label: 'Típus' },
      { key: 'accommodation', label: 'Szálláshely' },
      { key: 'detail', label: 'Megnevezés' },
      { key: 'amount', label: 'Összeg', type: 'money' },
    ],
    rows: [
      ...sheet.sites.flatMap((s) => (s.compensation_lines || []).map((c) => ({
        kind: 'Kártérítés', accommodation: s.accommodation_name,
        detail: c.description || c.compensation_number || '—', amount: c.amount ?? c.amount_gross,
      }))),
      ...sheet.sites.flatMap((s) => (s.utility_passthrough_lines || []).map((u) => ({
        kind: 'Rezsi továbbszámlázás', accommodation: s.accommodation_name,
        detail: LINE_HU[u.line] || u.line, amount: u.amount,
      }))),
    ],
  });

  // Summary first — it is the sheet the reader opens on.
  return excel.addBook([overview, gridSheet(sheet, { emptyRows: sheet.empty_rows || [] }), people, extras]);
}

// ── pdf ─────────────────────────────────────────────────────────────────────
// PDFKit's core fonts use WinAnsi, which has NO ő (U+0151) or ű (U+0171) — the two
// letters Hungarian cannot do without. Left on the default, "Fizetendő" renders as
// "Fizetend" plus three control bytes. `inspectionPDF.service` already solved this for
// the jegyzőkönyv with DejaVu; the same fonts are reused here rather than shipping a
// second copy. reportGenerator's primitives only ever set fontSize, never a family, so
// selecting the font once on the document is enough for all of them.
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

function renderPdf(sheet) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'portrait' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  // Fail soft: a missing font file must not lose the document, but the text would be
  // mangled, so say so loudly rather than shipping a broken invoice attachment.
  if (fs.existsSync(FONT_REGULAR)) {
    doc.registerFont('Regular', FONT_REGULAR);
    if (fs.existsSync(FONT_BOLD)) doc.registerFont('Bold', FONT_BOLD);
    doc.font('Regular');
  } else {
    // eslint-disable-next-line no-console
    console.warn('[settlementRender] DejaVu font missing — ő/ű will not render correctly');
  }

  rg.drawHeader(doc, sheet.kind === 'landlord' ? 'Szállásadói elszámolás' : 'Megbízói szállástábla',
    `${sheet.partner?.name || ''} — ${sheet.month}`);
  doc.moveDown(0.5);

  // State banner: green when closed, amber when a draft.
  const closed = sheet.state.closed;
  doc.rect(50, doc.y, doc.page.width - 100, 22).fill(closed ? '#2e7d32' : '#ed6c02');
  doc.fillColor('#ffffff').fontSize(10)
     .text(stateBanner(sheet.state), 56, doc.y + 6, { width: doc.page.width - 112 });
  doc.fillColor('#000000');
  doc.y += 30;

  const p = sheet.partner || {};
  rg.drawSectionTitle(doc, 'Partner');
  doc.fontSize(9).fillColor('#333')
     .text(`${p.name || ''}${p.tax_number ? `   ·   Adószám: ${p.tax_number}` : ''}`)
     .text(p.address || '', { width: doc.page.width - 100 });
  doc.moveDown(0.8);
  doc.fillColor('#000000');

  if (sheet.kind === 'landlord') {
    rg.drawSectionTitle(doc, 'Szálláshelyek');
    rg.drawSimpleTable(doc,
      ['Szálláshely', 'Díjalap', 'Díj', 'Ágyéj', 'Fizetendő'],
      sheet.accommodations.map((a) => [
        a.accommodation_name, BASIS_HU[a.rent_basis] || a.rent_basis || '—',
        a.rent_rate_used == null ? '—' : money(a.rent_rate_used),
        String(a.bed_nights), money(a.cost_total),
      ]),
      // sums to 495 = exactly the usable width; anything more clips the last cells
      { colWidths: [175, 85, 80, 50, 105] });
    doc.moveDown(0.5);
    doc.x = 50;   // drawSimpleTable leaves x at a column offset; without this the
                  // right-aligned total is laid out in a narrow box and gets clipped.
    doc.fontSize(12).text(`Fizetendő összesen: ${money(sheet.totals.cost_total)}`,
      50, doc.y, { width: doc.page.width - 100, align: 'right' });
  } else {
    rg.drawSectionTitle(doc, 'Szálláshelyek');
    rg.drawSimpleTable(doc,
      ['Szálláshely', 'Foglalt', 'Üres', 'Díj', 'Nettó', 'ÁFA', 'Bruttó'],
      sheet.sites.map((s) => [
        s.accommodation_name, String(s.occupied_bed_nights), String(s.reduced_bed_nights),
        s.rate_used == null ? '—' : money(s.rate_used),
        money(s.net), money(s.vat), money(s.gross),
      ]),
      // was [140,55,50,70,75,65,75] = 530pt against 495pt usable → clipped
      { colWidths: [125, 50, 45, 65, 78, 62, 70] });
    doc.moveDown(0.5);
    doc.x = 50;
    doc.fontSize(12).text(`Fizetendő bruttó: ${money(sheet.totals.gross)}`,
      50, doc.y, { width: doc.page.width - 100, align: 'right' });

    const comps = sheet.sites.flatMap((s) => s.compensation_lines || []);
    if (comps.length) {
      doc.moveDown(0.6);
      rg.drawSectionTitle(doc, 'Kártérítés');
      rg.drawSimpleTable(doc, ['Megnevezés', 'Összeg'],
        comps.map((c) => [c.description || c.compensation_number || '—', money(c.amount ?? c.amount_gross)]),
        { colWidths: [335, 155] });
    }
  }

  // ── The PDF is a SUMMARY document, deliberately ────────────────────────────
  //
  // It used to list every resident, which at real scale (304 people) made it 33 pages —
  // unusable as an invoice attachment. The person-level detail lives in the xlsx, which
  // already carries the full day-by-day matrix; duplicating it here served nobody.
  //
  // What stays: enough for the partner to check the total is the total, and an explicit
  // pointer to where the line-by-line proof is. A summary that does not say where the
  // detail went reads like the detail is missing.
  doc.moveDown(1.2);
  doc.x = 50;

  // The summary block is ~170pt (table + boxed note). Claim a page for it up front:
  // drawing a box near the bottom margin makes every subsequent text() spill onto its
  // own page, which is how a 2-page summary became 4 mostly-empty pages.
  const SUMMARY_BLOCK_H = 190;
  if (doc.y > doc.page.height - SUMMARY_BLOCK_H) doc.addPage();

  const people = sheet.grid?.people || [];
  const occupiedNights = people.reduce((n, x) => n + x.bed_nights, 0);
  const emptyNights = (sheet.empty_rows || []).reduce((n, e) => n + e.bed_nights, 0);
  const siteCount = sheet.kind === 'landlord'
    ? (sheet.accommodations || []).length
    : (sheet.sites || []).length;

  rg.drawSectionTitle(doc, 'Elszámolás alapja');
  rg.drawSimpleTable(doc,
    ['Megnevezés', 'Érték'],
    [
      ['Szálláshelyek száma', String(siteCount)],
      ['Elszámolt fő', String(people.length)],
      ['Bent töltött ágyéjszaka', String(occupiedNights)],
      ...(emptyNights ? [['Üresen számlázott ágyéjszaka', String(emptyNights)]] : []),
      ['Ágyéjszaka összesen', String(occupiedNights + emptyNights)],
      ['Időszak', `${sheet.month}. hónap`],
    ],
    { colWidths: [300, 195] });

  // The pointer to the detail. Boxed so it is not skimmed past.
  doc.moveDown(1);
  doc.x = 50;
  const boxH = 54;
  if (doc.y > doc.page.height - (boxH + 60)) doc.addPage();   // keep the box whole
  const boxY = doc.y;
  doc.rect(50, boxY, doc.page.width - 100, boxH).fillAndStroke('#f5f5f5', '#bdbdbd');
  doc.fillColor('#000000').fontSize(10)
     .text('Személyre bontott kimutatás', 60, boxY + 8, { width: doc.page.width - 120 });
  doc.fontSize(9).fillColor('#444')
     .text(
       'A napi bontású jelenléti ív — munkahely, szálláshely, szobaszám, név és '
       + 'naponkénti jelölés minden érintett személyre — a jelen dokumentummal együtt '
       + 'küldött Excel melléklet "Napi jelenlét" munkalapján található.',
       60, boxY + 24, { width: doc.page.width - 120 });
  doc.fillColor('#000000');
  doc.y = boxY + boxH + 10;

  rg.drawFooter(doc);
  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function renderXlsx(sheet) {
  return sheet.kind === 'landlord' ? landlordXlsx(sheet) : clientXlsx(sheet);
}

function fileBase(sheet) {
  const who = (sheet.partner?.name || 'partner')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${sheet.kind === 'landlord' ? 'szallasadoi-elszamolas' : 'megbizoi-szallastabla'}-${who}-${sheet.month}`;
}

module.exports = { renderXlsx, renderPdf, fileBase, stateBanner, _fmt: { HU, money } };
