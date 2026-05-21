const { query } = require('../database/connection');

class ExpenseService {
  /**
   * Get all expenses with filters (soft-delete aware).
   */
  async getAll(filters = {}) {
    const {
      accommodation_id, billing_month, category,
      month_from, month_to,
      page = 1, limit = 50,
    } = filters;
    const offset = (page - 1) * limit;

    const whereConditions = ['e.deleted_at IS NULL'];
    const params = [];
    let paramIndex = 1;

    if (accommodation_id) {
      whereConditions.push(`e.accommodation_id = $${paramIndex++}`);
      params.push(accommodation_id);
    }
    if (billing_month) {
      whereConditions.push(`e.billing_month = $${paramIndex++}`);
      params.push(billing_month);
    }
    if (category) {
      whereConditions.push(`e.category = $${paramIndex++}`);
      params.push(category);
    }
    if (month_from) {
      whereConditions.push(`e.billing_month >= $${paramIndex++}`);
      params.push(month_from);
    }
    if (month_to) {
      whereConditions.push(`e.billing_month <= $${paramIndex++}`);
      params.push(month_to);
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
        u.first_name AS created_by_first_name,
        u.last_name  AS created_by_last_name
       FROM accommodation_expenses e
       LEFT JOIN accommodations a ON e.accommodation_id = a.id
       LEFT JOIN users u          ON e.created_by = u.id
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
        u.first_name AS created_by_first_name,
        u.last_name  AS created_by_last_name
       FROM accommodation_expenses e
       LEFT JOIN accommodations a ON e.accommodation_id = a.id
       LEFT JOIN users u          ON e.created_by = u.id
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

    const result = await query(
      `INSERT INTO accommodation_expenses
        (accommodation_id, billing_month, category, amount, currency,
         invoice_number, attachment_url, notes, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'HUF'), $6, $7, $8, $9)
       RETURNING *`,
      [
        data.accommodation_id,
        data.billing_month,
        data.category,
        data.amount,
        data.currency || null,
        data.invoice_number || null,
        data.attachment_url || null,
        data.notes || null,
        userId,
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

    const result = await query(
      `UPDATE accommodation_expenses SET
        accommodation_id = COALESCE($1, accommodation_id),
        billing_month    = COALESCE($2, billing_month),
        category         = COALESCE($3, category),
        amount           = COALESCE($4, amount),
        currency         = COALESCE($5, currency),
        invoice_number   = COALESCE($6, invoice_number),
        attachment_url   = COALESCE($7, attachment_url),
        notes            = COALESCE($8, notes)
       WHERE id = $9 AND deleted_at IS NULL
       RETURNING *`,
      [
        data.accommodation_id, data.billing_month, data.category, data.amount,
        data.currency, data.invoice_number, data.attachment_url, data.notes, id,
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
