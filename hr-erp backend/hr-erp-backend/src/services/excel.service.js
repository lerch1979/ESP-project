/**
 * Excel Export Service — 5 Hungarian-localised workbooks
 *
 * Each `export*` function returns a Buffer ready to be streamed to the
 * client. Shared helpers:
 *   - buildSheet(columns, rows, { summaryRow?, sheetName })
 *   - addBook(sheets[])  → returns xlsx Buffer
 *
 * Notes:
 *   - Community xlsx (SheetJS) doesn't style cells beyond what the writer
 *     supports — we use the aoa-to-sheet path + !cols for widths, which
 *     Excel renders cleanly. Header row formatting is implicit via bold
 *     labels.
 *   - Money values stay as numbers (not pre-formatted strings) so Excel
 *     can sum/filter them.
 *   - Dates are written as native Date objects with a format hint.
 */
const XLSX = require('xlsx');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Helpers ────────────────────────────────────────────────────────

const GRADE_LABEL = {
  excellent: 'Kiváló', good: 'Jó', acceptable: 'Megfelelő',
  poor: 'Gyenge', bad: 'Rossz', critical: 'Kritikus',
};
const STATUS_LABEL = {
  scheduled: 'Ütemezett', in_progress: 'Folyamatban', completed: 'Befejezett',
  reviewed: 'Átnézett', cancelled: 'Törölt',
};
const TASK_STATUS_LABEL = {
  pending: 'Várólista', assigned: 'Kiosztva', in_progress: 'Folyamatban',
  completed: 'Befejezve', overdue: 'Lejárt', cancelled: 'Törölve',
};
const TASK_PRIORITY_LABEL = {
  emergency: 'Sürgős', critical: 'Kritikus', high: 'Magas',
  medium: 'Közepes', low: 'Alacsony',
};
const COMP_TYPE_LABEL = { fine: 'Bírság', damage: 'Kártérítés' };
const COMP_STATUS_LABEL = {
  draft: 'Piszkozat', issued: 'Kiállítva', notified: 'Értesítve',
  disputed: 'Vitatott', partial_paid: 'Részben fizetve', paid: 'Kiegyenlítve',
  paid_on_site: 'Helyszínen kifizetve', waived: 'Elengedve',
  escalated: 'Eszkalálva', closed: 'Lezárt',
  salary_deduction_pending: 'Bérlevonás vár', salary_deduction_active: 'Bérlevonás fut',
  salary_deduction_completed: 'Bérlevonás lezárva',
};

function formatDate(d) {
  if (!d) return null;
  // Return a Date so Excel recognises it. Empty cells stay empty.
  return d instanceof Date ? d : new Date(d);
}

/** Apply approximate column widths from row content + header. */
function computeColumnWidths(header, rows) {
  return header.map((h, i) => {
    let max = String(h || '').length;
    for (const row of rows) {
      const cell = row[i];
      if (cell == null) continue;
      const str = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell);
      if (str.length > max) max = Math.min(str.length, 50);
    }
    return { wch: Math.min(Math.max(max + 2, 10), 55) };
  });
}

/** Build a worksheet from a column schema + data rows. */
function buildSheet({ columns, rows, sheetName = 'Sheet1', summary = null, title = null }) {
  const header = columns.map(c => c.label);
  const dataArr = rows.map(r => columns.map(c => {
    const raw = c.render ? c.render(r) : r[c.key];
    if (raw == null) return null;
    if (c.type === 'date' && !(raw instanceof Date)) return new Date(raw);
    if (c.type === 'number' || c.type === 'money') return Number(raw);
    return raw;
  }));

  const aoa = [];
  if (title) {
    aoa.push([title]);
    aoa.push([]);
  }
  aoa.push(header);
  for (const row of dataArr) aoa.push(row);
  if (summary) {
    aoa.push([]);
    for (const line of summary) aoa.push(line);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths + frozen header
  ws['!cols'] = computeColumnWidths(header, dataArr);
  ws['!freeze'] = { xSplit: 0, ySplit: (title ? 3 : 1) };

  // Per-column number/date formatting via `z` (z= number format string).
  // Rows start at 0 for the title line (if present), the blank line, and
  // then the header. Data rows begin at `dataStart`.
  const dataStart = title ? 3 : 1; // 1-based index below
  for (let i = 0; i < dataArr.length; i++) {
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      const ref = XLSX.utils.encode_cell({ r: dataStart - 1 + 1 + i, c: j });
      const cell = ws[ref];
      if (!cell) continue;
      if (col.type === 'money') cell.z = '#,##0 "HUF"';
      if (col.type === 'date')  cell.z = 'yyyy-mm-dd';
      if (col.type === 'number') cell.z = '0';
    }
  }

  return { name: sheetName, sheet: ws };
}

function addBook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, sheet } of sheets) {
    XLSX.utils.book_append_sheet(wb, sheet, name.substring(0, 31));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Filter helper: push conditional WHERE fragments + params.
function buildWhere(filters = {}) {
  const clauses = [];
  const params = [];
  const add = (frag, val) => {
    if (val == null || val === '') return;
    params.push(val);
    clauses.push(frag.replace('?', `$${params.length}`));
  };
  add('i.accommodation_id = ?', filters.accommodationId);
  add('i.inspector_id     = ?', filters.inspectorId);
  add('i.status           = ?', filters.status);
  add('i.inspection_type  = ?', filters.type);
  add('i.scheduled_at     >= ?', filters.from);
  add('i.scheduled_at     <= ?', filters.to);
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// ─── 1. Inspections list export ─────────────────────────────────────

async function exportInspections(filters = {}) {
  const { where, params } = buildWhere(filters);
  const r = await query(
    `SELECT i.*,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS inspector_name
     FROM inspections i
     LEFT JOIN accommodations a ON i.accommodation_id = a.id
     LEFT JOIN users u          ON i.inspector_id     = u.id
     ${where}
     ORDER BY i.scheduled_at DESC NULLS LAST, i.created_at DESC`,
    params
  );

  const columns = [
    { label: 'Ellenőrzés száma',   key: 'inspection_number' },
    { label: 'Szálláshely',        key: 'accommodation_name' },
    { label: 'Ellenőr',            key: 'inspector_name' },
    { label: 'Típus',              render: r => r.inspection_type },
    { label: 'Státusz',            render: r => STATUS_LABEL[r.status] || r.status },
    { label: 'Ütemezve',           key: 'scheduled_at', type: 'date' },
    { label: 'Kezdés',             key: 'started_at',   type: 'date' },
    { label: 'Befejezés',          key: 'completed_at', type: 'date' },
    { label: 'Műszaki pont',       key: 'technical_score',  type: 'number' },
    { label: 'Higiénia pont',      key: 'hygiene_score',    type: 'number' },
    { label: 'Esztétika pont',     key: 'aesthetic_score',  type: 'number' },
    { label: 'Összes pont',        key: 'total_score',      type: 'number' },
    { label: 'Értékelés',          render: r => GRADE_LABEL[r.grade] || r.grade },
    { label: 'Általános jegyzet',  key: 'general_notes' },
    { label: 'Admin jegyzet',      key: 'admin_review_notes' },
  ];
  const summary = [
    [],
    ['Összes ellenőrzés:', r.rows.length],
    ['Befejezett:',        r.rows.filter(x => x.status === 'completed' || x.status === 'reviewed').length],
    ['Átlag pontszám:',    r.rows.length ? Math.round(r.rows.reduce((s, x) => s + (Number(x.total_score) || 0), 0) / r.rows.length) : 0],
  ];
  return buildSheet({
    sheetName: 'Ellenőrzések',
    title: `Ellenőrzések listája (${new Date().toLocaleDateString('hu-HU')})`,
    columns, rows: r.rows, summary,
  });
}

// ─── 2. Property performance export ─────────────────────────────────

async function exportPropertyPerformance(filters = {}) {
  // Build date filter separately; these apply to the joined inspection rows,
  // not to the accommodations themselves.
  const joinClauses = [];
  const params = [];
  const add = (frag, val) => { if (val == null || val === '') return; params.push(val); joinClauses.push(frag.replace('?', `$${params.length}`)); };
  add('i.scheduled_at >= ?', filters.from);
  add('i.scheduled_at <= ?', filters.to);
  const joinExtra = joinClauses.length ? `AND ${joinClauses.join(' AND ')}` : '';

  const r = await query(
    `SELECT a.id, a.name,
            COUNT(i.id)::int                                   AS inspections_count,
            COUNT(i.id) FILTER (WHERE i.status IN ('completed','reviewed'))::int AS completed_count,
            AVG(i.total_score)::numeric(5,2)                   AS avg_total,
            AVG(i.technical_score)::numeric(5,2)               AS avg_tech,
            AVG(i.hygiene_score)::numeric(5,2)                 AS avg_hyg,
            AVG(i.aesthetic_score)::numeric(5,2)               AS avg_aes,
            MIN(i.total_score)::int                            AS min_score,
            MAX(i.total_score)::int                            AS max_score,
            MAX(i.completed_at)                                AS last_inspected_at,
            COUNT(i.id) FILTER (WHERE i.grade IN ('bad','critical'))::int AS critical_count
     FROM accommodations a
     LEFT JOIN inspections i
       ON i.accommodation_id = a.id
      AND i.status IN ('completed','reviewed')
      ${joinExtra}
     GROUP BY a.id, a.name
     ORDER BY avg_total DESC NULLS LAST`,
    params
  );

  const columns = [
    { label: 'Szálláshely',          key: 'name' },
    { label: 'Ellenőrzések (össz.)', key: 'inspections_count', type: 'number' },
    { label: 'Befejezettek',         key: 'completed_count',   type: 'number' },
    { label: 'Átlag össz.pont',      key: 'avg_total',         type: 'number' },
    { label: 'Átlag műszaki',        key: 'avg_tech',          type: 'number' },
    { label: 'Átlag higiénia',       key: 'avg_hyg',           type: 'number' },
    { label: 'Átlag esztétika',      key: 'avg_aes',           type: 'number' },
    { label: 'Min pont',             key: 'min_score',         type: 'number' },
    { label: 'Max pont',             key: 'max_score',         type: 'number' },
    { label: 'Kritikus ellenőrzések', key: 'critical_count',   type: 'number' },
    { label: 'Utolsó ellenőrzés',    key: 'last_inspected_at', type: 'date' },
  ];
  return buildSheet({
    sheetName: 'Szálláshelyek',
    title: `Szálláshely teljesítmény — ${new Date().toLocaleDateString('hu-HU')}`,
    columns, rows: r.rows,
  });
}

// ─── 3. Compensation report (fines + damages) ──────────────────────

async function exportCompensationReport(filters = {}) {
  const clauses = [];
  const params = [];
  const add = (frag, val) => {
    if (val == null || val === '') return;
    params.push(val); clauses.push(frag.replace('?', `$${params.length}`));
  };
  add('c.type = ?',              filters.type);
  add('c.status = ?',            filters.status);
  add('c.accommodation_id = ?',  filters.accommodationId);
  add('c.created_at >= ?',       filters.from);
  add('c.created_at <= ?',       filters.to);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await query(
    `SELECT c.*,
            a.name AS accommodation_name,
            ft.name AS fine_type_name,
            (c.amount_gross - c.amount_paid) AS outstanding
     FROM compensations c
     LEFT JOIN accommodations a ON c.accommodation_id = a.id
     LEFT JOIN fine_types   ft ON c.fine_type_id = ft.id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );

  const columns = [
    { label: 'Azonosító',          key: 'compensation_number' },
    { label: 'Típus',              render: r => COMP_TYPE_LABEL[r.type] || r.type },
    { label: 'Bírság típus',       key: 'fine_type_name' },
    { label: 'Szálláshely',        key: 'accommodation_name' },
    { label: 'Felelős',            key: 'responsible_name' },
    { label: 'Összeg (bruttó)',    key: 'amount_gross', type: 'money' },
    { label: 'Befizetve',          key: 'amount_paid',  type: 'money' },
    { label: 'Hátralék',           key: 'outstanding',  type: 'money' },
    { label: 'Pénznem',            key: 'currency' },
    { label: 'Státusz',            render: r => COMP_STATUS_LABEL[r.status] || r.status },
    { label: 'Eszkalációs szint',  key: 'escalation_level', type: 'number' },
    { label: 'Kiállítva',          key: 'issued_at',  type: 'date' },
    { label: 'Határidő',           key: 'due_date',   type: 'date' },
    { label: 'Kifizetve',          key: 'paid_at',    type: 'date' },
    { label: 'Indoklás',           key: 'description' },
  ];

  // Summary split by type
  const fines   = rows.rows.filter(r => r.type === 'fine');
  const damages = rows.rows.filter(r => r.type === 'damage');
  const sum = (arr, k) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);
  const summary = [
    [],
    ['Bírságok', '', '', '', '', sum(fines, 'amount_gross'), sum(fines, 'amount_paid'), sum(fines, 'outstanding')],
    ['Kártérítések', '', '', '', '', sum(damages, 'amount_gross'), sum(damages, 'amount_paid'), sum(damages, 'outstanding')],
    ['Összesen:',    '', '', '', '', sum(rows.rows, 'amount_gross'), sum(rows.rows, 'amount_paid'), sum(rows.rows, 'outstanding')],
    [],
    ['Tételek száma:',        rows.rows.length],
    ['Teljesen kiegyenlített:', rows.rows.filter(r => ['paid', 'paid_on_site'].includes(r.status)).length],
    ['Bérlevonás alatt:',     rows.rows.filter(r => (r.status || '').startsWith('salary_deduction')).length],
  ];

  return buildSheet({
    sheetName: 'Kártérítések',
    title: `Kártérítések + bírságok riport — ${new Date().toLocaleDateString('hu-HU')}`,
    columns, rows: rows.rows, summary,
  });
}

// ─── 4. Inspector performance ───────────────────────────────────────

async function exportInspectorPerformance(filters = {}) {
  // Date filters attach to the joined inspections (keep inspectors with 0 in
  // the outer result where any filter applies).
  const joinClauses = [];
  const params = [];
  const add = (frag, val) => { if (val == null || val === '') return; params.push(val); joinClauses.push(frag.replace('?', `$${params.length}`)); };
  add('i.scheduled_at >= ?', filters.from);
  add('i.scheduled_at <= ?', filters.to);
  const joinExtra = joinClauses.length ? `AND ${joinClauses.join(' AND ')}` : '';

  const r = await query(
    `SELECT u.id,
            u.first_name || ' ' || u.last_name AS inspector_name,
            u.email,
            COUNT(i.id)::int AS inspections_count,
            COUNT(i.id) FILTER (WHERE i.status IN ('completed','reviewed'))::int AS completed_count,
            AVG(i.total_score)::numeric(5,2) AS avg_score,
            AVG(EXTRACT(EPOCH FROM (i.completed_at - i.started_at))/60)::numeric(8,1) AS avg_duration_min,
            COUNT(i.id) FILTER (WHERE i.grade IN ('bad','critical'))::int AS critical_found,
            MIN(i.scheduled_at) AS first_inspection,
            MAX(i.completed_at) AS last_inspection
     FROM users u
     LEFT JOIN inspections i ON i.inspector_id = u.id ${joinExtra}
     WHERE EXISTS (SELECT 1 FROM inspections i2 WHERE i2.inspector_id = u.id)
     GROUP BY u.id, u.first_name, u.last_name, u.email
     ORDER BY completed_count DESC, inspections_count DESC`,
    params
  );

  const columns = [
    { label: 'Ellenőr',           key: 'inspector_name' },
    { label: 'E-mail',            key: 'email' },
    { label: 'Ellenőrzések',      key: 'inspections_count',    type: 'number' },
    { label: 'Befejezettek',      key: 'completed_count',      type: 'number' },
    { label: 'Átlag pontszám',    key: 'avg_score',            type: 'number' },
    { label: 'Átlag időtartam (perc)', key: 'avg_duration_min', type: 'number' },
    { label: 'Kritikus találatok', key: 'critical_found',      type: 'number' },
    { label: 'Első ellenőrzés',   key: 'first_inspection',     type: 'date' },
    { label: 'Utolsó ellenőrzés', key: 'last_inspection',      type: 'date' },
  ];
  return buildSheet({
    sheetName: 'Ellenőrök',
    title: `Ellenőr teljesítmény — ${new Date().toLocaleDateString('hu-HU')}`,
    columns, rows: r.rows,
  });
}

// ─── 5. Maintenance tasks export ────────────────────────────────────

async function exportMaintenanceTasks(filters = {}) {
  const clauses = [];
  const params = [];
  const add = (frag, val) => { if (val == null || val === '') return; params.push(val); clauses.push(frag.replace('?', `$${params.length}`)); };
  add('t.status          = ?', filters.status);
  add('t.priority        = ?', filters.priority);
  add('t.assignee_id     = ?', filters.assigneeId);
  add('i.accommodation_id = ?', filters.accommodationId);
  add('t.created_at     >= ?', filters.from);
  add('t.created_at     <= ?', filters.to);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const r = await query(
    `SELECT t.*,
            i.inspection_number,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS assignee_name
     FROM inspection_tasks t
     LEFT JOIN inspections i    ON t.inspection_id = i.id
     LEFT JOIN accommodations a ON i.accommodation_id = a.id
     LEFT JOIN users u          ON t.assignee_id = u.id
     ${where}
     ORDER BY t.due_date NULLS LAST, t.priority DESC`,
    params
  );

  const columns = [
    { label: 'Cím',              key: 'title' },
    { label: 'Leírás',           key: 'description' },
    { label: 'Ellenőrzés',       key: 'inspection_number' },
    { label: 'Szálláshely',      key: 'accommodation_name' },
    { label: 'Kategória',        key: 'category' },
    { label: 'Prioritás',        render: r => TASK_PRIORITY_LABEL[r.priority] || r.priority },
    { label: 'Státusz',          render: r => TASK_STATUS_LABEL[r.status] || r.status },
    { label: 'Felelős',          key: 'assignee_name' },
    { label: 'Létrehozva',       key: 'created_at', type: 'date' },
    { label: 'Határidő',         key: 'due_date',   type: 'date' },
    { label: 'Befejezve',        key: 'completed_at', type: 'date' },
    { label: 'Tényleges költség', key: 'actual_cost', type: 'money' },
  ];
  const summary = [
    [],
    ['Összes feladat:',   r.rows.length],
    ['Befejezett:',       r.rows.filter(x => x.status === 'completed').length],
    ['Lejárt:',           r.rows.filter(x => x.status === 'overdue').length],
    ['Sürgős/kritikus:',  r.rows.filter(x => ['emergency', 'critical'].includes(x.priority)).length],
  ];
  return buildSheet({
    sheetName: 'Feladatok',
    title: `Karbantartási feladatok — ${new Date().toLocaleDateString('hu-HU')}`,
    columns, rows: r.rows, summary,
  });
}

// ─── Top-level dispatcher ───────────────────────────────────────────

async function exportWorkbook(type, filters = {}) {
  let sheet;
  switch (type) {
    case 'inspections':
      sheet = await exportInspections(filters); break;
    case 'property-performance':
      sheet = await exportPropertyPerformance(filters); break;
    case 'compensations':
      sheet = await exportCompensationReport(filters); break;
    case 'inspector-performance':
      sheet = await exportInspectorPerformance(filters); break;
    case 'maintenance-tasks':
      sheet = await exportMaintenanceTasks(filters); break;
    default:
      throw new Error(`UNKNOWN_EXPORT_TYPE:${type}`);
  }
  return addBook([sheet]);
}

module.exports = {
  exportInspections,
  exportPropertyPerformance,
  exportCompensationReport,
  exportInspectorPerformance,
  exportMaintenanceTasks,
  exportWorkbook,
  addBook,
  _helpers: { buildSheet, computeColumnWidths },
};
