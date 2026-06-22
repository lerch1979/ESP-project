const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const CATEGORY_LABELS = {
  munkabiztonság: 'Munkabiztonság',
  beilleszkedés: 'Beilleszkedés',
  nyelvi_kurzus: 'Nyelvi kurzus',
  adminisztráció: 'Adminisztráció',
  szakmai_kepzes: 'Szakmai képzés',
  ceg_info: 'Céginformáció',
};
const LANGS = ['hu', 'en', 'uk', 'tl', 'de'];

// ── Visibility scoping ──────────────────────────────────────────────────────
// Residents (employees) see global videos + those scoped to THEIR workplace
// (e.g. Autoliv fire-safety) or contractor. Staff (no employee row) see all.
async function resolveViewerScope(req) {
  const emp = await query(
    'SELECT workplace_id FROM employees WHERE user_id = $1 LIMIT 1',
    [req.user.id],
  );
  if (emp.rows.length === 0) {
    return { isResident: false, workplaceId: null, contractorId: req.user.contractorId || null };
  }
  return { isResident: true, workplaceId: emp.rows[0].workplace_id, contractorId: req.user.contractorId || null };
}

// Returns { clause, params } that, ANDed into a videos query (alias v), limits
// rows to what this viewer may see. Staff → no restriction.
function scopeClause(scope, startIndex) {
  if (!scope.isResident) return { clause: '', params: [] };
  // workplaceId / contractorId may be null → those branches simply never match.
  return {
    clause: `AND (v.scope = 'global'
      OR (v.scope = 'workplace'  AND v.workplace_id  = $${startIndex})
      OR (v.scope = 'contractor' AND v.contractor_id = $${startIndex + 1}))`,
    params: [scope.workplaceId, scope.contractorId],
  };
}

async function getVersions(videoId) {
  const r = await query(
    `SELECT language, playback_url, provider_asset_id, duration, status
       FROM video_versions WHERE video_id = $1 ORDER BY language`,
    [videoId],
  );
  return r.rows;
}
async function getSubtitles(videoId) {
  const r = await query(
    'SELECT language, vtt_url FROM video_subtitles WHERE video_id = $1 ORDER BY language',
    [videoId],
  );
  return r.rows;
}

// Full-replace the per-language dub versions / subtitle tracks for a video.
async function replaceVersions(videoId, versions) {
  await query('DELETE FROM video_versions WHERE video_id = $1', [videoId]);
  for (const v of versions || []) {
    if (!v || !LANGS.includes(v.language) || !v.playback_url) continue;
    await query(
      `INSERT INTO video_versions (video_id, language, playback_url, provider_asset_id, duration, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [videoId, v.language, v.playback_url, v.provider_asset_id || null, parseInt(v.duration) || 0, v.status || 'ready'],
    );
  }
}
async function replaceSubtitles(videoId, subtitles) {
  await query('DELETE FROM video_subtitles WHERE video_id = $1', [videoId]);
  for (const s of subtitles || []) {
    if (!s || !LANGS.includes(s.language) || !s.vtt_url) continue;
    await query(
      'INSERT INTO video_subtitles (video_id, language, vtt_url) VALUES ($1, $2, $3)',
      [videoId, s.language, s.vtt_url],
    );
  }
}

/** GET /videos — list (scoped for residents) */
const getVideos = async (req, res) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;
    const scope = await resolveViewerScope(req);

    const where = ['v.is_active = true'];
    const params = [];
    let i = 1;
    if (search) { where.push(`(v.title ILIKE $${i} OR v.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (category) { where.push(`v.category = $${i}`); params.push(category); i++; }

    const sc = scopeClause(scope, i);
    if (sc.clause) { params.push(...sc.params); i += sc.params.length; }
    const whereClause = `WHERE ${where.join(' AND ')} ${sc.clause}`;

    const countResult = await query(`SELECT COUNT(*) AS total FROM videos v ${whereClause}`, params);
    const videosResult = await query(
      `SELECT v.*, COALESCE(vc.view_count, 0)::int AS view_count
         FROM videos v
         LEFT JOIN (SELECT video_id, COUNT(*) AS view_count FROM video_views GROUP BY video_id) vc
           ON vc.video_id = v.id
        ${whereClause}
        ORDER BY v.is_featured DESC, v.created_at DESC
        LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    res.json({
      success: true,
      data: {
        videos: videosResult.rows,
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    logger.error('Videók lekérése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videók lekérése sikertelen' });
  }
};

/** GET /videos/:id — detail incl. per-language versions + subtitles (scope-checked) */
const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const scope = await resolveViewerScope(req);

    const result = await query(
      `SELECT v.*, COALESCE(vc.view_count, 0)::int AS view_count
         FROM videos v
         LEFT JOIN (SELECT video_id, COUNT(*) AS view_count FROM video_views GROUP BY video_id) vc
           ON vc.video_id = v.id
        WHERE v.id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Videó nem található' });
    }
    const video = result.rows[0];

    // Residents may only fetch a video within their scope.
    if (scope.isResident && video.scope !== 'global') {
      const ok = (video.scope === 'workplace' && video.workplace_id === scope.workplaceId)
        || (video.scope === 'contractor' && video.contractor_id === scope.contractorId);
      if (!ok) return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    video.versions = await getVersions(id);
    video.subtitles = await getSubtitles(id);
    res.json({ success: true, data: video });
  } catch (error) {
    logger.error('Videó lekérése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó lekérése sikertelen' });
  }
};

function validateScopeBody(body) {
  const scope = body.scope || 'global';
  if (!['global', 'workplace', 'contractor'].includes(scope)) return 'Érvénytelen láthatóság (scope)';
  if (scope === 'workplace' && !body.workplace_id) return 'Munkahely (workplace) megadása kötelező scope=workplace esetén';
  if (scope === 'contractor' && !body.contractor_id) return 'Megbízó (contractor) megadása kötelező scope=contractor esetén';
  return null;
}

/** POST /videos — create (admin) incl. versions + subtitles */
const createVideo = async (req, res) => {
  try {
    const {
      title, description, url, thumbnail_url, category, duration,
      scope = 'global', workplace_id, contractor_id, base_language, is_featured,
      versions, subtitles,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'Cím megadása kötelező' });
    if (category && !CATEGORY_LABELS[category]) return res.status(400).json({ success: false, message: 'Érvénytelen kategória' });
    const scopeErr = validateScopeBody(req.body);
    if (scopeErr) return res.status(400).json({ success: false, message: scopeErr });
    // A video must have either a base url (fallback) or at least one language version.
    if (!url && !(Array.isArray(versions) && versions.length)) {
      return res.status(400).json({ success: false, message: 'URL vagy legalább egy nyelvi videóverzió megadása kötelező' });
    }

    const result = await query(
      `INSERT INTO videos (title, description, url, thumbnail_url, category, duration,
                           scope, workplace_id, contractor_id, base_language, is_featured, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        title, description || null, url || null, thumbnail_url || null, category || 'ceg_info', parseInt(duration) || 0,
        scope, scope === 'workplace' ? workplace_id : null, scope === 'contractor' ? contractor_id : null,
        LANGS.includes(base_language) ? base_language : 'hu', !!is_featured, req.user.id,
      ],
    );
    const video = result.rows[0];
    await replaceVersions(video.id, versions);
    await replaceSubtitles(video.id, subtitles);
    video.versions = await getVersions(video.id);
    video.subtitles = await getSubtitles(video.id);

    logger.info(`Új videó létrehozva: ${video.id} - ${title} (scope=${scope})`);
    res.status(201).json({ success: true, data: video });
  } catch (error) {
    logger.error('Videó létrehozása sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó létrehozása sikertelen' });
  }
};

/** PUT /videos/:id — update (admin); re-replaces versions/subtitles if provided */
const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'description', 'url', 'thumbnail_url', 'category', 'duration',
      'scope', 'workplace_id', 'contractor_id', 'base_language', 'is_featured'];

    if (req.body.category !== undefined && !CATEGORY_LABELS[req.body.category]) {
      return res.status(400).json({ success: false, message: 'Érvénytelen kategória' });
    }
    if (req.body.scope !== undefined) {
      const scopeErr = validateScopeBody(req.body);
      if (scopeErr) return res.status(400).json({ success: false, message: scopeErr });
    }

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      let value = req.body[field];
      if (field === 'duration') value = parseInt(value) || 0;
      if (field === 'is_featured') value = !!value;
      // Null out the non-matching target when scope changes.
      if (field === 'workplace_id' && req.body.scope && req.body.scope !== 'workplace') value = null;
      if (field === 'contractor_id' && req.body.scope && req.body.scope !== 'contractor') value = null;
      setClauses.push(`${field} = $${i}`); values.push(value); i++;
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = now()`);
      values.push(id);
      const result = await query(`UPDATE videos SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`, values);
      if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    if (Array.isArray(req.body.versions)) await replaceVersions(id, req.body.versions);
    if (Array.isArray(req.body.subtitles)) await replaceSubtitles(id, req.body.subtitles);

    const out = await query('SELECT * FROM videos WHERE id = $1', [id]);
    if (out.rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });
    const video = out.rows[0];
    video.versions = await getVersions(id);
    video.subtitles = await getSubtitles(id);

    logger.info(`Videó frissítve: ${id}`);
    res.json({ success: true, data: video });
  } catch (error) {
    logger.error('Videó frissítése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó frissítése sikertelen' });
  }
};

/** DELETE /videos/:id — soft delete */
const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE videos SET is_active = false WHERE id = $1 AND is_active = true RETURNING id',
      [id],
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });
    logger.info(`Videó törölve (soft): ${id}`);
    res.json({ success: true, message: 'Videó sikeresen törölve' });
  } catch (error) {
    logger.error('Videó törlése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó törlése sikertelen' });
  }
};

/** GET /videos/categories */
const getCategories = async (req, res) => {
  try {
    const categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Kategóriák lekérése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Kategóriák lekérése sikertelen' });
  }
};

/** POST /videos/:id/view — record progress / completion (upsert; compliance evidence) */
const recordView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { completed = false, progress_pct, last_position_sec, language } = req.body;

    const videoCheck = await query('SELECT id FROM videos WHERE id = $1 AND is_active = true', [id]);
    if (videoCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });

    const isCompleted = !!completed || (parseInt(progress_pct) || 0) >= 90;
    const result = await query(
      `INSERT INTO video_views
         (user_id, video_id, completed, completed_at, progress_pct, last_position_sec, language_watched, watched_at, updated_at, watch_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), 1)
       ON CONFLICT (user_id, video_id) DO UPDATE SET
         completed         = video_views.completed OR EXCLUDED.completed,
         completed_at      = COALESCE(video_views.completed_at, EXCLUDED.completed_at),
         progress_pct      = GREATEST(video_views.progress_pct, EXCLUDED.progress_pct),
         last_position_sec = EXCLUDED.last_position_sec,
         language_watched  = COALESCE(EXCLUDED.language_watched, video_views.language_watched),
         watch_count       = video_views.watch_count + 1,
         updated_at        = now()
       RETURNING *`,
      [
        userId, id, isCompleted, isCompleted ? new Date() : null,
        Math.max(0, Math.min(100, parseInt(progress_pct) || (isCompleted ? 100 : 0))),
        parseInt(last_position_sec) || 0, LANGS.includes(language) ? language : null,
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Megtekintés rögzítése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Megtekintés rögzítése sikertelen' });
  }
};

/** GET /videos/:id/compliance?workplace_id= — who has/hasn't completed (admin, compliance evidence) */
const getCompliance = async (req, res) => {
  try {
    const { id } = req.params;
    const { workplace_id } = req.query;

    const vres = await query('SELECT id, title, scope, workplace_id FROM videos WHERE id = $1', [id]);
    if (vres.rows.length === 0) return res.status(404).json({ success: false, message: 'Videó nem található' });
    const video = vres.rows[0];

    // Audience = the employees the video targets (its workplace, or a filter), else all.
    const targetWorkplace = workplace_id || (video.scope === 'workplace' ? video.workplace_id : null);
    const params = [id];
    let audienceClause = '';
    if (targetWorkplace) { params.push(targetWorkplace); audienceClause = `AND e.workplace_id = $${params.length}`; }

    const rows = await query(
      `SELECT e.id AS employee_id, e.first_name, e.last_name,
              w.name AS workplace,
              (vv.completed_at IS NOT NULL) AS completed,
              vv.completed_at, COALESCE(vv.progress_pct, 0) AS progress_pct, vv.language_watched
         FROM employees e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN workplaces w ON w.id = e.workplace_id
         LEFT JOIN video_views vv ON vv.video_id = $1 AND vv.user_id = e.user_id
        WHERE e.user_id IS NOT NULL ${audienceClause}
        ORDER BY completed ASC, e.last_name, e.first_name`,
      params,
    );

    const total = rows.rows.length;
    const completed = rows.rows.filter((r) => r.completed).length;
    res.json({
      success: true,
      data: {
        video: { id: video.id, title: video.title, scope: video.scope },
        summary: { total, completed, pending: total - completed, completionPct: total ? Math.round((completed / total) * 1000) / 10 : 0 },
        rows: rows.rows,
      },
    });
  } catch (error) {
    logger.error('Megtekintési riport sikertelen:', error);
    res.status(500).json({ success: false, message: 'Megtekintési riport sikertelen' });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
  getCategories,
  recordView,
  getCompliance,
};
