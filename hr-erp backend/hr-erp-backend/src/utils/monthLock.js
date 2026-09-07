/**
 * Is a billing month closed?
 *
 * A month is closed when its billing run carries `finalized_at` (mig 148). The engine
 * already refuses to recalculate such a run — this helper is for the OTHER direction:
 * changes to the underlying facts that would silently restate an already-invoiced month.
 *
 * The case that prompted it: back-dating someone's leave date. `end_date` closes their
 * occupancy history at that date, and occupancy is what the settlement sheets and the
 * client invoices are computed from. Setting a leave date of 2026-07-15 in September
 * quietly removes bed-nights from a July that has already been billed and paid.
 *
 * That must not happen by accident. It is a real operation — people do hand in notice
 * late — so it is refused with an explanation and an explicit override, not forbidden.
 */
const { query } = require('../database/connection');

/** 'YYYY-MM' for a date-ish value, in local terms (a DATE column is local midnight). */
function monthOf(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @returns {Promise<{closed:boolean, month:string|null, finalizedAt?:Date, runType?:string}>}
 */
async function monthStatus(value) {
  const month = monthOf(value);
  if (!month) return { closed: false, month: null };
  const r = await query(
    `SELECT run_type, finalized_at
       FROM billing_runs
      WHERE billing_month = $1 AND finalized_at IS NOT NULL AND status <> 'cancelled'
      ORDER BY finalized_at DESC LIMIT 1`, [month]);
  if (r.rows.length === 0) return { closed: false, month };
  return { closed: true, month, finalizedAt: r.rows[0].finalized_at, runType: r.rows[0].run_type };
}

module.exports = { monthOf, monthStatus };
