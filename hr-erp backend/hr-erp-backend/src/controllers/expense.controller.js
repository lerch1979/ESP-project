const multer = require('multer');
const { query } = require('../database/connection');
const expenseService = require('../services/expense.service');
const dedupService = require('../services/expenseDeduplication.service');
const storage = require('../services/storage.service');
const { validateCreate, validateUpdate } = require('../models/expense.model');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

// File-upload middleware. Memory-storage so we can validate MIME + size
// before the bytes ever hit disk, then hand the buffer to the storage
// adapter for a deterministic on-disk path.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!storage.ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('Csak PDF / JPG / PNG fájl tölthető fel'));
    }
    cb(null, true);
  },
}).single('file');

/**
 * GET /api/v1/expenses
 */
const getAll = async (req, res) => {
  try {
    const result = await expenseService.getAll(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Költségek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Költségek lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/expenses/:id
 */
const getById = async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }
    res.json({ success: true, data: { expense } });
  } catch (error) {
    logger.error('Költség lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség lekérdezési hiba' });
  }
};

/**
 * POST /api/v1/expenses[?force=true]
 *
 * Default flow: runs the deduplication check first. If isDuplicate=true
 * (exact fingerprint match OR fuzzy ≥ 90% similarity within ±1 HUF / ±3
 * days), returns 409 with the match data so the UI can warn the user.
 *
 * Override flow: `?force=true` skips the dedup gate. The override is
 * audited via activityLogger with the IDs that were ignored and the
 * optional `override_note` from the request body.
 */
const create = async (req, res) => {
  try {
    const validation = validateCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const force = req.query.force === 'true' || req.query.force === '1';

    // Dedup gate (unless forced)
    let dupCheck = null;
    if (!force) {
      dupCheck = await dedupService.checkDuplicates({
        vendor_name:      req.body.vendor_name,
        amount:           req.body.amount,
        performance_date: req.body.performance_date,
      });
      if (dupCheck.isDuplicate) {
        return res.status(409).json({
          success: false,
          message: 'Lehetséges duplikátum észlelve. A rögzítéshez force=true szükséges.',
          duplicate_check: dupCheck,
        });
      }
    }

    const result = await expenseService.create(req.body, req.user.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    // Audit normal create
    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: result.data.id,
      action: 'create',
      metadata: {
        accommodation_id: req.body.accommodation_id,
        billing_month: result.data.billing_month,
        category: req.body.category,
        amount: req.body.amount,
        source: result.data.source,
      },
    });

    // Audit dedup override separately so the decision is queryable
    if (force) {
      const overrideCheck = await dedupService.checkDuplicates(
        {
          vendor_name:      req.body.vendor_name,
          amount:           req.body.amount,
          performance_date: req.body.performance_date,
        },
        result.data.id, // exclude the row we just created
      );
      if (overrideCheck.exactMatches.length > 0 || overrideCheck.fuzzyMatches.length > 0) {
        await logActivity({
          userId: req.user.id,
          entityType: 'accommodation_expense',
          entityId: result.data.id,
          action: 'dedup_override',
          metadata: {
            exact_match_ids: overrideCheck.exactMatches.map((m) => m.id),
            fuzzy_match_ids: overrideCheck.fuzzyMatches.map((m) => ({
              id: m.id, similarity_pct: m.similarity_pct,
            })),
            override_note: req.body.override_note || null,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Költség rögzítve',
      data: { expense: result.data },
    });
  } catch (error) {
    logger.error('Költség rögzítési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség rögzítési hiba' });
  }
};

/**
 * POST /api/v1/expenses/check-duplicates
 *
 * Standalone preview — UI can call this before submitting to surface
 * warnings proactively. No side effects, no persistence.
 *
 * Body: { vendor_name, amount, performance_date, exclude_id? }
 */
const checkDuplicates = async (req, res) => {
  try {
    const result = await dedupService.checkDuplicates(
      {
        vendor_name:      req.body.vendor_name,
        amount:           req.body.amount,
        performance_date: req.body.performance_date,
      },
      req.body.exclude_id || null,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Duplikátum ellenőrzési hiba:', error);
    res.status(500).json({ success: false, message: 'Duplikátum ellenőrzési hiba' });
  }
};

/**
 * PUT /api/v1/expenses/:id
 */
const update = async (req, res) => {
  try {
    const validation = validateUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const result = await expenseService.update(req.params.id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: req.params.id,
      action: 'update',
      metadata: {
        accommodation_id: result.data.accommodation_id,
        billing_month: result.data.billing_month,
      },
    });

    res.json({
      success: true,
      message: 'Költség frissítve',
      data: { expense: result.data },
    });
  } catch (error) {
    logger.error('Költség frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség frissítési hiba' });
  }
};

/**
 * DELETE /api/v1/expenses/:id
 */
const remove = async (req, res) => {
  try {
    const result = await expenseService.delete(req.params.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: req.params.id,
      action: 'delete',
      metadata: {
        accommodation_id: result.data.accommodation_id,
        billing_month: result.data.billing_month,
        amount: result.data.amount,
      },
    });

    res.json({ success: true, message: 'Költség törölve' });
  } catch (error) {
    logger.error('Költség törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség törlési hiba' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// File attachments
// ─────────────────────────────────────────────────────────────────────

/**
 * Multer error handler middleware — translates LIMIT_FILE_SIZE and the
 * fileFilter rejection into clean 400 / 413 responses with Hungarian
 * messages, so the routes file can compose [errorWrappedUpload, handler].
 */
const uploadWithErrorHandling = (req, res, next) => {
  uploadMw(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `A fájl maximális mérete ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
      });
    }
    return res.status(400).json({ success: false, message: err.message || 'Feltöltési hiba' });
  });
};

/**
 * POST /api/v1/expenses/:id/files  (multipart/form-data, field "file")
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Nincs feltöltött fájl (field: "file")' });
    }

    const expense = await expenseService.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }

    const saved = await storage.save({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      expense_id: expense.id,
      billing_month: expense.billing_month,
      original_name: req.file.originalname,
      uploaded_by: req.user.id,
    });

    // Atomically append to file_attachments JSONB and return the new array.
    const updated = await query(
      `UPDATE accommodation_expenses
          SET file_attachments = COALESCE(file_attachments, '[]'::jsonb) || $1::jsonb
        WHERE id = $2 AND deleted_at IS NULL
      RETURNING file_attachments`,
      [JSON.stringify([saved]), expense.id],
    );

    if (updated.rows.length === 0) {
      // expense was soft-deleted between fetch and update; roll back the file
      await storage.delete(saved.path).catch(() => {});
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: expense.id,
      action: 'file_upload',
      metadata: {
        file_id: saved.id, filename: saved.filename, original_name: saved.original_name,
        mime: saved.mime, size: saved.size,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Fájl feltöltve',
      data: { file: saved, file_attachments: updated.rows[0].file_attachments },
    });
  } catch (error) {
    logger.error('Fájl feltöltési hiba:', error);
    res.status(500).json({ success: false, message: 'Fájl feltöltési hiba' });
  }
};

/**
 * GET /api/v1/expenses/:id/files/:file_id
 */
const downloadFile = async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }
    const file = (expense.file_attachments || []).find((f) => f.id === req.params.file_id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Fájl nem található' });
    }

    let buffer;
    try {
      buffer = await storage.read(file.path);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return res.status(404).json({ success: false, message: 'A fájl nem található a tárolóban' });
      }
      throw e;
    }

    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.original_name || file.filename)}"`,
    );

    // Log access (fire-and-forget so a logger hiccup doesn't break the download)
    logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: expense.id,
      action: 'file_download',
      metadata: { file_id: file.id, filename: file.filename },
    }).catch(() => {});

    res.send(buffer);
  } catch (error) {
    logger.error('Fájl letöltési hiba:', error);
    res.status(500).json({ success: false, message: 'Fájl letöltési hiba' });
  }
};

/**
 * DELETE /api/v1/expenses/:id/files/:file_id
 */
const deleteFile = async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }

    const files = expense.file_attachments || [];
    const file = files.find((f) => f.id === req.params.file_id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Fájl nem található' });
    }

    // Atomic JSONB filter — remove the matching element by id.
    const updated = await query(
      `UPDATE accommodation_expenses
          SET file_attachments = COALESCE(
            (SELECT jsonb_agg(elem) FROM jsonb_array_elements(file_attachments) elem
              WHERE elem->>'id' <> $1),
            '[]'::jsonb)
        WHERE id = $2 AND deleted_at IS NULL
      RETURNING file_attachments`,
      [req.params.file_id, expense.id],
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }

    await storage.delete(file.path);

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: expense.id,
      action: 'file_delete',
      metadata: { file_id: file.id, filename: file.filename, original_name: file.original_name },
    });

    res.json({
      success: true,
      message: 'Fájl törölve',
      data: { file_attachments: updated.rows[0].file_attachments },
    });
  } catch (error) {
    logger.error('Fájl törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Fájl törlési hiba' });
  }
};

module.exports = {
  getAll, getById, create, update, remove, checkDuplicates,
  uploadFile, downloadFile, deleteFile,
  uploadWithErrorHandling,
};
