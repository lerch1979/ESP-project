/**
 * Billing Engine — monthly incoming billing calculation.
 *
 * Reads occupancy_snapshots for a target month, groups by (accommodation,
 * billing_client), and writes one accommodation_billings row per group inside a
 * fresh billing_run. The full audit trail lives in calculation_details JSONB.
 *
 * REVENUE is driven by client_night_rates (resolved per client × accommodation ×
 * day). Each applicable rate row carries a `billing_basis`:
 *   • per_person   — net = Σ(rate_per_night × person-nights)
 *   • flat         — net = Σ over covered days of (flat_amount / days_in_month)
 *                    → a flat property rent, prorated by the days actually occupied.
 *   • per_bed_night — a CONTRACTED BED BLOCK with an occupancy guarantee, billed every
 *                    day the rate is valid: full = max(occupied, ceil(capacity×floor_pct)),
 *                    reduced = max(0, capacity−full), net/day = full×rate_used +
 *                    reduced×rate_empty. capacity = contracted_beds else physical beds.
 * One basis wins per (client, accommodation, month); a mixed base is not modelled.
 *
 * COMPENSATION: approved damage claims for a worker are billed to that worker's megbízó
 * as a SEPARATE pass-through line (accommodation_billings.compensation_amount) — kept out
 * of housing net/margin. Invoice total to megbízó = gross_amount + compensation_amount.
 *
 * UTILITIES: if accommodations.utilities_billing = 'billed_separately', the month's
 * recorded `rezsi` expense for the accommodation is passed through to the client
 * (split pro-rata by employee-days across the accommodation's client groups). VAT is
 * applied at the rate's vat_rate. 'included'/'we_pay' add nothing to the client bill.
 *
 * VAT: gross = net × (1 + vat_rate). `total_amount` stays NET (the margin basis so
 * the profit dashboard reconciles); `vat_amount` + `gross_amount` are stored for the
 * invoice. COST = rent allocation + operating expenses (unchanged). margin = net − cost.
 *
 * Idempotency: re-running a month cancels the prior non-finalized run first;
 * finalized runs are protected (cancel via the controller to re-bill).
 */
const { transaction, query } = require('../database/connection');
const { logger } = require('../utils/logger');

function assertMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`billingEngine: month must be YYYY-MM (got "${month}")`);
  }
}

// pg returns DATE columns as local-midnight Date objects; read via local components
// (never .toISOString(), which would shift the day under CEST).
function localDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

function daysInMonthOf(month) {
  const [Y, M] = month.split('-').map(Number);
  return new Date(Y, M, 0).getDate();
}

/**
 * Resolve the full applicable client_night_rates ROW for (clientId, accId, dateStr):
 * an accommodation-specific row beats the client default (NULL accommodation); within
 * the same specificity the later valid_from wins. Returns the row or null.
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
    return best;
  };
}

/**
 * COST-side breakdown for one (accommodation, client) group: rent allocation per
 * room/employee + total employee-days. Revenue is computed separately (basis-aware).
 * Rows must be sorted by (room_id, employee_id, snapshot_date).
 */
function buildCostDetails(rows) {
  const roomsByKey = new Map();
  for (const r of rows) {
    const roomKey = r.room_id || '__no_room__';
    if (!roomsByKey.has(roomKey)) {
      roomsByKey.set(roomKey, {
        room_id: r.room_id, room_number: r.room_number,
        monthly_rent: r.accommodation_monthly_rent != null ? Number(r.accommodation_monthly_rent) : null,
        days: new Map(), employees: new Map(),
      });
    }
    const room = roomsByKey.get(roomKey);
    const dateStr = localDateStr(r.snapshot_date);
    const costShare = r.per_occupant_daily_share != null ? Number(r.per_occupant_daily_share) : 0;
    if (!room.days.has(dateStr)) room.days.set(dateStr, { date: dateStr, occupants: r.room_occupant_count, cost_share: costShare });
    if (!room.employees.has(r.employee_id)) room.employees.set(r.employee_id, { employee_id: r.employee_id, name: r.employee_name, days: 0, cost: 0 });
    const emp = room.employees.get(r.employee_id);
    emp.days += 1;
    emp.cost = round2(emp.cost + costShare);
  }
  let totalEmployeeDays = 0;
  let rentCost = 0;
  const roomsArr = [];
  for (const room of roomsByKey.values()) {
    const empArr = [...room.employees.values()];
    for (const e of empArr) { totalEmployeeDays += e.days; rentCost += e.cost; }
    roomsArr.push({
      room_id: room.room_id, room_number: room.room_number, monthly_rent: room.monthly_rent,
      days: [...room.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      employees: empArr.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    });
  }
  return { rooms: roomsArr, totalEmployeeDays, rentCost: round2(rentCost) };
}

/**
 * Per-bed occupancy for a group, keyed by day → Set(employee_id). One snapshot row is
 * one employee-day (= one occupied bed that day); distinct employees per day = occupied beds.
 */
function occupancyByDay(rows) {
  const m = new Map();
  for (const r of rows) {
    const d = localDateStr(r.snapshot_date);
    if (!m.has(d)) m.set(d, new Set());
    m.get(d).add(r.employee_id);
  }
  return m;
}

/**
 * per_bed_night revenue: DAY-DRIVEN across the whole month. The contracted block is
 * billed every day the rate is valid — even on low/zero-occupancy days — honouring the
 * occupancy floor. capacity = contracted_beds when set, else the accommodation's physical
 * beds. Returns net/vat plus a `per_bed` breakdown for the invoice + profit dashboard.
 */
function computePerBed(rows, resolveRow, accId, clientId, month, daysInMonth, accBeds) {
  const occ = occupancyByDay(rows);
  const [Y, M] = month.split('-').map(Number);
  let baseNet = 0, baseVat = 0, vatRate = 0, vatExempt = false;
  let fullBN = 0, reducedBN = 0, occBN = 0, daysBilled = 0;
  let capacity = null, contracted = null, floorPct = null, rateUsed = null, rateEmpty = null;
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${Y}-${String(M).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const row = resolveRow(clientId, accId, dStr);
    if (!row || row.billing_basis !== 'per_bed_night') continue;
    const rUsed = Number(row.rate_used) || 0;
    const rEmpty = Number(row.rate_empty) || 0;
    const fPct = Number(row.occupancy_floor_pct) || 0;
    const cap = row.contracted_beds != null ? Number(row.contracted_beds) : (Number(accBeds) || 0);
    const occupied = occ.get(dStr) ? occ.get(dStr).size : 0;
    const floorBeds = Math.ceil(cap * fPct);
    const full = Math.max(occupied, floorBeds);        // guaranteed minimum
    const reduced = Math.max(0, cap - full);           // empty beds in the block (clamped ≥0 on over-occupancy)
    const dayNet = full * rUsed + reduced * rEmpty;
    const dayVat = row.vat_exempt ? 0 : (Number(row.vat_rate) || 0);
    vatRate = dayVat; if (row.vat_exempt) vatExempt = true;
    baseNet = round2(baseNet + dayNet);
    baseVat = round2(baseVat + dayNet * dayVat);
    fullBN += full; reducedBN += reduced; occBN += occupied; daysBilled++;
    capacity = cap; contracted = row.contracted_beds != null ? Number(row.contracted_beds) : null;
    floorPct = fPct; rateUsed = rUsed; rateEmpty = rEmpty;
  }
  const perBed = {
    capacity, contracted_beds: contracted, physical_beds: Number(accBeds) || 0,
    floor_pct: floorPct, rate_used: rateUsed, rate_empty: rateEmpty,
    days_billed: daysBilled,
    full_bed_nights: fullBN, reduced_bed_nights: reducedBN, occupied_bed_nights: occBN,
    avg_full_beds: daysBilled ? round2(fullBN / daysBilled) : 0,
    avg_occupied_beds: daysBilled ? round2(occBN / daysBilled) : 0,
    empty_bed_nights: reducedBN,
  };
  return { baseNet, baseVat, vatRate, vatExempt, perBed };
}

/**
 * REVENUE for one (accommodation, client) group: base (per_person | flat | per_bed_night)
 * + optional utilities pass-through, each with VAT. `resolveRow(clientId, accId, dateStr)`
 * returns the applicable rate row (or null → 0 for that day). A group is a SINGLE basis for
 * the month (the first applicable row's basis wins).
 */
function computeGroupRevenue(rows, resolveRow, accId, clientId, daysInMonth, opts = {}) {
  const { rezsiTotal = 0, utilitiesBilling = 'we_pay', groupEmpDays = 0, accEmpDays = 0, month = null, accBeds = 0 } = opts;
  const dayRow = new Map();
  let peekBasis = null;
  for (const r of rows) {
    const d = localDateStr(r.snapshot_date);
    if (!dayRow.has(d)) { const row = resolveRow(clientId, accId, d); dayRow.set(d, row); if (row && !peekBasis) peekBasis = row.billing_basis; }
  }

  let baseNet = 0, baseVat = 0, vatRate = 0, basis = null, vatExempt = false, perBed = null;

  if (peekBasis === 'per_bed_night' && month) {
    const pb = computePerBed(rows, resolveRow, accId, clientId, month, daysInMonth, accBeds);
    basis = 'per_bed_night';
    baseNet = pb.baseNet; baseVat = pb.baseVat; vatRate = pb.vatRate; vatExempt = pb.vatExempt; perBed = pb.perBed;
  } else {
    const flatDaysSeen = new Set();
    for (const r of rows) {
      const d = localDateStr(r.snapshot_date);
      const row = dayRow.get(d);
      if (!row) continue; // no rate that day → contributes nothing (surfaced by coverage view)
      // VAT-exempt (áfamentes) → 0 VAT that day; net is unaffected.
      const dayVat = row.vat_exempt ? 0 : (Number(row.vat_rate) || 0);
      vatRate = dayVat;
      if (row.vat_exempt) vatExempt = true;
      if (row.billing_basis === 'flat') {
        basis = basis || 'flat';
        if (!flatDaysSeen.has(d)) { // per PROPERTY-day, headcount-independent
          flatDaysSeen.add(d);
          const dayNet = Number(row.flat_amount || 0) / daysInMonth;
          baseNet = round2(baseNet + dayNet);
          baseVat = round2(baseVat + dayNet * dayVat);
        }
      } else {
        basis = basis || 'per_person';
        const rate = Number(row.rate_per_night) || 0; // per employee-day
        baseNet = round2(baseNet + rate);
        baseVat = round2(baseVat + rate * dayVat);
      }
    }
  }

  // Utilities pass-through (billed_separately): the month rezsi, split by employee-days.
  let utilityNet = 0, utilityVat = 0;
  if (utilitiesBilling === 'billed_separately' && rezsiTotal > 0 && accEmpDays > 0) {
    utilityNet = round2(rezsiTotal * (groupEmpDays / accEmpDays));
    utilityVat = round2(utilityNet * vatRate);
  }

  const net = round2(baseNet + utilityNet);
  const vat = round2(baseVat + utilityVat);
  return { basis, base_net: baseNet, base_vat: baseVat, utility_net: utilityNet, utility_vat: utilityVat,
           net, vat, gross: round2(net + vat), vat_rate: vatRate, vat_exempt: vatExempt, per_bed: perBed };
}

async function calculateMonthlyBilling(month, opts = {}) {
  assertMonth(month);
  const runType = opts.runType || 'incoming';
  if (runType !== 'incoming') {
    throw new Error(`billingEngine: runType '${runType}' not supported in MVP (Phase 2)`);
  }
  const dim = daysInMonthOf(month);

  return transaction(async (client) => {
    // ─── 1. Replace any non-finalized active run for this (month, type) ───
    const existing = await client.query(
      `SELECT id, status FROM billing_runs
       WHERE billing_month = $1 AND run_type = $2 AND status <> 'cancelled' FOR UPDATE`,
      [month, runType]
    );
    let replacedRunId = null;
    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      if (prev.status === 'finalized') {
        throw new Error(`billingEngine: run ${prev.id} for ${month}/${runType} is finalized; cancel via controller before re-billing`);
      }
      await client.query(
        `UPDATE billing_runs SET status='cancelled', completed_at=NOW(),
           notes = COALESCE(notes,'') || E'\nReplaced by re-bill at ' || NOW() WHERE id = $1`,
        [prev.id]
      );
      replacedRunId = prev.id;
    }

    // ─── 2. Snapshot rows for the month. Billable client = the WORKER's billing_client_id. ───
    const snapRows = await client.query(
      `SELECT os.snapshot_date, os.employee_id,
              (e.first_name || ' ' || COALESCE(e.last_name, '')) AS employee_name,
              e.billing_client_id, os.accommodation_id, os.room_id, ar.room_number,
              os.accommodation_monthly_rent, os.room_occupant_count, os.per_occupant_daily_share
         FROM occupancy_snapshots os
         JOIN employees e ON e.id = os.employee_id
         JOIN accommodations a ON a.id = os.accommodation_id
         LEFT JOIN accommodation_rooms ar ON ar.id = os.room_id
        WHERE TO_CHAR(os.snapshot_date, 'YYYY-MM') = $1
        ORDER BY os.accommodation_id, e.billing_client_id NULLS LAST, os.room_id NULLS LAST,
                 os.employee_id, os.snapshot_date`,
      [month]
    );

    // Preloads: rate rows (with basis/vat/flat/per-bed), operating expenses, rezsi, utilities flag.
    const rateRows = await client.query(
      `SELECT contractor_id, accommodation_id, rate_per_night, flat_amount, billing_basis, vat_rate, vat_exempt,
              rate_used, rate_empty, occupancy_floor_pct, contracted_beds,
              TO_CHAR(valid_from, 'YYYY-MM-DD') AS valid_from, TO_CHAR(valid_to, 'YYYY-MM-DD') AS valid_to
         FROM client_night_rates`
    );
    const resolveRow = makeRateResolver(rateRows.rows);

    // Physical bed capacity per accommodation (Σ accommodation_rooms.beds) — the per_bed
    // fallback capacity when a rate has no contracted_beds, and the profit "lekötetlen" base.
    const bedRows = await client.query(
      `SELECT accommodation_id, COALESCE(SUM(beds), 0) AS beds FROM accommodation_rooms
        WHERE is_active = true GROUP BY accommodation_id`);
    const accBedsByAcc = new Map();
    for (const r of bedRows.rows) accBedsByAcc.set(r.accommodation_id, Number(r.beds));

    // Approved compensations for the month → billed to each worker's MEGBÍZÓ as a
    // separate pass-through line, keyed by (accommodation, megbízó). Billable statuses:
    // approved + still outstanding. Excludes draft (not approved), waived (forgiven),
    // DISPUTED (under contention — only bill once the dispute resolves), and worker-settled
    // states (paid / paid_on_site / salary_deduction_* / closed). Attribution = issued_date.
    const compByGroup = new Map();      // `${accId}|${megbizoId}` -> { total, lines: [] }
    const unattachedComps = [];         // approved comps with no resolvable megbízó / no housing group
    const compRows = await client.query(
      `SELECT co.id, co.compensation_number, co.accommodation_id, co.status,
              cr.resident_name, COALESCE(cr.amount_assigned, 0) AS amount, e.billing_client_id AS megbizo_id
         FROM compensations co
         JOIN compensation_residents cr ON cr.compensation_id = co.id
         LEFT JOIN employees e ON e.user_id = cr.resident_id
        WHERE co.status IN ('issued','notified','partial_paid','escalated')
          AND TO_CHAR(COALESCE(co.issued_date, co.issued_at::date, co.created_at::date), 'YYYY-MM') = $1
          AND COALESCE(cr.amount_assigned, 0) > 0`,
      [month]);
    for (const c of compRows.rows) {
      if (!c.megbizo_id) { unattachedComps.push({ compensation_number: c.compensation_number, resident_name: c.resident_name, amount: Number(c.amount), reason: 'no_megbizo' }); continue; }
      const key = `${c.accommodation_id}|${c.megbizo_id}`;
      if (!compByGroup.has(key)) compByGroup.set(key, { total: 0, lines: [] });
      const g = compByGroup.get(key);
      g.total = round2(g.total + Number(c.amount));
      g.lines.push({ compensation_number: c.compensation_number, resident_name: c.resident_name, amount: Number(c.amount) });
    }

    // Per-client billing profile (invoicing on/off + legal type). Missing profile →
    // defaults (invoiced, company); coverage surfaces unset profiles separately.
    const profRows = await client.query(`SELECT contractor_id, invoicing_enabled, legal_type FROM client_billing_profiles`);
    const profByClient = new Map();
    for (const p of profRows.rows) profByClient.set(p.contractor_id, p);

    const expRows = await client.query(
      `SELECT accommodation_id, COALESCE(SUM(amount), 0) AS total FROM accommodation_expenses
        WHERE billing_month = $1 AND deleted_at IS NULL GROUP BY accommodation_id`, [month]);
    const expenseByAcc = new Map();
    for (const r of expRows.rows) expenseByAcc.set(r.accommodation_id, Number(r.total));

    const rezsiRows = await client.query(
      `SELECT accommodation_id, COALESCE(SUM(amount), 0) AS total FROM accommodation_expenses
        WHERE billing_month = $1 AND deleted_at IS NULL AND category = 'rezsi' GROUP BY accommodation_id`, [month]);
    const rezsiByAcc = new Map();
    for (const r of rezsiRows.rows) rezsiByAcc.set(r.accommodation_id, Number(r.total));

    const utilRows = await client.query(`SELECT id, utilities_billing FROM accommodations`);
    const utilByAcc = new Map();
    for (const r of utilRows.rows) utilByAcc.set(r.id, r.utilities_billing);

    // ─── 3. Group by (accommodation_id, billing_client_id). Clients whose profile
    //        has invoicing_enabled=false are SKIPPED entirely (no billing row); their
    //        occupancy is excluded from the run (their unbilled cost is absorbed). ───
    const groups = new Map();
    const skippedClients = new Set();
    for (const r of snapRows.rows) {
      const prof = profByClient.get(r.billing_client_id);
      if (prof && prof.invoicing_enabled === false) { skippedClients.add(r.billing_client_id); continue; }
      const key = `${r.accommodation_id}|${r.billing_client_id || ''}`;
      if (!groups.has(key)) groups.set(key, { accommodation_id: r.accommodation_id, billing_client_id: r.billing_client_id, rows: [] });
      groups.get(key).rows.push(r);
    }

    // ─── 4. Pass 1: cost details + accumulate accommodation employee-days ───
    const computedAt = new Date().toISOString();
    const computed = [];
    const accTotalDays = new Map();
    let noClientGroups = 0, noRateGroups = 0;
    const partnerIds = new Set();
    for (const grp of groups.values()) {
      const cost = buildCostDetails(grp.rows);
      computed.push({ grp, cost });
      accTotalDays.set(grp.accommodation_id, (accTotalDays.get(grp.accommodation_id) || 0) + cost.totalEmployeeDays);
      if (grp.billing_client_id) partnerIds.add(grp.billing_client_id); else noClientGroups++;
    }

    // ─── 5. Create run, then one billing row per group (revenue/vat/cost/margin) ───
    const noteParts = [];
    if (opts.notes) noteParts.push(opts.notes);
    if (replacedRunId) noteParts.push(`Replaces ${replacedRunId}`);
    const runIns = await client.query(
      `INSERT INTO billing_runs (billing_month, run_type, status, created_by, notes)
       VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
      [month, runType, opts.createdBy || null, noteParts.length ? noteParts.join(' | ') : null]
    );
    const runId = runIns.rows[0].id;

    let grandRevenue = 0, grandGross = 0, grandCompensation = 0;
    for (const { grp, cost } of computed) {
      const accEmpDays = accTotalDays.get(grp.accommodation_id) || 0;
      const rev = computeGroupRevenue(grp.rows, resolveRow, grp.accommodation_id, grp.billing_client_id, dim, {
        rezsiTotal: rezsiByAcc.get(grp.accommodation_id) || 0,
        utilitiesBilling: utilByAcc.get(grp.accommodation_id) || 'we_pay',
        groupEmpDays: cost.totalEmployeeDays,
        accEmpDays,
        month,
        accBeds: accBedsByAcc.get(grp.accommodation_id) || 0,
      });
      if (grp.billing_client_id && rev.net === 0) noRateGroups++;

      // Compensation pass-through for this (accommodation, megbízó) — a separate line,
      // NOT added to housing net/margin. Consume the entry so leftovers = unattached.
      const compKey = `${grp.accommodation_id}|${grp.billing_client_id || ''}`;
      const comp = compByGroup.get(compKey);
      const compensationAmount = comp ? comp.total : 0;
      const compensationLines = comp ? comp.lines : [];
      if (comp) { grandCompensation = round2(grandCompensation + comp.total); compByGroup.delete(compKey); }

      const accExpense = expenseByAcc.get(grp.accommodation_id) || 0;
      const expenseCost = accEmpDays > 0 ? round2(accExpense * (cost.totalEmployeeDays / accEmpDays)) : 0;
      const totalCost = round2(cost.rentCost + expenseCost);
      const margin = round2(rev.net - totalCost);
      grandRevenue = round2(grandRevenue + rev.net);
      grandGross = round2(grandGross + rev.gross);

      // Private individual → payroll handoff: record the gross owed + a clear marker;
      // NEVER compute net-to-person or tax-to-NAV (the accountant's job).
      const legalType = profByClient.get(grp.billing_client_id)?.legal_type || 'company';
      const payrollHandoff = legalType === 'private';

      const details = {
        rooms: cost.rooms,
        total_employee_days: cost.totalEmployeeDays,
        billing_basis: rev.basis,
        legal_type: legalType,
        payroll_handoff: payrollHandoff,
        payroll_handoff_note: payrollHandoff ? 'Bérszámfejtendő magánszemély — bruttó összeg; nettó + NAV a könyvelő feladata' : null,
        vat_exempt: rev.vat_exempt,
        revenue_net: rev.net,
        base_net: rev.base_net,
        utility_net: rev.utility_net,
        vat_rate: rev.vat_rate,
        vat_amount: rev.vat,
        gross_amount: rev.gross,
        per_bed: rev.per_bed,   // per_bed_night breakdown (capacity/floor/full/empty bed-nights) or null
        rent_cost: cost.rentCost,
        expense_cost: expenseCost,
        cost: totalCost,
        margin,
        // Compensation pass-through: billed to the megbízó on a separate line; excluded
        // from housing net/margin. Invoice total to megbízó = gross_amount + compensation_amount.
        compensation_amount: compensationAmount,
        compensation_lines: compensationLines,
        computed_at: computedAt,
      };

      await client.query(
        `INSERT INTO accommodation_billings (
           billing_run_id, billing_month, accommodation_id, partner_contractor_id,
           total_amount, vat_amount, gross_amount, cost_amount, margin_amount, total_employee_days,
           payroll_handoff, compensation_amount, calculation_details, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')`,
        [runId, month, grp.accommodation_id, grp.billing_client_id,
         rev.net, rev.vat, rev.gross, totalCost, margin, cost.totalEmployeeDays, payrollHandoff, compensationAmount, details]
      );
    }

    // Compensations whose (accommodation, megbízó) matched no housing group this month
    // (worker not housed here now / megbízó not billed here) — surfaced, never dropped.
    for (const [key, g] of compByGroup.entries()) {
      const [accId, megbizoId] = key.split('|');
      for (const ln of g.lines) unattachedComps.push({ ...ln, accommodation_id: accId, megbizo_id: megbizoId, reason: 'no_matching_group' });
    }

    await client.query(
      `UPDATE billing_runs SET status='calculated', total_amount=$2, partner_count=$3, completed_at=NOW() WHERE id = $1`,
      [runId, grandRevenue, partnerIds.size]
    );

    const summary = {
      run_id: runId, month, run_type: runType, status: 'calculated',
      total_amount: grandRevenue,   // total NET revenue billed (housing only)
      total_gross: grandGross,      // NET + VAT (housing only)
      total_compensation: grandCompensation,  // pass-through billed to megbízók (separate lines)
      billing_count: groups.size,
      partner_count: partnerIds.size,
      groups_no_billing_client: noClientGroups,
      groups_no_rate: noRateGroups,
      skipped_clients: skippedClients.size,   // invoicing_enabled=false → intentionally not billed
      unattached_compensations: unattachedComps.length,  // approved comps with no megbízó / no housing group
      unattached_compensation_detail: unattachedComps,
      replaced_run_id: replacedRunId,
    };
    logger.info(`[billingEngine] ${JSON.stringify(summary)}`);
    return summary;
  });
}

module.exports = { calculateMonthlyBilling, buildCostDetails, computeGroupRevenue, makeRateResolver };
