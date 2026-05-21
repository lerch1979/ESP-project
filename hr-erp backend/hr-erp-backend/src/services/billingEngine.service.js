/**
 * Billing Engine — monthly incoming billing calculation.
 *
 * Reads occupancy_snapshots for a target month, groups by (partner,
 * accommodation), and writes one accommodation_billings row per group
 * inside a fresh billing_run. The full audit trail (rooms → days →
 * employees breakdown) lives in calculation_details JSONB so the math
 * is reverse-engineerable from a single row.
 *
 * Idempotency contract:
 *   • Re-running for the same month is safe. Any existing non-finalized
 *     run for that (month, run_type) is cancelled first; finalized runs
 *     are protected and the call rejects (cancel via the controller if
 *     a re-bill is intentional).
 *   • Cancelled runs and their accommodation_billings rows stay in the
 *     DB for audit — only the (status <> 'cancelled') partial UNIQUE
 *     keeps the new run as the active one.
 *
 * Scope: MVP — incoming only, no billing templates (VAT/discount/line
 * breakdown). All those can live as a future template-driven post-pass
 * over the JSONB without changing this engine's contract.
 *
 * NULL handling:
 *   • Snapshots with per_occupant_daily_share IS NULL (no rent set on
 *     the accommodation) are SKIPPED — they don't contribute to the
 *     total and don't generate a billing row.
 *   • Snapshots with contractor_id IS NULL (accommodation has no
 *     current_contractor_id) are STILL billed but partner_contractor_id
 *     ends up NULL — the run records the work but no partner can be
 *     invoiced until one is assigned. Surfaced in the return summary.
 */
const { transaction, query } = require('../database/connection');
const { logger } = require('../utils/logger');

function assertMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`billingEngine: month must be YYYY-MM (got "${month}")`);
  }
}

/**
 * Format a JS Date as YYYY-MM-DD in *local* time.
 *
 * pg returns DATE columns as JS Date objects with the local-midnight
 * interpretation, e.g. 2026-05-19 (DB) becomes `2026-05-18T22:00:00Z`
 * in CEST. Using .toISOString().slice(0,10) on that would silently
 * shift the date by a day. Always read via local components instead.
 */
function localDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build one calculation_details JSONB payload from the raw snapshot
 * rows belonging to a single (accommodation, contractor) group.
 *
 * Rows must already be sorted by (room_id, employee_id, snapshot_date).
 */
function buildCalculationDetails(rows, computedAt) {
  // room_id → { room_id, room_number, monthly_rent, days: [...], employees: {...} }
  const roomsByKey = new Map();

  for (const r of rows) {
    const roomKey = r.room_id || '__no_room__';
    if (!roomsByKey.has(roomKey)) {
      roomsByKey.set(roomKey, {
        room_id: r.room_id,
        room_number: r.room_number,
        monthly_rent: r.accommodation_monthly_rent != null
          ? Number(r.accommodation_monthly_rent) : null,
        days: new Map(),         // date → { date, occupants, per_share }
        employees: new Map(),    // employee_id → { employee_id, name, days, subtotal }
      });
    }
    const room = roomsByKey.get(roomKey);

    const dateStr = localDateStr(r.snapshot_date);
    if (!room.days.has(dateStr)) {
      room.days.set(dateStr, {
        date: dateStr,
        occupants: r.room_occupant_count,
        per_share: Number(r.per_occupant_daily_share),
      });
    }

    if (!room.employees.has(r.employee_id)) {
      room.employees.set(r.employee_id, {
        employee_id: r.employee_id,
        name: r.employee_name,
        days: 0,
        subtotal: 0,
      });
    }
    const emp = room.employees.get(r.employee_id);
    emp.days += 1;
    emp.subtotal = Math.round((emp.subtotal + Number(r.per_occupant_daily_share)) * 100) / 100;
  }

  let totalEmployeeDays = 0;
  let totalAmount = 0;
  const roomsArr = [];
  for (const room of roomsByKey.values()) {
    const empArr = [...room.employees.values()];
    const daysArr = [...room.days.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of empArr) totalEmployeeDays += e.days;
    for (const e of empArr) totalAmount += e.subtotal;
    roomsArr.push({
      room_id: room.room_id,
      room_number: room.room_number,
      monthly_rent: room.monthly_rent,
      days: daysArr,
      employees: empArr.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    });
  }
  totalAmount = Math.round(totalAmount * 100) / 100;

  return {
    details: {
      rooms: roomsArr,
      total_employee_days: totalEmployeeDays,
      total_amount: totalAmount,
      computed_at: computedAt,
    },
    totalEmployeeDays,
    totalAmount,
  };
}

/**
 * Compute incoming billing for a month and persist it as a new
 * billing_run + accommodation_billings rows.
 *
 * @param {string} month   'YYYY-MM'
 * @param {object} [opts]
 * @param {string} [opts.createdBy]   user UUID for the billing_run record
 * @param {string} [opts.runType='incoming']
 * @returns {Promise<{run_id, month, run_type, status, total_amount,
 *                    billing_count, partner_count, skipped_no_rent,
 *                    skipped_no_partner, replaced_run_id}>}
 */
async function calculateMonthlyBilling(month, opts = {}) {
  assertMonth(month);
  const runType = opts.runType || 'incoming';
  if (runType !== 'incoming') {
    throw new Error(`billingEngine: runType '${runType}' not supported in MVP (Phase 2)`);
  }

  return transaction(async (client) => {
    // ─── 1. Replace any non-finalized active run for this (month, type) ───
    const existing = await client.query(
      `SELECT id, status FROM billing_runs
       WHERE billing_month = $1 AND run_type = $2 AND status <> 'cancelled'
       FOR UPDATE`,
      [month, runType]
    );
    let replacedRunId = null;
    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      if (prev.status === 'finalized') {
        throw new Error(
          `billingEngine: run ${prev.id} for ${month}/${runType} is finalized; cancel via controller before re-billing`
        );
      }
      await client.query(
        `UPDATE billing_runs SET status='cancelled', completed_at=NOW(),
           notes = COALESCE(notes,'') || E'\nReplaced by re-bill at ' || NOW()
         WHERE id = $1`,
        [prev.id]
      );
      replacedRunId = prev.id;
    }

    // ─── 2. Pull snapshot rows for the month, sorted for streaming aggregation ───
    const snapRows = await client.query(
      `SELECT
         os.snapshot_date,
         os.employee_id,
         (e.first_name || ' ' || COALESCE(e.last_name, '')) AS employee_name,
         os.accommodation_id,
         a.name AS accommodation_name,
         os.room_id,
         ar.room_number,
         os.contractor_id,
         os.accommodation_monthly_rent,
         os.room_occupant_count,
         os.per_occupant_daily_share
       FROM occupancy_snapshots os
       JOIN employees e ON e.id = os.employee_id
       JOIN accommodations a ON a.id = os.accommodation_id
       LEFT JOIN accommodation_rooms ar ON ar.id = os.room_id
       WHERE TO_CHAR(os.snapshot_date, 'YYYY-MM') = $1
         AND os.per_occupant_daily_share IS NOT NULL
       ORDER BY os.accommodation_id, os.contractor_id NULLS LAST, os.room_id NULLS LAST,
                os.employee_id, os.snapshot_date`,
      [month]
    );

    // Count what we skipped (rent unset) for the summary
    const skipped = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE per_occupant_daily_share IS NULL) AS no_rent,
         COUNT(DISTINCT accommodation_id) FILTER (WHERE per_occupant_daily_share IS NULL) AS no_rent_accommodations
       FROM occupancy_snapshots
       WHERE TO_CHAR(snapshot_date, 'YYYY-MM') = $1`,
      [month]
    );

    // ─── 3. Group rows by (accommodation_id, contractor_id) — stream-friendly ───
    const groups = new Map();  // "accId|ctrId" → {accommodation_id, contractor_id, rows: []}
    for (const r of snapRows.rows) {
      const key = `${r.accommodation_id}|${r.contractor_id || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          accommodation_id: r.accommodation_id,
          contractor_id: r.contractor_id,
          rows: [],
        });
      }
      groups.get(key).rows.push(r);
    }

    // ─── 4. Create the run, then one accommodation_billings row per group ───
    const runIns = await client.query(
      `INSERT INTO billing_runs (billing_month, run_type, status, created_by, notes)
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING id`,
      [month, runType, opts.createdBy || null,
       replacedRunId ? `Replaces ${replacedRunId}` : null]
    );
    const runId = runIns.rows[0].id;

    const computedAt = new Date().toISOString();
    let grandTotal = 0;
    let noPartnerCount = 0;
    const partnerIds = new Set();

    for (const grp of groups.values()) {
      const { details, totalEmployeeDays, totalAmount } =
        buildCalculationDetails(grp.rows, computedAt);

      if (grp.contractor_id) partnerIds.add(grp.contractor_id);
      else noPartnerCount++;

      grandTotal = Math.round((grandTotal + totalAmount) * 100) / 100;

      await client.query(
        `INSERT INTO accommodation_billings (
           billing_run_id, billing_month, accommodation_id, partner_contractor_id,
           total_amount, total_employee_days, calculation_details, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
        [runId, month, grp.accommodation_id, grp.contractor_id,
         totalAmount, totalEmployeeDays, details]
      );
    }

    // ─── 5. Finalize the run header with totals ───
    await client.query(
      `UPDATE billing_runs SET
         status = 'calculated',
         total_amount = $2,
         partner_count = $3,
         completed_at = NOW()
       WHERE id = $1`,
      [runId, grandTotal, partnerIds.size]
    );

    const summary = {
      run_id: runId,
      month,
      run_type: runType,
      status: 'calculated',
      total_amount: grandTotal,
      billing_count: groups.size,
      partner_count: partnerIds.size,
      skipped_no_rent: parseInt(skipped.rows[0].no_rent, 10) || 0,
      skipped_no_rent_accommodations: parseInt(skipped.rows[0].no_rent_accommodations, 10) || 0,
      skipped_no_partner_groups: noPartnerCount,
      replaced_run_id: replacedRunId,
    };
    logger.info(`[billingEngine] ${JSON.stringify(summary)}`);
    return summary;
  });
}

module.exports = { calculateMonthlyBilling, buildCalculationDetails };
