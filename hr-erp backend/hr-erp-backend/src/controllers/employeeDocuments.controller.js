/**
 * GDPR-graded employee document store (migration 109).
 *
 *   GET    /api/v1/employees/:employeeId/documents
 *   POST   /api/v1/employees/:employeeId/documents          multipart "document"
 *   GET    /api/v1/employees/:employeeId/documents/:docId
 *   GET    /api/v1/employees/:employeeId/documents/:docId/download
 *   PATCH  /api/v1/employees/:employeeId/documents/:docId
 *   DELETE /api/v1/employees/:employeeId/documents/:docId   (soft)
 *   GET    /api/v1/admin/documents/expiring?days=30
 *
 * Auth gate (v1):
 *   - admin / superadmin → everything
 *   - the linked user (employees.user_id = req.user.id) → list / view / download / upload OWN
 *   - everyone else → 403
 *
 * Audit log:
 *   Every read (list, view, download) and write (upload, patch, delete) appends a
 *   { user_id, user_name, action, timestamp, ip, user_agent } row to
 *   employee_documents.accessed_log. Append-only — never truncated.
 *
 * File storage:
 *   uploads/employee-documents/<employee_id>/<type>-<ts>-<rand>.<ext>
 *   The static /uploads mount is BLOCKED for this subtree (server.js
 *   short-circuits with a 404). All file access goes through the
 *   audited /download endpoint, which streams the file with auth.
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
let sharp; try { sharp = require('sharp'); } catch { sharp = null; }
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const DOCS_DIR = path.join(__dirname, '..', '..', 'uploads', 'employee-documents');
const DOCS_URL_PREFIX = '/uploads/employee-documents';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
]);

const DOCUMENT_TYPES = new Set([
  'id_card', 'passport', 'work_permit', 'health_insurance',
  'bank_card', 'address_card', 'tax_card', 'employment_contract', 'other',
]);

const DOCUMENT_TYPE_LABELS = {
  id_card:             'Személyi igazolvány',
  passport:            'Útlevél',
  work_permit:         'Munkavállalási engedély',
  health_insurance:    'TAJ / Egészségbiztosítás',
  bank_card:           'Bankkártya',
  address_card:        'Lakcímkártya',
  tax_card:            'Adóigazolvány',
  employment_contract: 'Munkaszerződés',
  other:               'Egyéb',
};

// multer config: memory storage so we can run sharp on images before
// committing to disk. Single file per request — bulk upload is a
// follow-up if it ever proves necessary.
const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Csak PDF / JPG / PNG / WEBP fájl tölthető fel'));
    }
    cb(null, true);
  },
}).single('document');

// ── Helpers ──────────────────────────────────────────────────────────

function _isAdmin(req) {
  return (req.user.roles || []).some(r => r === 'admin' || r === 'superadmin');
}

// True when the caller IS the employee (employees.user_id = caller).
async function _isSelf(req, employeeId) {
  if (!employeeId) return false;
  const r = await query(`SELECT user_id FROM employees WHERE id = $1`, [employeeId]);
  return r.rows[0]?.user_id === req.user.id;
}

async function _canAccess(req, employeeId, { writeOnly = false } = {}) {
  if (_isAdmin(req)) return true;
  if (writeOnly) return false; // non-admin can't patch / delete (v1)
  return _isSelf(req, employeeId);
}

async function _appendAuditLog(documentId, req, action) {
  // Best-effort — must never block the actual read/write the user came for.
  try {
    const entry = {
      user_id: req.user?.id || null,
      user_name: req.user
        ? [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email
        : null,
      action,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      user_agent: req.headers['user-agent']?.slice(0, 200) || null,
    };
    await query(
      `UPDATE employee_documents SET accessed_log = accessed_log || $1::jsonb WHERE id = $2`,
      [JSON.stringify([entry]), documentId]
    );
  } catch (err) {
    logger.warn('[employeeDocuments.audit] append failed:', err.message);
  }
}

async function _ensureDir(employeeId) {
  const dir = path.join(DOCS_DIR, employeeId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function _decorate(row) {
  if (!row) return row;
  return {
    ...row,
    document_type_label: DOCUMENT_TYPE_LABELS[row.document_type] || 'Egyéb',
    // The actual file URL is intentionally NOT exposed for direct fetch —
    // server.js blocks /uploads/employee-documents/*. Surface a download
    // endpoint URL instead so the UI knows where to go.
    download_url: `/api/v1/employees/${row.employee_id}/documents/${row.id}/download`,
  };
}

// ── List ──────────────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!(await _canAccess(req, employeeId))) {
      return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const params = [employeeId];
    let where = `WHERE ed.employee_id = $1 AND ed.deleted_at IS NULL`;
    if (req.query.type) {
      params.push(req.query.type);
      where += ` AND ed.document_type = $${params.length}`;
    }
    const r = await query(
      `SELECT ed.id, ed.employee_id, ed.document_type, ed.document_name,
              ed.document_number, ed.file_name, ed.file_size, ed.mime_type,
              ed.issued_date, ed.expiry_date, ed.notes, ed.access_level,
              ed.uploaded_by, ed.uploaded_at, ed.updated_at,
              u.first_name || ' ' || u.last_name AS uploaded_by_name
         FROM employee_documents ed
         LEFT JOIN users u ON u.id = ed.uploaded_by
         ${where}
         ORDER BY ed.uploaded_at DESC`,
      params
    );
    res.json({ success: true, data: { documents: r.rows.map(_decorate) } });
  } catch (err) {
    logger.error('[employeeDocuments.list]', err.message);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

// ── Get one ──────────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const { employeeId, docId } = req.params;
    if (!(await _canAccess(req, employeeId))) {
      return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const r = await query(
      `SELECT * FROM employee_documents WHERE id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
      [docId, employeeId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    await _appendAuditLog(docId, req, 'viewed_details');
    res.json({ success: true, data: { document: _decorate(r.rows[0]) } });
  } catch (err) {
    logger.error('[employeeDocuments.getOne]', err.message);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

// ── Upload ───────────────────────────────────────────────────────────
const upload = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!(await _canAccess(req, employeeId))) {
      return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Fájl feltöltése kötelező' });
    }
    const docType = DOCUMENT_TYPES.has(req.body.document_type) ? req.body.document_type : 'other';
    const docName = (req.body.document_name || '').slice(0, 255) || null;
    const docNumber = (req.body.document_number || '').slice(0, 100) || null;
    const issuedDate = req.body.issued_date || null;
    const expiryDate = req.body.expiry_date || null;
    const notes = (req.body.notes || '').slice(0, 4000) || null;

    const dir = await _ensureDir(employeeId);
    const ts = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    const ext = (req.file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || 'bin').toLowerCase();

    let mainBuf = req.file.buffer;
    let mainMime = req.file.mimetype;
    let mainExt = ext;
    let thumbnailPath = null;
    let imageWidth = null;
    let imageHeight = null;

    // Run image-only post-processing if sharp is available. PDFs go to
    // disk untouched. Image flow: re-encode to JPEG, resize, generate a
    // 300px thumb. EXIF strips on re-encode.
    if (sharp && req.file.mimetype.startsWith('image/')) {
      try {
        const out = await sharp(req.file.buffer)
          .rotate()
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
        mainBuf = out.data;
        mainMime = 'image/jpeg';
        mainExt = 'jpg';
        imageWidth = out.info.width;
        imageHeight = out.info.height;

        const thumbBuf = await sharp(req.file.buffer)
          .rotate()
          .resize(300, 300, { fit: 'cover' })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
        const thumbName = `${docType}-${ts}-${rand}_thumb.jpg`;
        await fsp.writeFile(path.join(dir, thumbName), thumbBuf);
        thumbnailPath = `${DOCS_URL_PREFIX}/${employeeId}/${thumbName}`;
      } catch (err) {
        logger.warn('[employeeDocuments.upload.sharp]', err.message);
      }
    }

    const mainName = `${docType}-${ts}-${rand}.${mainExt}`;
    const mainPath = path.join(dir, mainName);
    await fsp.writeFile(mainPath, mainBuf);
    const mainUrl = `${DOCS_URL_PREFIX}/${employeeId}/${mainName}`;

    // Wrap INSERT — if it fails, unlink the files we just wrote so we
    // don't leak orphans (lesson learned from yesterday's task_photos).
    let insertResult;
    try {
      insertResult = await query(
        `INSERT INTO employee_documents
           (employee_id, document_type, document_name, document_number,
            file_name, file_path, file_size, mime_type, thumbnail_path,
            issued_date, expiry_date, notes, uploaded_by, access_level,
            uploaded_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 'admin_only', NOW(), NOW())
         RETURNING *`,
        [
          employeeId, docType, docName, docNumber,
          req.file.originalname, mainUrl, mainBuf.length, mainMime, thumbnailPath,
          issuedDate, expiryDate, notes, req.user.id,
        ]
      );
    } catch (err) {
      try { await fsp.unlink(mainPath); } catch {}
      if (thumbnailPath) {
        try { await fsp.unlink(path.join(dir, path.basename(thumbnailPath))); } catch {}
      }
      throw err;
    }

    const row = insertResult.rows[0];
    await _appendAuditLog(row.id, req, 'uploaded');

    res.status(201).json({ success: true, data: { document: _decorate(row) } });
  } catch (err) {
    logger.error('[employeeDocuments.upload]', err.message);
    res.status(500).json({ success: false, message: err.message || 'Feltöltési hiba' });
  }
};

// ── Download (audited stream) ────────────────────────────────────────
const download = async (req, res) => {
  try {
    const { employeeId, docId } = req.params;
    if (!(await _canAccess(req, employeeId))) {
      return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const r = await query(
      `SELECT file_path, file_name, mime_type FROM employee_documents
        WHERE id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
      [docId, employeeId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    const { file_path, file_name, mime_type } = r.rows[0];

    // file_path is stored as '/uploads/employee-documents/<id>/<name>' —
    // resolve under the uploads dir while clamping to that subtree (no
    // path traversal allowed even if a row got corrupted somehow).
    const expectedPrefix = path.resolve(DOCS_DIR);
    const resolvedPath = path.resolve(__dirname, '..', '..', file_path.replace(/^\//, ''));
    if (!resolvedPath.startsWith(expectedPrefix + path.sep)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen fájl útvonal' });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'A fájl nem található a lemezen' });
    }

    await _appendAuditLog(docId, req, 'downloaded');

    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file_name || 'document')}"`);
    fs.createReadStream(resolvedPath).pipe(res);
  } catch (err) {
    logger.error('[employeeDocuments.download]', err.message);
    res.status(500).json({ success: false, message: 'Letöltési hiba' });
  }
};

// ── Patch (admin only — metadata only, never the file itself) ────────
const patch = async (req, res) => {
  try {
    const { employeeId, docId } = req.params;
    if (!_isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Csak admin szerkesztheti' });
    }
    const allowed = ['document_name', 'document_number', 'issued_date', 'expiry_date', 'notes', 'document_type'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        if (k === 'document_type' && !DOCUMENT_TYPES.has(req.body[k])) {
          return res.status(400).json({ success: false, message: 'Ismeretlen dokumentum típus' });
        }
        params.push(req.body[k] || null);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }
    sets.push(`updated_at = NOW()`);
    params.push(docId, employeeId);
    const r = await query(
      `UPDATE employee_documents SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND employee_id = $${params.length}
          AND deleted_at IS NULL
        RETURNING *`,
      params
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    await _appendAuditLog(docId, req, 'metadata_updated');
    res.json({ success: true, data: { document: _decorate(r.rows[0]) } });
  } catch (err) {
    logger.error('[employeeDocuments.patch]', err.message);
    res.status(500).json({ success: false, message: 'Frissítési hiba' });
  }
};

// ── Soft delete ──────────────────────────────────────────────────────
const softDelete = async (req, res) => {
  try {
    const { employeeId, docId } = req.params;
    if (!_isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Csak admin törölheti' });
    }
    const reason = (req.body?.reason || '').slice(0, 1000) || null;
    const r = await query(
      `UPDATE employee_documents
          SET deleted_at = NOW(), deleted_by = $3, delete_reason = $4
        WHERE id = $1 AND employee_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [docId, employeeId, req.user.id, reason]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    await _appendAuditLog(docId, req, 'deleted');
    res.json({ success: true });
  } catch (err) {
    logger.error('[employeeDocuments.softDelete]', err.message);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
};

// ── Expiring (admin only — for reminder dashboard) ───────────────────
const expiring = async (req, res) => {
  try {
    if (!_isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Csak admin nézheti' });
    }
    const days = Math.max(1, Math.min(365, parseInt(req.query.days || '30', 10)));
    const r = await query(
      `SELECT ed.id, ed.employee_id, ed.document_type, ed.document_name,
              ed.document_number, ed.expiry_date,
              e.first_name, e.last_name, e.workplace
         FROM employee_documents ed
         JOIN employees e ON e.id = ed.employee_id
        WHERE ed.deleted_at IS NULL
          AND ed.expiry_date IS NOT NULL
          AND ed.expiry_date <= CURRENT_DATE + ($1::int || ' days')::interval
        ORDER BY ed.expiry_date ASC`,
      [days]
    );
    res.json({ success: true, data: { documents: r.rows, days } });
  } catch (err) {
    logger.error('[employeeDocuments.expiring]', err.message);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

module.exports = {
  list, getOne, upload, download, patch, softDelete, expiring,
  uploadMw,
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS,
};
