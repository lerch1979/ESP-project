const path = require('path');
const fs = require('fs');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const DOCUMENT_TYPE_LABELS = {
  passport: 'Útlevél',
  taj_card: 'TAJ kártya',
  visa: 'Vízum',
  contract: 'Szerződés',
  address_card: 'Lakcímkártya',
  other: 'Egyéb',
};

/**
 * POST /api/v1/employees/:id/documents
 * Upload a document for an employee
 */
const uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { document_type, notes } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Fájl feltöltése kötelező' });
    }

    const scanMode = req.body.scan_mode === 'true' || req.body.scan_mode === '1';

    // Process image: scan mode (B&W) + thumbnail generation
    let thumbnailPath = null;
    if (file.mimetype.startsWith('image/') && sharp) {
      // Apply scan processing (grayscale + high contrast) if scan_mode
      if (scanMode) {
        try {
          const scannedFilename = 'scan_' + file.filename;
          const scannedFullPath = path.join(file.destination, scannedFilename);
          await sharp(file.path)
            .greyscale()
            .normalize()
            .linear(1.4, -(128 * 1.4 - 128))  // boost contrast
            .sharpen({ sigma: 1.5 })
            .jpeg({ quality: 90 })
            .toFile(scannedFullPath);
          // Replace original with scanned version
          fs.unlinkSync(file.path);
          fs.renameSync(scannedFullPath, file.path);
          logger.info(`Scan processing applied to document for employee ${id}`);
        } catch (scanErr) {
          logger.warn('Scan processing failed, using original:', scanErr.message);
        }
      }

      // Generate thumbnail
      try {
        const thumbFilename = 'thumb_' + file.filename;
        const thumbFullPath = path.join(file.destination, thumbFilename);
        await sharp(file.path)
          .resize(200, 200, { fit: 'cover' })
          .jpeg({ quality: 70 })
          .toFile(thumbFullPath);
        thumbnailPath = `/uploads/employee-documents/${id}/${thumbFilename}`;
      } catch (thumbErr) {
        logger.warn('Thumbnail generation failed:', thumbErr.message);
      }
    }

    const filePath = `/uploads/employee-documents/${id}/${file.filename}`;

    const result = await query(
      `INSERT INTO employee_documents
        (employee_id, document_type, file_name, file_path, file_size, mime_type, thumbnail_path, uploaded_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        document_type || 'other',
        file.originalname,
        filePath,
        file.size,
        file.mimetype,
        thumbnailPath,
        req.user.id,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        document_type_label: DOCUMENT_TYPE_LABELS[result.rows[0].document_type] || 'Egyéb',
      },
    });
  } catch (error) {
    logger.error('Employee document upload error:', error);
    res.status(500).json({ success: false, message: 'Dokumentum feltöltési hiba' });
  }
};

/**
 * GET /api/v1/employees/:id/documents
 * List all documents for an employee
 */
const getDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT ed.*,
              u.first_name || ' ' || u.last_name as uploaded_by_name
       FROM employee_documents ed
       LEFT JOIN users u ON ed.uploaded_by = u.id
       WHERE ed.employee_id = $1
       ORDER BY ed.uploaded_at DESC`,
      [id]
    );

    const documents = result.rows.map((doc) => ({
      ...doc,
      document_type_label: DOCUMENT_TYPE_LABELS[doc.document_type] || 'Egyéb',
    }));

    res.json({ success: true, data: documents });
  } catch (error) {
    logger.error('Employee documents list error:', error);
    res.status(500).json({ success: false, message: 'Dokumentumok lekérési hiba' });
  }
};

/**
 * GET /api/v1/employees/documents/:docId
 * Download/view a specific document
 */
const getDocument = async (req, res) => {
  try {
    const { docId } = req.params;

    const result = await query(
      `SELECT * FROM employee_documents WHERE id = $1`,
      [docId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumentum nem található' });
    }

    const doc = result.rows[0];
    const fullPath = path.join(__dirname, '..', '..', doc.file_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Fájl nem található a szerveren' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
    res.sendFile(fullPath);
  } catch (error) {
    logger.error('Employee document download error:', error);
    res.status(500).json({ success: false, message: 'Dokumentum letöltési hiba' });
  }
};

/**
 * DELETE /api/v1/employees/documents/:docId
 * Delete a document
 */
const deleteDocument = async (req, res) => {
  try {
    const { docId } = req.params;

    const result = await query(
      `DELETE FROM employee_documents WHERE id = $1 RETURNING *`,
      [docId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumentum nem található' });
    }

    const doc = result.rows[0];

    // Delete files from disk
    const fullPath = path.join(__dirname, '..', '..', doc.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    if (doc.thumbnail_path) {
      const thumbPath = path.join(__dirname, '..', '..', doc.thumbnail_path);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }

    res.json({ success: true, message: 'Dokumentum törölve' });
  } catch (error) {
    logger.error('Employee document delete error:', error);
    res.status(500).json({ success: false, message: 'Dokumentum törlési hiba' });
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
};
