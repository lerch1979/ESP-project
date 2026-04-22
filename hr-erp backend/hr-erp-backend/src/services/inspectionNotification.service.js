/**
 * Inspection Notification Service
 *
 * When an inspection is completed, every resident affected MUST receive a
 * detailed legally-binding email in their native language with the PDF
 * protocol + photos attached. This service drives that flow.
 *
 * Core entry point: `notifyResidents(inspectionId)`.
 * It is called from inspection.controller.complete() fire-and-forget after
 * the HTTP response has been sent. A tracking row is written for each
 * recipient into inspection_email_notifications so the admin UI can show
 * delivery status + resend failed ones.
 *
 * SMTP reuse:
 *   - Uses the same env vars as multilingualEmail.service (EMAIL_HOST /
 *     EMAIL_USER / EMAIL_PASSWORD) with a fallback to SMTP_USER/SMTP_PASS
 *     (used by email.service). Gracefully no-ops if neither pair is set.
 *
 * Retries:
 *   - Failed rows are picked up by retryFailed(maxAttempts=3), called
 *     from the daily cron. Exponential backoff: 15min → 2h → 12h.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const sharp = require('sharp');
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const pdfService = require('./inspectionPDF.service');

const SUPPORTED_LANGS = ['hu', 'en', 'tl', 'uk', 'de'];
const MAX_PHOTOS = 10;
const MAX_PHOTO_EDGE_PX = 1600;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB gmail limit
const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_MS = [15 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'emails', 'inspectionCompleted.hbs');
const LOCALES_DIR  = path.join(__dirname, '..', 'locales');

// ─── Helpers ────────────────────────────────────────────────────────

function hasSmtpConfig() {
  return !!(
    (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) ||
    (process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587,
    secure: (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.EMAIL_USER || process.env.SMTP_USER,
      pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

let _template = null;
function getTemplate() {
  if (_template) return _template;
  const source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  _template = handlebars.compile(source);
  return _template;
}

function loadStrings(lang) {
  const safe = SUPPORTED_LANGS.includes(lang) ? lang : 'hu';
  const p = path.join(LOCALES_DIR, safe, 'inspection-notifications.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'hu', 'inspection-notifications.json'), 'utf8'));
  }
}

/** Render `{{tokens}}` inside a single string. */
function render(str, vars) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function fmtDate(d, lang) {
  if (!d) return '';
  try {
    const opts = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(d).toLocaleDateString(lang === 'hu' ? 'hu-HU' : lang === 'de' ? 'de-DE' : 'en-GB', opts);
  } catch { return String(d); }
}
function fmtTime(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function fmtMoney(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('hu-HU');
}

// ─── Resident resolution ────────────────────────────────────────────

/**
 * Collect the set of residents to notify for this inspection.
 *
 * Primary source: union of room_inspections.residents_snapshot JSONB.
 * Fallback   (when no room inspections): all employees currently assigned
 *   to rooms in the inspection's accommodation — joined to users to pick
 *   up email + preferred_language.
 *
 * Deduplicates by (resident_id || email.toLowerCase()). Returns an array of:
 *   { resident_id, name, email, language, room_info }
 */
async function resolveResidents(inspectionId) {
  const inspRes = await query(
    `SELECT accommodation_id FROM inspections WHERE id = $1`, [inspectionId]
  );
  if (inspRes.rows.length === 0) throw new Error('INSPECTION_NOT_FOUND');
  const accommodationId = inspRes.rows[0].accommodation_id;

  const roomRows = await query(
    `SELECT ri.id AS room_inspection_id, ri.room_id, ri.room_number,
            ri.technical_score, ri.hygiene_score, ri.aesthetic_score,
            ri.total_score, ri.grade, ri.notes AS room_notes,
            ri.residents_snapshot
     FROM room_inspections ri
     WHERE ri.inspection_id = $1`,
    [inspectionId]
  );

  const byKey = new Map(); // key → { resident_id, name, email, language, room }
  // Primary: residents_snapshot
  for (const r of roomRows.rows) {
    const snap = Array.isArray(r.residents_snapshot) ? r.residents_snapshot : [];
    for (const s of snap) {
      // New-shape snapshots carry email + language + employee_id directly.
      // Legacy rows only have { name, user_id (=actually employee.id), move_in_date }
      // — handle both.
      let email = s.email || null;
      let language = s.language || null;
      let name = s.name || null;
      let resolvedUserId = s.user_id || null;  // may be users.id on new-shape, employees.id on legacy

      if (!email || !language) {
        // Fallback: try users lookup (only works for new-shape user_id)
        if (resolvedUserId) {
          const u = await query(
            `SELECT email, preferred_language,
                    COALESCE(NULLIF(CONCAT(first_name, ' ', last_name), ' '), email) AS name
             FROM users WHERE id = $1`,
            [resolvedUserId]
          );
          if (u.rows[0]) {
            email = email || u.rows[0].email;
            language = language || u.rows[0].preferred_language;
            name = name || u.rows[0].name;
          }
        }
        // Fallback #2: treat legacy user_id as employees.id and join through
        // to users + personal_email
        if ((!email || !language) && (s.employee_id || s.user_id)) {
          const candidateEmpId = s.employee_id || s.user_id;
          const e = await query(
            `SELECT e.personal_email, u.email AS user_email, u.preferred_language, u.id AS uid
             FROM employees e
             LEFT JOIN users u ON u.id = e.user_id
             WHERE e.id = $1`,
            [candidateEmpId]
          );
          if (e.rows[0]) {
            email = email || e.rows[0].personal_email || e.rows[0].user_email || null;
            language = language || e.rows[0].preferred_language || 'hu';
            // If legacy snapshot's user_id was actually an employee id, promote
            // the real users.id if we found one
            if (!s.user_id || s.user_id === candidateEmpId) {
              resolvedUserId = e.rows[0].uid || null;
            }
          }
        }
      }

      language = language || 'hu';
      const key = (resolvedUserId || (email || '').toLowerCase()) || null;
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          resident_id: resolvedUserId,
          name: name || 'Lakó',
          email,
          language,
          room: {
            number:    r.room_number,
            technical: r.technical_score,
            hygiene:   r.hygiene_score,
            aesthetic: r.aesthetic_score,
            total:     r.total_score,
            grade:     r.grade,
            notes:     r.room_notes,
          },
        });
      }
    }
  }

  // Fallback: if nothing resolved, pull employees in this accommodation's rooms
  if (byKey.size === 0 && accommodationId) {
    const fb = await query(
      `SELECT DISTINCT
              e.id, e.user_id, e.first_name, e.last_name, e.room_id,
              r.room_number,
              u.email AS user_email, u.preferred_language
       FROM employees e
       LEFT JOIN accommodation_rooms r ON e.room_id = r.id
       LEFT JOIN users u               ON e.user_id = u.id
       WHERE r.accommodation_id = $1 AND r.is_active = true`,
      [accommodationId]
    );
    for (const row of fb.rows) {
      const email = row.user_email;
      if (!email) continue;
      const key = row.user_id || email.toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, {
        resident_id: row.user_id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || email,
        email,
        language: row.preferred_language || 'hu',
        room: row.room_number ? { number: row.room_number } : null,
      });
    }
  }

  return [...byKey.values()].filter(r => r.email);
}

// ─── Body composition ───────────────────────────────────────────────

/**
 * Render the per-recipient HTML body + collect metadata we'll also hash
 * for the tamper-proof content_hash field.
 */
function renderEmail(inspection, resident, meta) {
  const lang = SUPPORTED_LANGS.includes(resident.language) ? resident.language : 'hu';
  const s = loadStrings(lang);
  const subject = render(s.subject, {
    date: fmtDate(inspection.completed_at || inspection.scheduled_at, lang),
    propertyName: inspection.accommodation_name || '',
  });
  const greeting = render(s.greeting, { residentName: resident.name });
  const intro = render(s.intro, {
    date: fmtDate(inspection.completed_at || inspection.scheduled_at, lang),
    time: fmtTime(inspection.completed_at || inspection.scheduled_at),
    propertyName: inspection.accommodation_name || '',
  });

  // Grade label (localised)
  const gradeKey = resident.room?.grade;
  const gradeLabel = gradeKey && s.grades?.[gradeKey] ? s.grades[gradeKey] : (gradeKey || '');

  // Type label (keep enum — hu locale lists them but we also keep a fallback)
  const typeLabel = {
    weekly: 'heti', monthly: 'havi', quarterly: 'negyedéves', yearly: 'éves',
    checkin: 'beköltözés', checkout: 'kiköltözés', incident: 'eseti', complaint: 'panasz',
  }[inspection.inspection_type] || inspection.inspection_type;

  const findings = meta.findings || [];
  const fines    = (meta.fines || []).map(f => render(s.fines_line, f));
  const damages  = (meta.damages || []).map(d => render(s.damages_line, d));
  const contact  = render(s.contact, {
    email: process.env.CONTACT_EMAIL || 'info@housingsolutions.hu',
    phone: process.env.CONTACT_PHONE || '+36 99 000 000',
  });

  const payload = {
    lang,
    s: {
      ...s,
      greeting,       // overridden, already rendered
      intro,
      subject,
    },
    subject,
    inspectionNumber: inspection.inspection_number,
    typeLabel,
    inspectorName: inspection.inspector_name || '',
    completedAt: fmtDate(inspection.completed_at, lang) + ' ' + fmtTime(inspection.completed_at),
    room: resident.room,
    gradeLabel,
    findings,
    fines,
    damages,
    contact,
    verifyHint: '', // filled in after hashing below
  };

  const template = getTemplate();
  // First pass (without hash) to compute the canonical hash
  const pre = template(payload);
  const hash = crypto.createHash('sha256').update(pre).digest('hex').slice(0, 16);
  payload.verifyHint = render(s.verify_hint || '{{hash}}', { hash });
  const html = template(payload);

  return { subject, html, hash, language: lang };
}

// ─── Attachments: owner PDF + resized photos ────────────────────────

/** Render owner report PDF into a Buffer for use as an attachment. */
async function buildPdfAttachment(inspectionId, inspectionNumber) {
  const doc = await pdfService.generateOwnerReport(inspectionId);
  const chunks = [];
  await new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  return {
    filename: `jegyzokonyv-${inspectionNumber}.pdf`,
    content: Buffer.concat(chunks),
    contentType: 'application/pdf',
  };
}

/** Load + resize up to MAX_PHOTOS photos for this inspection. */
async function buildPhotoAttachments(inspectionId) {
  const r = await query(
    `SELECT id, file_path FROM inspection_photos
     WHERE inspection_id = $1 ORDER BY created_at LIMIT $2`,
    [inspectionId, MAX_PHOTOS]
  );
  const attachments = [];
  let totalBytes = 0;
  for (const p of r.rows) {
    if (!p.file_path) continue;
    const full = path.isAbsolute(p.file_path)
      ? p.file_path
      : path.join(__dirname, '..', '..', p.file_path);
    if (!fs.existsSync(full)) continue;

    try {
      const buf = await sharp(full)
        .rotate()
        .resize({ width: MAX_PHOTO_EDGE_PX, height: MAX_PHOTO_EDGE_PX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      if (totalBytes + buf.length > MAX_ATTACHMENT_BYTES) break; // gmail 25MB cap
      totalBytes += buf.length;
      const baseName = path.basename(p.file_path).replace(/\.[^.]+$/, '');
      attachments.push({
        filename: `${baseName || 'photo'}-${attachments.length + 1}.jpg`,
        content: buf,
        contentType: 'image/jpeg',
      });
    } catch (e) {
      logger.warn(`[inspectionNotification] photo resize failed for ${p.id}:`, e.message);
    }
  }
  return attachments;
}

// ─── Findings/fines/damages extraction ──────────────────────────────

/**
 * Fish out the data that belongs in the email. `inspection` has the
 * denormalised join; we also fetch any compensations attached to the
 * inspection that mention this resident (by residents_snapshot user_id
 * OR by compensation_residents.resident_id).
 */
async function collectMeta(inspection, resident) {
  // Findings: checklist items with major/critical severity for the inspection
  const findingsRes = await query(
    `SELECT ci.name, s.notes FROM inspection_item_scores s
     JOIN inspection_checklist_items ci ON s.checklist_item_id = ci.id
     WHERE s.inspection_id = $1 AND s.severity IN ('major','critical')
     ORDER BY ci.sort_order`,
    [inspection.id]
  );
  const findings = findingsRes.rows.map(r => r.notes ? `${r.name} — ${r.notes}` : r.name);

  // Compensations tied to this inspection, filtered to rows that include
  // this resident (via compensation_residents.resident_id) OR where the
  // compensation has no per-resident rows yet.
  const compRes = await query(
    `SELECT c.*,
            cr.amount_assigned, cr.id AS cr_id
     FROM compensations c
     LEFT JOIN compensation_residents cr
       ON cr.compensation_id = c.id AND cr.resident_id = $2
     WHERE c.inspection_id = $1`,
    [inspection.id, resident.resident_id]
  );

  const fines = [];
  const damages = [];
  for (const c of compRes.rows) {
    // If there is a per-resident row and this resident isn't in it, skip.
    const hasPerResident = await query(
      `SELECT 1 FROM compensation_residents WHERE compensation_id = $1 LIMIT 1`,
      [c.id]
    );
    if (hasPerResident.rows.length > 0 && !c.cr_id) continue;

    const amount = fmtMoney(c.amount_assigned ?? c.amount_gross);
    const deadline = c.due_date ? fmtDate(c.due_date, resident.language) : '';
    if (c.type === 'fine') {
      fines.push({ reason: c.description || 'Bírság', amount, deadline });
    } else {
      damages.push({ description: c.description || 'Kártérítés', amount, deadline });
    }
  }

  return { findings, fines, damages };
}

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Notify every resident linked to this inspection. Returns a summary
 * `{ queued, sent, failed, skipped }` and writes one row per recipient
 * into inspection_email_notifications.
 */
async function notifyResidents(inspectionId, { userId } = {}) {
  const inspRes = await query(
    `SELECT i.*,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS inspector_name
     FROM inspections i
     LEFT JOIN accommodations a ON i.accommodation_id = a.id
     LEFT JOIN users u          ON i.inspector_id = u.id
     WHERE i.id = $1`,
    [inspectionId]
  );
  if (inspRes.rows.length === 0) throw new Error('INSPECTION_NOT_FOUND');
  const inspection = inspRes.rows[0];

  const residents = await resolveResidents(inspectionId);
  if (residents.length === 0) {
    logger.info(`[inspectionNotification.notifyResidents] ${inspectionId}: no residents`);
    return { queued: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const smtpOk = hasSmtpConfig();
  let pdfAttach = null;
  let photoAttach = [];
  try {
    pdfAttach = await buildPdfAttachment(inspectionId, inspection.inspection_number);
    photoAttach = await buildPhotoAttachments(inspectionId);
  } catch (e) {
    logger.error('[inspectionNotification] attachments failed:', e.message);
  }

  const counters = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  const transporter = smtpOk ? getTransporter() : null;

  for (const r of residents) {
    const meta = await collectMeta(inspection, r);
    const rendered = renderEmail(inspection, r, meta);

    // Insert tracking row in pending state first.
    const track = await query(
      `INSERT INTO inspection_email_notifications
         (inspection_id, resident_id, resident_name, email_address, language,
          status, subject, attachments_count, content_hash, attempt_count)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,0)
       RETURNING id`,
      [
        inspectionId, r.resident_id || null, r.name, r.email, rendered.language,
        rendered.subject, (pdfAttach ? 1 : 0) + photoAttach.length, rendered.hash,
      ]
    );
    counters.queued++;

    if (!smtpOk) {
      await query(
        `UPDATE inspection_email_notifications
         SET status = 'skipped',
             failed_reason = 'SMTP not configured',
             updated_at = NOW()
         WHERE id = $1`,
        [track.rows[0].id]
      );
      counters.skipped++;
      continue;
    }

    const attachments = [];
    if (pdfAttach) attachments.push(pdfAttach);
    attachments.push(...photoAttach);

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER || process.env.SMTP_USER,
        to: r.email,
        subject: rendered.subject,
        html: rendered.html,
        attachments,
      });
      await query(
        `UPDATE inspection_email_notifications
         SET status = 'sent',
             sent_at = NOW(),
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [track.rows[0].id]
      );
      counters.sent++;
    } catch (err) {
      logger.error(`[inspectionNotification] send failed to ${r.email}:`, err.message);
      await query(
        `UPDATE inspection_email_notifications
         SET status = 'failed',
             failed_reason = $2,
             attempt_count = attempt_count + 1,
             next_retry_at = NOW() + INTERVAL '15 minutes',
             updated_at = NOW()
         WHERE id = $1`,
        [track.rows[0].id, String(err.message).slice(0, 500)]
      );
      counters.failed++;
    }
  }

  logger.info(`[inspectionNotification.notifyResidents] ${inspectionId}: ${JSON.stringify(counters)}`);
  return counters;
}

/** Re-send a single tracking row. Used by the admin "Resend" button. */
async function resendOne(trackingId, { userId } = {}) {
  const r = await query(
    `SELECT ien.*, i.inspection_number
     FROM inspection_email_notifications ien
     JOIN inspections i ON ien.inspection_id = i.id
     WHERE ien.id = $1`,
    [trackingId]
  );
  if (r.rows.length === 0) throw new Error('NOTIFICATION_NOT_FOUND');
  const row = r.rows[0];

  if (!hasSmtpConfig()) {
    await query(`UPDATE inspection_email_notifications SET status='skipped', failed_reason='SMTP not configured', updated_at=NOW() WHERE id=$1`, [trackingId]);
    return { status: 'skipped' };
  }

  // Re-resolve the specific resident from the original row (we stored
  // email + language + name, so no DB re-lookup required).
  const fakeResident = {
    resident_id: row.resident_id,
    name: row.resident_name || 'Lakó',
    email: row.email_address,
    language: row.language,
    room: null,  // resend uses the same body template; room data is in the PDF
  };

  const inspectionRes = await query(
    `SELECT i.*,
            a.name AS accommodation_name,
            u.first_name || ' ' || u.last_name AS inspector_name
     FROM inspections i
     LEFT JOIN accommodations a ON i.accommodation_id = a.id
     LEFT JOIN users u          ON i.inspector_id = u.id
     WHERE i.id = $1`,
    [row.inspection_id]
  );
  const inspection = inspectionRes.rows[0];

  const meta = await collectMeta(inspection, fakeResident);
  const rendered = renderEmail(inspection, fakeResident, meta);

  let pdfAttach, photoAttach = [];
  try {
    pdfAttach = await buildPdfAttachment(row.inspection_id, inspection.inspection_number);
    photoAttach = await buildPhotoAttachments(row.inspection_id);
  } catch (e) {
    logger.warn('[inspectionNotification.resendOne] attachment fail:', e.message);
  }

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_USER || process.env.SMTP_USER,
      to: row.email_address,
      subject: rendered.subject,
      html: rendered.html,
      attachments: [...(pdfAttach ? [pdfAttach] : []), ...photoAttach],
    });
    await query(
      `UPDATE inspection_email_notifications
       SET status='sent', sent_at=NOW(), attempt_count=attempt_count+1,
           failed_reason=NULL, next_retry_at=NULL, updated_at=NOW()
       WHERE id=$1`,
      [trackingId]
    );
    return { status: 'sent' };
  } catch (err) {
    await query(
      `UPDATE inspection_email_notifications
       SET status='failed', failed_reason=$2, attempt_count=attempt_count+1,
           next_retry_at=NOW() + INTERVAL '15 minutes', updated_at=NOW()
       WHERE id=$1`,
      [trackingId, String(err.message).slice(0, 500)]
    );
    return { status: 'failed', error: err.message };
  }
}

/**
 * Auto-retry entry point for the daily cron. Picks up rows with
 * status='failed' whose next_retry_at is in the past and attempt_count is
 * below MAX_RETRY_ATTEMPTS; backs off exponentially after each retry.
 */
async function retryFailed() {
  if (!hasSmtpConfig()) return { retried: 0, skipped: 0 };
  const eligible = await query(
    `SELECT id, attempt_count FROM inspection_email_notifications
     WHERE status = 'failed'
       AND attempt_count < $1
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())`,
    [MAX_RETRY_ATTEMPTS]
  );
  const counters = { retried: 0, sent: 0, failed: 0 };
  for (const row of eligible.rows) {
    const res = await resendOne(row.id).catch(() => ({ status: 'failed' }));
    counters.retried++;
    if (res.status === 'sent') counters.sent++;
    else {
      counters.failed++;
      // Extend backoff on subsequent failures
      const nextBackoff = BACKOFF_MS[Math.min(row.attempt_count, BACKOFF_MS.length - 1)];
      await query(
        `UPDATE inspection_email_notifications
         SET next_retry_at = NOW() + ($2 || ' milliseconds')::interval,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, nextBackoff]
      );
    }
  }
  logger.info(`[inspectionNotification.retryFailed] ${JSON.stringify(counters)}`);
  return counters;
}

async function listForInspection(inspectionId) {
  const r = await query(
    `SELECT * FROM inspection_email_notifications
     WHERE inspection_id = $1
     ORDER BY created_at DESC`,
    [inspectionId]
  );
  return r.rows;
}

module.exports = {
  notifyResidents,
  resendOne,
  retryFailed,
  listForInspection,
  // exposed for tests
  _internals: {
    resolveResidents, renderEmail, buildPdfAttachment, buildPhotoAttachments,
    loadStrings, hasSmtpConfig, SUPPORTED_LANGS, MAX_PHOTOS,
  },
};
