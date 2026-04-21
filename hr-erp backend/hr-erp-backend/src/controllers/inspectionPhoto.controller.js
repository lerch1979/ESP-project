/**
 * Inspection Photo Controller
 *
 * Two upload endpoints:
 *   POST /api/v1/inspections/:id/photos        — inspector's photos during audit
 *   POST /api/v1/inspection-tasks/:id/photos   — maintenance worker's before/during/after proof
 *
 * Storage: local disk under uploads/inspections/ and uploads/tasks/ (same
 * pattern as uploads/documents/ used by email-inbox). Migrating to S3 is a
 * later task; the DB stores the relative path so it's portable.
 */
const fs = require('fs');
const path = require('path');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const INSPECTION_DIR = path.join(__dirname, '..', '..', 'uploads', 'inspections');
const TASK_DIR       = path.join(__dirname, '..', '..', 'uploads', 'tasks');
for (const dir of [INSPECTION_DIR, TASK_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** POST /inspections/:id/photos
 *  multipart/form-data with `file`. Optional body:
 *  item_score_id, caption, gps_latitude, gps_longitude, taken_at.
 */
const uploadInspectionPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'file kötelező (multipart/form-data)' });
    }

    // Verify inspection exists
    const inspRes = await query(`SELECT id FROM inspections WHERE id = $1`, [id]);
    if (inspRes.rows.length === 0) {
      // Delete the orphan upload
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Ellenőrzés nem található' });
    }

    const relativePath = path.join('uploads', 'inspections', path.basename(req.file.path));
    const { item_score_id, caption, gps_latitude, gps_longitude, taken_at } = req.body;

    const r = await query(
      `INSERT INTO inspection_photos (
         inspection_id, item_score_id,
         file_path, caption,
         gps_latitude, gps_longitude, taken_at,
         file_size, mime_type, uploaded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        item_score_id || null,
        relativePath,
        caption || null,
        gps_latitude || null,
        gps_longitude || null,
        taken_at || new Date(),
        req.file.size,
        req.file.mimetype,
        req.user?.id || null,
      ]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[photo.uploadInspection]', err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: 'Fénykép feltöltési hiba' });
  }
};

/** POST /inspection-tasks/:id/photos — before/during/after proof */
const uploadTaskPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'file kötelező' });
    }

    const taskRes = await query(`SELECT id FROM inspection_tasks WHERE id = $1`, [id]);
    if (taskRes.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Feladat nem található' });
    }

    const relativePath = path.join('uploads', 'tasks', path.basename(req.file.path));
    const { caption, photo_type } = req.body;
    const validPhotoTypes = ['before', 'during', 'after'];
    const safePhotoType = validPhotoTypes.includes(photo_type) ? photo_type : null;

    const r = await query(
      `INSERT INTO task_completion_photos (task_id, file_path, caption, photo_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, relativePath, caption || null, safePhotoType, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[photo.uploadTask]', err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: 'Fénykép feltöltési hiba' });
  }
};

const listInspectionPhotos = async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY taken_at, created_at`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    logger.error('[photo.listInspection]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

const deleteInspectionPhoto = async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM inspection_photos WHERE id = $1 RETURNING file_path`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fénykép nem található' });
    }
    const absolutePath = path.join(__dirname, '..', '..', r.rows[0].file_path);
    fs.unlink(absolutePath, () => {}); // best-effort — DB row is the source of truth
    res.json({ success: true, message: 'Fénykép törölve' });
  } catch (err) {
    logger.error('[photo.deleteInspection]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

module.exports = {
  uploadInspectionPhoto,
  uploadTaskPhoto,
  listInspectionPhotos,
  deleteInspectionPhoto,
  INSPECTION_DIR,
  TASK_DIR,
};
