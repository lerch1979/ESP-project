const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * Dokumentumok listázása (szűrőkkel, lapozással)
 */
const getDocuments = async (req, res) => {
  try {
    const { search, document_type, employee_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['d.deleted_at IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (document_type && document_type !== 'all') {
      whereConditions.push(`d.document_type = $${paramIndex}`);
      params.push(document_type);
      paramIndex++;
    }

    if (employee_id && employee_id !== 'all') {
      whereConditions.push(`d.employee_id = $${paramIndex}`);
      params.push(employee_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(
        `(d.title ILIKE $${paramIndex} OR d.description ILIKE $${paramIndex} OR CONCAT(COALESCE(e.last_name, ''), ' ', COALESCE(e.first_name, '')) ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM documents d
       LEFT JOIN employees e ON d.employee_id = e.id
       ${whereClause}`,
      params
    );

    const documentsQuery = `
      SELECT
        d.id, d.title, d.description, d.document_type,
        d.employee_id, d.uploaded_by, d.file_name, d.file_path,
        d.file_size, d.mime_type, d.created_at, d.updated_at,
        COALESCE(e.last_name, '') as employee_last_name,
        COALESCE(e.first_name, '') as employee_first_name,
        e.employee_number,
        COALESCE(u.last_name, '') as uploader_last_name,
        COALESCE(u.first_name, '') as uploader_first_name
      FROM documents d
      LEFT JOIN employees e ON d.employee_id = e.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const result = await query(documentsQuery, params);

    res.json({
      success: true,
      data: {
        documents: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Dokumentumok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentumok lekérdezési hiba'
    });
  }
};

/**
 * Egy dokumentum részletei
 */
const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const documentQuery = `
      SELECT
        d.id, d.title, d.description, d.document_type,
        d.employee_id, d.uploaded_by, d.file_name, d.file_path,
        d.file_size, d.mime_type, d.created_at, d.updated_at,
        COALESCE(e.last_name, '') as employee_last_name,
        COALESCE(e.first_name, '') as employee_first_name,
        e.employee_number,
        COALESCE(u.last_name, '') as uploader_last_name,
        COALESCE(u.first_name, '') as uploader_first_name
      FROM documents d
      LEFT JOIN employees e ON d.employee_id = e.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = $1 AND d.deleted_at IS NULL
    `;

    const result = await query(documentQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    res.json({
      success: true,
      data: { document: result.rows[0] }
    });
  } catch (error) {
    logger.error('Dokumentum lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentum lekérdezési hiba'
    });
  }
};

/**
 * Új dokumentum feltöltése
 */
const createDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Fájl feltöltése kötelező'
      });
    }

    const { title, description, document_type, employee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Cím megadása kötelező'
      });
    }

    // Verify employee exists if provided
    if (employee_id) {
      const empCheck = await query('SELECT id FROM employees WHERE id = $1', [employee_id]);
      if (empCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott munkavállaló nem található'
        });
      }
    }

    const insertQuery = `
      INSERT INTO documents (title, description, document_type, employee_id, uploaded_by, file_name, file_path, file_size, mime_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(insertQuery, [
      title.trim(),
      description || null,
      document_type || 'other',
      employee_id || null,
      req.user.id,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
    ]);

    logger.info('Új dokumentum feltöltve', { documentId: result.rows[0].id });

    res.status(201).json({
      success: true,
      message: 'Dokumentum sikeresen feltöltve',
      data: { document: result.rows[0] }
    });
  } catch (error) {
    logger.error('Dokumentum feltöltési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentum feltöltési hiba'
    });
  }
};

/**
 * Dokumentum metaadatainak frissítése
 */
const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, document_type, employee_id } = req.body;

    const existing = await query(
      'SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    // Verify employee if provided
    if (employee_id) {
      const empCheck = await query('SELECT id FROM employees WHERE id = $1', [employee_id]);
      if (empCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott munkavállaló nem található'
        });
      }
    }

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      fields.push(`title = $${paramIndex}`);
      params.push(title.trim());
      paramIndex++;
    }
    if (description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      params.push(description || null);
      paramIndex++;
    }
    if (document_type !== undefined) {
      fields.push(`document_type = $${paramIndex}`);
      params.push(document_type);
      paramIndex++;
    }
    if (employee_id !== undefined) {
      fields.push(`employee_id = $${paramIndex}`);
      params.push(employee_id || null);
      paramIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs frissítendő mező'
      });
    }

    params.push(id);
    const updateQuery = `
      UPDATE documents SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    logger.info('Dokumentum frissítve', { documentId: id });

    res.json({
      success: true,
      message: 'Dokumentum sikeresen frissítve',
      data: { document: result.rows[0] }
    });
  } catch (error) {
    logger.error('Dokumentum frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentum frissítési hiba'
    });
  }
};

/**
 * Dokumentum törlése (soft delete)
 */
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query(
      'SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    await query(
      'UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    logger.info('Dokumentum törölve (soft)', { documentId: id });

    res.json({
      success: true,
      message: 'Dokumentum sikeresen törölve'
    });
  } catch (error) {
    logger.error('Dokumentum törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentum törlési hiba'
    });
  }
};

/**
 * Dokumentum letöltése
 */
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT file_name, file_path, mime_type FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    const doc = result.rows[0];
    const absolutePath = path.resolve(doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        message: 'A fájl nem található a szerveren'
      });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
    if (doc.mime_type) {
      res.setHeader('Content-Type', doc.mime_type);
    }

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('Dokumentum letöltési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dokumentum letöltési hiba'
    });
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
};
