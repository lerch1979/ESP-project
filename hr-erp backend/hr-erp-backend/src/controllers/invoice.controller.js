const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity, diffObjects } = require('../utils/activityLogger');
const { isValidUUID, sanitizeString, validateAmount, sanitizeSearch, parsePagination } = require('../utils/validation');

const VALID_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

// Valid invoice status transitions (state machine)
const VALID_TRANSITIONS = {
  'draft': ['sent', 'cancelled'],
  'sent': ['paid', 'overdue', 'cancelled'],
  'paid': ['overdue'],    // overpayment correction
  'overdue': ['paid', 'cancelled'],
  'cancelled': [],         // terminal state
};

const VALID_SORT_COLUMNS = {
  invoice_date: 'i.invoice_date',
  total_amount: 'i.total_amount',
  payment_status: 'i.payment_status',
  created_at: 'i.created_at',
  vendor_name: 'i.vendor_name',
};

function getSortColumn(col) {
  return VALID_SORT_COLUMNS[col] || 'i.created_at';
}

/**
 * Generate invoice number: INV-000001
 */
async function generateInvoiceNumber() {
  const result = await query("SELECT nextval('invoice_number_seq') as num");
  const num = String(result.rows[0].num).padStart(6, '0');
  return `INV-${num}`;
}

/**
 * GET /api/v1/invoices
 * Számlák listája szűrőkkel és lapozással
 */
const getAll = async (req, res) => {
  try {
    const { payment_status, vendor_name, date_from, date_to, sort_by, sort_order } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const search = sanitizeSearch(req.query.search, { maxLength: 200 });

    let whereConditions = ['i.deleted_at IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (payment_status && payment_status !== 'all') {
      whereConditions.push(`i.payment_status = $${paramIndex}`);
      params.push(payment_status);
      paramIndex++;
    }

    if (vendor_name) {
      whereConditions.push(`i.vendor_name ILIKE $${paramIndex}`);
      params.push(`%${vendor_name}%`);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(i.invoice_number ILIKE $${paramIndex} OR i.vendor_name ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`i.invoice_date >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`i.invoice_date <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM invoices i ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT i.*,
        cc.name as cost_center_name, cc.code as cost_center_code,
        ic.name as category_name,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name
       FROM invoices i
       LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
       LEFT JOIN invoice_categories ic ON i.category_id = ic.id
       LEFT JOIN users u ON i.created_by = u.id
       ${whereClause}
       ORDER BY ${getSortColumn(sort_by)} ${sort_order === 'ASC' ? 'ASC' : 'DESC'}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        invoices: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Számlák lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Számlák lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/invoices/:id
 * Számla részletek
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

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
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Számla nem található'
      });
    }

    res.json({
      success: true,
      data: { invoice: result.rows[0] }
    });
  } catch (error) {
    logger.error('Számla lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Számla lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/invoices
 * Új számla létrehozása
 */
const create = async (req, res) => {
  try {
    const {
      vendor_name, vendor_tax_number, amount, currency,
      vat_amount, total_amount, invoice_date, due_date,
      cost_center_id, category_id, description, notes,
      line_items, client_name, client_id, contractor_id
    } = req.body;

    if (!amount || !invoice_date) {
      return res.status(400).json({
        success: false,
        message: 'Összeg és számla dátum megadása kötelező'
      });
    }

    // Validate amount is positive
    const amountVal = validateAmount(amount);
    if (!amountVal.valid) {
      return res.status(400).json({ success: false, message: `Összeg: ${amountVal.error}` });
    }

    if (!cost_center_id) {
      return res.status(400).json({
        success: false,
        message: 'Költségközpont megadása kötelező'
      });
    }

    if (!isValidUUID(cost_center_id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen költségközpont azonosító' });
    }

    // Validate due_date is not before invoice_date
    if (due_date && invoice_date && new Date(due_date) < new Date(invoice_date)) {
      return res.status(400).json({ success: false, message: 'A fizetési határidő nem lehet a számla dátuma előtt' });
    }

    const invoiceNumber = await generateInvoiceNumber();

    const result = await query(
      `INSERT INTO invoices (
        invoice_number, vendor_name, vendor_tax_number, amount, currency,
        vat_amount, total_amount, invoice_date, due_date,
        cost_center_id, category_id, description, notes,
        line_items, client_name, client_id, contractor_id,
        payment_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        invoiceNumber, vendor_name || null, vendor_tax_number || null,
        amount, currency || 'HUF', vat_amount || null,
        total_amount || amount, invoice_date, due_date || null,
        cost_center_id, category_id || null, description || null, notes || null,
        line_items ? JSON.stringify(line_items) : null,
        client_name || null, client_id || null, contractor_id || null,
        'draft', req.user.id
      ]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'invoice',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { invoice_number: invoiceNumber, amount }
    });

    res.status(201).json({
      success: true,
      message: 'Számla létrehozva',
      data: { invoice: result.rows[0] }
    });
  } catch (error) {
    logger.error('Számla létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Számla létrehozási hiba'
    });
  }
};

/**
 * PUT /api/v1/invoices/:id
 * Számla szerkesztése
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const {
      vendor_name, vendor_tax_number, amount, currency,
      vat_amount, total_amount, invoice_date, due_date, payment_date,
      payment_status, cost_center_id, category_id, description, notes,
      line_items, client_name, client_id
    } = req.body;

    const current = await query(
      'SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Számla nem található'
      });
    }

    if (payment_status && !VALID_STATUSES.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen státusz. Lehetséges értékek: ${VALID_STATUSES.join(', ')}`
      });
    }

    // Validate status transitions (state machine)
    if (payment_status && payment_status !== current.rows[0].payment_status) {
      const currentStatus = current.rows[0].payment_status;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(payment_status)) {
        return res.status(400).json({
          success: false,
          message: `Érvénytelen státuszváltás: ${currentStatus} → ${payment_status}. Lehetséges: ${allowed.join(', ') || 'nincs'}`
        });
      }
    }

    // Validate amount if being updated
    if (amount !== undefined) {
      const amountVal = validateAmount(amount);
      if (!amountVal.valid) {
        return res.status(400).json({ success: false, message: `Összeg: ${amountVal.error}` });
      }
    }

    const result = await query(
      `UPDATE invoices SET
        vendor_name = COALESCE($1, vendor_name),
        vendor_tax_number = COALESCE($2, vendor_tax_number),
        amount = COALESCE($3, amount),
        currency = COALESCE($4, currency),
        vat_amount = COALESCE($5, vat_amount),
        total_amount = COALESCE($6, total_amount),
        invoice_date = COALESCE($7, invoice_date),
        due_date = COALESCE($8, due_date),
        payment_date = COALESCE($9, payment_date),
        payment_status = COALESCE($10, payment_status),
        cost_center_id = COALESCE($11, cost_center_id),
        category_id = COALESCE($12, category_id),
        description = COALESCE($13, description),
        notes = COALESCE($14, notes),
        line_items = COALESCE($15, line_items),
        client_name = COALESCE($16, client_name),
        client_id = COALESCE($17, client_id)
       WHERE id = $18 AND deleted_at IS NULL
       RETURNING *`,
      [
        vendor_name, vendor_tax_number, amount, currency,
        vat_amount, total_amount, invoice_date, due_date, payment_date,
        payment_status, cost_center_id, category_id, description, notes,
        line_items ? JSON.stringify(line_items) : null,
        client_name, client_id, id
      ]
    );

    const changes = diffObjects(current.rows[0], result.rows[0], [
      'vendor_name', 'amount', 'payment_status', 'due_date', 'cost_center_id'
    ]);

    if (changes) {
      await logActivity({
        userId: req.user.id,
        entityType: 'invoice',
        entityId: id,
        action: 'update',
        changes
      });
    }

    res.json({
      success: true,
      message: 'Számla frissítve',
      data: { invoice: result.rows[0] }
    });
  } catch (error) {
    logger.error('Számla frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Számla frissítési hiba'
    });
  }
};

/**
 * DELETE /api/v1/invoices/:id
 * Számla soft törlése
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const current = await query(
      'SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Számla nem található'
      });
    }

    await query(
      'UPDATE invoices SET deleted_at = NOW() WHERE id = $1',
      [id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'invoice',
      entityId: id,
      action: 'delete',
      metadata: { invoice_number: current.rows[0].invoice_number }
    });

    res.json({
      success: true,
      message: 'Számla törölve'
    });
  } catch (error) {
    logger.error('Számla törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Számla törlési hiba'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
