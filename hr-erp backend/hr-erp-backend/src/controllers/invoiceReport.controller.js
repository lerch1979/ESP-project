const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

// ============================================
// CONSTANTS
// ============================================

const PAYMENT_STATUS_LABELS = {
  pending: 'Függőben',
  paid: 'Fizetve',
  overdue: 'Lejárt',
  cancelled: 'Sztornó',
};

const MONTHS_HU = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

// Számlariportok now reads the LIVE cost ledger (accommodation_expenses),
// not the dormant `invoices` table. Field map vs the old invoices table:
//   net   = COALESCE(net_amount, amount)   (net_amount is null for ÁFA-exempt)
//   vat   = COALESCE(vat_amount, 0)
//   gross = amount
//   date  = performance_date (HU teljesítés) → invoice_date → billing_month
//   category = the 4-enum string (not the invoice_categories FK)
const EXP_DATE = "COALESCE(e.performance_date, e.invoice_date, to_date(e.billing_month, 'YYYY-MM'))";
const EXP_NET = 'COALESCE(e.net_amount, e.amount)';
const EXP_VAT = 'COALESCE(e.vat_amount, 0)';
const EXP_GROSS = 'e.amount';
const CATEGORY_LABELS = {
  rezsi: 'Rezsi', karbantartas: 'Karbantartás', takaritas: 'Takarítás', egyeb: 'Egyéb',
};
const CATEGORY_CASE = `CASE e.category ${Object.entries(CATEGORY_LABELS)
  .map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(' ')} ELSE e.category END`;

// ============================================
// HELPERS
// ============================================

function fmtDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString('hu-HU');
}

function fmtCurrency(val) {
  if (!val && val !== 0) return '';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
}

/**
 * Build base WHERE clause + params from report filters
 */
function buildFilterClause(filters) {
  const { startDate, endDate, costCenterIds, vendorNames, categories, paymentStatus } = filters;
  // Soft-delete guard always applies (live cost ledger).
  const conditions = ['e.deleted_at IS NULL'];
  const params = [];
  let idx = 0;

  if (startDate) {
    idx++;
    conditions.push(`${EXP_DATE} >= $${idx}`);
    params.push(startDate);
  }

  if (endDate) {
    idx++;
    conditions.push(`${EXP_DATE} <= $${idx}`);
    params.push(endDate);
  }

  if (costCenterIds && costCenterIds.length > 0) {
    // Include all descendants of the selected cost centers using recursive CTE
    idx++;
    const placeholders = costCenterIds.map((_, i) => `$${idx + i}`).join(', ');
    conditions.push(`e.cost_center_id IN (
      WITH RECURSIVE subtree AS (
        SELECT id FROM cost_centers WHERE id IN (${placeholders})
        UNION ALL
        SELECT cc2.id FROM cost_centers cc2 JOIN subtree st ON cc2.parent_id = st.id
      )
      SELECT id FROM subtree
    )`);
    params.push(...costCenterIds);
    idx += costCenterIds.length - 1;
  }

  if (vendorNames && vendorNames.length > 0) {
    const placeholders = vendorNames.map(() => { idx++; return `$${idx}`; }).join(', ');
    conditions.push(`e.vendor_name IN (${placeholders})`);
    params.push(...vendorNames);
  }

  // category is the 4-enum string (rezsi/karbantartas/takaritas/egyeb)
  if (categories && categories.length > 0) {
    const placeholders = categories.map(() => { idx++; return `$${idx}`; }).join(', ');
    conditions.push(`e.category IN (${placeholders})`);
    params.push(...categories);
  }

  if (paymentStatus && paymentStatus.length > 0) {
    const placeholders = paymentStatus.map(() => { idx++; return `$${idx}`; }).join(', ');
    conditions.push(`e.payment_status IN (${placeholders})`);
    params.push(...paymentStatus);
  }

  const whereClause = 'WHERE ' + conditions.join(' AND ');
  return { whereClause, params, paramIdx: idx };
}

/**
 * Build a tree from a flat list and roll up amounts from children to parents
 */
function buildTreeWithRollup(flatList) {
  const map = {};
  const roots = [];

  // Initialize all nodes
  flatList.forEach(item => {
    map[item.id] = {
      id: item.id,
      name: item.name,
      code: item.code,
      icon: item.icon,
      parent_id: item.parent_id,
      level: item.level,
      invoiceCount: parseInt(item.invoice_count) || 0,
      netAmount: parseFloat(item.net_amount) || 0,
      vatAmount: parseFloat(item.vat_amount) || 0,
      grossAmount: parseFloat(item.gross_amount) || 0,
      children: [],
    };
  });

  // Build tree
  flatList.forEach(item => {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
    } else {
      roots.push(map[item.id]);
    }
  });

  // Roll up amounts from children to parents (bottom-up)
  function rollUp(node) {
    if (node.children.length > 0) {
      node.children.forEach(rollUp);
      // Sum children into parent (parent keeps its own direct invoices + children's totals)
      node.children.forEach(child => {
        node.invoiceCount += child.invoiceCount;
        node.netAmount += child.netAmount;
        node.vatAmount += child.vatAmount;
        node.grossAmount += child.grossAmount;
      });
    }
  }

  roots.forEach(rollUp);

  // Filter out nodes that have zero invoices (no data in this report)
  function filterEmpty(nodes) {
    return nodes
      .filter(n => n.invoiceCount > 0)
      .map(n => ({
        ...n,
        children: filterEmpty(n.children),
      }));
  }

  return filterEmpty(roots);
}

/**
 * Get period grouping SQL expressions based on groupBy
 */
function getPeriodGrouping(groupBy) {
  const D = EXP_DATE; // date expression on accommodation_expenses (alias e)
  switch (groupBy) {
    case 'day':
      return {
        groupExpr: `TO_CHAR(${D}, 'YYYY-MM-DD')`,
        labelExpr: `TO_CHAR(${D}, 'YYYY. MM. DD.')`,
        orderExpr: `TO_CHAR(${D}, 'YYYY-MM-DD')`,
      };
    case 'week':
      return {
        groupExpr: `TO_CHAR(date_trunc('week', ${D}), 'IYYY-"W"IW')`,
        labelExpr: `TO_CHAR(date_trunc('week', ${D}), 'IYYY') || '. ' || TO_CHAR(date_trunc('week', ${D}), 'IW') || '. hét'`,
        orderExpr: `TO_CHAR(date_trunc('week', ${D}), 'IYYY-"W"IW')`,
      };
    case 'quarter':
      return {
        groupExpr: `TO_CHAR(${D}, 'YYYY-"Q"Q')`,
        labelExpr: `TO_CHAR(${D}, 'YYYY') || '. Q' || TO_CHAR(${D}, 'Q')`,
        orderExpr: `TO_CHAR(${D}, 'YYYY-"Q"Q')`,
      };
    case 'month':
    default:
      return {
        groupExpr: `TO_CHAR(${D}, 'YYYY-MM')`,
        labelExpr: `TO_CHAR(${D}, 'YYYY') || '. ' || TO_CHAR(${D}, 'MM')`,
        orderExpr: `TO_CHAR(${D}, 'YYYY-MM')`,
      };
  }
}

/**
 * Per-accommodation cashflow by month: cost (accommodation_expenses) +
 * revenue (accommodation_billings, non-cancelled incoming runs) → margin.
 * Independent of the line-item filters (vendor/category/cost-center) — those
 * would distort the unit margin — it respects only the month range so it
 * answers "which szálló makes money vs loses". Returns rows per accommodation
 * with a per-period breakdown + totals.
 */
async function computeByAccommodation(startDate, endDate) {
  const startMonth = String(startDate).slice(0, 7);
  const endMonth = String(endDate).slice(0, 7);

  const costRows = await query(
    `SELECT accommodation_id, billing_month AS period, COALESCE(SUM(amount), 0) AS cost
       FROM accommodation_expenses
      WHERE deleted_at IS NULL AND billing_month BETWEEN $1 AND $2
      GROUP BY accommodation_id, billing_month`,
    [startMonth, endMonth],
  );
  const revRows = await query(
    `SELECT ab.accommodation_id, ab.billing_month AS period, COALESCE(SUM(ab.total_amount), 0) AS revenue
       FROM accommodation_billings ab
       JOIN billing_runs br ON br.id = ab.billing_run_id
      WHERE ab.status <> 'cancelled' AND br.status <> 'cancelled' AND br.run_type = 'incoming'
        AND ab.billing_month BETWEEN $1 AND $2
      GROUP BY ab.accommodation_id, ab.billing_month`,
    [startMonth, endMonth],
  );

  const acc = new Map(); // accId -> { periods: Map<period,{cost,revenue}> }
  const bucket = (id) => {
    if (!acc.has(id)) acc.set(id, new Map());
    return acc.get(id);
  };
  for (const r of costRows.rows) bucket(r.accommodation_id).set(r.period, { cost: parseFloat(r.cost), revenue: 0 });
  for (const r of revRows.rows) {
    const m = bucket(r.accommodation_id);
    const cur = m.get(r.period) || { cost: 0, revenue: 0 };
    cur.revenue = parseFloat(r.revenue);
    m.set(r.period, cur);
  }

  const ids = [...acc.keys()];
  const nameById = new Map();
  if (ids.length > 0) {
    const names = await query('SELECT id, name FROM accommodations WHERE id = ANY($1::uuid[])', [ids]);
    for (const n of names.rows) nameById.set(n.id, n.name);
  }

  const rows = ids.map((id) => {
    const periods = [...acc.get(id).entries()]
      .map(([period, v]) => ({ period, cost: v.cost, revenue: v.revenue, margin: v.revenue - v.cost }))
      .sort((a, b) => a.period.localeCompare(b.period));
    const totalCost = periods.reduce((s, p) => s + p.cost, 0);
    const totalRevenue = periods.reduce((s, p) => s + p.revenue, 0);
    const margin = totalRevenue - totalCost;
    return {
      accommodationId: id,
      accommodationName: nameById.get(id) || '—',
      periods,
      totalCost, totalRevenue, margin,
      marginPct: totalRevenue > 0 ? Math.round((margin / totalRevenue) * 1000) / 10 : null,
    };
  });
  // Worst margin first (the ones losing money surface at the top).
  rows.sort((a, b) => a.margin - b.margin);
  return rows;
}

/**
 * Format period label for Hungarian display
 */
function formatPeriodLabel(period, groupBy) {
  if (!period) return '';
  if (groupBy === 'month') {
    // 'YYYY. MM' -> 'YYYY. Hónap'
    const parts = period.split('. ');
    if (parts.length === 2) {
      const monthNum = parseInt(parts[1]);
      if (monthNum >= 1 && monthNum <= 12) {
        return `${parts[0]}. ${MONTHS_HU[monthNum - 1]}`;
      }
    }
  }
  return period;
}

// ============================================
// GENERATE REPORT
// ============================================

const generateReport = async (req, res) => {
  try {
    const {
      startDate, endDate, costCenterIds = [], vendorNames = [],
      categories = [], paymentStatus = [], groupBy = 'month',
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Kezdő és záró dátum megadása kötelező',
      });
    }

    const filters = { startDate, endDate, costCenterIds, vendorNames, categories, paymentStatus };
    const { whereClause, params } = buildFilterClause(filters);

    // ---- 1. Summary ----
    const summaryResult = await query(`
      SELECT
        COUNT(*) AS total_invoices,
        COALESCE(SUM(${EXP_NET}), 0) AS total_net,
        COALESCE(SUM(${EXP_VAT}), 0) AS total_vat,
        COALESCE(SUM(${EXP_GROSS}), 0) AS total_gross
      FROM accommodation_expenses e
      ${whereClause}
    `, params);

    const summaryRow = summaryResult.rows[0];
    const totalInvoices = parseInt(summaryRow.total_invoices) || 0;
    const summary = {
      totalInvoices,
      totalNet: parseFloat(summaryRow.total_net) || 0,
      totalVat: parseFloat(summaryRow.total_vat) || 0,
      totalGross: parseFloat(summaryRow.total_gross) || 0,
      avgInvoice: totalInvoices > 0 ? (parseFloat(summaryRow.total_gross) || 0) / totalInvoices : 0,
    };

    // ---- 2. Detailed list (aliased to the old invoices column names so the
    //         export helpers + UI keep working unchanged) ----
    const invoiceResult = await query(`
      SELECT
        e.id, e.invoice_number, e.vendor_name, e.vendor_tax_number,
        ${EXP_NET} AS amount, ${EXP_VAT} AS vat_amount, ${EXP_GROSS} AS total_amount, e.currency,
        ${EXP_DATE} AS invoice_date, NULL::date AS due_date, e.payment_date, e.payment_status,
        e.notes AS description, e.notes, e.cost_center_id, e.category,
        a.name AS accommodation_name,
        cc.name AS cost_center_name, cc.code AS cost_center_code, cc.icon AS cost_center_icon,
        ${CATEGORY_CASE} AS category_name
      FROM accommodation_expenses e
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      ${whereClause}
      ORDER BY ${EXP_DATE} DESC, e.invoice_number ASC
    `, params);

    const invoices = invoiceResult.rows;

    // ---- 3. Cost center hierarchical summary ----
    const ccSumResult = await query(`
      SELECT
        cc.id, cc.name, cc.code, cc.icon, cc.parent_id, cc.level, cc.path,
        COUNT(e.cost_center_id) AS invoice_count,
        COALESCE(SUM(e.net), 0) AS net_amount,
        COALESCE(SUM(e.vat), 0) AS vat_amount,
        COALESCE(SUM(e.gross), 0) AS gross_amount
      FROM cost_centers cc
      LEFT JOIN (
        SELECT e.cost_center_id, ${EXP_NET} AS net, ${EXP_VAT} AS vat, ${EXP_GROSS} AS gross
        FROM accommodation_expenses e ${whereClause}
      ) e ON e.cost_center_id = cc.id
      WHERE cc.is_active = true
      GROUP BY cc.id, cc.name, cc.code, cc.icon, cc.parent_id, cc.level, cc.path
      ORDER BY cc.path, cc.name
    `, params);

    const byCostCenter = buildTreeWithRollup(ccSumResult.rows);

    // ---- 4. Vendor (supplier) summary ----
    const vendorResult = await query(`
      SELECT
        e.vendor_name,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY e.vendor_name
      ORDER BY gross_amount DESC
    `, params);

    const totalGrossForPercentage = summary.totalGross || 1;
    const byVendor = vendorResult.rows.map(row => ({
      vendorName: row.vendor_name || 'Ismeretlen',
      invoiceCount: parseInt(row.invoice_count) || 0,
      netAmount: parseFloat(row.net_amount) || 0,
      vatAmount: parseFloat(row.vat_amount) || 0,
      grossAmount: parseFloat(row.gross_amount) || 0,
      percentage: ((parseFloat(row.gross_amount) || 0) / totalGrossForPercentage) * 100,
    }));

    // ---- 5. Category summary (4-enum) ----
    const categoryResult = await query(`
      SELECT
        e.category,
        ${CATEGORY_CASE} AS category_name,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY e.category
      ORDER BY gross_amount DESC
    `, params);

    const byCategory = categoryResult.rows.map(row => ({
      categoryId: row.category,
      categoryName: row.category_name,
      categoryIcon: null,
      invoiceCount: parseInt(row.invoice_count) || 0,
      netAmount: parseFloat(row.net_amount) || 0,
      vatAmount: parseFloat(row.vat_amount) || 0,
      grossAmount: parseFloat(row.gross_amount) || 0,
    }));

    // ---- 6. Period breakdown ----
    const { groupExpr, labelExpr, orderExpr } = getPeriodGrouping(groupBy);

    const periodResult = await query(`
      SELECT
        ${groupExpr} AS period,
        ${labelExpr} AS period_label,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY ${groupExpr}, ${labelExpr}
      ORDER BY ${orderExpr} ASC
    `, params);

    const byPeriod = periodResult.rows.map(row => ({
      period: row.period,
      periodLabel: formatPeriodLabel(row.period_label, groupBy),
      invoiceCount: parseInt(row.invoice_count) || 0,
      netAmount: parseFloat(row.net_amount) || 0,
      vatAmount: parseFloat(row.vat_amount) || 0,
      grossAmount: parseFloat(row.gross_amount) || 0,
    }));

    // ---- 7. Per-accommodation cashflow (cost + revenue + margin) ----
    const byAccommodation = await computeByAccommodation(startDate, endDate);

    // ---- Response ----
    res.json({
      success: true,
      data: {
        summary,
        invoices,
        byCostCenter,
        byVendor,
        byCategory,
        byPeriod,
        byAccommodation,
      },
    });

    logger.info('Invoice report generated', {
      userId: req.user?.id,
      startDate, endDate, groupBy,
      invoiceCount: invoices.length,
    });
  } catch (error) {
    logger.error('Invoice report generate hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a riport generálásánál',
    });
  }
};

// ============================================
// EXPORT REPORT
// ============================================

const exportReport = async (req, res) => {
  try {
    const {
      startDate, endDate, costCenterIds = [], vendorNames = [],
      categories = [], paymentStatus = [], groupBy = 'month',
      format = 'xlsx',
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Kezdő és záró dátum megadása kötelező',
      });
    }

    if (!['xlsx', 'pdf', 'csv'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Érvénytelen formátum. Engedélyezett: xlsx, pdf, csv',
      });
    }

    const filters = { startDate, endDate, costCenterIds, vendorNames, categories, paymentStatus };
    const { whereClause, params } = buildFilterClause(filters);

    // Fetch all expense data (aliased to the legacy invoice column names)
    const invoiceResult = await query(`
      SELECT
        e.id, e.invoice_number, e.vendor_name, e.vendor_tax_number,
        ${EXP_NET} AS amount, ${EXP_VAT} AS vat_amount, ${EXP_GROSS} AS total_amount, e.currency,
        ${EXP_DATE} AS invoice_date, NULL::date AS due_date, e.payment_date, e.payment_status,
        e.notes AS description, e.notes,
        a.name AS accommodation_name,
        cc.name AS cost_center_name, cc.code AS cost_center_code,
        ${CATEGORY_CASE} AS category_name
      FROM accommodation_expenses e
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      ${whereClause}
      ORDER BY ${EXP_DATE} DESC, e.invoice_number ASC
    `, params);

    const invoices = invoiceResult.rows;

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nincs számla a megadott szűrőknek megfelelően',
      });
    }

    const filename = `szamla_riport_${startDate}_${endDate}`;

    // ---- CSV Export ----
    if (format === 'csv') {
      return exportCsv(res, invoices, filename);
    }

    // ---- PDF Export ----
    if (format === 'pdf') {
      return exportPdf(res, invoices, filters, filename);
    }

    // ---- XLSX Export ----
    const summaryResult = await query(`
      SELECT
        COUNT(*) AS total_invoices,
        COALESCE(SUM(${EXP_NET}), 0) AS total_net,
        COALESCE(SUM(${EXP_VAT}), 0) AS total_vat,
        COALESCE(SUM(${EXP_GROSS}), 0) AS total_gross
      FROM accommodation_expenses e
      ${whereClause}
    `, params);

    // Cost center summary
    const ccSumResult = await query(`
      SELECT
        cc.id, cc.name, cc.code, cc.icon, cc.parent_id, cc.level, cc.path,
        COUNT(e.cost_center_id) AS invoice_count,
        COALESCE(SUM(e.net), 0) AS net_amount,
        COALESCE(SUM(e.vat), 0) AS vat_amount,
        COALESCE(SUM(e.gross), 0) AS gross_amount
      FROM cost_centers cc
      LEFT JOIN (
        SELECT e.cost_center_id, ${EXP_NET} AS net, ${EXP_VAT} AS vat, ${EXP_GROSS} AS gross
        FROM accommodation_expenses e ${whereClause}
      ) e ON e.cost_center_id = cc.id
      WHERE cc.is_active = true
      GROUP BY cc.id, cc.name, cc.code, cc.icon, cc.parent_id, cc.level, cc.path
      ORDER BY cc.path, cc.name
    `, params);

    // Vendor summary
    const vendorResult = await query(`
      SELECT e.vendor_name,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY e.vendor_name
      ORDER BY gross_amount DESC
    `, params);

    // Category summary
    const categoryResult = await query(`
      SELECT
        ${CATEGORY_CASE} AS category_name,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY e.category
      ORDER BY gross_amount DESC
    `, params);

    // Period summary
    const { groupExpr, labelExpr, orderExpr } = getPeriodGrouping(groupBy);
    const periodResult = await query(`
      SELECT
        ${labelExpr} AS period_label,
        COUNT(*) AS invoice_count,
        COALESCE(SUM(${EXP_NET}), 0) AS net_amount,
        COALESCE(SUM(${EXP_VAT}), 0) AS vat_amount,
        COALESCE(SUM(${EXP_GROSS}), 0) AS gross_amount
      FROM accommodation_expenses e
      ${whereClause}
      GROUP BY ${groupExpr}, ${labelExpr}
      ORDER BY ${orderExpr} ASC
    `, params);

    const byAccommodation = await computeByAccommodation(startDate, endDate);

    return exportXlsx(res, {
      invoices,
      summary: summaryResult.rows[0],
      costCenters: buildTreeWithRollup(ccSumResult.rows),
      vendors: vendorResult.rows,
      categories: categoryResult.rows,
      periods: periodResult.rows,
      byAccommodation,
      filters,
      groupBy,
      filename,
    });
  } catch (error) {
    logger.error('Invoice report export hiba:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Hiba a riport exportálásánál',
      });
    }
  }
};

// ============================================
// CSV EXPORT
// ============================================

function exportCsv(res, invoices, filename) {
  const headers = [
    'Dátum', 'Számlaszám', 'Szállító', 'Szállító adószám',
    'Költséghely', 'Költséghely kód', 'Kategória',
    'Nettó', 'ÁFA', 'Bruttó', 'Pénznem',
    'Fizetési határidő', 'Fizetés dátuma', 'Státusz',
    'Leírás', 'Megjegyzés',
  ];

  const rows = invoices.map(inv => [
    fmtDate(inv.invoice_date),
    inv.invoice_number || '',
    inv.vendor_name || '',
    inv.vendor_tax_number || '',
    inv.cost_center_name || '',
    inv.cost_center_code || '',
    inv.category_name || '',
    inv.amount || 0,
    inv.vat_amount || 0,
    inv.total_amount || 0,
    inv.currency || 'HUF',
    fmtDate(inv.due_date),
    fmtDate(inv.payment_date),
    PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status || '',
    inv.description || '',
    inv.notes || '',
  ]);

  // Semicolon separated for Excel compatibility
  const csvContent = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  // UTF-8 BOM for Excel
  const bom = '\uFEFF';
  const buffer = Buffer.from(bom + csvContent, 'utf-8');

  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(buffer);
}

// ============================================
// PDF EXPORT
// ============================================

function exportPdf(res, invoices, filters, filename) {
  // Try to use pdfkit if available, otherwise fallback to a basic text approach
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch {
    // pdfkit not installed — generate a simple formatted text file as PDF alternative
    return exportPdfFallback(res, invoices, filters, filename);
  }

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  // ---- Header ----
  doc.fontSize(18).font('Helvetica-Bold').text('Számla Riport', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica')
    .text(`Időszak: ${filters.startDate} — ${filters.endDate}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor('#666666')
    .text(`Generálva: ${new Date().toLocaleString('hu-HU')}  |  Összesen: ${invoices.length} számla`, { align: 'center' });
  doc.fillColor('#000000');
  doc.moveDown(1);

  // ---- Summary ----
  const totalNet = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalVat = invoices.reduce((s, i) => s + (parseFloat(i.vat_amount) || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

  doc.fontSize(10).font('Helvetica-Bold').text('Összesítés');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica');
  doc.text(`Összes számla: ${invoices.length} db`);
  doc.text(`Nettó összeg: ${fmtCurrency(totalNet)}`);
  doc.text(`ÁFA összeg: ${fmtCurrency(totalVat)}`);
  doc.text(`Bruttó összeg: ${fmtCurrency(totalGross)}`);
  doc.text(`Átlag/számla: ${fmtCurrency(invoices.length > 0 ? totalGross / invoices.length : 0)}`);
  doc.moveDown(1);

  // ---- Table ----
  const colWidths = [65, 75, 95, 80, 65, 75, 75, 80, 55];
  const colHeaders = ['Dátum', 'Számlaszám', 'Szállító', 'Költséghely', 'Kategória', 'Nettó', 'ÁFA', 'Bruttó', 'Státusz'];
  const tableTop = doc.y;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Table header
  function drawTableHeader(yPos) {
    doc.rect(doc.page.margins.left, yPos, pageWidth, 18).fill('#2563eb');
    let x = doc.page.margins.left + 4;
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
    colHeaders.forEach((h, i) => {
      doc.text(h, x, yPos + 5, { width: colWidths[i] - 8, align: i >= 5 ? 'right' : 'left' });
      x += colWidths[i];
    });
    doc.fillColor('#000000');
    return yPos + 18;
  }

  let y = drawTableHeader(tableTop);
  const maxY = doc.page.height - doc.page.margins.bottom - 30;

  // Table rows
  invoices.forEach((inv, rowIdx) => {
    if (y > maxY) {
      doc.addPage();
      y = drawTableHeader(doc.page.margins.top);
    }

    const bgColor = rowIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(doc.page.margins.left, y, pageWidth, 16).fill(bgColor);

    const rowData = [
      fmtDate(inv.invoice_date),
      inv.invoice_number || '-',
      (inv.vendor_name || '-').substring(0, 18),
      (inv.cost_center_name || '-').substring(0, 14),
      (inv.category_name || '-').substring(0, 10),
      fmtCurrency(parseFloat(inv.amount) || 0),
      fmtCurrency(parseFloat(inv.vat_amount) || 0),
      fmtCurrency(parseFloat(inv.total_amount) || 0),
      PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status || '',
    ];

    let x = doc.page.margins.left + 4;
    doc.fontSize(6.5).font('Helvetica').fillColor('#333333');
    rowData.forEach((val, i) => {
      doc.text(val, x, y + 4, { width: colWidths[i] - 8, align: i >= 5 ? 'right' : 'left' });
      x += colWidths[i];
    });
    doc.fillColor('#000000');
    y += 16;
  });

  // ---- Footer with page numbers ----
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor('#999999');
    doc.text(
      `${i + 1} / ${pages.count} oldal`,
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom + 10,
      { align: 'center', width: pageWidth }
    );
  }

  doc.end();

  logger.info('PDF export completed', { invoiceCount: invoices.length });
}

/**
 * Fallback PDF-like export when pdfkit is not installed.
 * Generates XLSX instead with a note.
 */
function exportPdfFallback(res, invoices, filters, filename) {
  logger.warn('pdfkit not installed, falling back to XLSX for PDF export');

  const data = invoices.map((inv, idx) => ({
    'Sorszám': idx + 1,
    'Dátum': fmtDate(inv.invoice_date),
    'Számlaszám': inv.invoice_number || '',
    'Szállító': inv.vendor_name || '',
    'Költséghely': inv.cost_center_name || '',
    'Kategória': inv.category_name || '',
    'Nettó': parseFloat(inv.amount) || 0,
    'ÁFA': parseFloat(inv.vat_amount) || 0,
    'Bruttó': parseFloat(inv.total_amount) || 0,
    'Státusz': PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Számla riport');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.send(buffer);
}

// ============================================
// XLSX EXPORT (MULTI-SHEET)
// ============================================

function exportXlsx(res, data) {
  const { invoices, summary, costCenters, vendors, categories, periods, byAccommodation = [], filters, groupBy, filename } = data;

  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Részletes lista ----
  const detailData = invoices.map((inv, idx) => ({
    'Sorszám': idx + 1,
    'Számla dátum': fmtDate(inv.invoice_date),
    'Számlaszám': inv.invoice_number || '',
    'Szállító': inv.vendor_name || '',
    'Szállító adószám': inv.vendor_tax_number || '',
    'Költséghely': inv.cost_center_name || '',
    'Költséghely kód': inv.cost_center_code || '',
    'Kategória': inv.category_name || '',
    'Nettó összeg': parseFloat(inv.amount) || 0,
    'ÁFA összeg': parseFloat(inv.vat_amount) || 0,
    'Bruttó összeg': parseFloat(inv.total_amount) || 0,
    'Pénznem': inv.currency || 'HUF',
    'Fizetési határidő': fmtDate(inv.due_date),
    'Fizetés dátuma': fmtDate(inv.payment_date),
    'Státusz': PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status || '',
    'Leírás': inv.description || '',
    'Megjegyzés': inv.notes || '',
  }));

  // Add totals row
  const totalNet = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalVat = invoices.reduce((s, i) => s + (parseFloat(i.vat_amount) || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

  detailData.push({
    'Sorszám': '',
    'Számla dátum': '',
    'Számlaszám': '',
    'Szállító': 'ÖSSZESEN:',
    'Szállító adószám': '',
    'Költséghely': '',
    'Költséghely kód': '',
    'Kategória': '',
    'Nettó összeg': totalNet,
    'ÁFA összeg': totalVat,
    'Bruttó összeg': totalGross,
    'Pénznem': '',
    'Fizetési határidő': '',
    'Fizetés dátuma': '',
    'Státusz': '',
    'Leírás': `${invoices.length} db számla`,
    'Megjegyzés': '',
  });

  const ws1 = XLSX.utils.json_to_sheet(detailData);
  ws1['!cols'] = [
    { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 25 }, { wch: 18 },
    { wch: 22 }, { wch: 12 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 30 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Részletes lista');

  // ---- Sheet 2: Költséghely összesítő ----
  const ccData = [];
  function flattenCostCenterTree(nodes, level = 0) {
    nodes.forEach(node => {
      const prefix = '  '.repeat(level);
      ccData.push({
        'Költséghely': `${prefix}${node.icon || ''} ${node.name}`,
        'Kód': node.code || '',
        'Szint': level + 1,
        'Számla db': node.invoiceCount,
        'Nettó': node.netAmount,
        'ÁFA': node.vatAmount,
        'Bruttó': node.grossAmount,
      });
      if (node.children && node.children.length > 0) {
        flattenCostCenterTree(node.children, level + 1);
      }
    });
  }
  flattenCostCenterTree(costCenters);

  const ws2 = XLSX.utils.json_to_sheet(ccData);
  ws2['!cols'] = [
    { wch: 40 }, { wch: 12 }, { wch: 6 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Költséghely összesítő');

  // ---- Sheet 3: Szállító összesítő ----
  const vendorData = vendors.map((v, idx) => ({
    '#': idx + 1,
    'Szállító': v.vendor_name || 'Ismeretlen',
    'Számla db': parseInt(v.invoice_count) || 0,
    'Nettó': parseFloat(v.net_amount) || 0,
    'ÁFA': parseFloat(v.vat_amount) || 0,
    'Bruttó': parseFloat(v.gross_amount) || 0,
    'Részesedés %': totalGross > 0
      ? ((parseFloat(v.gross_amount) || 0) / totalGross * 100).toFixed(1) + '%'
      : '0%',
  }));

  const ws3 = XLSX.utils.json_to_sheet(vendorData);
  ws3['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Szállító összesítő');

  // ---- Sheet 4: Kategória összesítő ----
  const catData = categories.map(c => ({
    'Kategória': c.category_name || 'Nincs kategória',
    'Számla db': parseInt(c.invoice_count) || 0,
    'Nettó': parseFloat(c.net_amount) || 0,
    'ÁFA': parseFloat(c.vat_amount) || 0,
    'Bruttó': parseFloat(c.gross_amount) || 0,
  }));

  const ws4 = XLSX.utils.json_to_sheet(catData);
  ws4['!cols'] = [
    { wch: 25 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Kategória összesítő');

  // ---- Sheet 5: Időszak összesítő ----
  const periodLabel = { day: 'Nap', week: 'Hét', month: 'Hónap', quarter: 'Negyedév' }[groupBy] || 'Időszak';
  const periodData = periods.map(p => ({
    [periodLabel]: formatPeriodLabel(p.period_label, groupBy),
    'Számla db': parseInt(p.invoice_count) || 0,
    'Nettó': parseFloat(p.net_amount) || 0,
    'ÁFA': parseFloat(p.vat_amount) || 0,
    'Bruttó': parseFloat(p.gross_amount) || 0,
  }));

  const ws5 = XLSX.utils.json_to_sheet(periodData);
  ws5['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws5, 'Időszak összesítő');

  // ---- Sheet: Szállásonkénti cashflow (cost + revenue + margin by period) ----
  const cashflowData = [];
  byAccommodation.forEach((acc) => {
    acc.periods.forEach((p) => {
      cashflowData.push({
        'Szállás': acc.accommodationName,
        'Időszak': p.period,
        'Költség': p.cost,
        'Bevétel': p.revenue,
        'Margin': p.margin,
      });
    });
    cashflowData.push({
      'Szállás': `${acc.accommodationName} — ÖSSZESEN`,
      'Időszak': '',
      'Költség': acc.totalCost,
      'Bevétel': acc.totalRevenue,
      'Margin': acc.margin,
    });
  });
  if (cashflowData.length > 0) {
    const wsCf = XLSX.utils.json_to_sheet(cashflowData);
    wsCf['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsCf, 'Szállás cashflow');
  }

  // ---- Sheet 6: Összegzés ----
  const summaryData = [
    { 'Megnevezés': 'Riport időszak', 'Érték': `${filters.startDate} — ${filters.endDate}` },
    { 'Megnevezés': 'Generálva', 'Érték': new Date().toLocaleString('hu-HU') },
    { 'Megnevezés': 'Időszak bontás', 'Érték': periodLabel },
    { 'Megnevezés': '', 'Érték': '' },
    { 'Megnevezés': 'Összes számla', 'Érték': `${parseInt(summary.total_invoices) || 0} db` },
    { 'Megnevezés': 'Nettó összeg', 'Érték': fmtCurrency(parseFloat(summary.total_net) || 0) },
    { 'Megnevezés': 'ÁFA összeg', 'Érték': fmtCurrency(parseFloat(summary.total_vat) || 0) },
    { 'Megnevezés': 'Bruttó összeg', 'Érték': fmtCurrency(parseFloat(summary.total_gross) || 0) },
    {
      'Megnevezés': 'Átlagos számla',
      'Érték': fmtCurrency(
        (parseInt(summary.total_invoices) || 0) > 0
          ? (parseFloat(summary.total_gross) || 0) / parseInt(summary.total_invoices)
          : 0
      ),
    },
    { 'Megnevezés': '', 'Érték': '' },
    { 'Megnevezés': 'Szállítók száma', 'Érték': `${vendors.length} db` },
    { 'Megnevezés': 'Kategóriák száma', 'Érték': `${categories.length} db` },
  ];

  if (filters.vendorNames && filters.vendorNames.length > 0) {
    summaryData.push({ 'Megnevezés': 'Szűrő: Szállítók', 'Érték': filters.vendorNames.join(', ') });
  }
  if (filters.paymentStatus && filters.paymentStatus.length > 0) {
    summaryData.push({
      'Megnevezés': 'Szűrő: Státusz',
      'Érték': filters.paymentStatus.map(s => PAYMENT_STATUS_LABELS[s] || s).join(', '),
    });
  }

  const ws6 = XLSX.utils.json_to_sheet(summaryData);
  ws6['!cols'] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws6, 'Összegzés');

  // ---- Send response ----
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.send(buffer);

  logger.info('XLSX export completed', { invoiceCount: invoices.length, sheets: 6 });
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generateReport,
  exportReport,
};
