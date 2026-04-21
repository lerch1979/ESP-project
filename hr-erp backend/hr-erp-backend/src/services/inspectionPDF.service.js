/**
 * Inspection PDF Service — produces legally-grade Hungarian documents.
 *
 * Three document types:
 *   1. Legal Protocol (jegyzőkönyv) — legally-binding, signed document
 *      for the property owner / contractor. Most important; used as
 *      evidence for compensation claims and court proceedings.
 *   2. Owner Report — tenant-facing summary with per-room scoring.
 *   3. Inspection Report — internal operational report with full detail.
 *
 * Typography: DejaVu Sans (TTF bundled in assets/fonts/) covers the full
 * Hungarian character set incl. ő/ű. Core PDF fonts (Helvetica) do not.
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Fonts ──────────────────────────────────────────────────────────
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD    = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');
const FONT_ITALIC  = path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf');

// ─── Palette ────────────────────────────────────────────────────────
const COLORS = {
  primary:  '#1e3a8a', // deep blue — headings / company mark
  accent:   '#0f766e', // teal      — table header
  dark:     '#111827',
  muted:    '#4b5563',
  light:    '#e5e7eb',
  bg:       '#f9fafb',
  success:  '#047857',
  warning:  '#b45309',
  danger:   '#b91c1c',
};

// ─── Branding ───────────────────────────────────────────────────────
const COMPANY = {
  name:     'Housing Solutions Kft.',
  address:  '9400 Sopron, Várkerület 10.',
  email:    'info@housingsolutions.hu',
  phone:    '+36 99 000 000',
  taxId:    'Adószám: ——',
};

// ─── Hungarian formatters ───────────────────────────────────────────
const GRADE_HU = {
  excellent:  { label: 'Kiváló',      color: COLORS.success },
  good:       { label: 'Jó',          color: COLORS.success },
  acceptable: { label: 'Megfelelő',   color: COLORS.accent  },
  poor:       { label: 'Gyenge',      color: COLORS.warning },
  bad:        { label: 'Rossz',       color: COLORS.danger  },
  critical:   { label: 'Kritikus',    color: COLORS.danger  },
};

const TYPE_HU = {
  weekly:    'Heti',
  monthly:   'Havi',
  quarterly: 'Negyedéves',
  yearly:    'Éves',
  checkin:   'Beköltözési',
  checkout:  'Kiköltözési',
  incident:  'Eseti',
  complaint: 'Panasz alapján',
};

const SEVERITY_HU = {
  ok:       'Megfelelő',
  minor:    'Kisebb hiba',
  major:    'Jelentős hiba',
  critical: 'Kritikus',
};

const PRIORITY_HU = {
  emergency: 'Sürgős',
  critical:  'Kritikus',
  high:      'Magas',
  medium:    'Közepes',
  low:       'Alacsony',
};

function fmtDate(d, withTime = false) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (withTime) {
      return dt.toLocaleString('hu-HU', { dateStyle: 'long', timeStyle: 'short' });
    }
    return dt.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return String(d); }
}

function fmtMoney(amount) {
  if (amount == null) return '—';
  return `${Number(amount).toLocaleString('hu-HU')} HUF`;
}

function gradeChip(doc, grade, x, y, w = 80, h = 18) {
  const g = GRADE_HU[grade] || { label: '—', color: COLORS.muted };
  doc.save()
     .roundedRect(x, y, w, h, 3)
     .fill(g.color)
     .fillColor('white')
     .font('Bold').fontSize(9)
     .text(g.label, x, y + 4, { width: w, align: 'center' })
     .restore();
}

// ─── Doc setup ──────────────────────────────────────────────────────

function createDoc({ title = 'Ellenőrzési dokumentum', margin = 50 } = {}) {
  if (!fs.existsSync(FONT_REGULAR) || !fs.existsSync(FONT_BOLD)) {
    throw new Error(`Hungarian fonts missing from ${FONT_DIR}. Run the DejaVu install step.`);
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    info: {
      Title: title,
      Author: COMPANY.name,
      Subject: 'Ingatlan ellenőrzés',
      Creator: 'Housing Solutions HR-ERP',
      Producer: 'Housing Solutions HR-ERP',
    },
    bufferPages: true, // needed so we can add footer on every page afterwards
  });

  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold',    FONT_BOLD);
  if (fs.existsSync(FONT_ITALIC)) doc.registerFont('Italic', FONT_ITALIC);
  doc.font('Regular');

  return doc;
}

/** Top-of-page company header with title + number. */
function drawHeader(doc, { title, subtitle, number }) {
  const { page } = doc;
  const x = page.margins.left;
  const y = page.margins.top - 20;
  const w = page.width - page.margins.left - page.margins.right;

  doc.save();
  doc.rect(0, 0, page.width, 90).fill(COLORS.primary);
  doc.fillColor('white')
     .font('Bold').fontSize(18)
     .text(COMPANY.name, x, 22);
  doc.font('Regular').fontSize(9)
     .text(COMPANY.address, x, 46)
     .text(`${COMPANY.email}  •  ${COMPANY.phone}`, x, 58);

  // Right side: document type + number
  doc.font('Bold').fontSize(12)
     .fillColor('white')
     .text(title, x, 22, { width: w, align: 'right' });
  if (number) {
    doc.font('Regular').fontSize(9)
       .text(`Azonosító: ${number}`, x, 46, { width: w, align: 'right' });
  }
  if (subtitle) {
    doc.font('Italic').fontSize(9)
       .text(subtitle, x, 58, { width: w, align: 'right' });
  }
  doc.restore();
  doc.y = 110;
  doc.x = x;
  doc.font('Regular').fillColor(COLORS.dark).fontSize(10);
}

function drawSectionTitle(doc, text) {
  doc.moveDown(0.8);
  doc.font('Bold').fontSize(13).fillColor(COLORS.primary).text(text);
  doc.moveTo(doc.page.margins.left, doc.y + 2)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
     .lineWidth(1).strokeColor(COLORS.primary).stroke();
  doc.moveDown(0.6);
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark);
}

/** Two-column key/value panel. */
function drawKeyValueTable(doc, rows, opts = {}) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = opts.colW ?? 170;
  const rowH = opts.rowH ?? 20;

  rows.forEach(([k, v], i) => {
    const y = doc.y;
    if (i % 2 === 0) {
      doc.save().rect(x, y, w, rowH).fill(COLORS.bg).restore();
    }
    doc.font('Bold').fontSize(9).fillColor(COLORS.muted)
       .text(k, x + 6, y + 6, { width: colW - 6 });
    doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
       .text(v == null || v === '' ? '—' : String(v), x + colW, y + 5, {
         width: w - colW - 6,
       });
    doc.y = y + rowH;
  });
  doc.moveDown(0.5);
}

/**
 * Draws a tabular list with a colored header row, alternating row bg,
 * page-break aware. `columns` = [{ label, key, width, align? }].
 */
function drawTable(doc, columns, rows, opts = {}) {
  const x0 = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalW = columns.reduce((s, c) => s + (c.width || 0), 0);
  const scale = totalW > 0 ? usableW / totalW : 1;
  const widths = columns.map(c => (c.width || 0) * scale);

  const rowH = opts.rowH ?? 22;
  const headerH = opts.headerH ?? 24;

  const renderHeader = () => {
    const y = doc.y;
    doc.save().rect(x0, y, usableW, headerH).fill(opts.headerColor || COLORS.accent).restore();
    let cx = x0;
    columns.forEach((c, i) => {
      doc.font('Bold').fontSize(9).fillColor('white')
         .text(c.label, cx + 6, y + 7, {
           width: widths[i] - 12,
           align: c.align || 'left',
           lineBreak: false,
         });
      cx += widths[i];
    });
    doc.y = y + headerH;
  };

  renderHeader();

  rows.forEach((r, idx) => {
    // page break
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      renderHeader();
    }
    const y = doc.y;
    if (idx % 2 === 1) {
      doc.save().rect(x0, y, usableW, rowH).fill(COLORS.bg).restore();
    }
    let cx = x0;
    columns.forEach((c, i) => {
      const raw = c.render ? c.render(r) : r[c.key];
      const value = raw == null ? '—' : String(raw);
      doc.font(c.bold ? 'Bold' : 'Regular').fontSize(9).fillColor(COLORS.dark)
         .text(value, cx + 6, y + 7, {
           width: widths[i] - 12,
           align: c.align || 'left',
           lineBreak: false,
           ellipsis: true,
         });
      cx += widths[i];
    });
    doc.y = y + rowH;
  });
  doc.moveDown(0.4);
}

function drawScoreCard(doc, { technical, hygiene, aesthetic, total, grade }) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 70;
  const y = doc.y;

  doc.save().roundedRect(x, y, w, h, 5).fill(COLORS.bg).restore();
  doc.save().roundedRect(x, y, 6, h, 3).fill(COLORS.primary).restore();

  const boxes = [
    { label: 'Műszaki (max 50)',   value: technical },
    { label: 'Higiénia (max 30)',  value: hygiene },
    { label: 'Esztétika (max 20)', value: aesthetic },
    { label: 'Összesen / 100',     value: total, accent: true },
  ];

  const pad = 12;
  const boxW = (w - pad * 2) / 4;
  boxes.forEach((b, i) => {
    const bx = x + pad + boxW * i;
    doc.font('Regular').fontSize(8).fillColor(COLORS.muted)
       .text(b.label, bx, y + 10, { width: boxW, align: 'center' });
    doc.font('Bold').fontSize(b.accent ? 22 : 18)
       .fillColor(b.accent ? COLORS.primary : COLORS.dark)
       .text(b.value ?? '—', bx, y + 24, { width: boxW, align: 'center' });
  });
  if (grade) {
    gradeChip(doc, grade, x + w - 110, y + h - 24, 90, 18);
  }
  doc.y = y + h + 8;
}

async function drawQR(doc, payload, size = 80) {
  const buf = await QRCode.toBuffer(payload, { errorCorrectionLevel: 'M', margin: 1, width: size * 3 });
  return buf;
}

/** Footer on every page: page number, company line, verification hint. */
function finalizeDoc(doc, { verifyText } = {}) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { page } = doc;
    const x = page.margins.left;
    const w = page.width - page.margins.left - page.margins.right;
    const y = page.height - page.margins.bottom + 15;

    doc.save();
    doc.moveTo(x, y - 8).lineTo(x + w, y - 8).lineWidth(0.5).strokeColor(COLORS.light).stroke();
    doc.font('Regular').fontSize(8).fillColor(COLORS.muted)
       .text(`${COMPANY.name}  •  ${COMPANY.email}`, x, y, { width: w, align: 'left' });
    if (verifyText) {
      doc.text(verifyText, x, y, { width: w, align: 'center' });
    }
    doc.text(`${i + 1}. oldal / ${range.count}`, x, y, { width: w, align: 'right' });
    doc.restore();
  }
}

// ─── Data loading ───────────────────────────────────────────────────

async function loadInspectionContext(id) {
  const inspRes = await query(
    `SELECT i.*,
            a.name AS accommodation_name,
            a.address AS accommodation_address,
            u.first_name || ' ' || u.last_name AS inspector_name,
            u.email AS inspector_email
     FROM inspections i
     LEFT JOIN accommodations a ON i.accommodation_id = a.id
     LEFT JOIN users u ON i.inspector_id = u.id
     WHERE i.id = $1`,
    [id]
  );
  if (inspRes.rows.length === 0) throw new Error('INSPECTION_NOT_FOUND');
  const inspection = inspRes.rows[0];

  const [scoresRes, photosRes, tasksRes, damagesRes, roomsRes] = await Promise.all([
    query(
      `SELECT s.*, ci.name AS item_name, ci.code AS item_code,
              c.name AS category_name, c.code AS category_code
       FROM inspection_item_scores s
       JOIN inspection_checklist_items ci ON s.checklist_item_id = ci.id
       JOIN inspection_categories c ON ci.category_id = c.id
       WHERE s.inspection_id = $1
       ORDER BY c.code, ci.sort_order`,
      [id]
    ),
    query(`SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY created_at`, [id]),
    query(`SELECT * FROM inspection_tasks WHERE inspection_id = $1 ORDER BY priority, due_date`, [id]),
    query(`SELECT * FROM inspection_damages WHERE inspection_id = $1`, [id]).catch(() => ({ rows: [] })),
    query(
      `SELECT ri.*, r.room_number, r.floor, r.beds
       FROM room_inspections ri
       LEFT JOIN accommodation_rooms r ON ri.room_id = r.id
       WHERE ri.inspection_id = $1
       ORDER BY r.floor NULLS FIRST, r.room_number`,
      [id]
    ),
  ]);

  return {
    inspection,
    scores:  scoresRes.rows,
    photos:  photosRes.rows,
    tasks:   tasksRes.rows,
    damages: damagesRes.rows,
    rooms:   roomsRes.rows,
  };
}

// ─── Document 1: Legal Protocol (Jegyzőkönyv) ───────────────────────

/**
 * Legally-binding inspection protocol. This is the headline document —
 * used for contractor disputes, insurance claims, and court proceedings.
 * Structure follows Hungarian legal document conventions (jegyzőkönyv).
 */
async function generateLegalProtocol(inspectionId) {
  const ctx = await loadInspectionContext(inspectionId);
  const { inspection, scores, tasks, damages, rooms } = ctx;

  const doc = createDoc({ title: 'Ellenőrzési jegyzőkönyv' });

  drawHeader(doc, {
    title: 'ELLENŐRZÉSI JEGYZŐKÖNYV',
    subtitle: 'Hivatalos dokumentum',
    number: inspection.inspection_number,
  });

  // Preamble
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark);
  doc.text(
    `Jelen jegyzőkönyv az alábbi ingatlanban ${fmtDate(inspection.completed_at || inspection.started_at, true)} időpontban lefolytatott ellenőrzésről készült, a ${COMPANY.name} által fenntartott minőségbiztosítási eljárás keretében.`,
    { align: 'justify' }
  );

  drawSectionTitle(doc, 'Felek és ingatlan');
  drawKeyValueTable(doc, [
    ['Ellenőrzést végző cég', COMPANY.name],
    ['Ellenőr',               inspection.inspector_name || '—'],
    ['Ingatlan neve',         inspection.accommodation_name || '—'],
    ['Ingatlan címe',         inspection.accommodation_address || '—'],
    ['Ellenőrzés típusa',     TYPE_HU[inspection.inspection_type] || inspection.inspection_type],
    ['Ütemezett időpont',     fmtDate(inspection.scheduled_at, true)],
    ['Kezdés',                fmtDate(inspection.started_at, true)],
    ['Befejezés',             fmtDate(inspection.completed_at, true)],
    ['GPS koordináták',       inspection.gps_latitude
      ? `${Number(inspection.gps_latitude).toFixed(6)}, ${Number(inspection.gps_longitude).toFixed(6)}`
      : '—'],
  ]);

  drawSectionTitle(doc, 'Összesített értékelés');
  drawScoreCard(doc, {
    technical:  inspection.technical_score,
    hygiene:    inspection.hygiene_score,
    aesthetic:  inspection.aesthetic_score,
    total:      inspection.total_score,
    grade:      inspection.grade,
  });

  // Findings (critical + major only for protocol)
  const materialFindings = scores.filter(s => ['major', 'critical'].includes(s.severity));
  drawSectionTitle(doc, `Megállapított hiányosságok (${materialFindings.length} db)`);
  if (materialFindings.length === 0) {
    doc.font('Italic').fontSize(10).fillColor(COLORS.muted)
       .text('A helyszíni szemle során jelentős hiányosság nem került rögzítésre.');
  } else {
    drawTable(doc, [
      { label: 'Kategória',    key: 'category_name', width: 90 },
      { label: 'Tétel',        key: 'item_name',     width: 200 },
      { label: 'Pont',         render: r => `${r.score}/${r.max_score}`, width: 50, align: 'center' },
      { label: 'Súlyosság',    render: r => SEVERITY_HU[r.severity] || r.severity, width: 80, align: 'center', bold: true },
      { label: 'Megjegyzés',   key: 'notes',         width: 180 },
    ], materialFindings);
  }

  if (rooms.length > 0) {
    drawSectionTitle(doc, `Szobánkénti értékelés (${rooms.length} db)`);
    drawTable(doc, [
      { label: 'Szoba',     key: 'room_number',      width: 60 },
      { label: 'Emelet',    key: 'floor',            width: 40, align: 'center' },
      { label: 'Műszaki',   key: 'technical_score',  width: 55, align: 'center' },
      { label: 'Higiénia',  key: 'hygiene_score',    width: 55, align: 'center' },
      { label: 'Esztétika', key: 'aesthetic_score',  width: 55, align: 'center' },
      { label: 'Össz.',     key: 'total_score',      width: 45, align: 'center', bold: true },
      { label: 'Jegy',      render: r => GRADE_HU[r.grade]?.label || '—', width: 70, align: 'center' },
      { label: 'Lakók',     render: r => Array.isArray(r.residents_snapshot) ? r.residents_snapshot.length : 0, width: 40, align: 'center' },
    ], rooms);
  }

  if (damages.length > 0) {
    drawSectionTitle(doc, `Észlelt károk (${damages.length} db)`);
    drawTable(doc, [
      { label: 'Leírás',         key: 'description',    width: 260 },
      { label: 'Súlyosság',      render: r => SEVERITY_HU[r.severity] || r.severity || '—', width: 90, align: 'center' },
      { label: 'Becsült költség', render: r => fmtMoney(r.estimated_cost), width: 110, align: 'right' },
      { label: 'Státusz',        key: 'status',         width: 80 },
    ], damages);
  }

  if (tasks.length > 0) {
    drawSectionTitle(doc, `Kötelezően elvégzendő beavatkozások (${tasks.length} db)`);
    doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
       .text('Az alábbi határidők a szerződéses kötelezettségek alapján irányadóak. A határidő túllépése szerződésszegésnek minősül.', { align: 'justify' });
    doc.moveDown(0.3);
    drawTable(doc, [
      { label: 'Feladat',    key: 'title',    width: 260 },
      { label: 'Prioritás',  render: r => PRIORITY_HU[r.priority] || r.priority, width: 80, align: 'center', bold: true },
      { label: 'Határidő',   render: r => fmtDate(r.due_date), width: 110, align: 'center' },
      { label: 'Státusz',    key: 'status',   width: 80 },
    ], tasks);
  }

  // Declarations
  drawSectionTitle(doc, 'Nyilatkozatok');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text(
       '1. A helyszíni szemlét az ellenőr a hatályos belső szabályzat és a szerződéses kötelezettségek szerint folytatta le.\n' +
       '2. Az ellenőrzés eredményeit a jelenlévő felek megismerték és elfogadták.\n' +
       '3. A jelen jegyzőkönyvben rögzített hiányosságok orvoslása a megjelölt határidőkig kötelező.\n' +
       '4. A jegyzőkönyv eredeti példánya a Housing Solutions Kft. irattárában, elektronikus másolata a Szolgáltató rendszerében kerül megőrzésre.',
       { align: 'justify', lineGap: 2 }
     );

  // Signatures
  drawSectionTitle(doc, 'Aláírások');
  const sigY = doc.y + 10;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const sigW = (pageW - 20) / 2;
  const x1 = doc.page.margins.left;
  const x2 = x1 + sigW + 20;

  doc.moveTo(x1, sigY + 50).lineTo(x1 + sigW, sigY + 50).lineWidth(0.5).strokeColor(COLORS.dark).stroke();
  doc.moveTo(x2, sigY + 50).lineTo(x2 + sigW, sigY + 50).lineWidth(0.5).strokeColor(COLORS.dark).stroke();

  doc.font('Bold').fontSize(10).fillColor(COLORS.dark)
     .text('Ellenőr', x1, sigY + 55, { width: sigW, align: 'center' });
  doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
     .text(inspection.inspector_name || '—', x1, sigY + 70, { width: sigW, align: 'center' })
     .text(inspection.inspector_email || '', x1, sigY + 82, { width: sigW, align: 'center' });

  doc.font('Bold').fontSize(10).fillColor(COLORS.dark)
     .text('Ingatlan képviselője', x2, sigY + 55, { width: sigW, align: 'center' });
  doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
     .text('Név és aláírás dátuma:', x2, sigY + 70, { width: sigW, align: 'center' });

  // Digital signature note if one was captured
  if (inspection.digital_signature) {
    doc.y = sigY + 100;
    doc.moveDown(1);
    doc.font('Italic').fontSize(8).fillColor(COLORS.muted)
       .text(`Az ellenőr digitális aláírása rögzítve: ${fmtDate(inspection.signature_timestamp, true)}`, { align: 'center' });
  }

  // QR for verification — encodes inspection number + completion timestamp
  const qrPayload = JSON.stringify({
    t: 'hs-inspection',
    n: inspection.inspection_number,
    at: inspection.completed_at,
    id: inspection.id,
  });
  const qrBuf = await drawQR(doc, qrPayload, 70);
  doc.image(qrBuf, doc.page.width - doc.page.margins.right - 70, sigY + 50, { width: 70, height: 70 });
  doc.font('Regular').fontSize(7).fillColor(COLORS.muted)
     .text('Ellenőrzési kód', doc.page.width - doc.page.margins.right - 70, sigY + 124, { width: 70, align: 'center' });

  finalizeDoc(doc, { verifyText: `Jegyzőkönyv azonosító: ${inspection.inspection_number}` });
  doc.end();
  return doc;
}

// ─── Document 2: Owner Report ───────────────────────────────────────

async function generateOwnerReport(inspectionId) {
  const ctx = await loadInspectionContext(inspectionId);
  const { inspection, rooms, scores, tasks } = ctx;

  const doc = createDoc({ title: 'Tulajdonosi riport' });

  drawHeader(doc, {
    title: 'TULAJDONOSI RIPORT',
    subtitle: 'Ingatlan állapotfelmérés',
    number: inspection.inspection_number,
  });

  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text(`Tisztelt Tulajdonos!`, { continued: false });
  doc.moveDown(0.3);
  doc.text(
    `Az alábbiakban összefoglaljuk a(z) ${inspection.accommodation_name || 'ingatlan'} ${fmtDate(inspection.completed_at)} időpontban lefolytatott állapotfelmérésének eredményét.`,
    { align: 'justify' }
  );

  drawSectionTitle(doc, 'Eredmények egy pillantásra');
  drawScoreCard(doc, {
    technical:  inspection.technical_score,
    hygiene:    inspection.hygiene_score,
    aesthetic:  inspection.aesthetic_score,
    total:      inspection.total_score,
    grade:      inspection.grade,
  });

  drawSectionTitle(doc, 'Ingatlan adatai');
  drawKeyValueTable(doc, [
    ['Ingatlan',          inspection.accommodation_name || '—'],
    ['Cím',               inspection.accommodation_address || '—'],
    ['Ellenőrzés típusa', TYPE_HU[inspection.inspection_type] || inspection.inspection_type],
    ['Elvégezte',         inspection.inspector_name || '—'],
    ['Dátum',             fmtDate(inspection.completed_at || inspection.started_at)],
  ]);

  if (rooms.length > 0) {
    drawSectionTitle(doc, `Szobánkénti értékelés (${rooms.length} db)`);
    drawTable(doc, [
      { label: 'Szoba',        key: 'room_number', width: 70 },
      { label: 'Emelet',       key: 'floor',       width: 50, align: 'center' },
      { label: 'Ágyak',        key: 'beds',        width: 50, align: 'center' },
      { label: 'Pontszám',     render: r => r.total_score != null ? `${r.total_score}/100` : '—', width: 70, align: 'center', bold: true },
      { label: 'Értékelés',    render: r => GRADE_HU[r.grade]?.label || '—', width: 90, align: 'center' },
      { label: 'Trend',        render: r => r.trend === 'improving' ? '▲ javuló' : r.trend === 'declining' ? '▼ romló' : r.trend === 'stable' ? '■ stabil' : '—', width: 80, align: 'center' },
      { label: 'Megjegyzés',   key: 'notes',       width: 150 },
    ], rooms);
  }

  // Category breakdown
  const categoryTotals = {};
  scores.forEach(s => {
    const key = s.category_name || s.category_code;
    categoryTotals[key] = categoryTotals[key] || { score: 0, max: 0 };
    categoryTotals[key].score += Number(s.score) || 0;
    categoryTotals[key].max   += Number(s.max_score) || 0;
  });
  const catRows = Object.entries(categoryTotals).map(([name, v]) => ({
    name, score: v.score, max: v.max, pct: v.max ? Math.round((v.score / v.max) * 100) : 0,
  }));
  if (catRows.length > 0) {
    drawSectionTitle(doc, 'Kategóriák szerinti bontás');
    drawTable(doc, [
      { label: 'Kategória', key: 'name',  width: 260 },
      { label: 'Pontok',    render: r => `${r.score} / ${r.max}`, width: 120, align: 'center' },
      { label: 'Teljesítés', render: r => `${r.pct}%`, width: 120, align: 'center', bold: true },
    ], catRows);
  }

  if (tasks.length > 0) {
    drawSectionTitle(doc, 'Szükséges beavatkozások');
    drawTable(doc, [
      { label: 'Teendő',    key: 'title',   width: 300 },
      { label: 'Prioritás', render: r => PRIORITY_HU[r.priority] || r.priority, width: 100, align: 'center' },
      { label: 'Határidő',  render: r => fmtDate(r.due_date), width: 100, align: 'center' },
    ], tasks);
  }

  drawSectionTitle(doc, 'Kapcsolat');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text('Kérdés esetén kérjük forduljon ügyfélszolgálatunkhoz:');
  doc.text(`${COMPANY.name}`);
  doc.text(COMPANY.address);
  doc.text(`${COMPANY.email}  •  ${COMPANY.phone}`);

  finalizeDoc(doc, { verifyText: `Riport azonosító: ${inspection.inspection_number}` });
  doc.end();
  return doc;
}

// ─── Document 3: Internal Inspection Report ─────────────────────────

async function generateInspectionReport(inspectionId) {
  const ctx = await loadInspectionContext(inspectionId);
  const { inspection, scores, tasks, photos, rooms, damages } = ctx;

  const doc = createDoc({ title: 'Ellenőrzési részletes riport' });

  drawHeader(doc, {
    title: 'BELSŐ ELLENŐRZÉSI RIPORT',
    subtitle: 'Részletes kimutatás',
    number: inspection.inspection_number,
  });

  drawSectionTitle(doc, 'Alapadatok');
  drawKeyValueTable(doc, [
    ['Ingatlan',        inspection.accommodation_name || '—'],
    ['Cím',             inspection.accommodation_address || '—'],
    ['Ellenőr',         inspection.inspector_name || '—'],
    ['Ellenőr e-mail',  inspection.inspector_email || '—'],
    ['Típus',           TYPE_HU[inspection.inspection_type] || inspection.inspection_type],
    ['Státusz',         inspection.status],
    ['Ütemezve',        fmtDate(inspection.scheduled_at, true)],
    ['Kezdés',          fmtDate(inspection.started_at, true)],
    ['Befejezés',       fmtDate(inspection.completed_at, true)],
    ['GPS',             inspection.gps_latitude ? `${Number(inspection.gps_latitude).toFixed(6)}, ${Number(inspection.gps_longitude).toFixed(6)}` : '—'],
  ]);

  drawSectionTitle(doc, 'Értékelés');
  drawScoreCard(doc, {
    technical:  inspection.technical_score,
    hygiene:    inspection.hygiene_score,
    aesthetic:  inspection.aesthetic_score,
    total:      inspection.total_score,
    grade:      inspection.grade,
  });

  drawSectionTitle(doc, `Tételes pontozás (${scores.length} db)`);
  if (scores.length === 0) {
    doc.font('Italic').fontSize(10).fillColor(COLORS.muted)
       .text('Nincsenek rögzített tételes pontok.');
  } else {
    drawTable(doc, [
      { label: 'Kategória',   key: 'category_name', width: 90 },
      { label: 'Tétel',       key: 'item_name',     width: 220 },
      { label: 'Pont',        render: r => `${r.score}/${r.max_score}`, width: 60, align: 'center' },
      { label: 'Súlyosság',   render: r => SEVERITY_HU[r.severity] || r.severity, width: 90, align: 'center' },
      { label: 'Jegyzet',     key: 'notes',         width: 140 },
    ], scores);
  }

  if (rooms.length > 0) {
    drawSectionTitle(doc, `Szobánkénti pontok (${rooms.length} db)`);
    drawTable(doc, [
      { label: 'Szoba',      key: 'room_number',     width: 60 },
      { label: 'Emelet',     key: 'floor',           width: 50, align: 'center' },
      { label: 'Műszaki',    key: 'technical_score', width: 60, align: 'center' },
      { label: 'Higiénia',   key: 'hygiene_score',   width: 60, align: 'center' },
      { label: 'Esztétika',  key: 'aesthetic_score', width: 60, align: 'center' },
      { label: 'Össz.',      key: 'total_score',     width: 55, align: 'center', bold: true },
      { label: 'Trend',      render: r => r.trend || '—', width: 60, align: 'center' },
      { label: 'Változás',   render: r => r.score_change != null ? (r.score_change > 0 ? `+${r.score_change}` : r.score_change) : '—', width: 60, align: 'center' },
    ], rooms);
  }

  if (tasks.length > 0) {
    drawSectionTitle(doc, `Generált feladatok (${tasks.length} db)`);
    drawTable(doc, [
      { label: 'Cím',        key: 'title',       width: 260 },
      { label: 'Prioritás',  render: r => PRIORITY_HU[r.priority] || r.priority, width: 80, align: 'center' },
      { label: 'Határidő',   render: r => fmtDate(r.due_date), width: 100, align: 'center' },
      { label: 'Státusz',    key: 'status',      width: 80 },
    ], tasks);
  }

  if (damages.length > 0) {
    drawSectionTitle(doc, `Kárigények (${damages.length} db)`);
    drawTable(doc, [
      { label: 'Leírás',          key: 'description',    width: 250 },
      { label: 'Súlyosság',       render: r => SEVERITY_HU[r.severity] || r.severity || '—', width: 90, align: 'center' },
      { label: 'Becsült költség', render: r => fmtMoney(r.estimated_cost), width: 110, align: 'right' },
      { label: 'Státusz',         key: 'status',         width: 80 },
    ], damages);
  }

  drawSectionTitle(doc, 'Jegyzetek');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark);
  if (inspection.general_notes) {
    doc.font('Bold').text('Ellenőr jegyzetei:');
    doc.font('Regular').text(inspection.general_notes, { align: 'justify' });
    doc.moveDown(0.5);
  }
  if (inspection.admin_review_notes) {
    doc.font('Bold').text('Admin átnézés:');
    doc.font('Regular').text(inspection.admin_review_notes, { align: 'justify' });
  }
  if (!inspection.general_notes && !inspection.admin_review_notes) {
    doc.font('Italic').fillColor(COLORS.muted).text('Nincs rögzített jegyzet.');
  }

  if (photos.length > 0) {
    drawSectionTitle(doc, `Fotódokumentáció (${photos.length} db)`);
    doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
       .text('Az alábbi fotók az ellenőrzés helyszínén készültek. Teljes felbontásban a rendszerben érhetők el.');
    doc.moveDown(0.3);

    const perRow = 3;
    const gap = 8;
    const x0 = doc.page.margins.left;
    const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cellW = (usableW - gap * (perRow - 1)) / perRow;
    const cellH = cellW * 0.75;

    let col = 0;
    let rowY = doc.y;
    for (const p of photos) {
      if (!p.file_path) continue;
      const full = path.isAbsolute(p.file_path)
        ? p.file_path
        : path.join(__dirname, '..', '..', p.file_path);
      if (!fs.existsSync(full)) continue;

      if (rowY + cellH > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        rowY = doc.y;
      }

      const cx = x0 + col * (cellW + gap);
      try {
        doc.image(full, cx, rowY, { fit: [cellW, cellH], align: 'center', valign: 'center' });
        doc.save().rect(cx, rowY, cellW, cellH).lineWidth(0.5).strokeColor(COLORS.light).stroke().restore();
      } catch (e) {
        doc.save().rect(cx, rowY, cellW, cellH).fill(COLORS.bg).restore();
        doc.font('Italic').fontSize(8).fillColor(COLORS.muted)
           .text('Kép nem betölthető', cx, rowY + cellH / 2 - 6, { width: cellW, align: 'center' });
      }

      col++;
      if (col >= perRow) {
        col = 0;
        rowY += cellH + gap;
        doc.y = rowY;
      }
    }
    if (col !== 0) doc.y = rowY + cellH + gap;
  }

  finalizeDoc(doc, { verifyText: `Belső riport: ${inspection.inspection_number}` });
  doc.end();
  return doc;
}

// ─── Document 4: Compensation Notice (Kártérítési értesítő) ─────────

const COMP_TYPE_HU = {
  damage:             'Kártérítés',
  cleaning:           'Takarítási költség',
  late_payment:       'Késedelmi kamat',
  contract_violation: 'Szerződésszegés',
  other:              'Egyéb',
};

async function loadCompensationContext(compensationId) {
  const r = await query(
    `SELECT c.*,
            a.name  AS accommodation_name,
            a.address AS accommodation_address,
            i.inspection_number,
            i.completed_at AS inspection_date,
            r.room_number,
            u.first_name || ' ' || u.last_name AS created_by_name
     FROM compensations c
     LEFT JOIN accommodations a      ON c.accommodation_id = a.id
     LEFT JOIN inspections    i      ON c.inspection_id    = i.id
     LEFT JOIN accommodation_rooms r ON c.room_id          = r.id
     LEFT JOIN users u               ON c.created_by       = u.id
     WHERE c.id = $1`,
    [compensationId]
  );
  if (r.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');

  const [payments, reminders] = await Promise.all([
    query(`SELECT * FROM compensation_payments WHERE compensation_id = $1 ORDER BY paid_at`, [compensationId]),
    query(`SELECT * FROM compensation_reminders WHERE compensation_id = $1 ORDER BY sent_at`, [compensationId]),
  ]);

  return { compensation: r.rows[0], payments: payments.rows, reminders: reminders.rows };
}

/**
 * Formal demand letter to the responsible party. Structured as a Hungarian
 * "Kártérítési értesítő" (compensation notice) — used as evidence in
 * payroll deduction proceedings and legal action.
 */
async function generateCompensationNotice(compensationId) {
  const { compensation: c, payments, reminders } = await loadCompensationContext(compensationId);

  const doc = createDoc({ title: 'Kártérítési értesítő' });
  drawHeader(doc, {
    title: 'KÁRTÉRÍTÉSI ÉRTESÍTŐ',
    subtitle: 'Fizetési felszólítás',
    number: c.compensation_number,
  });

  doc.font('Regular').fontSize(10).fillColor(COLORS.dark);
  const escalationLabel = c.escalation_level >= 3
    ? 'Jogi eljárás alá helyezve'
    : c.escalation_level === 2 ? 'Végső felszólítás'
    : c.escalation_level === 1 ? 'Ismételt felszólítás'
    : 'Első értesítő';
  doc.text(`Tárgy: Fizetési kötelezettség (${escalationLabel})`, { align: 'justify' });
  doc.moveDown(0.5);
  doc.text(
    `A ${COMPANY.name} nevében értesítjük Önt, hogy az alábbiakban részletezett ${COMP_TYPE_HU[c.compensation_type] || c.compensation_type} címén fizetési kötelezettsége áll fenn.`,
    { align: 'justify' }
  );

  drawSectionTitle(doc, 'Adatok');
  drawKeyValueTable(doc, [
    ['Értesítő száma',    c.compensation_number],
    ['Felelős neve',      c.responsible_name || '—'],
    ['Felelős e-mail',    c.responsible_email || '—'],
    ['Felelős telefon',   c.responsible_phone || '—'],
    ['Ingatlan',          c.accommodation_name || '—'],
    ['Ingatlan cím',      c.accommodation_address || '—'],
    ['Szoba',             c.room_number || '—'],
    ['Kapcsolódó ellenőrzés',
      c.inspection_number
        ? `${c.inspection_number} (${fmtDate(c.inspection_date)})`
        : '—'],
    ['Kiállítás dátuma',  fmtDate(c.issued_at, true)],
    ['Fizetési határidő', fmtDate(c.due_date)],
    ['Értesítő szintje',  escalationLabel],
  ]);

  // Amount block — dominant visual
  drawSectionTitle(doc, 'Fizetendő összeg');
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 80;
  const y = doc.y;
  doc.save().roundedRect(x, y, w, h, 6).fill(COLORS.bg).restore();
  doc.save().roundedRect(x, y, 6, h, 3).fill(COLORS.danger).restore();

  const outstanding = Number(c.amount_gross) - Number(c.amount_paid || 0);
  const boxW = (w - 24) / 3;
  const boxes = [
    { label: 'Alapösszeg',   value: fmtMoney(c.amount_gross) },
    { label: 'Befizetve',    value: fmtMoney(c.amount_paid || 0) },
    { label: 'Hátralék',     value: fmtMoney(outstanding), accent: true },
  ];
  boxes.forEach((b, i) => {
    const bx = x + 12 + boxW * i;
    doc.font('Regular').fontSize(9).fillColor(COLORS.muted)
       .text(b.label, bx, y + 12, { width: boxW, align: 'center' });
    doc.font('Bold').fontSize(b.accent ? 22 : 16)
       .fillColor(b.accent ? COLORS.danger : COLORS.dark)
       .text(b.value, bx, y + 28, { width: boxW, align: 'center' });
  });
  doc.y = y + h + 10;

  drawSectionTitle(doc, 'A követelés indoklása');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text(c.description || '—', { align: 'justify' });
  if (c.calculation_notes) {
    doc.moveDown(0.5);
    doc.font('Bold').text('Számítási jegyzet:');
    doc.font('Regular').text(c.calculation_notes, { align: 'justify' });
  }

  if (payments.length > 0) {
    drawSectionTitle(doc, `Beérkezett részfizetések (${payments.length})`);
    drawTable(doc, [
      { label: 'Dátum',     render: r => fmtDate(r.paid_at), width: 120 },
      { label: 'Összeg',    render: r => fmtMoney(r.amount), width: 120, align: 'right', bold: true },
      { label: 'Módszer',   key: 'method',                    width: 120, align: 'center' },
      { label: 'Hivatkozás', key: 'reference',                width: 140 },
    ], payments);
  }

  if (reminders.length > 0) {
    drawSectionTitle(doc, `Értesítők / emlékeztetők története (${reminders.length})`);
    drawTable(doc, [
      { label: 'Dátum',    render: r => fmtDate(r.sent_at, true), width: 140 },
      { label: 'Típus',    key: 'reminder_type',                   width: 130 },
      { label: 'Csatorna', key: 'sent_channel',                    width: 80, align: 'center' },
      { label: 'Státusz',  key: 'delivery_status',                 width: 80, align: 'center' },
    ], reminders);
  }

  drawSectionTitle(doc, 'Fizetési feltételek');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text(
       '1. A fenti hátralékos összeg a megadott határidőig a Szolgáltató által megadott bankszámlára átutalással, vagy a munkavállalói bérből történő levonással kiegyenlítendő.\n' +
       '2. A határidő eredménytelen elteltét követően a Szolgáltató jogi úton érvényesíti követelését, melynek költségei a Felelőst terhelik.\n' +
       '3. Részletfizetési megállapodás kérhető a kibocsátótól, a határidő lejárta előtt írásban.\n' +
       '4. Amennyiben a követelés megalapozatlannak tartja, kifogását a ' + fmtDate(c.due_date) + ' dátumig jelezheti.',
       { align: 'justify', lineGap: 2 }
     );

  drawSectionTitle(doc, 'Kapcsolat');
  doc.font('Regular').fontSize(10).fillColor(COLORS.dark)
     .text(`${COMPANY.name}  •  ${COMPANY.address}`);
  doc.text(`${COMPANY.email}  •  ${COMPANY.phone}`);
  if (c.created_by_name) {
    doc.moveDown(0.3);
    doc.font('Italic').fontSize(9).fillColor(COLORS.muted)
       .text(`Kiállította: ${c.created_by_name}`);
  }

  // QR for verification
  const qrPayload = JSON.stringify({
    t: 'hs-compensation',
    n: c.compensation_number,
    due: c.due_date,
    amt: Number(c.amount_gross),
  });
  const qrBuf = await drawQR(doc, qrPayload, 70);
  const qrX = doc.page.width - doc.page.margins.right - 70;
  const qrY = doc.y + 10;
  doc.image(qrBuf, qrX, qrY, { width: 70, height: 70 });
  doc.font('Regular').fontSize(7).fillColor(COLORS.muted)
     .text('Ellenőrző kód', qrX, qrY + 74, { width: 70, align: 'center' });

  finalizeDoc(doc, { verifyText: `Kártérítés: ${c.compensation_number}` });
  doc.end();
  return doc;
}

module.exports = {
  generateLegalProtocol,
  generateOwnerReport,
  generateInspectionReport,
  generateCompensationNotice,
  // exports for testing
  _internals: { createDoc, drawHeader, loadInspectionContext, loadCompensationContext, GRADE_HU, SEVERITY_HU, PRIORITY_HU, TYPE_HU, COMP_TYPE_HU, COLORS, COMPANY },
};
