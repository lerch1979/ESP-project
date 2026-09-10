/**
 * Exchange-rate surface: what is missing, retry the fetch, and the audit view.
 *
 * The retry exists because "blocked until resolved" is only fair if resolving is one
 * click. The month-close refusal names the rows; this is where they get fixed.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const mnb = require('../services/mnbRates.service');

/** GET /exchange-rates/missing?billing_month=YYYY-MM — what blocks a close. */
const listMissing = async (req, res) => {
  try {
    const { billing_month } = req.query;
    const params = [];
    let where = `e.deleted_at IS NULL AND e.rate_status = 'missing'`;
    if (billing_month) { params.push(billing_month); where += ` AND e.billing_month = $1`; }
    const r = await query(
      `SELECT e.id, e.billing_month, e.category, e.vendor_name, e.invoice_number,
              e.original_amount, e.original_currency,
              TO_CHAR(e.performance_date,'YYYY-MM-DD') AS performance_date,
              a.name AS accommodation
         FROM accommodation_expenses e
         LEFT JOIN accommodations a ON a.id = e.accommodation_id
        WHERE ${where}
        ORDER BY e.billing_month DESC, e.performance_date NULLS LAST`, params);
    res.json({ success: true, data: { count: r.rows.length, expenses: r.rows } });
  } catch (e) {
    logger.error('Hiányzó árfolyamok lekérési hiba:', e);
    res.status(500).json({ success: false, message: 'Hiányzó árfolyamok lekérési hiba' });
  }
};

/**
 * POST /exchange-rates/retry — re-fetch for every expense still missing a rate.
 * Optionally scoped to one billing_month or one expense id.
 */
const retryMissing = async (req, res) => {
  try {
    const { billing_month, expense_id } = req.body || {};
    const params = [];
    let where = `deleted_at IS NULL AND rate_status = 'missing'`;
    if (expense_id) { params.push(expense_id); where += ` AND id = $${params.length}`; }
    else if (billing_month) { params.push(billing_month); where += ` AND billing_month = $${params.length}`; }

    const rows = (await query(
      `SELECT id, original_amount, original_currency, performance_date, billing_month
         FROM accommodation_expenses WHERE ${where}`, params)).rows;

    let fixed = 0;
    const still = [];
    for (const x of rows) {
      const when = x.performance_date || `${x.billing_month}-01`;
      const conv = await mnb.toHuf(x.original_amount, x.original_currency, when);
      if (conv.status === 'ok') {
        await query(
          `UPDATE accommodation_expenses
              SET amount = $2, exchange_rate = $3, exchange_rate_date = $4,
                  rate_status = 'ok', updated_at = now()
            WHERE id = $1`,
          [x.id, conv.amountHuf, conv.rate, conv.rateDate]);
        fixed += 1;
      } else {
        still.push({ id: x.id, reason: conv.reason });
      }
    }

    logger.info('[mnb] retry', { requested: rows.length, fixed, still: still.length, user: req.user?.id });
    res.json({
      success: true,
      message: `${rows.length} tételből ${fixed} megoldva`
             + (still.length ? `, ${still.length} továbbra sem sikerült` : ''),
      data: { requested: rows.length, fixed, still },
    });
  } catch (e) {
    logger.error('Árfolyam újrapróbálkozási hiba:', e);
    res.status(500).json({ success: false, message: 'Árfolyam újrapróbálkozási hiba' });
  }
};

/**
 * GET /exchange-rates — the audit view. A disputed figure is settled by "what did MNB
 * publish that day", so the cache is browsable on its own terms.
 */
const listRates = async (req, res) => {
  try {
    const { currency, from, to, limit = 200 } = req.query;
    const params = [];
    const where = [];
    if (currency) { params.push(String(currency).toUpperCase()); where.push(`currency = $${params.length}`); }
    if (from) { params.push(from); where.push(`rate_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`rate_date <= $${params.length}::date`); }
    params.push(Math.min(parseInt(limit, 10) || 200, 1000));
    const r = await query(
      `SELECT currency, TO_CHAR(rate_date,'YYYY-MM-DD') AS rate_date, rate, unit, source, fetched_at
         FROM mnb_exchange_rates
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY rate_date DESC, currency
        LIMIT $${params.length}`, params);
    res.json({ success: true, data: { rates: r.rows, supported: mnb.SUPPORTED } });
  } catch (e) {
    logger.error('Árfolyam-lista hiba:', e);
    res.status(500).json({ success: false, message: 'Árfolyam-lista hiba' });
  }
};

module.exports = { listMissing, retryMissing, listRates };
