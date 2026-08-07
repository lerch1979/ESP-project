/**
 * Accommodation history writer — the missing feed for the occupancy → billing chain.
 *
 * `employee_accommodation_history` is the ONLY input `occupancyTracking.recordDailySnapshot`
 * reads, and until now nothing in the application ever wrote it: the table was populated
 * once by migration 112's backfill and then frozen. Room moves, accommodation transfers,
 * hires and terminations therefore never reached `occupancy_snapshots`, so the billing
 * engine billed the roster as it stood at that backfill (FUNCTEST DATA-01).
 *
 * Every code path that changes where an employee sleeps now calls `syncAssignment()`
 * (or `closeAssignment()` on departure) inside the SAME transaction as the employees
 * UPDATE, so the two can never disagree.
 *
 * ── Semantics (migration 112) ────────────────────────────────────────────────────
 *   A row is "open" while check_out_date IS NULL.
 *   A row covers a day D when:  check_in_date <= D AND (check_out_date IS NULL OR check_out_date > D)
 *   check_out_date is therefore "the first day they are NO LONGER there", which is what
 *   makes a same-day handover land on the NEW accommodation (decision #5 of mig 112).
 *
 * ── The overlap invariant (why this is careful) ──────────────────────────────────
 *   `recordDailySnapshot` inserts with ON CONFLICT (snapshot_date, employee_id). If one
 *   employee had TWO history rows covering the same day, that statement would try to
 *   affect the same conflict target twice and Postgres would abort the whole snapshot
 *   ("ON CONFLICT DO UPDATE command cannot affect row a second time") — i.e. one bad
 *   history row would break billing for everybody. So this service NEVER leaves two rows
 *   covering the same day: a change effective on D closes the old row at D and opens the
 *   new one at D, and a row that was opened on D itself is REPLACED rather than closed
 *   (closing it at D would leave a zero-length row, harmless but noisy).
 */
const { query: rootQuery } = require('../database/connection');
const { logger } = require('../utils/logger');

/** YYYY-MM-DD in local time — pg hands DATE back as local midnight, never use toISOString(). */
function localDateStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Accepts a pg client (inside a transaction) or falls back to the pool.
const run = (exec, sql, params) => (exec ? exec.query(sql, params) : rootQuery(sql, params));

const norm = (v) => (v === undefined || v === '' ? null : v);

/**
 * Make history agree with where the employee now sleeps.
 *
 * @param {object|null} exec           pg client when called inside a transaction (strongly preferred)
 * @param {string} employeeId
 * @param {string|null} accommodationId  null → they are not housed (closes any open row)
 * @param {string|null} roomId
 * @param {string} [effectiveDate]     YYYY-MM-DD, defaults to today (local)
 * @param {string} [reason]            free-text, stored on the new row
 * @param {string|null} [changedBy]    users.id
 * @returns {Promise<{changed: boolean, closed: number, replaced: number, opened: boolean}>}
 */
async function syncAssignment(exec, { employeeId, accommodationId, roomId, effectiveDate, reason = null, changedBy = null }) {
  const accId = norm(accommodationId);
  const rmId = norm(roomId);
  const date = effectiveDate || localDateStr();

  const open = (await run(exec,
    `SELECT id, accommodation_id, room_id, TO_CHAR(check_in_date,'YYYY-MM-DD') AS check_in_date
       FROM employee_accommodation_history
      WHERE employee_id = $1 AND check_out_date IS NULL
      ORDER BY check_in_date DESC`, [employeeId])).rows;

  // Already correct (exactly one open row pointing at the right place) → nothing to do.
  // This is the common case on any employee UPDATE that doesn't touch housing.
  if (open.length === 1 && open[0].accommodation_id === accId && (open[0].room_id || null) === rmId) {
    return { changed: false, closed: 0, replaced: 0, opened: false };
  }
  if (open.length === 0 && accId === null) {
    return { changed: false, closed: 0, replaced: 0, opened: false };
  }

  let closed = 0;
  let replaced = 0;
  for (const row of open) {
    if (row.check_in_date >= date) {
      // Opened today (or later) — closing it at `date` would leave a row covering no day.
      // Drop it instead so the final state of the day is the only record of the day.
      await run(exec, `DELETE FROM employee_accommodation_history WHERE id = $1`, [row.id]);
      replaced++;
    } else {
      await run(exec,
        `UPDATE employee_accommodation_history SET check_out_date = $2::date WHERE id = $1`, [row.id, date]);
      closed++;
    }
  }

  let opened = false;
  if (accId) {
    await run(exec,
      `INSERT INTO employee_accommodation_history
         (employee_id, accommodation_id, room_id, check_in_date, reason, created_by)
       VALUES ($1, $2, $3, $4::date, $5, $6)`,
      [employeeId, accId, rmId, date, reason, changedBy]);
    opened = true;
  }
  return { changed: true, closed, replaced, opened };
}

/**
 * They stopped being housed (termination, or an accommodation cleared).
 * Equivalent to syncAssignment with a null accommodation.
 */
function closeAssignment(exec, { employeeId, effectiveDate, reason = null, changedBy = null }) {
  return syncAssignment(exec, { employeeId, accommodationId: null, roomId: null, effectiveDate, reason, changedBy });
}

/**
 * Best-effort variant for call sites that are not inside a transaction and must not fail
 * the user's request over a history write. Logs loudly instead of throwing — used only
 * where the employees UPDATE has already committed independently.
 */
async function syncAssignmentSafe(args) {
  try { return await syncAssignment(null, args); }
  catch (e) {
    logger.error(`[accommodationHistory] sync FAILED for employee ${args.employeeId}: ${e.message}`);
    return { changed: false, error: e.message };
  }
}

/**
 * Bring history in line with the CURRENT roster.
 *
 * Needed once, because the table has been frozen since migration 112: an employee moved
 * in the meantime still has an open row pointing at where they used to sleep. For each
 * employee whose open row disagrees with `employees.accommodation_id`/`room_id`, we close
 * the stale row today and open a correct one today. Past rows are NOT rewritten — history
 * that already drove past billing stays exactly as it was.
 *
 * @param {{dryRun?: boolean, effectiveDate?: string}} opts
 */
async function backfillCurrentRoster({ dryRun = false, effectiveDate } = {}) {
  const date = effectiveDate || localDateStr();

  // Active (not terminated) employees, with their single open history row if any.
  const rows = (await rootQuery(
    `SELECT e.id AS employee_id, e.accommodation_id, e.room_id,
            h.id AS open_id, h.accommodation_id AS open_acc, h.room_id AS open_room,
            (SELECT COUNT(*)::int FROM employee_accommodation_history x
              WHERE x.employee_id = e.id AND x.check_out_date IS NULL) AS open_count
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT id, accommodation_id, room_id FROM employee_accommodation_history
          WHERE employee_id = e.id AND check_out_date IS NULL
          ORDER BY check_in_date DESC LIMIT 1) h ON TRUE
      WHERE e.end_date IS NULL`)).rows;

  const plan = { housed_ok: 0, housed_fixed: 0, housed_opened: 0, unhoused_closed: 0, duplicates_collapsed: 0 };
  const actions = [];
  for (const r of rows) {
    const acc = r.accommodation_id || null;
    const room = r.room_id || null;
    if (r.open_count > 1) plan.duplicates_collapsed++;                      // sync() leaves exactly one
    if (!acc) {
      if (r.open_count > 0) { plan.unhoused_closed++; actions.push(r); }
      continue;
    }
    if (r.open_count === 1 && r.open_acc === acc && (r.open_room || null) === room) { plan.housed_ok++; continue; }
    if (r.open_count === 0) plan.housed_opened++; else plan.housed_fixed++;
    actions.push(r);
  }

  if (!dryRun) {
    for (const r of actions) {
      await syncAssignment(null, {
        employeeId: r.employee_id,
        accommodationId: r.accommodation_id,
        roomId: r.room_id,
        effectiveDate: date,
        reason: 'backfill: aligned with current roster',
      });
    }
  }

  // Terminated employees still holding an open row → close it at their end_date.
  const leavers = (await rootQuery(
    `SELECT e.id, TO_CHAR(e.end_date,'YYYY-MM-DD') AS end_date
       FROM employees e
      WHERE e.end_date IS NOT NULL
        AND EXISTS (SELECT 1 FROM employee_accommodation_history h
                     WHERE h.employee_id = e.id AND h.check_out_date IS NULL)`)).rows;
  plan.leavers_closed = leavers.length;
  if (!dryRun) {
    for (const l of leavers) {
      await closeAssignment(null, { employeeId: l.id, effectiveDate: l.end_date, reason: 'backfill: terminated' });
    }
  }

  plan.dry_run = dryRun;
  plan.effective_date = date;
  plan.employees_scanned = rows.length;
  logger.info(`[accommodationHistory.backfill] ${JSON.stringify(plan)}`);
  return plan;
}

/**
 * Guard query for the invariant that keeps `recordDailySnapshot` alive: no employee may
 * have two history rows covering the same day. Returns the offending pairs (empty = healthy).
 */
async function findOverlaps() {
  const r = await rootQuery(
    `SELECT a.employee_id,
            TO_CHAR(a.check_in_date,'YYYY-MM-DD') AS a_in, TO_CHAR(a.check_out_date,'YYYY-MM-DD') AS a_out,
            TO_CHAR(b.check_in_date,'YYYY-MM-DD') AS b_in, TO_CHAR(b.check_out_date,'YYYY-MM-DD') AS b_out
       FROM employee_accommodation_history a
       JOIN employee_accommodation_history b
         ON b.employee_id = a.employee_id AND b.id > a.id
        AND a.check_in_date < COALESCE(b.check_out_date, 'infinity'::date)
        AND b.check_in_date < COALESCE(a.check_out_date, 'infinity'::date)`);
  return r.rows;
}

module.exports = { syncAssignment, closeAssignment, syncAssignmentSafe, backfillCurrentRoster, findOverlaps, localDateStr };
