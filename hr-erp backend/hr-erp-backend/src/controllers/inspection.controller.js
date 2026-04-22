/**
 * Inspection Controller
 *
 * Mobile-first workflow:
 *   1. POST   /inspections              — inspector starts a new inspection (draft)
 *   2. PATCH  /inspections/:id          — update notes / GPS / signature mid-inspection
 *   3. POST   /inspections/:id/scores   — bulk insert per-checklist-item scores
 *   4. POST   /inspections/:id/complete — finalize: total + grade + auto-tasks
 *   5. GET    /inspections              — admin list with filters
 *   6. GET    /inspections/:id          — full detail (scores + photos + tasks + damages)
 *   7. DELETE /inspections/:id          — admin-only, blocks completed ones
 *
 * Photo upload is a separate endpoint (Day 1b — needs multer + storage decision).
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const pdfService = require('../services/inspectionPDF.service');
const notify = require('../services/inAppNotification.service');
const notificationSvc = require('../services/inspectionNotification.service');

const VALID_TYPES = ['weekly', 'monthly', 'quarterly', 'yearly', 'checkin', 'checkout', 'incident', 'complaint'];
const VALID_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'reviewed'];

// ─── Helpers ────────────────────────────────────────────────────────

/** Generate the next inspection number in ELL-YYYY-MM-NNNN format. */
async function nextInspectionNumber(client) {
  const r = await (client || query)(`SELECT nextval('inspection_seq') AS seq`);
  const seq = parseInt(r.rows[0].seq, 10);
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `ELL-${yy}-${mm}-${String(seq).padStart(4, '0')}`;
}

/** Map a 0-100 total to a grade label. */
function scoreToGrade(total) {
  if (total === null || total === undefined) return null;
  if (total >= 90) return 'excellent';
  if (total >= 75) return 'good';
  if (total >= 60) return 'acceptable';
  if (total >= 40) return 'poor';
  if (total >= 20) return 'bad';
  return 'critical';
}

/** Severity derived from score/max ratio (for auto-task priority). */
function severityFromRatio(score, max) {
  if (!max || max <= 0) return 'ok';
  const r = score / max;
  if (r < 0.2) return 'critical';
  if (r < 0.4) return 'major';
  if (r < 0.7) return 'minor';
  return 'ok';
}

/** Priority for an auto-generated task, based on severity. */
function taskPriorityFromSeverity(severity) {
  switch (severity) {
    case 'critical': return 'emergency';
    case 'major':    return 'high';
    case 'minor':    return 'medium';
    default:         return null; // no task for 'ok'
  }
}

/** Days-from-now per priority, for auto-task due_date. */
function dueOffsetDays(priority) {
  return { emergency: 1, critical: 2, high: 7, medium: 14, low: 30 }[priority] || 14;
}

function formatInspection(row) {
  if (!row) return null;
  return {
    id: row.id,
    inspectionNumber: row.inspection_number,
    accommodationId: row.accommodation_id,
    accommodationName: row.accommodation_name || null,
    inspectorId: row.inspector_id,
    inspectorName: row.inspector_name || null,
    scheduleId: row.schedule_id,
    inspectionType: row.inspection_type,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalScore: row.total_score,
    technicalScore: row.technical_score,
    hygieneScore: row.hygiene_score,
    aestheticScore: row.aesthetic_score,
    grade: row.grade,
    status: row.status,
    gpsLatitude: row.gps_latitude ? Number(row.gps_latitude) : null,
    gpsLongitude: row.gps_longitude ? Number(row.gps_longitude) : null,
    digitalSignature: row.digital_signature,
    signatureTimestamp: row.signature_timestamp,
    generalNotes: row.general_notes,
    adminReviewNotes: row.admin_review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Endpoints ──────────────────────────────────────────────────────

/** GET /api/v1/inspections — list with filters */
const list = async (req, res) => {
  try {
    const { status, accommodation_id, inspector_id, type, from, to, limit = 50, offset = 0 } = req.query;
    const clauses = [];
    const params = [];
    const push = (clause, ...vals) => {
      const placeholders = vals.map((_, i) => `$${params.length + i + 1}`);
      clauses.push(clause.replace(/\?\?/g, () => placeholders.shift()));
      params.push(...vals);
    };

    if (status) push('i.status = ??', status);
    if (accommodation_id) push('i.accommodation_id = ??', accommodation_id);
    if (inspector_id) push('i.inspector_id = ??', inspector_id);
    if (type) push('i.inspection_type = ??', type);
    if (from) push('i.scheduled_at >= ??', from);
    if (to)   push('i.scheduled_at <= ??', to);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;

    const result = await query(
      `SELECT i.*,
              a.name AS accommodation_name,
              u.first_name || ' ' || u.last_name AS inspector_name
       FROM inspections i
       LEFT JOIN accommodations a ON i.accommodation_id = a.id
       LEFT JOIN users u ON i.inspector_id = u.id
       ${where}
       ORDER BY i.scheduled_at DESC NULLS LAST, i.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, off]
    );
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM inspections i ${where}`,
      params
    );

    res.json({
      success: true,
      data: result.rows.map(formatInspection),
      pagination: { total: countRes.rows[0].total, limit: lim, offset: off },
    });
  } catch (err) {
    logger.error('[inspection.list]', err);
    res.status(500).json({ success: false, message: 'Ellenőrzések lekérési hiba' });
  }
};

/** GET /api/v1/inspections/:id */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const inspRes = await query(
      `SELECT i.*,
              a.name AS accommodation_name,
              u.first_name || ' ' || u.last_name AS inspector_name
       FROM inspections i
       LEFT JOIN accommodations a ON i.accommodation_id = a.id
       LEFT JOIN users u ON i.inspector_id = u.id
       WHERE i.id = $1`,
      [id]
    );
    if (inspRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }

    const inspection = formatInspection(inspRes.rows[0]);

    const [scoresRes, photosRes, tasksRes, damagesRes] = await Promise.all([
      query(
        `SELECT s.*, ci.code AS item_code, ci.name AS item_name, ci.category_id
         FROM inspection_item_scores s
         JOIN inspection_checklist_items ci ON s.checklist_item_id = ci.id
         WHERE s.inspection_id = $1
         ORDER BY ci.sort_order`,
        [id]
      ),
      query(
        `SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY created_at`,
        [id]
      ),
      query(
        `SELECT * FROM inspection_tasks WHERE inspection_id = $1 ORDER BY priority DESC, due_date`,
        [id]
      ),
      query(
        `SELECT * FROM inspection_damages WHERE inspection_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        ...inspection,
        scores: scoresRes.rows,
        photos: photosRes.rows,
        tasks: tasksRes.rows,
        damages: damagesRes.rows,
      },
    });
  } catch (err) {
    logger.error('[inspection.getById]', err);
    res.status(500).json({ success: false, message: 'Ellenőrzés lekérési hiba' });
  }
};

/** POST /api/v1/inspections — create draft */
const create = async (req, res) => {
  try {
    const { accommodation_id, inspection_type = 'monthly', scheduled_at, schedule_id, gps_latitude, gps_longitude } = req.body;

    if (!accommodation_id) {
      return res.status(400).json({ success: false, message: 'accommodation_id kötelező' });
    }
    if (!VALID_TYPES.includes(inspection_type)) {
      return res.status(400).json({ success: false, message: `inspection_type egyike: ${VALID_TYPES.join(', ')}` });
    }

    const inspectionNumber = await nextInspectionNumber();

    const result = await query(
      `INSERT INTO inspections (
         inspection_number, accommodation_id, inspector_id, schedule_id,
         inspection_type, scheduled_at, started_at, status,
         gps_latitude, gps_longitude
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress', $7, $8)
       RETURNING *`,
      [
        inspectionNumber,
        accommodation_id,
        req.user?.id || null,
        schedule_id || null,
        inspection_type,
        scheduled_at || new Date(),
        gps_latitude || null,
        gps_longitude || null,
      ]
    );

    res.status(201).json({ success: true, data: formatInspection(result.rows[0]) });
  } catch (err) {
    logger.error('[inspection.create]', err);
    res.status(500).json({ success: false, message: 'Ellenőrzés létrehozási hiba' });
  }
};

/** PATCH /api/v1/inspections/:id — update notes / signature / gps */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      general_notes, admin_review_notes, digital_signature,
      gps_latitude, gps_longitude, status,
    } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status egyike: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await query(
      `UPDATE inspections SET
         general_notes = COALESCE($1, general_notes),
         admin_review_notes = COALESCE($2, admin_review_notes),
         digital_signature = COALESCE($3, digital_signature),
         signature_timestamp = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE signature_timestamp END,
         gps_latitude = COALESCE($4, gps_latitude),
         gps_longitude = COALESCE($5, gps_longitude),
         status = COALESCE($6, status),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [general_notes, admin_review_notes, digital_signature, gps_latitude, gps_longitude, status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    res.json({ success: true, data: formatInspection(result.rows[0]) });
  } catch (err) {
    logger.error('[inspection.update]', err);
    res.status(500).json({ success: false, message: 'Ellenőrzés frissítési hiba' });
  }
};

/** POST /api/v1/inspections/:id/scores — bulk insert per-item scores
 *  Body: { scores: [{checklist_item_id, score, max_score, notes?}] }
 *  Uses ON CONFLICT to allow re-scoring (idempotent per item).
 */
const addScores = async (req, res) => {
  try {
    const { id } = req.params;
    const { scores } = req.body || {};
    if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ success: false, message: 'scores tömb kötelező' });
    }

    // Verify inspection exists + get checklist items for validation
    const inspRes = await query(`SELECT id, status FROM inspections WHERE id = $1`, [id]);
    if (inspRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    if (inspRes.rows[0].status === 'completed') {
      return res.status(409).json({ success: false, message: 'Befejezett ellenőrzésre nem lehet pontozást rögzíteni' });
    }

    const inserted = [];
    for (const s of scores) {
      if (!s.checklist_item_id || s.score === undefined || s.max_score === undefined) continue;
      if (s.score < 0 || s.score > s.max_score) continue;

      const severity = severityFromRatio(s.score, s.max_score);
      const r = await query(
        `INSERT INTO inspection_item_scores (
           inspection_id, checklist_item_id, score, max_score, notes, severity
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (inspection_id, checklist_item_id)
         DO UPDATE SET score = EXCLUDED.score,
                       max_score = EXCLUDED.max_score,
                       notes = EXCLUDED.notes,
                       severity = EXCLUDED.severity
         RETURNING *`,
        [id, s.checklist_item_id, s.score, s.max_score, s.notes || null, severity]
      );
      inserted.push(r.rows[0]);
    }

    res.json({ success: true, data: inserted, count: inserted.length });
  } catch (err) {
    logger.error('[inspection.addScores]', err);
    res.status(500).json({ success: false, message: 'Pontozási hiba' });
  }
};

/** POST /api/v1/inspections/:id/complete — finalize
 *  Calculates per-category and total scores, grade, and auto-generates
 *  inspection_tasks for items with major/critical severity.
 */
const complete = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await transaction(async (client) => {
      const inspRes = await client.query(
        `SELECT id, status FROM inspections WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (inspRes.rows.length === 0) throw new Error('NOT_FOUND');
      if (inspRes.rows[0].status === 'completed') throw new Error('ALREADY_COMPLETED');

      // Aggregate scores per category
      const aggRes = await client.query(
        `SELECT
           c.code AS cat_code,
           SUM(s.score)::int AS sum_score,
           SUM(s.max_score)::int AS sum_max
         FROM inspection_item_scores s
         JOIN inspection_checklist_items ci ON s.checklist_item_id = ci.id
         JOIN inspection_categories c ON ci.category_id = c.id
         WHERE s.inspection_id = $1
         GROUP BY c.code`,
        [id]
      );

      const byCategory = { TECHNICAL: 0, HYGIENE: 0, AESTHETIC: 0 };
      for (const row of aggRes.rows) {
        byCategory[row.cat_code] = row.sum_score; // raw category points
      }
      // Categories are pre-weighted via max_points (50/30/20 = 100 total)
      const total = byCategory.TECHNICAL + byCategory.HYGIENE + byCategory.AESTHETIC;
      const grade = scoreToGrade(total);

      const updRes = await client.query(
        `UPDATE inspections SET
           total_score = $1,
           technical_score = $2,
           hygiene_score = $3,
           aesthetic_score = $4,
           grade = $5,
           status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [total, byCategory.TECHNICAL, byCategory.HYGIENE, byCategory.AESTHETIC, grade, id]
      );

      // Auto-generate maintenance tasks for items with severity worse than 'ok'
      const itemsRes = await client.query(
        `SELECT s.id AS score_id, s.severity, ci.name AS item_name, c.code AS cat_code
         FROM inspection_item_scores s
         JOIN inspection_checklist_items ci ON s.checklist_item_id = ci.id
         JOIN inspection_categories c ON ci.category_id = c.id
         WHERE s.inspection_id = $1 AND s.severity IN ('major', 'critical')`,
        [id]
      );

      const tasksCreated = [];
      for (const it of itemsRes.rows) {
        const priority = taskPriorityFromSeverity(it.severity);
        if (!priority) continue;
        const offset = dueOffsetDays(priority);
        const taskRes = await client.query(
          `INSERT INTO inspection_tasks (
             inspection_id, item_score_id,
             title, description, priority, category,
             due_date, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE + $7::INTEGER, 'pending')
           RETURNING id, title, priority, due_date`,
          [
            id,
            it.score_id,
            `Javítás: ${it.item_name}`,
            `Automatikusan generált feladat ellenőrzésből (súlyosság: ${it.severity})`,
            priority,
            it.cat_code,
            offset,
          ]
        );
        tasksCreated.push(taskRes.rows[0]);
      }

      return {
        inspection: formatInspection(updRes.rows[0]),
        tasksCreated,
      };
    });

    // Fire-and-forget notifications to inspector + accommodation contacts.
    // Never block the response or fail the transaction on notify errors.
    notify.notify({
      userId: data.inspection.inspectorId,
      type: 'inspection_completed',
      title: `Ellenőrzés lezárva: ${data.inspection.inspectionNumber}`,
      message: `Eredmény: ${data.inspection.totalScore ?? '—'}/100. ${data.tasksCreated.length} feladat generálva.`,
      link: `/inspections/${data.inspection.id}`,
      data: { inspection_id: data.inspection.id, tasks_created: data.tasksCreated.length },
    }).catch(() => {});

    // Send legal completion email to every affected resident in their
    // preferred language (PDF + photos attached). Fire-and-forget — we
    // respond to the inspector immediately; delivery status is tracked
    // in inspection_email_notifications and viewable in the admin UI.
    setImmediate(() => {
      notificationSvc.notifyResidents(data.inspection.id, { userId: req.user?.id })
        .catch((err) => logger.error('[inspection.complete:notify]', err.message));
    });

    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    if (err.message === 'ALREADY_COMPLETED') {
      return res.status(409).json({ success: false, message: 'Ellenőrzés már be van fejezve' });
    }
    logger.error('[inspection.complete]', err);
    res.status(500).json({ success: false, message: 'Befejezési hiba' });
  }
};

/** GET /api/v1/inspections/:id/rooms — list room-level scores for an inspection.
 *  Also returns rooms belonging to the inspection's accommodation that
 *  DON'T yet have a score, so the UI can show "pending" rows.
 */
const listRooms = async (req, res) => {
  try {
    const { id } = req.params;
    const inspRes = await query(
      `SELECT accommodation_id FROM inspections WHERE id = $1`,
      [id]
    );
    if (inspRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    const accommodationId = inspRes.rows[0].accommodation_id;

    const result = await query(
      `SELECT
         r.id              AS room_id,
         r.room_number,
         r.floor,
         r.beds,
         r.room_type,
         ri.id             AS room_inspection_id,
         ri.technical_score,
         ri.hygiene_score,
         ri.aesthetic_score,
         ri.total_score,
         ri.grade,
         ri.previous_score,
         ri.score_change,
         ri.trend,
         ri.residents_snapshot,
         ri.notes,
         ri.needs_attention,
         ri.created_at     AS scored_at
       FROM accommodation_rooms r
       LEFT JOIN room_inspections ri
         ON ri.room_id = r.id AND ri.inspection_id = $1
       WHERE r.accommodation_id = $2 AND r.is_active = true
       ORDER BY r.floor NULLS FIRST, r.room_number`,
      [id, accommodationId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[inspection.listRooms]', err);
    res.status(500).json({ success: false, message: 'Szobák lekérési hiba' });
  }
};

/** POST /api/v1/inspections/:id/rooms/:roomId/score
 *  Body: { technical_score, hygiene_score, aesthetic_score, notes?, needs_attention? }
 *  Auto-computes total, grade, previous_score/score_change/trend, residents_snapshot.
 *  Uses ON CONFLICT so re-scoring updates in place.
 */
const scoreRoom = async (req, res) => {
  try {
    const { id, roomId } = req.params;
    const {
      technical_score, hygiene_score, aesthetic_score,
      notes, needs_attention = false,
    } = req.body || {};

    const tech = Number(technical_score) || 0;
    const hyg  = Number(hygiene_score) || 0;
    const aes  = Number(aesthetic_score) || 0;

    if (tech < 0 || tech > 50 || hyg < 0 || hyg > 30 || aes < 0 || aes > 20) {
      return res.status(400).json({
        success: false,
        message: 'Pontszámok tartománya: műszaki 0-50, higiénia 0-30, esztétika 0-20',
      });
    }

    const data = await transaction(async (client) => {
      // Verify the room belongs to the inspection's accommodation
      const roomRes = await client.query(
        `SELECT r.id, r.room_number, r.accommodation_id
         FROM accommodation_rooms r
         JOIN inspections i ON i.accommodation_id = r.accommodation_id
         WHERE r.id = $1 AND i.id = $2`,
        [roomId, id]
      );
      if (roomRes.rows.length === 0) throw new Error('ROOM_MISMATCH');
      const roomNumber = roomRes.rows[0].room_number;

      const total = tech + hyg + aes;
      const grade = scoreToGrade(total);

      // Previous score → for delta/trend.
      const prevRes = await client.query(
        `SELECT total_score FROM room_inspections
         WHERE room_id = $1 AND inspection_id <> $2
         ORDER BY created_at DESC LIMIT 1`,
        [roomId, id]
      );
      const previousScore = prevRes.rows[0]?.total_score ?? null;
      let scoreChange = null;
      let trend = null;
      if (previousScore !== null) {
        scoreChange = total - previousScore;
        if (scoreChange > 2) trend = 'improving';
        else if (scoreChange < -2) trend = 'declining';
        else trend = 'stable';
      }

      // Residents snapshot: employees currently in this room. We don't
      // filter by status here — snapshots are historical records, so
      // "who lived here at the time of the inspection" matters more than
      // their current employment state.
      //
      // Snapshot shape (stored as JSONB):
      //   employee_id → employees.id  (tied to the physical resident)
      //   user_id     → users.id or null (the system account, if any)
      //   name, email, language, move_in_date → for later email rendering
      //
      // We capture email + language AT THE MOMENT of scoring so the record
      // survives user deletions / language changes, and the email notifier
      // doesn't need to re-join at send-time.
      const residentsRes = await client.query(
        `SELECT e.id       AS employee_id,
                e.user_id  AS user_id,
                e.first_name || ' ' || e.last_name AS name,
                COALESCE(NULLIF(e.personal_email, ''), u.email) AS email,
                COALESCE(u.preferred_language, 'hu') AS language,
                e.created_at AS move_in_date
         FROM employees e
         LEFT JOIN users u ON u.id = e.user_id
         WHERE e.room_id = $1`,
        [roomId]
      );

      const upsert = await client.query(
        `INSERT INTO room_inspections (
           inspection_id, room_id, room_number,
           technical_score, hygiene_score, aesthetic_score,
           total_score, grade,
           previous_score, score_change, trend,
           residents_snapshot, notes, needs_attention
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (inspection_id, room_id) DO UPDATE SET
           technical_score   = EXCLUDED.technical_score,
           hygiene_score     = EXCLUDED.hygiene_score,
           aesthetic_score   = EXCLUDED.aesthetic_score,
           total_score       = EXCLUDED.total_score,
           grade             = EXCLUDED.grade,
           previous_score    = EXCLUDED.previous_score,
           score_change      = EXCLUDED.score_change,
           trend             = EXCLUDED.trend,
           residents_snapshot = EXCLUDED.residents_snapshot,
           notes             = EXCLUDED.notes,
           needs_attention   = EXCLUDED.needs_attention
         RETURNING *`,
        [
          id, roomId, roomNumber,
          tech, hyg, aes,
          total, grade,
          previousScore, scoreChange, trend,
          JSON.stringify(residentsRes.rows), notes || null, !!needs_attention,
        ]
      );

      return upsert.rows[0];
    });

    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'ROOM_MISMATCH') {
      return res.status(400).json({
        success: false,
        message: 'A szoba nem tartozik az ellenőrzés szálláshelyéhez',
      });
    }
    logger.error('[inspection.scoreRoom]', err);
    res.status(500).json({ success: false, message: 'Szoba pontozási hiba' });
  }
};

/** GET /api/v1/rooms/:id/inspection-history — per-room score history. */
const roomHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const roomRes = await query(
      `SELECT r.id, r.room_number, r.floor, r.beds, r.room_type,
              a.id AS accommodation_id, a.name AS accommodation_name
       FROM accommodation_rooms r
       LEFT JOIN accommodations a ON r.accommodation_id = a.id
       WHERE r.id = $1`,
      [id]
    );
    if (roomRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szoba nem található' });
    }

    const [historyRes, trendRes] = await Promise.all([
      query(
        `SELECT ri.*,
                i.inspection_number,
                i.inspection_type,
                i.completed_at,
                u.first_name || ' ' || u.last_name AS inspector_name
         FROM room_inspections ri
         JOIN inspections i ON ri.inspection_id = i.id
         LEFT JOIN users u ON i.inspector_id = u.id
         WHERE ri.room_id = $1
         ORDER BY ri.created_at DESC`,
        [id]
      ),
      query(
        `SELECT * FROM room_inspection_trends WHERE room_id = $1`,
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        room: roomRes.rows[0],
        trend: trendRes.rows[0] || null,
        history: historyRes.rows,
      },
    });
  } catch (err) {
    logger.error('[inspection.roomHistory]', err);
    res.status(500).json({ success: false, message: 'Szoba történeti lekérési hiba' });
  }
};

// ─── PDF downloads (Day 3 Part B) ───────────────────────────────────

/**
 * Streams a generated PDF to the client with a sensible filename. The
 * service returns a pdfkit doc that has already been `.end()`ed; we just
 * pipe it. Errors inside the generator are caught below; errors during
 * streaming are impossible to recover from gracefully — we log + hang up.
 */
async function streamPDF(res, generator, filename) {
  try {
    const doc = await generator();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);
  } catch (err) {
    if (err.message === 'INSPECTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    logger.error('[inspection.pdf]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'PDF generálási hiba' });
    }
  }
}

/** GET /api/v1/inspections/:id/pdf/legal — Jegyzőkönyv */
const pdfLegal = (req, res) =>
  streamPDF(res, () => pdfService.generateLegalProtocol(req.params.id),
            `jegyzokonyv-${req.params.id}.pdf`);

/** GET /api/v1/inspections/:id/pdf/owner — Tulajdonosi riport */
const pdfOwner = (req, res) =>
  streamPDF(res, () => pdfService.generateOwnerReport(req.params.id),
            `tulajdonosi-riport-${req.params.id}.pdf`);

/** GET /api/v1/inspections/:id/pdf/report — Belső részletes riport */
const pdfReport = (req, res) =>
  streamPDF(res, () => pdfService.generateInspectionReport(req.params.id),
            `ellenorzesi-riport-${req.params.id}.pdf`);

// ─── Email notifications (Part E follow-up) ─────────────────────────

/** GET /api/v1/inspections/:id/email-notifications — delivery trail */
const listEmailNotifications = async (req, res) => {
  try {
    const rows = await notificationSvc.listForInspection(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('[inspection.listEmailNotifications]', err);
    res.status(500).json({ success: false, message: 'Értesítések lekérési hiba' });
  }
};

/** POST /api/v1/inspections/:id/email-notifications/resend/:notifId */
const resendEmailNotification = async (req, res) => {
  try {
    const result = await notificationSvc.resendOne(req.params.notifId, { userId: req.user?.id });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'NOTIFICATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Értesítés nem található' });
    }
    logger.error('[inspection.resendEmailNotification]', err);
    res.status(500).json({ success: false, message: 'Újraküldés sikertelen' });
  }
};

/** POST /api/v1/inspections/:id/email-notifications/trigger — manual fire */
const triggerEmailNotifications = async (req, res) => {
  try {
    const result = await notificationSvc.notifyResidents(req.params.id, { userId: req.user?.id });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'INSPECTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }
    logger.error('[inspection.triggerEmailNotifications]', err);
    res.status(500).json({ success: false, message: 'Értesítés küldési hiba' });
  }
};

/** DELETE /api/v1/inspections/:id — admin only, only scheduled/cancelled */
const remove = async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM inspections
       WHERE id = $1 AND status IN ('scheduled', 'cancelled')
       RETURNING id`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: 'Csak ütemezett vagy törölt ellenőrzés törölhető',
      });
    }
    res.json({ success: true, message: 'Ellenőrzés törölve' });
  } catch (err) {
    logger.error('[inspection.remove]', err);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  addScores,
  complete,
  remove,
  listRooms,
  scoreRoom,
  roomHistory,
  pdfLegal,
  pdfOwner,
  pdfReport,
  listEmailNotifications,
  resendEmailNotification,
  triggerEmailNotifications,
  // exported helpers so the template/schedule controllers can reuse
  _helpers: { scoreToGrade, severityFromRatio, taskPriorityFromSeverity, dueOffsetDays, nextInspectionNumber },
};
