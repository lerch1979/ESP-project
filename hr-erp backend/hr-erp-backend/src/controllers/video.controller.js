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

/**
 * GET /videos
 * Videók listázása keresés, kategória szűrő, lapozás
 */
const getVideos = async (req, res) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['v.is_active = true'];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(v.title ILIKE $${paramIndex} OR v.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`v.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM videos v ${whereClause}`,
      params
    );

    // Videos with view count
    const videosResult = await query(
      `SELECT
        v.*,
        COALESCE(vc.view_count, 0)::int as view_count
      FROM videos v
      LEFT JOIN (
        SELECT video_id, COUNT(*) as view_count
        FROM video_views
        GROUP BY video_id
      ) vc ON vc.video_id = v.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
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

/**
 * GET /videos/:id
 * Egy videó részletei
 */
const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        v.*,
        COALESCE(vc.view_count, 0)::int as view_count
      FROM videos v
      LEFT JOIN (
        SELECT video_id, COUNT(*) as view_count
        FROM video_views
        GROUP BY video_id
      ) vc ON vc.video_id = v.id
      WHERE v.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Videó lekérése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó lekérése sikertelen' });
  }
};

/**
 * POST /videos
 * Új videó létrehozása (admin)
 */
const createVideo = async (req, res) => {
  try {
    const { title, description, url, thumbnail_url, category, duration } = req.body;

    if (!title || !url) {
      return res.status(400).json({ success: false, message: 'Cím és URL megadása kötelező' });
    }

    if (category && !CATEGORY_LABELS[category]) {
      return res.status(400).json({ success: false, message: 'Érvénytelen kategória' });
    }

    const result = await query(
      `INSERT INTO videos (title, description, url, thumbnail_url, category, duration)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description || null, url, thumbnail_url || null, category || 'ceg_info', parseInt(duration) || 0]
    );

    logger.info(`Új videó létrehozva: ${result.rows[0].id} - ${title}`);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Videó létrehozása sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó létrehozása sikertelen' });
  }
};

/**
 * PUT /videos/:id
 * Videó frissítése (admin)
 */
const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['title', 'description', 'url', 'thumbnail_url', 'category', 'duration'];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'duration') value = parseInt(value) || 0;
        if (field === 'category' && !CATEGORY_LABELS[value]) {
          return res.status(400).json({ success: false, message: 'Érvénytelen kategória' });
        }
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }

    values.push(id);

    const result = await query(
      `UPDATE videos SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    logger.info(`Videó frissítve: ${id}`);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Videó frissítése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó frissítése sikertelen' });
  }
};

/**
 * DELETE /videos/:id
 * Videó törlése (soft delete via is_active=false)
 */
const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE videos SET is_active = false WHERE id = $1 AND is_active = true RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    logger.info(`Videó törölve (soft): ${id}`);

    res.json({ success: true, message: 'Videó sikeresen törölve' });
  } catch (error) {
    logger.error('Videó törlése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Videó törlése sikertelen' });
  }
};

/**
 * GET /videos/categories
 * Kategóriák listázása
 */
const getCategories = async (req, res) => {
  try {
    const categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
      value,
      label,
    }));

    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Kategóriák lekérése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Kategóriák lekérése sikertelen' });
  }
};

/**
 * POST /videos/:id/view
 * Megtekintés rögzítése
 */
const recordView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { completed } = req.body;

    // Check video exists
    const videoCheck = await query('SELECT id FROM videos WHERE id = $1 AND is_active = true', [id]);
    if (videoCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Videó nem található' });
    }

    const result = await query(
      `INSERT INTO video_views (user_id, video_id, completed)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, id, completed || false]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Megtekintés rögzítése sikertelen:', error);
    res.status(500).json({ success: false, message: 'Megtekintés rögzítése sikertelen' });
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
};
