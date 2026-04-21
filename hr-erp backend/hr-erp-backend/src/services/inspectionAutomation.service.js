/**
 * Inspection Automation Service
 *
 * Daily cron:
 *   1. Find schedules whose next_due_date has arrived and no open
 *      inspection already exists against them → create draft.
 *   2. Mark tasks past due_date as 'overdue' (status machine maintenance).
 *   3. Refresh the `inspection_trends` materialized view.
 *
 * Invoked from server.js cron block (alongside Gmail poller).
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const compensationSvc = require('./compensation.service');
const fineSvc = require('./fine.service');

const FREQ_INTERVAL = {
  weekly: "7 days",
  monthly: "1 month",
  quarterly: "3 months",
  yearly: "1 year",
};

/** Generate the next ELL-YYYY-MM-NNNN number. */
async function nextInspectionNumber() {
  const r = await query(`SELECT nextval('inspection_seq') AS seq`);
  const seq = parseInt(r.rows[0].seq, 10);
  const now = new Date();
  return `ELL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
}

/**
 * Scan active schedules where next_due_date <= today and create a
 * `scheduled` inspection for each — unless one already exists in
 * scheduled/in_progress status against the same schedule.
 */
async function autoCreateDueInspections() {
  const due = await query(`
    SELECT s.id, s.accommodation_id, s.frequency, s.default_inspector_id, s.next_due_date
    FROM inspection_schedules s
    WHERE s.is_active = true
      AND s.next_due_date IS NOT NULL
      AND s.next_due_date <= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM inspections i
        WHERE i.schedule_id = s.id
          AND i.status IN ('scheduled', 'in_progress')
      )
  `);

  const created = [];
  for (const sched of due.rows) {
    try {
      const inspectionNumber = await nextInspectionNumber();
      const inspectionType = sched.frequency; // 'weekly'/'monthly'/etc. — match the enum
      const r = await query(
        `INSERT INTO inspections (
           inspection_number, accommodation_id, inspector_id, schedule_id,
           inspection_type, scheduled_at, status
         )
         VALUES ($1, $2, $3, $4, $5, NOW(), 'scheduled')
         RETURNING id`,
        [inspectionNumber, sched.accommodation_id, sched.default_inspector_id, sched.id, inspectionType]
      );
      // Advance next_due_date by frequency
      await query(
        `UPDATE inspection_schedules SET
           next_due_date = next_due_date + INTERVAL '${FREQ_INTERVAL[sched.frequency]}',
           updated_at = NOW()
         WHERE id = $1`,
        [sched.id]
      );
      created.push({ inspectionId: r.rows[0].id, scheduleId: sched.id, number: inspectionNumber });
    } catch (err) {
      logger.error(`[inspectionAutomation] Failed to auto-create for schedule ${sched.id}:`, err.message);
    }
  }
  return created;
}

/**
 * Mark any inspection_tasks whose due_date has passed and are still
 * pending/assigned/in_progress as 'overdue'.
 */
async function markOverdueTasks() {
  const r = await query(`
    UPDATE inspection_tasks
    SET status = 'overdue', updated_at = NOW()
    WHERE due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND status IN ('pending', 'assigned', 'in_progress')
    RETURNING id
  `);
  return r.rows.length;
}

/** Refresh materialized views for inspection + room trend aggregates. */
async function refreshTrends() {
  const views = ['inspection_trends', 'room_inspection_trends'];
  let okCount = 0;
  for (const v of views) {
    try {
      await query(`REFRESH MATERIALIZED VIEW ${v}`);
      okCount++;
    } catch (err) {
      // MV may be missing on older dev DBs; safe to ignore here.
      logger.warn(`[inspectionAutomation] refresh ${v}:`, err.message);
    }
  }
  return okCount === views.length;
}

/** Single-entry cron target. Safe to call manually via REPL for testing. */
async function runDaily() {
  const startedAt = Date.now();
  try {
    const created = await autoCreateDueInspections();
    const overdue = await markOverdueTasks();
    const trendsOk = await refreshTrends();
    let escalations = { firstReminder: 0, finalWarning: 0, escalated: 0, skipped: 0 };
    try {
      escalations = await compensationSvc.runDailyEscalations();
    } catch (err) {
      logger.error('[inspectionAutomation] compensation escalations failed:', err.message);
    }

    // Auto-convert overdue damage compensations to salary_deduction and mark
    // expired deductions completed (refined Part C).
    let conversions = { converted: 0, completed: 0, skipped: 0, errors: 0 };
    try {
      conversions = await fineSvc.runAutoConversions();
    } catch (err) {
      logger.error('[inspectionAutomation] fine auto-conversions failed:', err.message);
    }

    logger.info(
      `[inspectionAutomation] daily run done in ${Date.now() - startedAt}ms — ` +
      `created=${created.length}, overdue=${overdue}, trends_refreshed=${trendsOk}, ` +
      `escalations=${JSON.stringify(escalations)}, ` +
      `conversions=${JSON.stringify(conversions)}`
    );
    return { created, overdueCount: overdue, trendsRefreshed: trendsOk, escalations, conversions };
  } catch (err) {
    logger.error('[inspectionAutomation] daily run error:', err);
    throw err;
  }
}

module.exports = {
  runDaily,
  autoCreateDueInspections,
  markOverdueTasks,
  refreshTrends,
  nextInspectionNumber,
};
