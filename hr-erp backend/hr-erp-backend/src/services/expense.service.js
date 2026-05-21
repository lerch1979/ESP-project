const { query } = require('../database/connection');
const { deriveBillingMonth, generateFingerprint } = require('../models/expense.model');

class ExpenseService {
  /**
   * Get all expenses with filters (soft-delete aware).
   *
   * Supported filters: accommodation_id, billing_month, category,
   * month_from/month_to (billing_month range), perf_from/perf_to
   * (performance_date range — accountant package use case), source,
   * status, payment_status, cost_center_id, vendor (ilike on vendor_name).
   */
  async getAll(filters = {}) {
    const {
      accommodation_id, billing_month, category,
      month_from, month_to,
      perf_from, perf_to,
      source, status, payment_status, cost_center_id, vendor,
      page = 1, limit = 50,
    } = filters;
    const offset = (page - 1) * limit;

    const whereConditions = ['e.deleted_at IS NULL'];
    const params = [];
    let paramIndex = 1;

    const push = (sql, val) => {
      whereConditions.push(sql.replace('$$', `$${paramIndex++}`));
      params.push(val);
    };

    if (accommodation_id) push('e.accommodation_id = $$', accommodation_id);
    if (billing_month)    push('e.billing_month = $$', billing_month);
    if (category)         push('e.category = $$', category);
    if (month_from)       push('e.billing_month >= $$', month_from);
    if (month_to)         push('e.billing_month <= $$', month_to);
    if (perf_from)        push('e.performance_date >= $$', perf_from);
    if (perf_to)          push('e.performance_date <= $$', perf_to);
    if (source)           push('e.source = $$', source);
    if (status)           push('e.status = $$', status);
    if (payment_status)   push('e.payment_status = $$', payment_status);
    if (cost_center_id)   push('e.cost_center_id = $$', cost_center_id);
    if (vendor) {
      whereConditions.push(`lower(e.vendor_name) LIKE $${paramIndex++}`);
      params.push(`%${String(vendor).toLowerCase()}%`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM accommodation_expenses e ${whereClause}`,
      params,
    );

    const result = await query(
      `SELECT e.*,
        a.name  AS accommodation_name,
        a.address AS accommodation_address,
        cc.name AS cost_center_name,
        cc.code AS cost_center_code,
        u.first_name  AS created_by_first_name,
        u.last_name   AS created_by_last_name,
        ap.first_name AS approved_by_first_name,
        ap.last_name  AS approved_by_last_name
       FROM accommodation_expenses e
       LEFT JOIN accommodations a   ON e.accommodation_id = a.id
       LEFT JOIN cost_centers cc    ON e.cost_center_id   = cc.id
       LEFT JOIN users u            ON e.created_by       = u.id
       LEFT JOIN users ap           ON e.approved_by      = ap.id
       ${whereClause}
       ORDER BY e.billing_month DESC, e.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)],
    );

    return {
      expenses: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    };
  }

  async getById(id) {
    const result = await query(
      `SELECT e.*,
        a.name  AS accommodation_name,
        a.address AS accommodation_address,
        cc.name AS cost_center_name,
        cc.code AS cost_center_code,
        u.first_name  AS created_by_first_name,
        u.last_name   AS created_by_last_name,
        ap.first_name AS approved_by_first_name,
        ap.last_name  AS approved_by_last_name
       FROM accommodation_expenses e
       LEFT JOIN accommodations a   ON e.accommodation_id = a.id
       LEFT JOIN cost_centers cc    ON e.cost_center_id   = cc.id
       LEFT JOIN users u            ON e.created_by       = u.id
       LEFT JOIN users ap           ON e.approved_by      = ap.id
       WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] || null;
  }

  async create(data, userId) {
    const accommodation = await query(
      'SELECT id FROM accommodations WHERE id = $1',
      [data.accommodation_id],
    );
    if (accommodation.rows.length === 0) {
      return { error: 'Szállás nem található', status: 404 };
    }

    // Auto-derive billing_month from performance_date when omitted.
    const billing_month = data.billing_month
      || deriveBillingMonth(data.performance_date)
      || null;
    if (!billing_month) {
      // validation already enforces this; defensive guard
      return { error: 'Számlázási hónap vagy teljesítés dátum kötelező', status: 400 };
    }

    const fingerprint = generateFingerprint({
      vendor_name: data.vendor_name,
      amount: data.amount,
      performance_date: data.performance_date,
    });

    const result = await query(
      `INSERT INTO accommodation_expenses (
        accommodation_id, billing_month, category, amount, currency,
        invoice_number, attachment_url, notes, created_by,
        performance_date, invoice_date, vendor_name, vendor_tax_number,
        dedup_fingerprint, file_attachments, cost_center_id,
        source, ai_confidence, status, payment_date, payment_status
       ) VALUES (
        $1, $2, $3, $4, COALESCE($5, 'HUF'),
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, COALESCE($15::jsonb, '[]'::jsonb), $16,
        COALESCE($17, 'manual'), $18, COALESCE($19, 'confirmed'), $20, COALESCE($21, 'unpaid')
       ) RETURNING *`,
      [
        data.accommodation_id,
        billing_month,
        data.category,
        data.amount,
        data.currency || null,
        data.invoice_number || null,
        data.attachment_url || null,
        data.notes || null,
        userId,
        data.performance_date || null,
        data.invoice_date || null,
        data.vendor_name || null,
        data.vendor_tax_number || null,
        fingerprint,
        data.file_attachments ? JSON.stringify(data.file_attachments) : null,
        data.cost_center_id || null,
        data.source || null,
        data.ai_confidence == null ? null : parseInt(data.ai_confidence, 10),
        data.status || null,
        data.payment_date || null,
        data.payment_status || null,
      ],
    );

    return { data: result.rows[0] };
  }

  async update(id, data) {
    const current = await query(
      'SELECT * FROM accommodation_expenses WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (current.rows.length === 0) {
      return { error: 'Költség nem található', status: 404 };
    }

    if (data.accommodation_id) {
      const accommodation = await query(
        'SELECT id FROM accommodations WHERE id = $1',
        [data.accommodation_id],
      );
      if (accommodation.rows.length === 0) {
        return { error: 'Szállás nem található', status: 404 };
      }
    }

    // billing_month: if caller updates performance_date but not billing_month,
    // recompute billing_month from the new performance_date.
    let next_billing_month = data.billing_month;
    if (next_billing_month === undefined && data.performance_date !== undefined) {
      next_billing_month = deriveBillingMonth(data.performance_date);
    }

    // Fingerprint: if any input changed, recompute. Otherwise leave alone.
    let next_fingerprint;
    const fingerprintInputsTouched =
      data.vendor_name !== undefined
      || data.amount !== undefined
      || data.performance_date !== undefined;
    if (fingerprintInputsTouched) {
      next_fingerprint = generateFingerprint({
        vendor_name: data.vendor_name !== undefined ? data.vendor_name : current.rows[0].vendor_name,
        amount:      data.amount      !== undefined ? data.amount      : current.rows[0].amount,
        performance_date:
          data.performance_date !== undefined ? data.performance_date : current.rows[0].performance_date,
      });
    }

    const result = await query(
      `UPDATE accommodation_expenses SET
        accommodation_id  = COALESCE($1, accommodation_id),
        billing_month     = COALESCE($2, billing_month),
        category          = COALESCE($3, category),
        amount            = COALESCE($4, amount),
        currency          = COALESCE($5, currency),
        invoice_number    = COALESCE($6, invoice_number),
        attachment_url    = COALESCE($7, attachment_url),
        notes             = COALESCE($8, notes),
        performance_date  = COALESCE($9::date, performance_date),
        invoice_date      = COALESCE($10::date, invoice_date),
        vendor_name       = COALESCE($11, vendor_name),
        vendor_tax_number = COALESCE($12, vendor_tax_number),
        dedup_fingerprint = COALESCE($13, dedup_fingerprint),
        file_attachments  = COALESCE($14::jsonb, file_attachments),
        cost_center_id    = COALESCE($15, cost_center_id),
        source            = COALESCE($16, source),
        ai_confidence     = COALESCE($17, ai_confidence),
        status            = COALESCE($18, status),
        approved_by       = COALESCE($19, approved_by),
        approved_at       = COALESCE($20::timestamp, approved_at),
        payment_date      = COALESCE($21::date, payment_date),
        payment_status    = COALESCE($22, payment_status)
       WHERE id = $23 AND deleted_at IS NULL
       RETURNING *`,
      [
        data.accommodation_id, next_billing_month, data.category, data.amount,
        data.currency, data.invoice_number, data.attachment_url, data.notes,
        data.performance_date, data.invoice_date, data.vendor_name, data.vendor_tax_number,
        fingerprintInputsTouched ? next_fingerprint : null,
        data.file_attachments ? JSON.stringify(data.file_attachments) : null,
        data.cost_center_id,
        data.source,
        data.ai_confidence == null ? null : parseInt(data.ai_confidence, 10),
        data.status,
        data.approved_by, data.approved_at,
        data.payment_date, data.payment_status,
        id,
      ],
    );

    return { data: result.rows[0], previous: current.rows[0] };
  }

  /**
   * Soft delete — table has deleted_at column.
   */
  async delete(id) {
    const current = await query(
      'SELECT * FROM accommodation_expenses WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (current.rows.length === 0) {
      return { error: 'Költség nem található', status: 404 };
    }

    await query(
      'UPDATE accommodation_expenses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id],
    );

    return { data: current.rows[0] };
  }
}

module.exports = new ExpenseService();
