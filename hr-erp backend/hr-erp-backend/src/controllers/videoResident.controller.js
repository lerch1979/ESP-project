/**
 * Resident-facing video access — Path B, self-scoped (2026-06-09 decision).
 *
 * Residents NEVER receive `videos.view`. That permission is blanket and staff-wide; these
 * endpoints are auth-only and resolve everything from `req.user.id`, exactly like
 * /tickets/my and /accommodations/my.
 *
 * What a resident may see (the LIBRARY):
 *   • every globally-scoped active video, plus
 *   • anything they were personally sent (video_announcement_recipients)
 * so a situational topic — doctor, bank — is findable when they need it, not only in the
 * moment it was pushed. Scoped videos they were never sent stay invisible.
 *
 * Language: each video resolves to the caller's `preferred_language` version from
 * video_versions, falling back to the video's base_language, then its plain url.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const DEFAULT_LANG = 'hu';

const lang = (req) => req.user?.preferredLanguage || req.user?.preferred_language || DEFAULT_LANG;

/**
 * The visible set, with the caller's language version resolved.
 * Ordering puts anything they were SENT first (most recent), then the rest of the library.
 */
const VISIBLE_SQL = `
  WITH me AS (SELECT $1::uuid AS user_id, $2::text AS lang),
  sent AS (
    SELECT a.video_id, MAX(a.sent_at) AS sent_at, BOOL_OR(a.is_mandatory) AS mandatory
      FROM video_announcement_recipients r
      JOIN video_announcements a ON a.id = r.announcement_id
     WHERE r.user_id = (SELECT user_id FROM me)
     GROUP BY a.video_id
  )
  SELECT v.id, v.title, v.description, v.category, v.duration, v.thumbnail_url,
         v.base_language, v.created_at,
         COALESCE(ver.playback_url, base.playback_url, v.url) AS playback_url,
         COALESCE(ver.language, base.language, v.base_language) AS playback_language,
         (ver.id IS NOT NULL) AS in_my_language,
         sub.vtt_url AS subtitle_url,
         s.sent_at, COALESCE(s.mandatory, FALSE) AS mandatory,
         (s.video_id IS NOT NULL) AS was_sent_to_me,
         vv.completed, COALESCE(vv.progress_pct, 0) AS progress_pct, vv.last_position_sec
    FROM videos v
    LEFT JOIN sent s ON s.video_id = v.id
    LEFT JOIN video_versions ver
           ON ver.video_id = v.id AND ver.language = (SELECT lang FROM me) AND ver.status <> 'failed'
    LEFT JOIN video_versions base
           ON base.video_id = v.id AND base.language = v.base_language AND base.status <> 'failed'
    LEFT JOIN video_subtitles sub
           ON sub.video_id = v.id AND sub.language = (SELECT lang FROM me)
    LEFT JOIN video_views vv
           ON vv.video_id = v.id AND vv.user_id = (SELECT user_id FROM me)
   WHERE v.is_active = TRUE
     AND (v.scope = 'global' OR s.video_id IS NOT NULL)
`;

/** GET /videos/my — the library. Optional ?category= &search= &only=sent|unwatched */
const getMyVideos = async (req, res) => {
  try {
    const { category, search, only } = req.query;
    const params = [req.user.id, lang(req)];
    let sql = VISIBLE_SQL;
    if (category) { params.push(category); sql += ` AND v.category = $${params.length}`; }
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (v.title ILIKE $${params.length} OR COALESCE(v.description,'') ILIKE $${params.length})`;
    }
    if (only === 'sent') sql += ` AND s.video_id IS NOT NULL`;
    if (only === 'unwatched') sql += ` AND (vv.completed IS NOT TRUE)`;
    sql += ` ORDER BY s.sent_at DESC NULLS LAST, v.created_at DESC`;

    const rows = (await query(sql, params)).rows;

    // Categories for the browse tabs, counted over what THIS resident can see.
    const cats = {};
    for (const r of rows) cats[r.category || 'egyeb'] = (cats[r.category || 'egyeb'] || 0) + 1;

    res.json({
      success: true,
      data: {
        videos: rows,
        categories: Object.entries(cats).map(([slug, count]) => ({ slug, count })),
        language: lang(req),
        unwatched_mandatory: rows.filter((r) => r.mandatory && !r.completed).length,
      },
    });
  } catch (error) {
    logger.error('Resident videó lista hiba:', error);
    res.status(500).json({ success: false, message: 'Videók lekérési hiba' });
  }
};

/** GET /videos/my/:id — one video, same visibility rule, 404 if not theirs to see. */
const getMyVideoById = async (req, res) => {
  try {
    const rows = (await query(`${VISIBLE_SQL} AND v.id = $3`, [req.user.id, lang(req), req.params.id])).rows;
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });
    res.json({ success: true, data: { video: rows[0] } });
  } catch (error) {
    logger.error('Resident videó lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Videó lekérési hiba' });
  }
};

/**
 * POST /videos/my/:id/view — progress + completion. This is the WATCH EVIDENCE that the
 * compliance view reports for mandatory notices, so it is written on the resident's own
 * behalf only (user_id from the token, never from the body).
 */
const recordMyView = async (req, res) => {
  try {
    const { completed = false, progress_pct, last_position_sec } = req.body || {};
    // Visibility check first: you cannot generate evidence for a video you cannot see.
    const visible = (await query(`${VISIBLE_SQL} AND v.id = $3`, [req.user.id, lang(req), req.params.id])).rows[0];
    if (!visible) return res.status(404).json({ success: false, message: 'Videó nem található' });

    const pct = Math.max(0, Math.min(100, parseInt(progress_pct, 10) || 0));
    const isCompleted = !!completed || pct >= 90;   // same 90% rule as the staff endpoint
    const r = (await query(
      `INSERT INTO video_views
         (user_id, video_id, completed, completed_at, progress_pct, last_position_sec, language_watched, watched_at, updated_at, watch_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now(), 1)
       ON CONFLICT (user_id, video_id) DO UPDATE SET
         completed         = video_views.completed OR EXCLUDED.completed,
         completed_at      = COALESCE(video_views.completed_at, EXCLUDED.completed_at),
         progress_pct      = GREATEST(video_views.progress_pct, EXCLUDED.progress_pct),
         last_position_sec = EXCLUDED.last_position_sec,
         language_watched  = EXCLUDED.language_watched,
         watched_at        = now(), updated_at = now(),
         watch_count       = video_views.watch_count + 1
       RETURNING completed, progress_pct, watch_count`,
      [req.user.id, req.params.id, isCompleted, isCompleted ? new Date() : null, pct,
       parseInt(last_position_sec, 10) || 0, visible.playback_language || lang(req)])).rows[0];

    res.json({ success: true, data: r });
  } catch (error) {
    logger.error('Resident videó nézettség hiba:', error);
    res.status(500).json({ success: false, message: 'Nézettség rögzítési hiba' });
  }
};

module.exports = { getMyVideos, getMyVideoById, recordMyView };
