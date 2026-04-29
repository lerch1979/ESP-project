/**
 * Photo upload + gallery for tasks (migration 107).
 *
 *   POST   /api/v1/tasks/:taskId/photos       multipart, field "photos"
 *   GET    /api/v1/tasks/:taskId/photos
 *   DELETE /api/v1/tasks/:taskId/photos/:photoId
 *
 * Storage layout (relative to uploads/tasks/photos/):
 *   ${taskId}/${ts}_${rand}.jpg          ← main, max 1600px on long side
 *   ${taskId}/${ts}_${rand}_thumb.jpg    ← 300px thumbnail
 *
 * The static dir is already exposed at /uploads (server.js), so the
 * UI fetches the saved photo via that path. We never let multer write
 * to disk directly — buffers run through sharp first so EXIF strips,
 * orientation normalises, and oversized originals never hit storage.
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const PHOTO_DIR = path.join(__dirname, '..', '..', 'uploads', 'tasks', 'photos');
const PHOTO_URL_PREFIX = '/uploads/tasks/photos';
const MAX_PHOTOS_PER_TASK = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_TYPES = new Set(['before', 'during', 'after', 'general']);

// multer config: memory storage, mime + size guarded. multer.array('photos', N)
// is invoked from the route so the limit reads from MAX_PHOTOS_PER_TASK.
const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_PHOTOS_PER_TASK },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Csak JPG / PNG / WEBP fájl tölthető fel'));
    }
    cb(null, true);
  },
}).array('photos', MAX_PHOTOS_PER_TASK);

function _isAdmin(req) {
  return (req.user.roles || []).some(r => r === 'admin' || r === 'superadmin');
}

async function _ensureTaskDir(taskId) {
  const dir = path.join(PHOTO_DIR, taskId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ── List ──────────────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { taskId } = req.params;
    const r = await query(
      `SELECT p.id, p.task_id, p.uploaded_by, p.photo_url,
              p.thumbnail_url, p.photo_type, p.caption,
              p.size_bytes, p.width, p.height, p.created_at,
              u.first_name, u.last_name, u.email
         FROM task_photos p
         LEFT JOIN users u ON u.id = p.uploaded_by
        WHERE p.task_id = $1
        ORDER BY p.created_at ASC`,
      [taskId]
    );
    res.json({ success: true, data: { photos: r.rows } });
  } catch (err) {
    logger.error('[taskPhotos.list]', err.message);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

// ── Upload ────────────────────────────────────────────────────────────
const upload = async (req, res) => {
  try {
    const { taskId } = req.params;

    // Reject silently when there's already a full gallery to keep the
    // disk bounded. Per-request multer limit only protects single bursts.
    const existing = await query(`SELECT COUNT(*)::int AS n FROM task_photos WHERE task_id = $1`, [taskId]);
    const existingCount = existing.rows[0].n;
    const incomingCount = (req.files || []).length;
    if (existingCount + incomingCount > MAX_PHOTOS_PER_TASK) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PHOTOS_PER_TASK} fotó tölthető fel feladatonként (jelenleg: ${existingCount})`,
      });
    }
    if (incomingCount === 0) {
      return res.status(400).json({ success: false, message: 'Nincs feltöltött fájl' });
    }

    const photoType = ALLOWED_TYPES.has(req.body.photo_type) ? req.body.photo_type : 'general';
    const caption = (req.body.caption || '').slice(0, 500) || null;

    const dir = await _ensureTaskDir(taskId);
    const inserted = [];

    for (const file of req.files) {
      const ts = Date.now();
      const rand = crypto.randomBytes(4).toString('hex');
      const baseName = `${ts}_${rand}`;
      const mainPath = path.join(dir, `${baseName}.jpg`);
      const thumbPath = path.join(dir, `${baseName}_thumb.jpg`);

      // Main: max 1600px long-side, JPEG quality 82, EXIF stripped.
      const mainBuf = await sharp(file.buffer)
        .rotate()                     // honor EXIF, then strip below
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      await fs.writeFile(mainPath, mainBuf.data);

      const thumbBuf = await sharp(file.buffer)
        .rotate()
        .resize(300, 300, { fit: 'cover' })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      await fs.writeFile(thumbPath, thumbBuf);

      const photoUrl = `${PHOTO_URL_PREFIX}/${taskId}/${baseName}.jpg`;
      const thumbUrl = `${PHOTO_URL_PREFIX}/${taskId}/${baseName}_thumb.jpg`;

      const r = await query(
        `INSERT INTO task_photos
           (task_id, uploaded_by, photo_url, thumbnail_url,
            photo_type, caption, size_bytes, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [taskId, req.user.id, photoUrl, thumbUrl, photoType, caption,
         mainBuf.data.length, mainBuf.info.width, mainBuf.info.height]
      );
      inserted.push(r.rows[0]);
    }

    res.status(201).json({ success: true, data: { photos: inserted } });
  } catch (err) {
    logger.error('[taskPhotos.upload]', err.message);
    res.status(500).json({ success: false, message: err.message || 'Feltöltési hiba' });
  }
};

// ── Delete ────────────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const { taskId, photoId } = req.params;
    // Look up so we can delete the file from disk and check ownership
    const r = await query(
      `SELECT id, uploaded_by, photo_url, thumbnail_url
         FROM task_photos
        WHERE id = $1 AND task_id = $2`,
      [photoId, taskId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    const row = r.rows[0];
    if (row.uploaded_by !== req.user.id && !_isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Csak a feltöltő vagy admin törölhet' });
    }

    await query(`DELETE FROM task_photos WHERE id = $1`, [photoId]);

    // Best-effort file cleanup. Failure shouldn't break the API contract
    // (the row is gone — orphan files can be reaped offline).
    const baseUploads = path.join(__dirname, '..', '..');
    for (const u of [row.photo_url, row.thumbnail_url]) {
      if (!u) continue;
      const p = path.join(baseUploads, u.replace(/^\//, ''));
      try { await fs.unlink(p); } catch (e) {
        if (e.code !== 'ENOENT') logger.warn('[taskPhotos.remove] unlink failed:', e.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('[taskPhotos.remove]', err.message);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
};

module.exports = { list, upload, remove, uploadMw, MAX_PHOTOS_PER_TASK, MAX_FILE_BYTES };
