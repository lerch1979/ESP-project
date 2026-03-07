const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

class PaymentService {
  /**
   * Get all payments with filters
   */
  async getAll(filters = {}) {
    const { invoice_id, payment_method, date_from, date_to, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (invoice_id) {
      whereConditions.push(`p.invoice_id = $${paramIndex}`);
      params.push(invoice_id);
      paramIndex++;
    }

    if (payment_method) {
      whereConditions.push(`p.payment_method = $${paramIndex}`);
      params.push(payment_method);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`p.payment_date >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`p.payment_date <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) as total FROM payments p ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT p.*,
        i.invoice_number, i.vendor_name, i.total_amount as invoice_total,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN users u ON p.created_by = u.id
       ${whereClause}
       ORDER BY p.payment_date DESC, p.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    return {
      payments: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    };
  }

  /**
   * Get payment by ID
   */
  async getById(id) {
    const result = await query(
      `SELECT p.*,
        i.invoice_number, i.vendor_name, i.total_amount as invoice_total,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all payments for an invoice
   */
  async getByInvoiceId(invoiceId) {
    const result = await query(
      `SELECT p.*,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.invoice_id = $1
       ORDER BY p.payment_date DESC`,
      [invoiceId]
    );

    // Get invoice total for comparison
    const invoice = await query(
      'SELECT total_amount, amount, payment_status FROM invoices WHERE id = $1',
      [invoiceId]
    );

    const invoiceTotal = invoice.rows[0]
      ? parseFloat(invoice.rows[0].total_amount || invoice.rows[0].amount || 0)
      : 0;

    const totalPaid = result.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      payments: result.rows,
      summary: {
        invoice_total: invoiceTotal,
        total_paid: totalPaid,
        remaining: invoiceTotal - totalPaid,
        is_fully_paid: totalPaid >= invoiceTotal,
      },
    };
  }

  /**
   * Create payment and auto-update invoice status
   */
  async create(data, userId) {
    // Verify invoice exists
    const invoice = await query(
      'SELECT id, total_amount, amount, payment_status, deleted_at FROM invoices WHERE id = $1',
      [data.invoice_id]
    );

    if (invoice.rows.length === 0) {
      return { error: 'Számla nem található', status: 404 };
    }

    if (invoice.rows[0].deleted_at) {
      return { error: 'Törölt számlához nem rögzíthető fizetés', status: 400 };
    }

    const result = await transaction(async (client) => {
      // Insert payment
      const payment = await client.query(
        `INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          data.invoice_id, data.amount, data.payment_date,
          data.payment_method, data.reference_number || null,
          data.notes || null, userId,
        ]
      );

      // Calculate total paid
      const paid = await client.query(
        'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1',
        [data.invoice_id]
      );

      const invoiceTotal = parseFloat(invoice.rows[0].total_amount || invoice.rows[0].amount || 0);
      const totalPaid = parseFloat(paid.rows[0].total_paid);

      // Auto-update invoice status
      if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
        await client.query(
          `UPDATE invoices SET payment_status = 'paid', payment_date = $1 WHERE id = $2`,
          [data.payment_date, data.invoice_id]
        );
      } else if (totalPaid > 0) {
        await client.query(
          `UPDATE invoices SET payment_status = 'sent' WHERE id = $1 AND payment_status = 'draft'`,
          [data.invoice_id]
        );
      }

      return payment.rows[0];
    });

    return { data: result };
  }

  /**
   * Update payment
   */
  async update(id, data) {
    const current = await query('SELECT * FROM payments WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return { error: 'Fizetés nem található', status: 404 };
    }

    const result = await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE payments SET
          amount = COALESCE($1, amount),
          payment_date = COALESCE($2, payment_date),
          payment_method = COALESCE($3, payment_method),
          reference_number = COALESCE($4, reference_number),
          notes = COALESCE($5, notes)
         WHERE id = $6
         RETURNING *`,
        [
          data.amount, data.payment_date, data.payment_method,
          data.reference_number, data.notes, id,
        ]
      );

      // Recalculate invoice status
      const invoiceId = current.rows[0].invoice_id;
      await this._recalculateInvoiceStatus(client, invoiceId);

      return updated.rows[0];
    });

    return { data: result, previous: current.rows[0] };
  }

  /**
   * Delete payment and recalculate invoice status
   */
  async delete(id) {
    const current = await query('SELECT * FROM payments WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return { error: 'Fizetés nem található', status: 404 };
    }

    await transaction(async (client) => {
      await client.query('DELETE FROM payments WHERE id = $1', [id]);
      await this._recalculateInvoiceStatus(client, current.rows[0].invoice_id);
    });

    return { data: current.rows[0] };
  }

  /**
   * Recalculate invoice payment status based on total payments
   */
  async _recalculateInvoiceStatus(client, invoiceId) {
    const invoice = await client.query(
      'SELECT total_amount, amount FROM invoices WHERE id = $1',
      [invoiceId]
    );

    if (invoice.rows.length === 0) return;

    const invoiceTotal = parseFloat(invoice.rows[0].total_amount || invoice.rows[0].amount || 0);

    const paid = await client.query(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1',
      [invoiceId]
    );
    const totalPaid = parseFloat(paid.rows[0].total_paid);

    let newStatus;
    if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
      newStatus = 'paid';
    } else if (totalPaid > 0) {
      newStatus = 'sent';
    } else {
      newStatus = 'draft';
    }

    await client.query(
      'UPDATE invoices SET payment_status = $1 WHERE id = $2',
      [newStatus, invoiceId]
    );
  }
}

module.exports = new PaymentService();
