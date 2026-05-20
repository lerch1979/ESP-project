/**
 * Occupancy Tracking Service — daily snapshot writer.
 *
 * The daily cron at 00:30 calls recordDailySnapshot() for the day that
 * just ended ("yesterday"). One row per employee currently lodged, with
 * denormalized rent + room occupant count + computed daily share — so
 * the monthly billing engine doesn't need to back-walk history.
 *
 * Idempotent: re-running for the same date upserts (ON CONFLICT) rather
 * than duplicating. That also encodes decision 5 (same-day transfer):
 * if a history row was added late, a re-run overwrites the snapshot to
 * reflect the latest-known state.
 *
 * Open-at-end-of-day semantics (matches migration 112 docs):
 *   row counts if   check_in_date <= date
 *               AND (check_out_date IS NULL OR check_out_date > date)
 * Convention: check_out_date is "the first day they're no longer here".
 * Half-day stay counts as full day; same-day in-AND-out does NOT count.
 *
 * Pro-rata math (decision 2):
 *   per_occupant_daily_share = monthly_rent / days_in_month / room_occupant_count
 * NULL room_id and NULL monthly_rent are tolerated:
 *   • NULL room_id  → all occupants of the accommodation with NULL room
 *                     are grouped together (IS NOT DISTINCT FROM null = match).
 *   • NULL rent     → per_occupant_daily_share stays NULL; billing engine
 *                     will skip these rows with a warning.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

function daysInMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function toDateStr(d) {
  // YYYY-MM-DD in local time (matches how the DB sees `DATE` columns).
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Write/update occupancy_snapshots rows for `snapshotDate`.
 * @param {Date|string} [snapshotDate] — Date object or YYYY-MM-DD. Defaults to yesterday.
 * @returns {Promise<{snapshot_date:string, rows_written:number, days_in_month:number, with_rent:number, without_rent:number}>}
 */
async function recordDailySnapshot(snapshotDate) {
  const date = snapshotDate
    ? (typeof snapshotDate === 'string' ? new Date(snapshotDate + 'T00:00:00') : new Date(snapshotDate))
    : yesterday();
  const dateStr = toDateStr(date);
  const dim = daysInMonth(date);

  // Single-statement INSERT … ON CONFLICT. CTE 1 finds open assignments,
  // CTE 2 counts per (accommodation, room). IS NOT DISTINCT FROM handles
  // NULL room_id correctly (NULL = NULL for grouping).
  const sql = `
    WITH active_assignments AS (
      SELECT
        h.employee_id,
        h.accommodation_id,
        h.room_id,
        a.monthly_rent,
        a.current_contractor_id AS contractor_id,
        r.beds AS room_beds
      FROM employee_accommodation_history h
      JOIN accommodations a ON a.id = h.accommodation_id
      LEFT JOIN accommodation_rooms r ON r.id = h.room_id
      WHERE h.check_in_date <= $1::date
        AND (h.check_out_date IS NULL OR h.check_out_date > $1::date)
    ),
    occupant_counts AS (
      SELECT
        accommodation_id,
        room_id,
        COUNT(*) AS room_occupant_count
      FROM active_assignments
      GROUP BY accommodation_id, room_id
    )
    INSERT INTO occupancy_snapshots (
      snapshot_date, employee_id, accommodation_id, room_id, contractor_id,
      accommodation_monthly_rent, room_beds, room_occupant_count,
      per_occupant_daily_share
    )
    SELECT
      $1::date,
      a.employee_id,
      a.accommodation_id,
      a.room_id,
      a.contractor_id,
      a.monthly_rent,
      a.room_beds,
      oc.room_occupant_count,
      CASE
        WHEN a.monthly_rent IS NOT NULL AND oc.room_occupant_count > 0
          THEN ROUND(a.monthly_rent::numeric / $2::numeric / oc.room_occupant_count::numeric, 4)
        ELSE NULL
      END AS per_occupant_daily_share
    FROM active_assignments a
    JOIN occupant_counts oc
      ON oc.accommodation_id = a.accommodation_id
     AND oc.room_id IS NOT DISTINCT FROM a.room_id
    ON CONFLICT (snapshot_date, employee_id) DO UPDATE SET
      accommodation_id           = EXCLUDED.accommodation_id,
      room_id                    = EXCLUDED.room_id,
      contractor_id              = EXCLUDED.contractor_id,
      accommodation_monthly_rent = EXCLUDED.accommodation_monthly_rent,
      room_beds                  = EXCLUDED.room_beds,
      room_occupant_count        = EXCLUDED.room_occupant_count,
      per_occupant_daily_share   = EXCLUDED.per_occupant_daily_share
    RETURNING
      (accommodation_monthly_rent IS NOT NULL) AS has_rent
  `;

  const result = await query(sql, [dateStr, dim]);
  const withRent = result.rows.filter(r => r.has_rent).length;
  const withoutRent = result.rows.length - withRent;
  const stats = {
    snapshot_date: dateStr,
    rows_written: result.rows.length,
    days_in_month: dim,
    with_rent: withRent,
    without_rent: withoutRent,
  };
  logger.info(`[occupancyTracking] ${JSON.stringify(stats)}`);
  return stats;
}

module.exports = { recordDailySnapshot, daysInMonth, yesterday };
