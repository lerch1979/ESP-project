/**
 * Admin HTTP layer for video communication (mig 143):
 *   • ad-hoc sends (Mode B)
 *   • sequence CRUD + steps (Modes A1/A2) — several sequences, created without code changes
 *   • audience preview (see the headcount BEFORE sending)
 *   • per-announcement compliance: who was SENT it vs. who WATCHED it
 *   • delivery config (per-day cap, re-nag window)
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const audienceSvc = require('../services/videoAudience.service');
const announce = require('../services/videoAnnounce.service');
const sequences = require('../services/videoSequence.service');

const ANCHORS = ['move_in', 'employment_start', 'calendar'];

/* ── audience ─────────────────────────────────────────────────────── */

// GET /video-comms/audience/options — pickers + live counts, so an empty filter is obvious.
const audienceOptions = async (req, res) => {
  try { res.json({ success: true, data: await audienceSvc.options() }); }
  catch (e) { logger.error('[videoComms.audienceOptions]', e.message); res.status(500).json({ success: false, message: 'Lekérési hiba' }); }
};

// POST /video-comms/audience/preview — "whoever it concerns", counted before you commit.
const audiencePreview = async (req, res) => {
  try {
    const r = await audienceSvc.resolve(req.body?.audience || {});
    res.json({ success: true, data: { count: r.count, warnings: r.warnings,
      by_language: r.recipients.reduce((a, x) => { a[x.language] = (a[x.language] || 0) + 1; return a; }, {}),
      sample: r.recipients.slice(0, 10).map((x) => `${x.last_name} ${x.first_name}`) } });
  } catch (e) { logger.error('[videoComms.audiencePreview]', e.message); res.status(500).json({ success: false, message: 'Előnézeti hiba' }); }
};

/* ── Mode B: ad-hoc send ──────────────────────────────────────────── */

// POST /video-comms/send  { video_id, audience, is_mandatory }
const sendNow = async (req, res) => {
  try {
    const { video_id, audience, is_mandatory } = req.body || {};
    if (!video_id) return res.status(400).json({ success: false, message: 'Videó kiválasztása kötelező' });
    const result = await announce.send(video_id, audience || {}, {
      isMandatory: !!is_mandatory, createdBy: req.user?.id, source: 'adhoc',
    });
    if (result.skipped === 'no_recipients') {
      return res.status(422).json({ success: false, message: 'A megadott célközönségre nincs címzett.', data: result });
    }
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[videoComms.sendNow]', e.message);
    res.status(500).json({ success: false, message: e.message || 'Küldési hiba' });
  }
};

/* ── Modes A1/A2: sequences ───────────────────────────────────────── */

const listSequences = async (req, res) => {
  try {
    const rows = (await query(
      `SELECT s.*,
              COUNT(st.id)::int AS step_count,
              (SELECT COUNT(*)::int FROM video_sequence_sends x WHERE x.sequence_id = s.id) AS sends
         FROM video_sequences s
         LEFT JOIN video_sequence_steps st ON st.sequence_id = s.id
        GROUP BY s.id ORDER BY s.created_at DESC`)).rows;
    res.json({ success: true, data: { sequences: rows } });
  } catch (e) { logger.error('[videoComms.listSequences]', e.message); res.status(500).json({ success: false, message: 'Lekérési hiba' }); }
};

const getSequence = async (req, res) => {
  try {
    const seq = (await query(`SELECT * FROM video_sequences WHERE id = $1`, [req.params.id])).rows[0];
    if (!seq) return res.status(404).json({ success: false, message: 'Sorozat nem található' });
    seq.steps = (await query(
      `SELECT st.*, v.title AS video_title, v.category
         FROM video_sequence_steps st JOIN videos v ON v.id = st.video_id
        WHERE st.sequence_id = $1
        ORDER BY COALESCE(st.day_offset, 0), st.month_day NULLS LAST, st.sort_order`, [req.params.id])).rows;
    res.json({ success: true, data: { sequence: seq } });
  } catch (e) { logger.error('[videoComms.getSequence]', e.message); res.status(500).json({ success: false, message: 'Lekérési hiba' }); }
};

const createSequence = async (req, res) => {
  try {
    const { name, description, anchor_type, audience, is_active } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Név megadása kötelező' });
    if (!ANCHORS.includes(anchor_type)) {
      return res.status(400).json({ success: false, message: `Horgony típusa: ${ANCHORS.join(' | ')}` });
    }
    const r = (await query(
      `INSERT INTO video_sequences (name, description, anchor_type, audience, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), description || null, anchor_type, JSON.stringify(audience || {}), is_active === true, req.user?.id || null])).rows[0];
    res.status(201).json({ success: true, data: { sequence: r } });
  } catch (e) { logger.error('[videoComms.createSequence]', e.message); res.status(500).json({ success: false, message: 'Létrehozási hiba' }); }
};

const updateSequence = async (req, res) => {
  try {
    const { name, description, audience, is_active, anchor_type } = req.body || {};
    if (anchor_type !== undefined && !ANCHORS.includes(anchor_type)) {
      return res.status(400).json({ success: false, message: `Horgony típusa: ${ANCHORS.join(' | ')}` });
    }
    const sets = []; const params = [];
    const put = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (name !== undefined) put('name', name);
    if (description !== undefined) put('description', description || null);
    if (audience !== undefined) put('audience', JSON.stringify(audience || {}));
    if (is_active !== undefined) put('is_active', is_active === true);
    if (anchor_type !== undefined) put('anchor_type', anchor_type);
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nincs módosítandó mező' });
    params.push(req.params.id);
    const r = (await query(
      `UPDATE video_sequences SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)).rows[0];
    if (!r) return res.status(404).json({ success: false, message: 'Sorozat nem található' });
    res.json({ success: true, data: { sequence: r } });
  } catch (e) { logger.error('[videoComms.updateSequence]', e.message); res.status(500).json({ success: false, message: 'Mentési hiba' }); }
};

const deleteSequence = async (req, res) => {
  try {
    const r = await query(`DELETE FROM video_sequences WHERE id = $1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Sorozat nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[videoComms.deleteSequence]', e.message); res.status(500).json({ success: false, message: 'Törlési hiba' }); }
};

// POST /video-comms/sequences/:id/steps  { video_id, day_offset | month_day, is_mandatory }
const addStep = async (req, res) => {
  try {
    const seq = (await query(`SELECT anchor_type FROM video_sequences WHERE id = $1`, [req.params.id])).rows[0];
    if (!seq) return res.status(404).json({ success: false, message: 'Sorozat nem található' });
    const { video_id, day_offset, month_day, is_mandatory, sort_order } = req.body || {};
    if (!video_id) return res.status(400).json({ success: false, message: 'Videó kötelező' });

    // The scheduling key must match the parent's anchor — a day offset is meaningless on a
    // calendar sequence and a month-day is meaningless on a drip.
    if (seq.anchor_type === 'calendar') {
      if (!/^[0-1][0-9]-[0-3][0-9]$/.test(month_day || '')) {
        return res.status(400).json({ success: false, message: 'Naptári sorozathoz hónap-nap kell (HH-NN, pl. 12-20)' });
      }
    } else if (!(Number.isInteger(Number(day_offset)) && Number(day_offset) >= 1)) {
      return res.status(400).json({ success: false, message: 'Nap-index kötelező (1 = a horgony napja)' });
    }

    const r = (await query(
      `INSERT INTO video_sequence_steps (sequence_id, video_id, day_offset, month_day, is_mandatory, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, video_id,
       seq.anchor_type === 'calendar' ? null : Number(day_offset),
       seq.anchor_type === 'calendar' ? month_day : null,
       !!is_mandatory, Number(sort_order) || 0])).rows[0];
    res.status(201).json({ success: true, data: { step: r } });
  } catch (e) { logger.error('[videoComms.addStep]', e.message); res.status(500).json({ success: false, message: 'Lépés hozzáadási hiba' }); }
};

const deleteStep = async (req, res) => {
  try {
    const r = await query(`DELETE FROM video_sequence_steps WHERE id = $1 AND sequence_id = $2`, [req.params.stepId, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Lépés nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[videoComms.deleteStep]', e.message); res.status(500).json({ success: false, message: 'Törlési hiba' }); }
};

// POST /video-comms/sequences/run  { dry_run?, today? } — manual trigger of the daily job.
const runSequences = async (req, res) => {
  try { res.json({ success: true, data: await sequences.runDaily({ dryRun: req.body?.dry_run === true, today: req.body?.today || null }) }); }
  catch (e) { logger.error('[videoComms.runSequences]', e.message); res.status(500).json({ success: false, message: 'Futtatási hiba' }); }
};

/* ── compliance: sent vs. watched ─────────────────────────────────── */

/**
 * GET /video-comms/announcements/:id/compliance
 * Evidence for a mandatory notice: everyone it was SENT to, and whether they watched.
 * Deliberately scoped to the announcement's real recipients — not to a guessed audience.
 */
const announcementCompliance = async (req, res) => {
  try {
    const a = (await query(
      `SELECT a.*, v.title AS video_title FROM video_announcements a
         JOIN videos v ON v.id = a.video_id WHERE a.id = $1`, [req.params.id])).rows[0];
    if (!a) return res.status(404).json({ success: false, message: 'Küldés nem található' });

    const rows = (await query(
      `SELECT r.user_id, r.language, r.push_ok, r.renag_sent_at,
              e.first_name, e.last_name,
              acc.name AS accommodation,
              (vv.completed IS TRUE) AS watched,
              vv.completed_at, COALESCE(vv.progress_pct,0) AS progress_pct, vv.language_watched
         FROM video_announcement_recipients r
         LEFT JOIN employees e ON e.id = r.employee_id
         LEFT JOIN accommodations acc ON acc.id = e.accommodation_id
         LEFT JOIN video_views vv ON vv.user_id = r.user_id AND vv.video_id = $2
        WHERE r.announcement_id = $1
        ORDER BY watched ASC, e.last_name, e.first_name`, [req.params.id, a.video_id])).rows;

    const watched = rows.filter((r) => r.watched).length;
    res.json({
      success: true,
      data: {
        announcement: { id: a.id, video_id: a.video_id, video_title: a.video_title,
                        sent_at: a.sent_at, is_mandatory: a.is_mandatory, source: a.source },
        sent: rows.length, watched, not_watched: rows.length - watched,
        watched_pct: rows.length ? Math.round((watched / rows.length) * 100) : 0,
        push_delivered: rows.filter((r) => r.push_ok).length,
        recipients: rows,
      },
    });
  } catch (e) { logger.error('[videoComms.compliance]', e.message); res.status(500).json({ success: false, message: 'Lekérési hiba' }); }
};

const listAnnouncements = async (req, res) => {
  try {
    const rows = (await query(
      `SELECT a.id, a.video_id, v.title AS video_title, a.source, a.is_mandatory, a.sent_at, a.recipient_count,
              (SELECT COUNT(*)::int FROM video_announcement_recipients r
                 JOIN video_views vv ON vv.user_id = r.user_id AND vv.video_id = a.video_id AND vv.completed
                WHERE r.announcement_id = a.id) AS watched_count
         FROM video_announcements a JOIN videos v ON v.id = a.video_id
        ORDER BY a.sent_at DESC LIMIT 100`)).rows;
    res.json({ success: true, data: { announcements: rows } });
  } catch (e) { logger.error('[videoComms.listAnnouncements]', e.message); res.status(500).json({ success: false, message: 'Lekérési hiba' }); }
};

/* ── config ───────────────────────────────────────────────────────── */

const getConfig = async (req, res) => {
  try { res.json({ success: true, data: await sequences.getConfig() }); }
  catch (e) { res.status(500).json({ success: false, message: 'Konfiguráció lekérési hiba' }); }
};

const updateConfig = async (req, res) => {
  try {
    const { enabled, max_videos_per_day, renag_after_days, renag_enabled } = req.body || {};
    if (max_videos_per_day !== undefined && !(Number(max_videos_per_day) >= 0)) {
      return res.status(400).json({ success: false, message: 'A napi korlát nem lehet negatív' });
    }
    const r = (await query(
      `UPDATE video_delivery_config SET
         enabled            = COALESCE($1, enabled),
         max_videos_per_day = COALESCE($2, max_videos_per_day),
         renag_after_days   = COALESCE($3, renag_after_days),
         renag_enabled      = COALESCE($4, renag_enabled),
         updated_by = $5, updated_at = NOW()
       WHERE id = (SELECT id FROM video_delivery_config ORDER BY created_at LIMIT 1) RETURNING *`,
      [enabled ?? null, max_videos_per_day ?? null, renag_after_days ?? null, renag_enabled ?? null, req.user?.id || null])).rows[0];
    res.json({ success: true, data: r });
  } catch (e) { logger.error('[videoComms.updateConfig]', e.message); res.status(500).json({ success: false, message: 'Mentési hiba' }); }
};

module.exports = {
  audienceOptions, audiencePreview, sendNow,
  listSequences, getSequence, createSequence, updateSequence, deleteSequence, addStep, deleteStep, runSequences,
  announcementCompliance, listAnnouncements, getConfig, updateConfig,
};
