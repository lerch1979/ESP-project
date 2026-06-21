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
 * Resolve the per-night client rate for (clientId, accId, dateStr) from a
 * preloaded client_night_rates array. Prefers an accommodation-specific row
 * over the client default (NULL accommodation); within the same specificity,
 * the later valid_from wins. Returns a Number or null (no rate configured).
 */
function makeRateResolver(rates) {
  return (clientId, accId, dateStr) => {
    if (!clientId) return null;
    let best = null;
    for (const r of rates) {
      if (r.contractor_id !== clientId) continue;
      if (r.accommodation_id && r.accommodation_id !== accId) continue;
      if (dateStr < r.valid_from) continue;
      if (r.valid_to && dateStr > r.valid_to) continue;
      if (!best) { best = r; continue; }
      const bSpec = !!best.accommodation_id;
      const rSpec = !!r.accommodation_id;
      if (rSpec !== bSpec) { if (rSpec) best = r; continue; }
      if (r.valid_from > best.valid_from) best = r;
    }
    return best ? Number(best.rate_per_night) : null;
  };
}

/**
 * Build one calculation_details JSONB payload from the raw snapshot
 * rows belonging to a single (accommodation, billing_client) group.
 * Tracks BOTH cost (rent allocation) and revenue (resolved client rate)
 * per employee. resolveRate(clientId, accId, dateStr) → Number|null.
 *
 * Rows must already be sorted by (room_id, employee_id, snapshot_date).
 */
const round2 = (n) => Math.round(n * 100) / 100;

function buildCalculationDetails(rows, computedAt, resolveRate, accId, clientId) {
  const roomsByKey = new Map();

  for (const r of rows) {
    const roomKey = r.room_id || '__no_room__';
    if (!roomsByKey.has(roomKey)) {
      roomsByKey.set(roomKey, {
        room_id: r.room_id,
        room_number: r.room_number,
        monthly_rent: r.accommodation_monthly_rent != null ? Number(r.accommodation_monthly_rent) : null,
        days: new Map(),       // date → { date, occupants, cost_share, rate }
        employees: new Map(),  // employee_id → { employee_id, name, days, cost, revenue }
      });
    }
    const room = roomsByKey.get(roomKey);

    const dateStr = localDateStr(r.snapshot_date);
    const costShare = r.per_occupant_daily_share != null ? Number(r.per_occupant_daily_share) : 0;
    const rate = resolveRate(clientId, accId, dateStr) || 0; // per-occupant-night revenue

    if (!room.days.has(dateStr)) {
      room.days.set(dateStr, { date: dateStr, occupants: r.room_occupant_count, cost_share: costShare, rate });
    }
    if (!room.employees.has(r.employee_id)) {
      room.employees.set(r.employee_id, { employee_id: r.employee_id, name: r.employee_name, days: 0, cost: 0, revenue: 0 });
    }
    const emp = room.employees.get(r.employee_id);
    emp.days += 1;
    emp.cost = round2(emp.cost + costShare);
    emp.revenue = round2(emp.revenue + rate);
  }

  let totalEmployeeDays = 0;
  let revenue = 0;
  let rentCost = 0;
  const roomsArr = [];
  for (const room of roomsByKey.values()) {
    const empArr = [...room.employees.values()];
    const daysArr = [...room.days.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of empArr) { totalEmployeeDays += e.days; revenue += e.revenue; rentCost += e.cost; }
    roomsArr.push({
      room_id: room.room_id,
      room_number: room.room_number,
      monthly_rent: room.monthly_rent,
      days: daysArr,
      employees: empArr.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    });
  }
  revenue = round2(revenue);
  rentCost = round2(rentCost);

  return {
    rooms: roomsArr,
    totalEmployeeDays,
    revenue,
    rentCost, // expense allocation + final cost/margin are added by the caller
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
 * @param {string} [opts.notes]       free-text tag, e.g. '[auto] cron monthly billing'
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

    // ─── 2. Snapshot rows for the month — ALL of them (no rent filter; option C
    //        revenue comes from the client rate, not the rent). The billable
    //        client is the WORKER's billing_client_id (the accommodation-payer),
    //        NOT the snapshot's accommodation contractor. ───
    const snapRows = await client.query(
      `SELECT
         os.snapshot_date,
         os.employee_id,
         (e.first_name || ' ' || COALESCE(e.last_name, '')) AS employee_name,
         e.billing_client_id,
         os.accommodation_id,
         os.room_id,
         ar.room_number,
         os.accommodation_monthly_rent,
         os.room_occupant_count,
         os.per_occupant_daily_share
       FROM occupancy_snapshots os
       JOIN employees e ON e.id = os.employee_id
       JOIN accommodations a ON a.id = os.accommodation_id
       LEFT JOIN accommodation_rooms ar ON ar.id = os.room_id
       WHERE TO_CHAR(os.snapshot_date, 'YYYY-MM') = $1
       ORDER BY os.accommodation_id, e.billing_client_id NULLS LAST, os.room_id NULLS LAST,
                os.employee_id, os.snapshot_date`,
      [month]
    );

    // Preload client rates (resolver) + operating expenses per accommodation.
    const rateRows = await client.query(
      `SELECT contractor_id, accommodation_id, rate_per_night,
              TO_CHAR(valid_from, 'YYYY-MM-DD') AS valid_from,
              TO_CHAR(valid_to, 'YYYY-MM-DD') AS valid_to
         FROM client_night_rates`
    );
    const resolveRate = makeRateResolver(rateRows.rows);

    const expRows = await client.query(
      `SELECT accommodation_id, COALESCE(SUM(amount), 0) AS total
         FROM accommodation_expenses
        WHERE billing_month = $1 AND deleted_at IS NULL
        GROUP BY accommodation_id`,
      [month]
    );
    const expenseByAcc = new Map();
    for (const r of expRows.rows) expenseByAcc.set(r.accommodation_id, Number(r.total));

    // ─── 3. Group by (accommodation_id, billing_client_id) ───
    const groups = new Map(); // "accId|clientId" → {accommodation_id, billing_client_id, rows:[]}
    for (const r of snapRows.rows) {
      const key = `${r.accommodation_id}|${r.billing_client_id || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { accommodation_id: r.accommodation_id, billing_client_id: r.billing_client_id, rows: [] });
      }
      groups.get(key).rows.push(r);
    }

    // ─── 4. Pass 1: compute per-group revenue/rent + accumulate accommodation totals ───
    const computedAt = new Date().toISOString();
    const computed = [];
    const accTotalDays = new Map();
    let noClientGroups = 0;
    let noRateGroups = 0;
    const partnerIds = new Set();

    for (const grp of groups.values()) {
      const built = buildCalculationDetails(grp.rows, computedAt, resolveRate, grp.accommodation_id, grp.billing_client_id);
      computed.push({ grp, built });
      accTotalDays.set(grp.accommodation_id, (accTotalDays.get(grp.accommodation_id) || 0) + built.totalEmployeeDays);
      if (grp.billing_client_id) partnerIds.add(grp.billing_client_id); else noClientGroups++;
      if (grp.billing_client_id && built.revenue === 0) noRateGroups++;
    }

    // ─── 5. Create run, then one billing row per group (revenue/cost/margin) ───
    const noteParts = [];
    if (opts.notes) noteParts.push(opts.notes);
    if (replacedRunId) noteParts.push(`Replaces ${replacedRunId}`);
    const runNotes = noteParts.length ? noteParts.join(' | ') : null;

    const runIns = await client.query(
      `INSERT INTO billing_runs (billing_month, run_type, status, created_by, notes)
       VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
      [month, runType, opts.createdBy || null, runNotes]
    );
    const runId = runIns.rows[0].id;

    let grandRevenue = 0;
    for (const { grp, built } of computed) {
      // Operating expenses allocated pro-rata by this group's share of the
      // accommodation's employee-days (cost = rent allocation + expenses).
      const accExpense = expenseByAcc.get(grp.accommodation_id) || 0;
      const accDays = accTotalDays.get(grp.accommodation_id) || 0;
      const expenseCost = accDays > 0 ? round2(accExpense * (built.totalEmployeeDays / accDays)) : 0;
      const cost = round2(built.rentCost + expenseCost);
      const margin = round2(built.revenue - cost);
      grandRevenue = round2(grandRevenue + built.revenue);

      const details = {
        rooms: built.rooms,
        total_employee_days: built.totalEmployeeDays,
        revenue: built.revenue,
        rent_cost: built.rentCost,
        expense_cost: expenseCost,
        cost,
        margin,
        computed_at: computedAt,
      };

      await client.query(
        `INSERT INTO accommodation_billings (
           billing_run_id, billing_month, accommodation_id, partner_contractor_id,
           total_amount, cost_amount, margin_amount, total_employee_days,
           calculation_details, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')`,
        [runId, month, grp.accommodation_id, grp.billing_client_id,
         built.revenue, cost, margin, built.totalEmployeeDays, details]
      );
    }

    await client.query(
      `UPDATE billing_runs SET status='calculated', total_amount=$2, partner_count=$3, completed_at=NOW()
       WHERE id = $1`,
      [runId, grandRevenue, partnerIds.size]
    );

    const summary = {
      run_id: runId,
      month,
      run_type: runType,
      status: 'calculated',
      total_amount: grandRevenue,            // total REVENUE billed
      billing_count: groups.size,
      partner_count: partnerIds.size,
      groups_no_billing_client: noClientGroups, // workers with no billing_client_id set
      groups_no_rate: noRateGroups,             // billing_client set but no rate configured → 0 revenue
      replaced_run_id: replacedRunId,
    };
    logger.info(`[billingEngine] ${JSON.stringify(summary)}`);
    return summary;
  });
}

module.exports = { calculateMonthlyBilling, buildCalculationDetails, makeRateResolver };
