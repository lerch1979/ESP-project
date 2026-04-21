/**
 * Compensation Service
 *
 * Business rules for the claims workflow. The controller is a thin wrapper
 * around these helpers; cron and tests also invoke them directly.
 *
 * Status machine:
 *   draft → issued → notified → {disputed, partial_paid, paid}
 *   partial_paid → paid (on final payment)
 *   issued/notified/disputed/partial_paid → escalated (after missed deadline)
 *   any → waived (admin action)
 *   any → closed (archival)
 *
 * Escalation ladder (driven by cron — runDailyEscalations):
 *   level 0 (initial)     : issued_at; no reminder yet
 *   level 1 (first)       : 1 day before due_date        → first_reminder
 *   level 2 (final)       : on or after due_date         → final_warning
 *   level 3 (legal/payroll): 7+ days past due            → escalation
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

const ACTIVE_STATUSES = ['issued', 'notified', 'disputed', 'partial_paid'];
const TYPES = ['damage', 'cleaning', 'late_payment', 'contract_violation', 'other'];

// Reminder cadence (ladder steps, in days relative to due_date):
//   -3  : first_reminder   (level 1)
//   0   : final_warning    (level 2)
//   +15 : serious_overdue  (level 3)
//   +30 : escalation       (level 4, status → escalated)
const REMINDER_CADENCE = [
  { daysFromDue: -3, minLevel: 1, type: 'first_reminder',    setStatus: null },
  { daysFromDue:  0, minLevel: 2, type: 'final_warning',     setStatus: null },
  { daysFromDue: 15, minLevel: 3, type: 'serious_overdue',   setStatus: null },
  { daysFromDue: 30, minLevel: 4, type: 'escalation',        setStatus: 'escalated' },
];

async function nextCompensationNumber(client) {
  // `client` is a pg Client (inside a transaction) with a `.query()` method;
  // `query` is a free function. Handle both.
  const runner = client ? (sql, args) => client.query(sql, args) : query;
  const r = await runner(`SELECT nextval('compensation_seq') AS seq`);
  const seq = parseInt(r.rows[0].seq, 10);
  const year = new Date().getFullYear();
  return `HSK-${year}-${String(seq).padStart(4, '0')}`;
}

function format(row) {
  if (!row) return null;
  return {
    id: row.id,
    compensationNumber: row.compensation_number,
    inspectionId: row.inspection_id,
    damageId: row.damage_id,
    roomId: row.room_id,
    accommodationId: row.accommodation_id,
    accommodationName: row.accommodation_name || null,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    responsibleEmail: row.responsible_email,
    responsiblePhone: row.responsible_phone,
    compensationType: row.compensation_type,
    amountGross: row.amount_gross != null ? Number(row.amount_gross) : null,
    amountPaid:  row.amount_paid  != null ? Number(row.amount_paid)  : 0,
    amountOutstanding: row.amount_gross != null
      ? Math.max(0, Number(row.amount_gross) - Number(row.amount_paid || 0))
      : null,
    currency: row.currency,
    description: row.description,
    calculationNotes: row.calculation_notes,
    status: row.status,
    issuedAt: row.issued_at,
    dueDate: row.due_date,
    remediationPeriodDays: row.remediation_period_days,
    escalationLevel: row.escalation_level,
    lastReminderAt: row.last_reminder_at,
    escalatedAt: row.escalated_at,
    waivedAt: row.waived_at,
    waivedReason: row.waived_reason,
    paidAt: row.paid_at,
    closedAt: row.closed_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Core operations ────────────────────────────────────────────────

/**
 * Create a new compensation claim. If `issue = true` the status is bumped
 * straight to 'issued' (issued_at = now, due_date computed from the
 * remediation period).
 */
async function createCompensation(payload, { userId, issue = false } = {}) {
  const {
    inspection_id, damage_id, room_id, accommodation_id,
    responsible_user_id, responsible_name, responsible_email, responsible_phone,
    compensation_type,
    amount_gross, currency = 'HUF',
    description, calculation_notes,
    remediation_period_days = 14,
    due_date,
  } = payload || {};

  if (!compensation_type || !TYPES.includes(compensation_type)) {
    throw new Error(`compensation_type must be one of: ${TYPES.join(', ')}`);
  }
  if (amount_gross == null || Number(amount_gross) < 0) {
    throw new Error('amount_gross is required and must be >= 0');
  }
  if (!description || description.trim().length === 0) {
    throw new Error('description is required');
  }
  if (!responsible_name && !responsible_user_id) {
    throw new Error('Either responsible_user_id or responsible_name is required');
  }

  return transaction(async (client) => {
    const number = await nextCompensationNumber(client);
    const status = issue ? 'issued' : 'draft';
    const issuedAt = issue ? new Date() : null;
    const computedDueDate = due_date
      ? due_date
      : (issue
          ? new Date(Date.now() + remediation_period_days * 24 * 60 * 60 * 1000)
              .toISOString().slice(0, 10)
          : null);

    const r = await client.query(
      `INSERT INTO compensations (
         compensation_number, inspection_id, damage_id, room_id, accommodation_id,
         responsible_user_id, responsible_name, responsible_email, responsible_phone,
         compensation_type, amount_gross, currency,
         description, calculation_notes,
         status, issued_at, due_date, remediation_period_days,
         created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        number, inspection_id || null, damage_id || null, room_id || null, accommodation_id || null,
        responsible_user_id || null, responsible_name || null, responsible_email || null, responsible_phone || null,
        compensation_type, Number(amount_gross), currency,
        description, calculation_notes || null,
        status, issuedAt, computedDueDate, remediation_period_days,
        userId || null,
      ]
    );
    return r.rows[0];
  });
}

/** Transition a draft → issued (generates issued_at + due_date if missing). */
async function issueCompensation(id, { userId } = {}) {
  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (c.status !== 'draft') throw new Error(`Cannot issue from status: ${c.status}`);

    const periodDays = c.remediation_period_days || 14;
    const dueDate = c.due_date
      ? c.due_date
      : new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const r = await client.query(
      `UPDATE compensations SET
         status = 'issued',
         issued_at = NOW(),
         due_date = $2,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, dueDate]
    );
    await logReminder(client, id, {
      type: 'initial_notification',
      channel: 'in_app',
      subject: `Kártérítési értesítő: ${c.compensation_number}`,
      body: `Kártérítési értesítő kiállítva. Összeg: ${Number(c.amount_gross).toLocaleString('hu-HU')} ${c.currency}. Határidő: ${dueDate}.`,
      metadata: { amount: Number(c.amount_gross), due_date: dueDate, escalation_level: 0 },
      sentTo: c.responsible_user_id,
      sentToName: c.responsible_name,
      actorUserId: userId,
    });
    return r.rows[0];
  });
}

/** Record a payment; the DB trigger syncs amount_paid + status. */
async function recordPayment(compensationId, payload, { userId } = {}) {
  const { amount, paid_at, method, reference, notes } = payload || {};
  if (amount == null || Number(amount) <= 0) throw new Error('amount must be > 0');

  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [compensationId]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (['waived', 'closed'].includes(c.status)) {
      throw new Error(`Cannot record payment for status: ${c.status}`);
    }

    const remaining = Number(c.amount_gross) - Number(c.amount_paid || 0);
    if (Number(amount) > remaining + 0.01) {
      throw new Error(`Payment (${amount}) exceeds outstanding balance (${remaining})`);
    }

    const pay = await client.query(
      `INSERT INTO compensation_payments
         (compensation_id, amount, paid_at, method, reference, notes, recorded_by)
       VALUES ($1,$2,COALESCE($3, NOW()),$4,$5,$6,$7) RETURNING *`,
      [compensationId, Number(amount), paid_at || null, method || null, reference || null, notes || null, userId || null]
    );

    // Re-read compensation post-trigger for status update
    const after = await client.query(`SELECT * FROM compensations WHERE id = $1`, [compensationId]);
    if (after.rows[0].status === 'paid') {
      await logReminder(client, compensationId, {
        type: 'payment_confirmation',
        channel: 'in_app',
        subject: 'Kártérítés kiegyenlítve',
        body: `A ${after.rows[0].compensation_number} számú kártérítés teljes összegben kiegyenlítve.`,
        sentTo: c.responsible_user_id,
        sentToName: c.responsible_name,
        actorUserId: userId,
      });
    }
    return { payment: pay.rows[0], compensation: after.rows[0] };
  });
}

/** Waive the remaining balance (admin action). Writes a waiver entry. */
async function waiveCompensation(id, { reason, userId }) {
  if (!reason || reason.trim().length === 0) throw new Error('reason is required');
  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (['waived', 'closed', 'paid'].includes(c.status)) {
      throw new Error(`Cannot waive from status: ${c.status}`);
    }
    const r = await client.query(
      `UPDATE compensations SET
         status = 'waived',
         waived_at = NOW(),
         waived_reason = $2,
         waived_by = $3,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, reason, userId || null]
    );
    await logReminder(client, id, {
      type: 'waiver',
      channel: 'in_app',
      subject: 'Kártérítés elengedve',
      body: `Indoklás: ${reason}`,
      metadata: { waived_by: userId, reason },
      actorUserId: userId,
    });
    return r.rows[0];
  });
}

/**
 * Bump the escalation ladder by one level (or to a specified level),
 * logging a reminder. Caps at 4 (legal referral → status='escalated').
 */
async function escalateCompensation(id, { reminderType, reason, userId, targetLevel, setStatus } = {}) {
  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (!ACTIVE_STATUSES.includes(c.status)) {
      throw new Error(`Cannot escalate from status: ${c.status}`);
    }
    const nextLevel = targetLevel != null
      ? Math.min(4, Math.max(c.escalation_level || 0, targetLevel))
      : Math.min(4, (c.escalation_level || 0) + 1);
    const becomesEscalated = setStatus === 'escalated' || nextLevel === 4;

    const r = await client.query(
      `UPDATE compensations SET
         escalation_level = $2,
         last_reminder_at = NOW(),
         escalated_at = CASE WHEN $3 AND escalated_at IS NULL THEN NOW() ELSE escalated_at END,
         status = CASE WHEN $3 THEN 'escalated' ELSE status END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, nextLevel, becomesEscalated]
    );

    const fallbackType = nextLevel === 1 ? 'first_reminder'
                       : nextLevel === 2 ? 'final_warning'
                       : nextLevel === 3 ? 'serious_overdue'
                       : 'escalation';
    await logReminder(client, id, {
      type: reminderType || fallbackType,
      channel: 'in_app',
      subject: `Kártérítési emlékeztető — ${fallbackType}`,
      body: reason || `Escalation level ${nextLevel}. Határidő: ${c.due_date}.`,
      metadata: { escalation_level: nextLevel, due_date: c.due_date, amount: Number(c.amount_gross) },
      sentTo: c.responsible_user_id,
      sentToName: c.responsible_name,
      actorUserId: userId,
    });
    return r.rows[0];
  });
}

// ─── Responsibility allocation ──────────────────────────────────────

/**
 * Replace the set of responsibilities for a compensation. `parties` is an
 * array of { user_id?, name, email?, phone?, percentage }. Percentages
 * must sum to 100. Each row's amount_allocated is auto-computed from the
 * parent compensation's amount_gross.
 */
async function allocateResponsibilities(compensationId, parties, { userId } = {}) {
  if (!Array.isArray(parties) || parties.length === 0) {
    throw new Error('At least one party is required');
  }
  const totalPct = parties.reduce((s, p) => s + Number(p.percentage || 0), 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Percentages must sum to 100 (got ${totalPct})`);
  }
  for (const p of parties) {
    if (!p.name || !p.name.trim()) throw new Error('Each party must have a name');
    if (p.percentage <= 0 || p.percentage > 100) throw new Error('Each percentage must be in (0, 100]');
  }

  return transaction(async (client) => {
    const cur = await client.query(`SELECT id, amount_gross FROM compensations WHERE id = $1 FOR UPDATE`, [compensationId]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const gross = Number(cur.rows[0].amount_gross);

    await client.query(`DELETE FROM compensation_responsibilities WHERE compensation_id = $1`, [compensationId]);

    const inserted = [];
    for (const p of parties) {
      const pct = Number(p.percentage);
      const allocated = Math.round(gross * pct) / 100;
      const r = await client.query(
        `INSERT INTO compensation_responsibilities
           (compensation_id, user_id, name, email, phone, percentage, amount_allocated)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [compensationId, p.user_id || null, p.name.trim(), p.email || null, p.phone || null, pct, allocated]
      );
      inserted.push(r.rows[0]);
    }

    await logReminder(client, compensationId, {
      type: 'allocation_notified',
      channel: 'in_app',
      subject: 'Felelősség allokáció',
      body: `${parties.length} felelős fél allokálva (${parties.map(p => `${p.name}: ${p.percentage}%`).join(', ')}).`,
      metadata: { parties: parties.map(p => ({ name: p.name, pct: Number(p.percentage) })) },
      actorUserId: userId,
    });

    return inserted;
  });
}

async function listResponsibilities(compensationId) {
  const r = await query(
    `SELECT r.*,
            u.email AS user_email
     FROM compensation_responsibilities r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.compensation_id = $1
     ORDER BY r.percentage DESC, r.created_at`,
    [compensationId]
  );
  return r.rows;
}

// ─── Dispute workflow ───────────────────────────────────────────────

/**
 * Submit a dispute. Can be called by the responsible party or by an admin
 * on their behalf. Transitions status → 'disputed' and freezes the
 * escalation ladder until resolved.
 */
async function submitDispute(id, { reason, userId }) {
  if (!reason || !reason.trim()) throw new Error('reason is required');

  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (!['issued', 'notified', 'partial_paid'].includes(c.status)) {
      throw new Error(`Cannot dispute from status: ${c.status}`);
    }

    const r = await client.query(
      `UPDATE compensations SET
         status = 'disputed',
         disputed_at = NOW(),
         dispute_reason = $2,
         dispute_submitted_by = $3,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, reason, userId || null]
    );

    await logReminder(client, id, {
      type: 'dispute_submitted',
      channel: 'in_app',
      subject: 'Vitatás bejelentve',
      body: `Indoklás: ${reason}`,
      metadata: { submitted_by: userId, reason },
      actorUserId: userId,
    });
    return r.rows[0];
  });
}

/**
 * Resolve a dispute. `outcome` drives what happens next:
 *   - 'upheld'    → return to active state (issued/partial_paid) at full amount
 *   - 'reduced'   → return to active state with new_amount_gross
 *   - 'dismissed' → waive the remainder (status → waived)
 */
async function resolveDispute(id, { outcome, notes, newAmount, userId }) {
  if (!['upheld', 'reduced', 'dismissed'].includes(outcome)) {
    throw new Error('outcome must be: upheld | reduced | dismissed');
  }
  if (outcome === 'reduced' && (newAmount == null || Number(newAmount) < 0)) {
    throw new Error('newAmount is required for outcome=reduced');
  }

  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (c.status !== 'disputed') {
      throw new Error(`Cannot resolve dispute from status: ${c.status}`);
    }

    let nextStatus;
    let nextAmount = Number(c.amount_gross);
    const originalAmount = c.original_amount_gross != null ? Number(c.original_amount_gross) : Number(c.amount_gross);

    if (outcome === 'upheld') {
      nextStatus = Number(c.amount_paid) > 0 ? 'partial_paid' : 'issued';
    } else if (outcome === 'reduced') {
      nextAmount = Number(newAmount);
      if (Number(c.amount_paid) >= nextAmount && nextAmount > 0) nextStatus = 'paid';
      else if (Number(c.amount_paid) > 0) nextStatus = 'partial_paid';
      else nextStatus = 'issued';
    } else {
      nextStatus = 'waived';
    }

    const isWaived = nextStatus === 'waived';
    const isPaid   = nextStatus === 'paid';
    const r = await client.query(
      `UPDATE compensations SET
         status = $2,
         dispute_resolution = $3,
         dispute_resolution_notes = $4,
         resolved_at = NOW(),
         amount_gross = $5,
         original_amount_gross = COALESCE(original_amount_gross, $6),
         waived_at = CASE WHEN $8 THEN NOW() ELSE waived_at END,
         waived_reason = CASE WHEN $8 THEN COALESCE(waived_reason, $4) ELSE waived_reason END,
         waived_by = CASE WHEN $8 THEN $7 ELSE waived_by END,
         paid_at = CASE WHEN $9 AND paid_at IS NULL THEN NOW() ELSE paid_at END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, nextStatus, outcome, notes || null, nextAmount, originalAmount, userId || null, isWaived, isPaid]
    );

    await logReminder(client, id, {
      type: 'dispute_resolved',
      channel: 'in_app',
      subject: `Vitatás lezárva: ${outcome}`,
      body: notes || outcome,
      metadata: { outcome, new_amount: nextAmount, resolved_by: userId },
      actorUserId: userId,
    });
    return r.rows[0];
  });
}

// ─── Salary deduction ───────────────────────────────────────────────

/**
 * Schedule a multi-period salary deduction against the compensation. Does
 * NOT actually hit payroll — that integration is a separate concern. This
 * just records the plan and updates the compensation reminder log.
 */
async function scheduleSalaryDeduction(compensationId, payload, { userId } = {}) {
  const {
    responsibility_id,
    user_id,
    employee_name,
    amount_per_period,
    periods_total,
    start_date,
  } = payload || {};

  if (!employee_name) throw new Error('employee_name is required');
  if (!amount_per_period || Number(amount_per_period) <= 0) throw new Error('amount_per_period must be > 0');
  if (!periods_total || Number(periods_total) <= 0) throw new Error('periods_total must be > 0');
  if (!start_date) throw new Error('start_date is required');

  // Compute end_date in pure integer arithmetic to avoid DST/timezone drift.
  // periods_total represents full monthly cycles from start_date.
  const [ys, ms, ds] = start_date.split('-').map(Number);
  let endY = ys, endM = ms + Number(periods_total) - 1;
  while (endM > 12) { endM -= 12; endY += 1; }
  const endStr = `${endY}-${String(endM).padStart(2, '0')}-${String(ds).padStart(2, '0')}`;

  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1`, [compensationId]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');

    const r = await client.query(
      `INSERT INTO salary_deductions
         (compensation_id, responsibility_id, user_id, employee_name,
          amount_per_period, periods_total, start_date, end_date, status,
          notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9,$10) RETURNING *`,
      [
        compensationId,
        responsibility_id || null,
        user_id || null,
        employee_name,
        Number(amount_per_period),
        Number(periods_total),
        start_date,
        endStr,
        payload.notes || null,
        userId || null,
      ]
    );

    await logReminder(client, compensationId, {
      type: 'salary_deduction_scheduled',
      channel: 'in_app',
      subject: 'Bérlevonás ütemezve',
      body: `${employee_name}: ${Number(amount_per_period).toLocaleString('hu-HU')} HUF × ${periods_total} hónap, kezdés: ${start_date}`,
      metadata: {
        amount_per_period: Number(amount_per_period),
        periods_total: Number(periods_total),
        start_date,
      },
      actorUserId: userId,
    });

    return r.rows[0];
  });
}

async function listSalaryDeductions(compensationId) {
  const r = await query(
    `SELECT * FROM salary_deductions WHERE compensation_id = $1 ORDER BY created_at DESC`,
    [compensationId]
  );
  return r.rows;
}

// ─── Email notification ─────────────────────────────────────────────

/**
 * Email the compensation notice PDF to the responsible party (or all of
 * them, if responsibilities are allocated). Re-uses the existing SMTP
 * config; is a no-op when SMTP credentials aren't configured.
 */
async function sendNoticeEmail(compensationId, { userId } = {}) {
  const nodemailer = require('nodemailer');
  const pdfSvc = require('./inspectionPDF.service');

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('[compensation.sendNoticeEmail] SMTP not configured — skipping');
    return { skipped: true, reason: 'SMTP_NOT_CONFIGURED' };
  }

  const cur = await query(`SELECT * FROM compensations WHERE id = $1`, [compensationId]);
  if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
  const c = cur.rows[0];

  const responsibilities = await listResponsibilities(compensationId);
  const recipients = responsibilities.length > 0
    ? responsibilities.filter(r => r.email).map(r => ({ email: r.email, name: r.name }))
    : (c.responsible_email ? [{ email: c.responsible_email, name: c.responsible_name }] : []);

  if (recipients.length === 0) {
    return { skipped: true, reason: 'NO_EMAIL_ON_FILE' };
  }

  // Render PDF into a buffer
  const doc = await pdfSvc.generateCompensationNotice(compensationId);
  const chunks = [];
  await new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const subject = `Kártérítési értesítő – ${c.compensation_number}`;
  const body = [
    `Tisztelt Címzett!`,
    ``,
    `Mellékletben küldjük a(z) ${c.compensation_number} számú kártérítési értesítőt.`,
    ``,
    `Fizetendő összeg: ${Number(c.amount_gross).toLocaleString('hu-HU')} ${c.currency}`,
    `Fizetési határidő: ${c.due_date}`,
    ``,
    `Housing Solutions Kft.`,
  ].join('\n');

  const results = [];
  for (const recipient of recipients) {
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: recipient.email,
        subject,
        text: body,
        attachments: [{
          filename: `karteriteses-ertesito-${c.compensation_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });
      results.push({ to: recipient.email, ok: true, messageId: info.messageId });
    } catch (err) {
      logger.error(`[compensation.sendNoticeEmail] ${recipient.email}:`, err.message);
      results.push({ to: recipient.email, ok: false, error: err.message });
    }
  }

  await transaction(async (client) => {
    await client.query(
      `UPDATE compensations SET status = 'notified', updated_at = NOW()
       WHERE id = $1 AND status = 'issued'`,
      [compensationId]
    );
    for (const r of results) {
      await logReminder(client, compensationId, {
        type: 'initial_notification',
        channel: 'email',
        subject,
        body,
        metadata: { recipient: r.to, delivery: r.ok ? 'sent' : 'failed', error: r.error || null },
        actorUserId: userId,
      });
    }
  });

  return { sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
}

async function logReminder(client, compensationId, r) {
  await client.query(
    `INSERT INTO compensation_reminders
       (compensation_id, reminder_type, sent_to, sent_to_name, sent_channel,
        subject, body, metadata, delivery_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent')`,
    [
      compensationId,
      r.type,
      r.sentTo || null,
      r.sentToName || null,
      r.channel || 'in_app',
      r.subject || null,
      r.body || null,
      r.metadata ? JSON.stringify(r.metadata) : null,
    ]
  );
}

// ─── Read queries ───────────────────────────────────────────────────

async function listCompensations(filters = {}) {
  const { status, accommodation_id, responsible_user_id, overdue, limit = 50, offset = 0 } = filters;
  const clauses = [];
  const params = [];
  const push = (clause, ...vals) => {
    const placeholders = vals.map((_, i) => `$${params.length + i + 1}`);
    clauses.push(clause.replace(/\?\?/g, () => placeholders.shift()));
    params.push(...vals);
  };

  if (status) push('c.status = ??', status);
  if (accommodation_id) push('c.accommodation_id = ??', accommodation_id);
  if (responsible_user_id) push('c.responsible_user_id = ??', responsible_user_id);
  if (overdue === 'true' || overdue === true) {
    push('c.due_date < CURRENT_DATE');
    push(`c.status IN ('issued','notified','disputed','partial_paid')`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  const list = await query(
    `SELECT c.*,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS created_by_name
     FROM compensations c
     LEFT JOIN accommodations a ON c.accommodation_id = a.id
     LEFT JOIN users u ON c.created_by = u.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, lim, off]
  );
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM compensations c ${where}`,
    params
  );
  return {
    data: list.rows.map(format),
    pagination: { total: count.rows[0].total, limit: lim, offset: off },
  };
}

async function getCompensation(id) {
  const r = await query(
    `SELECT c.*,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS created_by_name
     FROM compensations c
     LEFT JOIN accommodations a ON c.accommodation_id = a.id
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;

  const [payments, reminders, responsibilities, deductions] = await Promise.all([
    query(`SELECT * FROM compensation_payments WHERE compensation_id = $1 ORDER BY paid_at DESC`, [id]),
    query(`SELECT * FROM compensation_reminders WHERE compensation_id = $1 ORDER BY sent_at DESC`, [id]),
    listResponsibilities(id),
    listSalaryDeductions(id),
  ]);

  return {
    ...format(r.rows[0]),
    payments: payments.rows,
    reminders: reminders.rows,
    responsibilities,
    salaryDeductions: deductions,
  };
}

// ─── Cron entrypoint ────────────────────────────────────────────────

/**
 * Daily sweep over active compensations. Emits reminders based on the
 * escalation ladder (see module docstring). Returns a summary for logging.
 */
async function runDailyEscalations() {
  const due = await query(
    `SELECT id, escalation_level, due_date,
            (CURRENT_DATE - due_date) AS days_past_due
     FROM compensations
     WHERE status = ANY($1)
       AND due_date IS NOT NULL`,
    [ACTIVE_STATUSES]
  );

  const counters = { firstReminder: 0, finalWarning: 0, seriousOverdue: 0, escalated: 0, skipped: 0 };
  for (const row of due.rows) {
    const daysPastDue = Number(row.days_past_due);
    const lvl = row.escalation_level || 0;

    // Find the highest eligible step whose threshold has been reached,
    // then jump to that level (so a compensation that suddenly became
    // 20 days overdue goes straight to serious_overdue, not through all
    // the intermediate steps).
    const eligible = REMINDER_CADENCE.filter(s => daysPastDue >= s.daysFromDue);
    if (eligible.length === 0) { counters.skipped++; continue; }
    const step = eligible[eligible.length - 1];
    if (lvl >= step.minLevel) { counters.skipped++; continue; }

    try {
      await escalateCompensation(row.id, {
        reminderType: step.type,
        targetLevel: step.minLevel,
        setStatus: step.setStatus,
      });
      const key = step.type === 'first_reminder'  ? 'firstReminder'
                : step.type === 'final_warning'   ? 'finalWarning'
                : step.type === 'serious_overdue' ? 'seriousOverdue'
                : 'escalated';
      counters[key]++;
    } catch (e) {
      logger.error(`[compensation.escalation:${row.id}]`, e.message);
      counters.skipped++;
    }
  }

  logger.info(`[compensation.runDailyEscalations] ${JSON.stringify(counters)}`);
  return counters;
}

module.exports = {
  createCompensation,
  issueCompensation,
  recordPayment,
  waiveCompensation,
  escalateCompensation,
  listCompensations,
  getCompensation,
  runDailyEscalations,
  // Advanced features (ext. spec)
  allocateResponsibilities,
  listResponsibilities,
  submitDispute,
  resolveDispute,
  scheduleSalaryDeduction,
  listSalaryDeductions,
  sendNoticeEmail,
  format,
  _helpers: { nextCompensationNumber, logReminder, ACTIVE_STATUSES, TYPES, REMINDER_CADENCE },
};
