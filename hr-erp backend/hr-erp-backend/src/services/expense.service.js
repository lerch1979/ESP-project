const { query } = require('../database/connection');
const {
  deriveBillingMonth, generateFingerprint, computeNetVat,
} = require('../models/expense.model');

// ────────────────────────────────────────────────────────────────────────
// VAT auto-fill helper
//
// When a vat_rate is provided but the caller didn't supply net/vat
// (a common quick-entry case), derive both from gross + rate. If the
// caller DID supply them, leave them — validation in the model has
// already enforced net + vat ≈ amount (±1 HUF).
//
// Returns { net_amount, vat_amount } that the SQL should use. Null
// values mean "do not change" (UPDATE path) or "leave NULL" (INSERT).
// ────────────────────────────────────────────────────────────────────────
function deriveVatSplit({ amount, vat_rate, net_amount, vat_amount }) {
  const hasNet = net_amount != null && net_amount !== '';
  const hasVat = vat_amount != null && vat_amount !== '';
  // Caller supplied both → trust them, validation already passed.
  if (hasNet && hasVat) return { net_amount, vat_amount };
  // No rate → can't compute, leave null.
  if (vat_rate == null || vat_rate === '') return { net_amount: null, vat_amount: null };
  // Have rate + gross → compute.
  if (amount == null || amount === '') return { net_amount: null, vat_amount: null };
  const split = computeNetVat(amount, vat_rate);
  if (!split) return { net_amount: null, vat_amount: null };
  return { net_amount: split.net, vat_amount: split.vat };
}

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
      vat_rate, is_reverse_vat,
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
    if (vat_rate !== undefined && vat_rate !== '') push('e.vat_rate = $$', vat_rate);
    if (is_reverse_vat === true || is_reverse_vat === 'true') {
      push('e.is_reverse_vat = $$', true);
    }
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

    // VAT auto-fill — only when vat_rate provided AND net/vat omitted.
    const vatSplit = deriveVatSplit({
      amount: data.amount,
      vat_rate: data.vat_rate,
      net_amount: data.net_amount,
      vat_amount: data.vat_amount,
    });

    const result = await query(
      `INSERT INTO accommodation_expenses (
        accommodation_id, billing_month, category, amount, currency,
        invoice_number, attachment_url, notes, created_by,
        performance_date, invoice_date, vendor_name, vendor_tax_number,
        dedup_fingerprint, file_attachments, cost_center_id,
        source, ai_confidence, status, payment_date, payment_status,
        net_amount, vat_rate, vat_amount, vat_exemption_reason, is_reverse_vat
       ) VALUES (
        $1, $2, $3, $4, COALESCE($5, 'HUF'),
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, COALESCE($15::jsonb, '[]'::jsonb), $16,
        COALESCE($17, 'manual'), $18, COALESCE($19, 'confirmed'), $20, COALESCE($21, 'unpaid'),
        $22, $23, $24, $25, COALESCE($26, FALSE)
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
        vatSplit.net_amount,
        data.vat_rate == null || data.vat_rate === '' ? null : Number(data.vat_rate),
        vatSplit.vat_amount,
        data.vat_exemption_reason || null,
        data.is_reverse_vat === true || data.is_reverse_vat === 'true' ? true : null,
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

    // VAT recompute. Trigger when amount or vat_rate changed AND the caller
    // did NOT explicitly supply net/vat. If caller passed both, trust them
    // (validation already confirmed net+vat ≈ amount within tolerance).
    // If caller cleared vat_rate (passed null), clear net/vat too.
    let vatNet;
    let vatVat;
    let vatTouched = false;
    const amountTouched = data.amount !== undefined;
    const rateTouched = data.vat_rate !== undefined;
    const netExplicit = data.net_amount !== undefined;
    const vatExplicit = data.vat_amount !== undefined;

    if (netExplicit || vatExplicit) {
      vatTouched = true;
      vatNet = data.net_amount ?? null;
      vatVat = data.vat_amount ?? null;
    } else if (amountTouched || rateTouched) {
      vatTouched = true;
      const effectiveAmount = amountTouched ? data.amount : current.rows[0].amount;
      const effectiveRate   = rateTouched   ? data.vat_rate : current.rows[0].vat_rate;
      if (effectiveRate == null || effectiveRate === '') {
        vatNet = null;
        vatVat = null;
      } else {
        const split = computeNetVat(effectiveAmount, effectiveRate);
        vatNet = split ? split.net : null;
        vatVat = split ? split.vat : null;
      }
    }

    // VAT writeback: when vatTouched=true, we write the computed (or
    // explicit) values verbatim — including NULL when the user cleared
    // the rate. When vatTouched=false, the SQL keeps the existing
    // values via COALESCE. The $vatTouchedFlag boolean toggles between
    // the two behaviours inside the SQL.
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
        payment_status    = COALESCE($22, payment_status),
        net_amount         = CASE WHEN $23 THEN $24::numeric ELSE net_amount END,
        vat_rate           = CASE WHEN $25 THEN $26::numeric ELSE vat_rate END,
        vat_amount         = CASE WHEN $23 THEN $27::numeric ELSE vat_amount END,
        vat_exemption_reason = COALESCE($28, vat_exemption_reason),
        is_reverse_vat       = COALESCE($29, is_reverse_vat)
       WHERE id = $30 AND deleted_at IS NULL
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
        // VAT split writeback
        vatTouched,
        vatNet,
        rateTouched,
        rateTouched ? (data.vat_rate == null || data.vat_rate === '' ? null : Number(data.vat_rate)) : null,
        vatVat,
        data.vat_exemption_reason,
        data.is_reverse_vat === true ? true
          : data.is_reverse_vat === false ? false : null,
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
