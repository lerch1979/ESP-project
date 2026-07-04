/**
 * GDPR anonymization (right-to-be-forgotten) — v1.
 *
 * One engine, two entry points (manual GDPR request + grace-period proposal),
 * one dry-run → execute flow. Irreversible: DB mutations are one-way and files
 * are physically unlinked. Pseudonymizing the users/employees master record makes
 * the author display cascade to "TÖRÖLT-<id8>" everywhere it is joined (tickets,
 * messages, chatbot), so operational records stay intact with no edits.
 *
 * Disposition (decisions locked with the user — configurable knobs in anonymization_config):
 *   • employees     — name → pseudonym, all other PII NULLed, anonymized_at set; profile photo file deleted.
 *   • users         — deactivated (blocks login + existing tokens), email scrambled, password randomized.
 *   • documents     — non-statutory scans physically DELETED (file + row); statutory types KEPT.
 *   • health/wellbeing — hard DELETE.
 *   • financial     — KEPT (statutory retention), denormalized names → pseudonym, contacts NULLed.
 *   • tickets/messages/attachments/chatbot/translation_cache — KEPT INTACT (authorship cascades).
 *   • notifications for/about the subject — deleted.
 *   • SKIPPED v1 (documented v2): activity_logs JSONB scrubbing, translation_cache purge.
 *
 * The anonymization_log records WHO/WHEN/WHY + COUNTS only — never the removed values.
 */
const crypto = require('crypto');
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const storage = require('./storage.service');
const inApp = require('./inAppNotification.service');

const PSEUDO_PREFIX = 'TÖRÖLT-';
const pseudonym = (employeeId) => PSEUDO_PREFIX + String(employeeId).slice(0, 8);

// employees columns NULLed outright (everything except the retained skeleton:
// id, contractor_id, user_id, employee_number, status_id, start_date, end_date).
const EMPLOYEE_NULL_FIELDS = [
  'gender', 'birth_date', 'birth_place', 'mothers_name', 'marital_status', 'nationality',
  'passport_number', 'tax_id', 'social_security_number', 'bank_account', 'visa_expiry',
  'company_email', 'personal_email', 'company_phone', 'personal_phone',
  'permanent_address_zip', 'permanent_address_country', 'permanent_address_county',
  'permanent_address_city', 'permanent_address_street', 'permanent_address_number',
  'company_name', 'profile_photo_url', 'room_number',
];

// Health / wellbeing — hard delete. {table, col} keyed on the subject's user_id
// unless noted employee_id. (v_* are views — excluded.)
const HEALTH_DELETE = [
  { table: 'wellmind_assessments', col: 'user_id' },
  { table: 'wellmind_coaching_sessions', col: 'user_id' },
  { table: 'wellmind_interventions', col: 'user_id' },
  { table: 'wellmind_ml_predictions', col: 'user_id' },
  { table: 'wellmind_pulse_surveys', col: 'user_id' },
  { table: 'wellbeing_sentiment_analysis', col: 'user_id' },
  { table: 'wellbeing_feedback', col: 'user_id' },
  { table: 'wellbeing_notifications', col: 'user_id' },
  { table: 'wellbeing_points', col: 'user_id' },
  { table: 'wellbeing_referrals', col: 'user_id' },
  { table: 'wellbeing_streaks', col: 'user_id' },
  { table: 'pulse_question_history', col: 'user_id' },
  { table: 'user_nlp_consent', col: 'user_id' },
  { table: 'user_badges', col: 'user_id' },
  { table: 'slack_checkin_messages', col: 'user_id' },
  { table: 'carepath_cases', col: 'user_id' },
  { table: 'carepath_provider_bookings', col: 'user_id' },
  { table: 'medical_appointments', col: 'employee_id' },
];

// Run a statement, tolerating a missing optional table (42P01) so the engine is
// robust across environments where a feature's tables aren't present.
async function safeExec(exec, sql, params) {
  try { const r = await exec(sql, params); return r.rowCount || 0; }
  catch (e) { if (e.code === '42P01' || e.code === '42703') return 0; throw e; }
}

async function getConfig() {
  const r = await query('SELECT * FROM anonymization_config ORDER BY updated_at ASC LIMIT 1');
  return r.rows[0] || { retention_grace_months: 24, backup_retention_days: 30, statutory_document_types: [], reminder_enabled: true };
}

async function setConfig({ retention_grace_months, backup_retention_days, statutory_document_types, reminder_enabled, updatedBy } = {}) {
  const cur = await getConfig();
  await query(
    `UPDATE anonymization_config
        SET retention_grace_months = $1, backup_retention_days = $2,
            statutory_document_types = $3, reminder_enabled = $4,
            updated_by = $5, updated_at = NOW()
      WHERE id = (SELECT id FROM anonymization_config ORDER BY updated_at ASC LIMIT 1)`,
    [
      Number.isInteger(retention_grace_months) ? retention_grace_months : cur.retention_grace_months,
      Number.isInteger(backup_retention_days) ? backup_retention_days : cur.backup_retention_days,
      Array.isArray(statutory_document_types) ? statutory_document_types : cur.statutory_document_types,
      typeof reminder_enabled === 'boolean' ? reminder_enabled : cur.reminder_enabled,
      updatedBy || null,
    ]
  );
  return getConfig();
}

async function getSubject(employeeId) {
  const r = await query(
    `SELECT id, user_id, first_name, last_name, end_date, anonymized_at FROM employees WHERE id = $1`,
    [employeeId]
  );
  return r.rows[0] || null;
}

// Map a stored file path to the storage-relative path (storage root strips uploads/).
function toRelPath(p) {
  if (!p) return null;
  return String(p).replace(/^\/?uploads\//, '').replace(/^\/+/, '');
}

// Gather everything that WOULD change, without mutating. Powers dry-run + the summary.
async function buildPlan(employeeId) {
  const subject = await getSubject(employeeId);
  if (!subject) return { notFound: true };
  if (subject.anonymized_at) return { alreadyAnonymized: true, anonymized_at: subject.anonymized_at };

  const config = await getConfig();
  const uid = subject.user_id;
  const statutory = config.statutory_document_types || [];

  const cnt = async (sql, params) => {
    try { const r = await query(sql, params); return parseInt(r.rows[0]?.c || 0, 10); }
    catch (e) { if (e.code === '42P01' || e.code === '42703') return 0; throw e; }
  };

  // Documents: split statutory (keep) vs non-statutory (delete file+row).
  const docs = await query(
    `SELECT id, document_type, file_path, scanned_file_path, thumbnail_path
       FROM employee_documents WHERE employee_id = $1 AND deleted_at IS NULL`,
    [employeeId]
  );
  const keepDocs = [];
  const deleteDocs = [];
  const filesToDelete = [];
  for (const d of docs.rows) {
    if (statutory.includes(d.document_type)) { keepDocs.push(d.id); continue; }
    deleteDocs.push(d.id);
    [d.file_path, d.scanned_file_path, d.thumbnail_path].forEach((p) => { const rp = toRelPath(p); if (rp) filesToDelete.push(rp); });
  }
  // Profile photo file.
  const photo = await query('SELECT profile_photo_url FROM employees WHERE id = $1', [employeeId]);
  const photoRel = toRelPath(photo.rows[0]?.profile_photo_url);
  if (photoRel) filesToDelete.push(photoRel);

  // Health/wellbeing row counts.
  let healthRows = 0;
  for (const h of HEALTH_DELETE) {
    const key = h.col === 'employee_id' ? employeeId : uid;
    if (!key) continue;
    healthRows += await cnt(`SELECT count(*)::int c FROM ${h.table} WHERE ${h.col} = $1`, [key]);
  }

  // Financial (kept, pseudonymized) counts.
  const financial = {
    compensations: uid ? await cnt('SELECT count(*)::int c FROM compensations WHERE responsible_user_id = $1', [uid]) : 0,
    compensation_residents: uid ? await cnt('SELECT count(*)::int c FROM compensation_residents WHERE resident_id = $1', [uid]) : 0,
    salary_deductions: uid ? await cnt('SELECT count(*)::int c FROM salary_deductions WHERE user_id = $1', [uid]) : 0,
  };

  // Notifications for/about the subject.
  const notifications = await cnt(
    `SELECT count(*)::int c FROM notifications WHERE user_id = $1 OR (data->>'entity_id') = ANY($2)`,
    [uid, [String(employeeId), String(uid)]]
  );

  // Tickets KEPT INTACT — listed so the admin can spot-check free text.
  const tickets = await query(
    `SELECT id, ticket_number, title, created_at FROM tickets
      WHERE created_by = $1 OR linked_employee_id = $2 ORDER BY created_at DESC`,
    [uid, employeeId]
  );

  return {
    employeeId,
    userId: uid,
    pseudonym: pseudonym(employeeId),
    currentName: `${subject.last_name || ''} ${subject.first_name || ''}`.trim(),
    nullEmployeeFields: EMPLOYEE_NULL_FIELDS.length,
    deactivateUser: !!uid,
    documents: { delete: deleteDocs.length, keepStatutory: keepDocs.length },
    filesToDelete,
    healthRowsToDelete: healthRows,
    pseudonymizeFinancial: financial,
    notificationsToDelete: notifications,
    ticketsKeptIntact: tickets.rows,
    skippedV2: ['activity_logs (JSONB scrub)', 'translation_cache (purge)'],
  };
}

// Dry-run: full plan, zero mutation.
async function preview(employeeId) {
  return buildPlan(employeeId);
}

const CONTENT_TOMBSTONE = '[GDPR törölve]';
const JSONB_REDACTION = '{"_redacted":"gdpr"}';

// Execute: one transaction (all DB mutation + TOCTOU-safe file COLLECTION via
// RETURNING), then physically unlink the collected files post-commit. The result
// is only ok:true when EVERY collected file was actually deleted — a failed
// unlink surfaces as ok:false with the failed paths (no more silent success).
// reason ∈ gdpr_request | retention_expiry.
async function anonymizeEmployee(employeeId, { dryRun = false, requestedBy = null, reason = 'gdpr_request' } = {}) {
  const plan = await buildPlan(employeeId);
  if (plan.notFound) return { ok: false, error: 'not_found' };
  if (plan.alreadyAnonymized) return { ok: false, error: 'already_anonymized', anonymized_at: plan.anonymized_at };

  if (dryRun) {
    await query(
      `INSERT INTO anonymization_log (employee_id, pseudonym, requested_by, reason, dry_run, summary)
       VALUES ($1,$2,$3,$4,TRUE,$5)`,
      [employeeId, plan.pseudonym, requestedBy, reason, JSON.stringify(summaryOf(plan))]
    );
    return { ok: true, dryRun: true, plan };
  }

  const uid = plan.userId;
  const pseudo = plan.pseudonym;
  const randomPw = crypto.randomBytes(24).toString('hex'); // unusable; is_active=false also blocks
  const statutory = (await getConfig()).statutory_document_types || [];
  const idp = String(employeeId).slice(0, 8);

  const txn = await transaction(async (client) => {
    const receipt = { rows: {}, filesToDelete: [], skippedTables: [] };
    // Tolerate ONLY a genuinely-absent optional table (42P01) — recorded in the
    // receipt so a skip is never invisible. Any other error (incl. 42703 column
    // drift) throws and rolls the whole erasure back: fail loud, never a silent
    // no-op that leaves PII behind.
    const step = async (label, sql, params) => {
      // SAVEPOINT so a tolerated 42P01 (absent optional table) rolls back only
      // THIS statement — otherwise the first error poisons the whole txn and
      // every later step fails with 25P02 (aborted transaction).
      await client.query('SAVEPOINT gdpr_step');
      try {
        const r = await client.query(sql, params);
        await client.query('RELEASE SAVEPOINT gdpr_step');
        receipt.rows[label] = r.rowCount || 0;
        return r;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT gdpr_step');
        if (e.code === '42P01') { receipt.skippedTables.push(label); return { rows: [], rowCount: 0 }; }
        throw e; // column drift / anything else → fail loud, roll back the whole erasure
      }
    };
    const collect = (rows, cols) => rows.forEach((r) => cols.forEach((c) => {
      const vals = Array.isArray(r[c]) ? r[c] : [r[c]];
      vals.forEach((v) => { const rp = toRelPath(v); if (rp) receipt.filesToDelete.push(rp); });
    }));

    // 1) employees — capture profile photo under a row lock, then pseudonymize + NULL all PII.
    const emp = await client.query('SELECT profile_photo_url FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
    collect(emp.rows, ['profile_photo_url']);
    const setNulls = EMPLOYEE_NULL_FIELDS.map((f) => `${f} = NULL`).join(', ');
    await client.query(
      `UPDATE employees SET last_name = $2, first_name = NULL, anonymized_at = NOW(), ${setNulls} WHERE id = $1`,
      [employeeId, pseudo]
    );
    receipt.rows.employees = 1;

    // 2) users — deactivate + scramble (blocks login + existing JWTs; also makes authorship display as the pseudonym).
    if (uid) {
      await step('users',
        `UPDATE users SET is_active = FALSE, email = $2, password_hash = $3,
                          first_name = '', last_name = $4, phone = NULL, updated_at = NOW()
          WHERE id = $1`,
        [uid, `torolt-${idp}@anonymized.invalid`, randomPw, pseudo]);
    }

    // 3) employee_documents — delete non-statutory rows AND collect their files atomically (TOCTOU-safe).
    const dd = await step('employee_documents',
      `DELETE FROM employee_documents WHERE employee_id = $1 AND NOT (document_type = ANY($2))
        RETURNING file_path, scanned_file_path, thumbnail_path`,
      [employeeId, statutory]);
    collect(dd.rows, ['file_path', 'scanned_file_path', 'thumbnail_path']);

    // 4) health/wellbeing — hard delete.
    for (const h of HEALTH_DELETE) {
      const key = h.col === 'employee_id' ? employeeId : uid;
      if (!key) continue;
      await step(h.table, `DELETE FROM ${h.table} WHERE ${h.col} = $1`, [key]);
    }

    // 5) financial (KEEP statutory, pseudonymize denormalized names, NULL contacts/biometric).
    if (uid) {
      await step('compensations', `UPDATE compensations SET responsible_name = $2, responsible_email = NULL, responsible_phone = NULL WHERE responsible_user_id = $1`, [uid, pseudo]);
      await step('compensation_residents', `UPDATE compensation_residents SET resident_name = $2, resident_email = NULL, resident_phone = NULL, signature_data = NULL, notes = NULL WHERE resident_id = $1`, [uid, pseudo]);
      await step('salary_deductions', `UPDATE salary_deductions SET employee_name = $2 WHERE user_id = $1`, [uid, pseudo]);
    }

    // 6) notifications for/about the subject — delete.
    await step('notifications', `DELETE FROM notifications WHERE user_id = $1 OR (data->>'entity_id') = ANY($2)`, [uid, [String(employeeId), String(uid || '')]]);

    // 7) damage_reports — capture photo files (locked), then NULL biometric signatures + salary + free text.
    const drSel = await step('damage_reports_scan',
      `SELECT photo_urls FROM damage_reports WHERE employee_id = $1 OR responsible_employee_id = $2 FOR UPDATE`,
      [uid, employeeId]);
    collect(drSel.rows, ['photo_urls']);
    await step('damage_reports',
      `UPDATE damage_reports SET description = $3, employee_salary = NULL,
              employee_signature_data = NULL, manager_signature_data = NULL,
              witness_name = NULL, witness_signature_data = NULL, notes = NULL, photo_urls = NULL
        WHERE employee_id = $1 OR responsible_employee_id = $2`,
      [uid, employeeId, CONTENT_TOMBSTONE]);

    // 8) files the person uploaded — delete rows + collect files atomically.
    if (uid) {
      const ta = await step('ticket_attachments', `DELETE FROM ticket_attachments WHERE uploaded_by = $1 RETURNING file_path`, [uid]);
      collect(ta.rows, ['file_path']);
      const tp = await step('task_photos', `DELETE FROM task_photos WHERE uploaded_by = $1 RETURNING photo_url, thumbnail_url`, [uid]);
      collect(tp.rows, ['photo_url', 'thumbnail_url']);
      const ip = await step('inspection_photos', `DELETE FROM inspection_photos WHERE uploaded_by = $1 RETURNING file_path, thumbnail_path`, [uid]);
      collect(ip.rows, ['file_path', 'thumbnail_path']);
    }

    // 9) free-text CONTENT scrub (keep row skeleton so threads/history survive).
    if (uid) {
      await step('ticket_messages', `UPDATE ticket_messages SET message = $2 WHERE sender_id = $1`, [uid, CONTENT_TOMBSTONE]);
      await step('chatbot_messages', `UPDATE chatbot_messages SET content = $2, translated_content = NULL WHERE conversation_id IN (SELECT id FROM chatbot_conversations WHERE user_id = $1)`, [uid, CONTENT_TOMBSTONE]);
    }
    await step('employee_notes', `UPDATE employee_notes SET content = $2, title = $3 WHERE employee_id = $1`, [employeeId, CONTENT_TOMBSTONE, CONTENT_TOMBSTONE]);

    // 10) activity_logs — null IP + redact any PII embedded in the JSONB payload for the person's own rows.
    if (uid) await step('activity_logs', `UPDATE activity_logs SET ip_address = NULL, changes = $2::jsonb, metadata = $2::jsonb WHERE user_id = $1`, [uid, JSONB_REDACTION]);

    // 11) identity/contact mappings — delete (push tokens table may be absent in some envs → step tolerates 42P01).
    if (uid) {
      await step('user_push_tokens', `DELETE FROM user_push_tokens WHERE user_id = $1`, [uid]);
      await step('slack_users', `DELETE FROM slack_users WHERE user_id = $1`, [uid]);
    }

    // 12) receipt row (rowcounts + skipped tables so far; file outcome patched post-commit).
    const ins = await client.query(
      `INSERT INTO anonymization_log (employee_id, pseudonym, requested_by, reason, dry_run, summary)
       VALUES ($1,$2,$3,$4,FALSE,$5) RETURNING id`,
      [employeeId, pseudo, requestedBy, reason, JSON.stringify({ ...receipt, phase: 'db-committed' })]
    );
    receipt.logId = ins.rows[0].id;
    return receipt;
  });

  // Physical file deletion — AFTER commit. Track EVERY outcome; a failure is NOT hidden.
  const filesDeleted = [];
  const filesFailed = [];
  for (const rel of txn.filesToDelete) {
    try { await storage.delete(rel); filesDeleted.push(rel); }
    catch (e) { logger.error('[gdpr] file delete FAILED:', rel, e.message); filesFailed.push(rel); }
  }

  const ok = filesFailed.length === 0;
  // Erasure receipt — ACTUAL outcomes (not planned counts): tables+rowcounts touched,
  // files deleted vs failed, any tolerated table-skips. Patched into the audit log.
  const erasureReceipt = {
    pseudonym: pseudo,
    reason,
    db_rows_affected: txn.rows,
    files_deleted: filesDeleted.length,
    files_failed: filesFailed.length,
    files_failed_paths: filesFailed,
    skipped_tables: txn.skippedTables,
    backups_note: 'Pre-erasure PII in daily dumps/tarballs ages out via the 30-day backup retention (backup.sh); backups are not edited.',
    complete: ok,
  };
  await query('UPDATE anonymization_log SET summary = $2 WHERE id = $1', [txn.logId, JSON.stringify(erasureReceipt)]);

  logger.info(`[gdpr] anonymized employee ${employeeId} reason=${reason} files=${filesDeleted.length}/${txn.filesToDelete.length} failed=${filesFailed.length} complete=${ok}`);
  return {
    ok,
    dryRun: false,
    logId: txn.logId,
    pseudonym: pseudo,
    filesDeleted: filesDeleted.length,
    filesFailed,
    skippedTables: txn.skippedTables,
    receipt: erasureReceipt,
    ...(ok ? {} : { error: 'files_not_fully_deleted' }),
  };
}

// COUNTS + table names only — never the removed values (dry-run preview summary).
function summaryOf(plan) {
  return {
    pseudonym: plan.pseudonym,
    employee_pii_fields_nulled: plan.nullEmployeeFields,
    user_deactivated: plan.deactivateUser,
    documents_deleted: plan.documents.delete,
    documents_kept_statutory: plan.documents.keepStatutory,
    files_to_delete: plan.filesToDelete.length,
    health_rows_deleted: plan.healthRowsToDelete,
    financial_pseudonymized: plan.pseudonymizeFinancial,
    notifications_deleted: plan.notificationsToDelete,
    tickets_kept_intact: plan.ticketsKeptIntact.length,
    also_erased: ['damage_reports (signatures/salary/photos)', 'uploaded files (tickets/tasks/inspections)',
      'ticket/chatbot free text (scrubbed)', 'employee_notes', 'activity_logs (IP+JSONB redacted)',
      'push tokens', 'slack mapping'],
  };
}

// ── lifecycle: grace-period proposal queue (read-only; never mutates) ──
async function listProposals() {
  const cfg = await getConfig();
  const r = await query(
    `SELECT e.id, e.last_name, e.first_name, e.end_date, e.contractor_id, e.data_consent_at,
            (CURRENT_DATE - e.end_date) AS days_since_end
       FROM employees e
      WHERE e.end_date IS NOT NULL
        AND e.anonymized_at IS NULL
        AND e.end_date + ($1 || ' months')::interval < CURRENT_DATE
      ORDER BY e.end_date ASC`,
    [String(cfg.retention_grace_months)]
  );
  return { grace_months: cfg.retention_grace_months, proposals: r.rows };
}

// Daily reminder — notify superadmin/data_controller about NEWLY eligible ex-employees.
// Sets retention_notified_at so each person pings once. NEVER anonymizes.
async function notifyProposals() {
  const cfg = await getConfig();
  if (!cfg.reminder_enabled) return { skipped: true };
  const fresh = await query(
    `SELECT id, last_name, first_name FROM employees
      WHERE end_date IS NOT NULL AND anonymized_at IS NULL AND retention_notified_at IS NULL
        AND end_date + ($1 || ' months')::interval < CURRENT_DATE`,
    [String(cfg.retention_grace_months)]
  );
  if (fresh.rows.length === 0) return { skipped: false, notified: 0 };

  const recips = await query(
    `SELECT DISTINCT u.id FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r2 ON r2.id = ur.role_id
      WHERE u.is_active = TRUE AND (r.slug = ANY($1) OR r2.slug = ANY($1))`,
    [['superadmin', 'data_controller']]
  );
  const ids = recips.rows.map((x) => x.id);
  if (ids.length > 0) {
    await inApp.notifyMany(ids, {
      type: 'gdpr_proposal',
      title: 'Anonimizálásra javasolt munkavállalók',
      message: `${fresh.rows.length} volt munkavállaló túllépte a megőrzési időt és anonimizálásra javasolt. Kérjük, tekintse át.`,
      link: '/anonymization',
      data: { count: fresh.rows.length },
    });
  }
  await query(
    `UPDATE employees SET retention_notified_at = NOW() WHERE id = ANY($1)`,
    [fresh.rows.map((r) => r.id)]
  );
  return { skipped: false, notified: fresh.rows.length, recipients: ids.length };
}

async function recordConsent(employeeId, recordedBy) {
  const r = await query(
    `UPDATE employees SET data_consent_at = NOW(), data_consent_recorded_by = $2
      WHERE id = $1 AND anonymized_at IS NULL RETURNING data_consent_at`,
    [employeeId, recordedBy || null]
  );
  return r.rows[0] || null;
}

async function getLogs(limit = 100) {
  const r = await query(
    `SELECT id, employee_id, pseudonym, requested_by, reason, dry_run, summary, executed_at
       FROM anonymization_log ORDER BY executed_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

module.exports = {
  preview,
  anonymizeEmployee,
  listProposals,
  notifyProposals,
  recordConsent,
  getConfig,
  setConfig,
  getLogs,
  pseudonym,
};
