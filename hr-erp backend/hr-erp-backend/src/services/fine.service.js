/**
 * Fine / Damage Compensation Service — Refined Part C
 *
 * Two payment types share the `compensations` table but follow different
 * lifecycles:
 *
 *   TYPE 'fine'   — fixed amount × residents, paid IMMEDIATELY on-site.
 *                   No "unpaid" terminal state; inspector captures a
 *                   signature per resident and collects cash/card there
 *                   and then.
 *
 *   TYPE 'damage' — actual repair cost, 30-day deadline. If unpaid on
 *                   due_date + 1, daily cron auto-converts the balance
 *                   to a multi-month salary_deduction schedule (no appeal).
 *
 * This service is additive over compensation.service.js — the legacy
 * helpers (createCompensation, issueCompensation, recordPayment, …) still
 * work. New code and the new admin UI should prefer the helpers here.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const legacy = require('./compensation.service');

const TYPES = ['fine', 'damage'];
const DEFAULT_DAMAGE_DAYS = 30;
const DEFAULT_DEDUCTION_MONTHS = 3;

// ─── fine_types CRUD ────────────────────────────────────────────────

async function listFineTypes({ activeOnly = true } = {}) {
  const where = activeOnly ? `WHERE is_active = true` : '';
  const r = await query(`SELECT * FROM fine_types ${where} ORDER BY category, name`);
  return r.rows;
}

async function createFineType({ code, name, amount_per_person, description, category }) {
  if (!code || !name) throw new Error('code and name are required');
  if (amount_per_person == null || Number(amount_per_person) < 0) {
    throw new Error('amount_per_person must be >= 0');
  }
  const r = await query(
    `INSERT INTO fine_types (code, name, amount_per_person, description, category)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [code.toUpperCase(), name, Number(amount_per_person), description || null, category || null]
  );
  return r.rows[0];
}

async function updateFineType(id, payload) {
  const fields = ['name', 'amount_per_person', 'description', 'category', 'is_active'];
  const sets = [];
  const params = [];
  fields.forEach((f) => {
    if (payload[f] !== undefined) {
      params.push(payload[f]);
      sets.push(`${f} = $${params.length}`);
    }
  });
  if (sets.length === 0) return null;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const r = await query(
    `UPDATE fine_types SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

async function deleteFineType(id) {
  await query(`UPDATE fine_types SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
}

// ─── Helpers ────────────────────────────────────────────────────────

async function nextCompensationNumberFine(client, type) {
  // Prefix by type so HSK-… (damage) vs BIR-… (fine) are visually distinct.
  const { rows } = await client.query(`SELECT nextval('compensation_seq') AS seq`);
  const seq = parseInt(rows[0].seq, 10);
  const year = new Date().getFullYear();
  const prefix = type === 'fine' ? 'BIR' : 'HSK';
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDate(dt);
}

// Resolve a payment method to a canonical label for the outer compensation
function canonicalMethod(method) {
  if (['on_site_cash', 'on_site_card'].includes(method)) return 'on_site';
  if (method === 'salary_deduction') return 'salary_deduction';
  if (method === 'bank_transfer' || method === 'transfer') return 'bank_transfer';
  return method || 'mixed';
}

// ─── Core workflows ─────────────────────────────────────────────────

/**
 * Create a FINE from an inspection. The amount is the fine type's
 * per-person figure × number of residents. due_date = today; status
 * starts as 'issued' so the inspector can immediately record on-site
 * payments. The returned object includes the per-resident rows.
 *
 * @param inspectionId          may be null for standalone fines
 * @param fineTypeId
 * @param residents             [{ resident_id?, name, email?, phone? }]
 */
async function createFine(inspectionId, fineTypeId, residents, { userId, roomInspectionId, notes } = {}) {
  if (!fineTypeId) throw new Error('fineTypeId is required');
  if (!Array.isArray(residents) || residents.length === 0) throw new Error('at least one resident is required');
  for (const r of residents) {
    if (!r.name || !r.name.trim()) throw new Error('each resident must have a name');
  }

  const ft = await query(`SELECT * FROM fine_types WHERE id = $1 AND is_active = true`, [fineTypeId]);
  if (ft.rows.length === 0) throw new Error('FINE_TYPE_NOT_FOUND');
  const fineType = ft.rows[0];
  const perPerson = Number(fineType.amount_per_person);
  const total = perPerson * residents.length;
  const today = isoDate();

  return transaction(async (client) => {
    const number = await nextCompensationNumberFine(client, 'fine');

    // Pull the inspection's accommodation if we have one
    let accommodation_id = null;
    let room_id = null;
    if (inspectionId) {
      const i = await client.query(
        `SELECT accommodation_id FROM inspections WHERE id = $1`,
        [inspectionId]
      );
      accommodation_id = i.rows[0]?.accommodation_id || null;
    }
    if (roomInspectionId) {
      const r = await client.query(
        `SELECT room_id FROM room_inspections WHERE id = $1`,
        [roomInspectionId]
      );
      room_id = r.rows[0]?.room_id || null;
    }

    const comp = await client.query(
      `INSERT INTO compensations (
         compensation_number, inspection_id, accommodation_id, room_id,
         type, fine_type_id,
         responsible_name,
         compensation_type, amount_gross, currency,
         description, calculation_notes,
         status, issued_at, issued_date, due_date, remediation_period_days,
         created_by
       ) VALUES (
         $1, $2, $3, $4,
         'fine', $5,
         $6,
         'other', $7, 'HUF',
         $8, $9,
         'issued', NOW(), $10, $10, 0,
         $11
       ) RETURNING *`,
      [
        number,
        inspectionId || null,
        accommodation_id,
        room_id,
        fineTypeId,
        residents.map(r => r.name).join(', '),
        total,
        `${fineType.name} — ${residents.length} fő × ${perPerson.toLocaleString('hu-HU')} HUF`,
        notes || null,
        today,
        userId || null,
      ]
    );
    const compensation = comp.rows[0];

    // Create one compensation_residents row per resident
    const residentRows = [];
    for (const r of residents) {
      const row = await client.query(
        `INSERT INTO compensation_residents (
           compensation_id, resident_id, resident_name, resident_email, resident_phone,
           amount_assigned, status
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending')
         RETURNING *`,
        [compensation.id, r.resident_id || null, r.name.trim(), r.email || null, r.phone || null, perPerson]
      );
      residentRows.push(row.rows[0]);
    }

    // Audit
    await legacy._helpers.logReminder(client, compensation.id, {
      type: 'initial_notification',
      channel: 'in_app',
      subject: `Bírság kiállítva: ${number}`,
      body: `${fineType.name} — ${residents.length} fő × ${perPerson.toLocaleString('hu-HU')} HUF = ${total.toLocaleString('hu-HU')} HUF`,
      metadata: { type: 'fine', fine_type_code: fineType.code, residents: residents.length, total },
      actorUserId: userId,
    });

    return { compensation, residents: residentRows, fineType };
  });
}

/**
 * Create a DAMAGE COMPENSATION from an inspection. Cost is split across
 * residents per explicit allocations (amount or percentage).
 *
 * @param inspectionId
 * @param details      { description, calculation_notes?, items?, total_amount }
 * @param residents    [{ resident_id?, name, email?, phone?, amount? | percentage? }]
 */
async function createDamageCompensation(inspectionId, details, residents, { userId, roomInspectionId, dueDays = DEFAULT_DAMAGE_DAYS } = {}) {
  if (!details || !details.total_amount || Number(details.total_amount) <= 0) {
    throw new Error('details.total_amount is required and must be > 0');
  }
  if (!Array.isArray(residents) || residents.length === 0) throw new Error('at least one resident is required');
  const total = Number(details.total_amount);

  // Resolve allocations: allow either explicit amount or percentage; if
  // neither is given, split evenly.
  const allocations = residents.map((r) => {
    if (r.amount != null) return { ...r, _amount: Number(r.amount) };
    if (r.percentage != null) return { ...r, _amount: Math.round((total * Number(r.percentage)) / 100 * 100) / 100 };
    return { ...r, _amount: Math.round((total / residents.length) * 100) / 100 };
  });
  const allocSum = allocations.reduce((s, a) => s + a._amount, 0);
  if (Math.abs(allocSum - total) > 1) {
    throw new Error(`allocation sum (${allocSum}) does not match total_amount (${total})`);
  }
  // Snap any rounding drift onto the first allocation.
  if (allocSum !== total) allocations[0]._amount += total - allocSum;

  const today = isoDate();
  const due   = addDays(today, dueDays);

  return transaction(async (client) => {
    const number = await nextCompensationNumberFine(client, 'damage');

    let accommodation_id = null;
    let room_id = null;
    if (inspectionId) {
      const i = await client.query(`SELECT accommodation_id FROM inspections WHERE id = $1`, [inspectionId]);
      accommodation_id = i.rows[0]?.accommodation_id || null;
    }
    if (roomInspectionId) {
      const r = await client.query(`SELECT room_id FROM room_inspections WHERE id = $1`, [roomInspectionId]);
      room_id = r.rows[0]?.room_id || null;
    }

    const comp = await client.query(
      `INSERT INTO compensations (
         compensation_number, inspection_id, accommodation_id, room_id,
         type, damage_details,
         responsible_name,
         compensation_type, amount_gross, currency,
         description, calculation_notes,
         status, issued_at, issued_date, due_date, remediation_period_days,
         created_by
       ) VALUES (
         $1, $2, $3, $4,
         'damage', $5,
         $6,
         'damage', $7, 'HUF',
         $8, $9,
         'issued', NOW(), $10, $11, $12,
         $13
       ) RETURNING *`,
      [
        number, inspectionId || null, accommodation_id, room_id,
        details.items ? JSON.stringify({ items: details.items }) : null,
        residents.map(r => r.name).join(', '),
        total,
        details.description || 'Kártérítés',
        details.calculation_notes || null,
        today, due, dueDays,
        userId || null,
      ]
    );
    const compensation = comp.rows[0];

    const residentRows = [];
    for (const r of allocations) {
      const row = await client.query(
        `INSERT INTO compensation_residents (
           compensation_id, resident_id, resident_name, resident_email, resident_phone,
           amount_assigned, status
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending')
         RETURNING *`,
        [compensation.id, r.resident_id || null, r.name.trim(), r.email || null, r.phone || null, r._amount]
      );
      residentRows.push(row.rows[0]);
    }

    await legacy._helpers.logReminder(client, compensation.id, {
      type: 'initial_notification',
      channel: 'in_app',
      subject: `Kártérítés kiállítva: ${number}`,
      body: `${details.description || 'Kár'} — ${residents.length} fő, össz. ${total.toLocaleString('hu-HU')} HUF. Határidő: ${due}`,
      metadata: { type: 'damage', residents: residents.length, total, due_date: due },
      actorUserId: userId,
    });

    return { compensation, residents: residentRows };
  });
}

/**
 * Record an on-site payment for a single resident's share.
 *
 * @param compensationResidentId
 * @param method        'on_site_cash' | 'on_site_card'
 * @param signatureData base64 PNG bytes from the signature pad
 * @param receiptNumber optional receipt id from external terminal
 */
async function recordOnSitePayment(compensationResidentId, { method, signatureData, receiptNumber, notes, userId } = {}) {
  if (!['on_site_cash', 'on_site_card'].includes(method)) {
    throw new Error('method must be on_site_cash or on_site_card');
  }
  if (!signatureData) throw new Error('signatureData is required for on-site payment');

  return transaction(async (client) => {
    const resRes = await client.query(
      `SELECT r.*, c.id AS compensation_id, c.type AS comp_type, c.amount_gross
       FROM compensation_residents r
       JOIN compensations c ON r.compensation_id = c.id
       WHERE r.id = $1 FOR UPDATE`,
      [compensationResidentId]
    );
    if (resRes.rows.length === 0) throw new Error('RESIDENT_NOT_FOUND');
    const resident = resRes.rows[0];
    if (['paid', 'paid_on_site', 'waived'].includes(resident.status)) {
      throw new Error(`Resident already settled: ${resident.status}`);
    }
    const outstanding = Number(resident.amount_assigned) - Number(resident.amount_paid || 0);
    if (outstanding <= 0) throw new Error('Nothing outstanding for this resident');

    // Insert payment; trigger syncs compensation_residents.amount_paid + status
    const pay = await client.query(
      `INSERT INTO compensation_payments
         (compensation_id, compensation_resident_id,
          amount, method, paid_at, reference, notes, recorded_by, receipt_number)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$5)
       RETURNING *`,
      [
        resident.compensation_id, resident.id,
        outstanding, method,
        receiptNumber || null,
        notes || null,
        userId || null,
      ]
    );

    // Update resident with signature + method; trigger already updated status/amount_paid
    const resAfter = await client.query(
      `UPDATE compensation_residents SET
         signature_data = $2,
         signed_at      = NOW(),
         payment_method = $3,
         status         = 'paid_on_site',
         updated_at     = NOW()
       WHERE id = $1 RETURNING *`,
      [resident.id, signatureData, method]
    );

    // Check if all residents now settled → compensation status transition
    await reconcileCompensationStatus(client, resident.compensation_id);

    await legacy._helpers.logReminder(client, resident.compensation_id, {
      type: 'payment_confirmation',
      channel: 'in_app',
      subject: `Helyszíni fizetés rögzítve`,
      body: `${resident.resident_name} — ${outstanding.toLocaleString('hu-HU')} HUF (${method})`,
      metadata: { resident_id: resident.id, method, amount: outstanding, receipt: receiptNumber },
      actorUserId: userId,
    });

    return { payment: pay.rows[0], resident: resAfter.rows[0] };
  });
}

/**
 * Record a regular (non-on-site) payment against a resident.
 */
async function recordResidentPayment(compensationResidentId, { amount, method = 'bank_transfer', reference, notes, paidAt, userId } = {}) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('amount must be > 0');

  return transaction(async (client) => {
    const resRes = await client.query(
      `SELECT r.*, c.id AS compensation_id
       FROM compensation_residents r
       JOIN compensations c ON r.compensation_id = c.id
       WHERE r.id = $1 FOR UPDATE`,
      [compensationResidentId]
    );
    if (resRes.rows.length === 0) throw new Error('RESIDENT_NOT_FOUND');
    const resident = resRes.rows[0];
    const outstanding = Number(resident.amount_assigned) - Number(resident.amount_paid || 0);
    if (amt > outstanding + 0.01) throw new Error(`amount exceeds outstanding (${outstanding})`);

    const pay = await client.query(
      `INSERT INTO compensation_payments
         (compensation_id, compensation_resident_id,
          amount, method, paid_at, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,COALESCE($5, NOW()),$6,$7,$8)
       RETURNING *`,
      [
        resident.compensation_id, resident.id,
        amt, method, paidAt || null, reference || null, notes || null, userId || null,
      ]
    );

    await reconcileCompensationStatus(client, resident.compensation_id);
    return pay.rows[0];
  });
}

/**
 * Convert an unpaid (or partially paid) resident share to a multi-month
 * salary deduction schedule. Callable manually or from the daily cron.
 */
async function convertToSalaryDeduction(compensationResidentId, { months = DEFAULT_DEDUCTION_MONTHS, userId } = {}) {
  if (!months || months <= 0) throw new Error('months must be > 0');

  return transaction(async (client) => {
    const resRes = await client.query(
      `SELECT r.*, c.compensation_number
       FROM compensation_residents r
       JOIN compensations c ON r.compensation_id = c.id
       WHERE r.id = $1 FOR UPDATE`,
      [compensationResidentId]
    );
    if (resRes.rows.length === 0) throw new Error('RESIDENT_NOT_FOUND');
    const resident = resRes.rows[0];
    if (['paid', 'paid_on_site', 'salary_deduction', 'waived'].includes(resident.status)) {
      throw new Error(`Cannot convert from status: ${resident.status}`);
    }
    const outstanding = Number(resident.amount_assigned) - Number(resident.amount_paid || 0);
    if (outstanding <= 0) throw new Error('Nothing outstanding to convert');

    const monthly = Math.ceil((outstanding / months) * 100) / 100;
    const today = new Date();
    const startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    let endY = today.getFullYear();
    let endM = today.getMonth() + 1 + (months - 1);
    while (endM > 12) { endM -= 12; endY += 1; }
    const endMonth = `${endY}-${String(endM).padStart(2, '0')}`;

    await client.query(
      `UPDATE compensation_residents SET
         status = 'salary_deduction',
         salary_deduction_start = $2::date,
         salary_deduction_monthly = $3,
         salary_deduction_months = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [resident.id, `${startMonth}-01`, monthly, months]
    );

    const sd = await client.query(
      `INSERT INTO salary_deductions
         (compensation_id, compensation_resident_id, user_id, employee_name,
          amount_per_period, monthly_amount, periods_total, months_total,
          start_date, end_date, start_month, end_month, status,
          notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$6,$7::date,$8::date,$9,$10,'active',$11,$12)
       RETURNING *`,
      [
        resident.compensation_id,
        resident.id,
        resident.resident_id,
        resident.resident_name,
        monthly,
        months,
        `${startMonth}-01`,
        `${endMonth}-01`,
        startMonth,
        endMonth,
        `Auto-generated from ${resident.compensation_number}, outstanding ${outstanding}`,
        userId || null,
      ]
    );

    await reconcileCompensationStatus(client, resident.compensation_id);

    await legacy._helpers.logReminder(client, resident.compensation_id, {
      type: 'salary_deduction_scheduled',
      channel: 'in_app',
      subject: `Bérlevonás ütemezve: ${resident.resident_name}`,
      body: `${monthly.toLocaleString('hu-HU')} HUF × ${months} hónap (${startMonth}..${endMonth})`,
      metadata: { resident_id: resident.id, monthly, months, start_month: startMonth, end_month: endMonth },
      actorUserId: userId,
    });

    return { salaryDeduction: sd.rows[0], resident: (await client.query(`SELECT * FROM compensation_residents WHERE id = $1`, [resident.id])).rows[0] };
  });
}

/**
 * Reconcile the outer compensations.status based on the state of its
 * residents' rows. Called after any payment or conversion.
 *
 * Rules:
 *   - all residents paid/paid_on_site  → compensation.status 'paid'
 *   - all in salary_deduction          → 'salary_deduction_active'
 *   - mix of paid + salary_deduction   → 'salary_deduction_active'
 *   - any still pending                → leave as 'issued'/'notified'
 */
async function reconcileCompensationStatus(client, compensationId) {
  const r = await client.query(
    `SELECT status, amount_paid, amount_assigned, payment_method FROM compensation_residents WHERE compensation_id = $1`,
    [compensationId]
  );
  if (r.rows.length === 0) return;
  const residents = r.rows;
  const anyPending = residents.some(x => x.status === 'pending');
  const allPaid    = residents.every(x => x.status === 'paid' || x.status === 'paid_on_site' || x.status === 'waived');
  const anySalary  = residents.some(x => x.status === 'salary_deduction');

  let status = null;
  let method = null;
  if (allPaid) {
    status = residents.every(x => x.status === 'paid_on_site') ? 'paid_on_site' : 'paid';
    const methods = [...new Set(residents.filter(x => x.payment_method).map(x => x.payment_method))];
    method = methods.length === 1 ? methods[0] : 'mixed';
  } else if (!anyPending && anySalary) {
    status = 'salary_deduction_active';
    method = 'salary_deduction';
  }

  if (status) {
    const markPaid = status === 'paid' || status === 'paid_on_site';
    await client.query(
      `UPDATE compensations SET
         status = $2,
         payment_method = COALESCE(payment_method, $3),
         paid_at = CASE WHEN $4 AND paid_at IS NULL THEN NOW() ELSE paid_at END,
         updated_at = NOW()
       WHERE id = $1`,
      [compensationId, status, method, markPaid]
    );
  }
}

/**
 * Daily cron entrypoint for the refined Part C workflow.
 * Two responsibilities:
 *   1. For damage compensations past their due_date with any still-pending
 *      resident: auto-convert that resident to salary_deduction
 *   2. Mark salary_deductions whose end_month has passed as 'completed'
 *      and transition the compensation to 'salary_deduction_completed'
 */
async function runAutoConversions() {
  const counters = { converted: 0, completed: 0, skipped: 0, errors: 0 };

  // 1. Auto-convert overdue damage compensations
  const overdue = await query(
    `SELECT cr.id AS resident_id, cr.compensation_id, c.type, c.due_date,
            (cr.amount_assigned - cr.amount_paid) AS outstanding
     FROM compensation_residents cr
     JOIN compensations c ON cr.compensation_id = c.id
     WHERE c.type = 'damage'
       AND c.due_date < CURRENT_DATE
       AND cr.status = 'pending'
       AND (cr.amount_assigned - cr.amount_paid) > 0`
  );
  for (const row of overdue.rows) {
    try {
      await convertToSalaryDeduction(row.resident_id, { months: DEFAULT_DEDUCTION_MONTHS });
      counters.converted++;
    } catch (e) {
      logger.error(`[fine.runAutoConversions:${row.resident_id}] ${e.message}`);
      counters.errors++;
    }
  }

  // 2. Mark completed salary_deductions
  const currentMonth = isoDate().slice(0, 7); // YYYY-MM
  const done = await query(
    `UPDATE salary_deductions
     SET status = 'completed', updated_at = NOW()
     WHERE status = 'active' AND end_month IS NOT NULL AND end_month < $1
     RETURNING compensation_id`,
    [currentMonth]
  );
  counters.completed = done.rows.length;

  // Transition their compensations to salary_deduction_completed
  const compIds = [...new Set(done.rows.map(r => r.compensation_id))];
  for (const cid of compIds) {
    await query(
      `UPDATE compensations
       SET status = 'salary_deduction_completed', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'salary_deduction_active'`,
      [cid]
    );
  }

  logger.info(`[fine.runAutoConversions] ${JSON.stringify(counters)}`);
  return counters;
}

/**
 * Process monthly payroll run: for all active salary deductions whose start
 * month ≤ the target month AND hasn't yet been recorded for that month,
 * create a compensation_payments row and increment months_completed.
 *
 * The trigger on compensation_payments syncs amount_paid on the resident,
 * which in turn cascades to the outer compensation status.
 */
async function processMonthlyDeductions(targetMonth, { userId } = {}) {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) throw new Error('targetMonth must be YYYY-MM');

  return transaction(async (client) => {
    const active = await client.query(
      `SELECT * FROM salary_deductions
       WHERE status = 'active'
         AND start_month IS NOT NULL AND start_month <= $1
         AND end_month   IS NOT NULL AND end_month   >= $1
       FOR UPDATE`,
      [targetMonth]
    );
    const results = { processed: 0, skipped: 0 };
    for (const sd of active.rows) {
      // Idempotent: skip if a payment for this period already exists
      const existing = await client.query(
        `SELECT id FROM compensation_payments
         WHERE compensation_resident_id = $1 AND payroll_period = $2`,
        [sd.compensation_resident_id, targetMonth]
      );
      if (existing.rows.length > 0) { results.skipped++; continue; }

      const nextNumber = (sd.months_completed || 0) + 1;
      await client.query(
        `INSERT INTO compensation_payments
           (compensation_id, compensation_resident_id, amount, method, paid_at,
            payroll_period, deduction_number, recorded_by, notes)
         VALUES ($1,$2,$3,'salary_deduction',NOW(),$4,$5,$6,$7)`,
        [
          sd.compensation_id, sd.compensation_resident_id,
          Number(sd.monthly_amount),
          targetMonth, nextNumber, userId || null,
          `Havi levonás ${nextNumber}/${sd.months_total} (${targetMonth})`,
        ]
      );
      await client.query(
        `UPDATE salary_deductions SET
           months_completed = months_completed + 1,
           periods_completed = COALESCE(periods_completed, 0) + 1,
           amount_deducted = COALESCE(amount_deducted, 0) + $2,
           status = CASE WHEN months_completed + 1 >= months_total THEN 'completed' ELSE status END,
           updated_at = NOW()
         WHERE id = $1`,
        [sd.id, Number(sd.monthly_amount)]
      );
      await reconcileCompensationStatus(client, sd.compensation_id);
      results.processed++;
    }
    logger.info(`[fine.processMonthlyDeductions:${targetMonth}] ${JSON.stringify(results)}`);
    return results;
  });
}

// ─── Reads ──────────────────────────────────────────────────────────

async function listResidentsFor(compensationId) {
  const r = await query(
    `SELECT cr.*,
            u.email AS user_email,
            (cr.amount_assigned - cr.amount_paid) AS outstanding
     FROM compensation_residents cr
     LEFT JOIN users u ON cr.resident_id = u.id
     WHERE cr.compensation_id = $1
     ORDER BY cr.created_at`,
    [compensationId]
  );
  return r.rows;
}

async function listSalaryDeductions({ employeeId, status = 'active', limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (employeeId) { params.push(employeeId); clauses.push(`user_id = $${params.length}`); }
  if (status)     { params.push(status);     clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(limit, 500));
  const r = await query(
    `SELECT sd.*, c.compensation_number, c.type AS compensation_type
     FROM salary_deductions sd
     LEFT JOIN compensations c ON sd.compensation_id = c.id
     ${where}
     ORDER BY sd.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

module.exports = {
  // fine types
  listFineTypes, createFineType, updateFineType, deleteFineType,
  // workflows
  createFine, createDamageCompensation,
  recordOnSitePayment, recordResidentPayment,
  convertToSalaryDeduction, reconcileCompensationStatus,
  runAutoConversions, processMonthlyDeductions,
  // reads
  listResidentsFor, listSalaryDeductions,
  _helpers: { nextCompensationNumberFine, addDays, isoDate, canonicalMethod, TYPES, DEFAULT_DAMAGE_DAYS, DEFAULT_DEDUCTION_MONTHS },
};
