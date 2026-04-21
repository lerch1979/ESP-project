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

/** Bump the escalation ladder by one level, logging a reminder. */
async function escalateCompensation(id, { reminderType, reason, userId } = {}) {
  return transaction(async (client) => {
    const cur = await client.query(`SELECT * FROM compensations WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('COMPENSATION_NOT_FOUND');
    const c = cur.rows[0];
    if (!ACTIVE_STATUSES.includes(c.status)) {
      throw new Error(`Cannot escalate from status: ${c.status}`);
    }
    const nextLevel = Math.min(3, (c.escalation_level || 0) + 1);
    const becomesEscalated = nextLevel === 3;

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

  const [payments, reminders] = await Promise.all([
    query(`SELECT * FROM compensation_payments WHERE compensation_id = $1 ORDER BY paid_at DESC`, [id]),
    query(`SELECT * FROM compensation_reminders WHERE compensation_id = $1 ORDER BY sent_at DESC`, [id]),
  ]);

  return {
    ...format(r.rows[0]),
    payments: payments.rows,
    reminders: reminders.rows,
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

  const counters = { firstReminder: 0, finalWarning: 0, escalated: 0, skipped: 0 };
  for (const row of due.rows) {
    const daysPastDue = Number(row.days_past_due);
    const lvl = row.escalation_level || 0;

    try {
      if (daysPastDue === -1 && lvl < 1) {
        await escalateCompensation(row.id, { reminderType: 'first_reminder' });
        counters.firstReminder++;
      } else if (daysPastDue >= 0 && daysPastDue < 7 && lvl < 2) {
        await escalateCompensation(row.id, { reminderType: 'final_warning' });
        counters.finalWarning++;
      } else if (daysPastDue >= 7 && lvl < 3) {
        await escalateCompensation(row.id, { reminderType: 'escalation' });
        counters.escalated++;
      } else {
        counters.skipped++;
      }
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
  format,
  _helpers: { nextCompensationNumber, logReminder, ACTIVE_STATUSES, TYPES },
};
