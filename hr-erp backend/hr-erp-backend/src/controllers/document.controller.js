const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Roles that legitimately manage the whole employee document store (HR/admin).
// Anyone else who somehow reaches these endpoints is treated as a self-service
// caller and may only ever see documents tied to their OWN employee record.
// This is defense-in-depth: the primary control is that residents no longer
// hold `documents.view` at all (migration 129).
const STAFF_DOC_ROLES = ['superadmin', 'admin', 'data_controller', 'task_owner', 'user', 'contractor'];

/**
 * Resolve the ownership scope for a documents request.
 * @returns {{ selfScoped: boolean, employeeId: string|null }}
 *   selfScoped=false → staff caller, sees all documents.
 *   selfScoped=true  → restricted to employeeId (null = no employee record → nothing).
 */
const resolveDocScope = async (req) => {
  const roles = (req.user && req.user.roles) || [];
  const isSuperadmin = roles.includes('superadmin');
  const contractorId = (req.user && req.user.contractorId) || null;
  if (roles.some(r => STAFF_DOC_ROLES.includes(r))) {
    return { selfScoped: false, employeeId: null, isSuperadmin, contractorId };
  }
  const r = await query('SELECT id FROM employees WHERE user_id = $1 LIMIT 1', [req.user.id]);
  return { selfScoped: true, employeeId: r.rows[0] ? r.rows[0].id : null, isSuperadmin, contractorId };
};

// A document's authoritative tenant is its employee's contractor (documents.tenant_id
// is a fallback — it was historically left NULL on insert). Given the caller's scope
// and a document's employee_id + effective contractor, return true if the caller must
// NOT access it: self-service callers are bound to their own employee; non-superadmin
// staff to their own contractor; superadmin sees all.
const isDocOutOfScope = (scope, docEmployeeId, docContractor) =>
  scope.selfScoped
    ? docEmployeeId !== scope.employeeId
    : (!scope.isSuperadmin && docContractor !== scope.contractorId);

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

    // Ownership scoping: a non-staff caller may only see their own documents.
    const scope = await resolveDocScope(req);
    if (scope.selfScoped && !scope.employeeId) {
      return res.json({
        success: true,
        data: { documents: [], pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 } }
      });
    }

    if (document_type && document_type !== 'all') {
      whereConditions.push(`d.document_type = $${paramIndex}`);
      params.push(document_type);
      paramIndex++;
    }

    if (scope.selfScoped) {
      // Force the caller's own employee_id; ignore any client-supplied filter.
      whereConditions.push(`d.employee_id = $${paramIndex}`);
      params.push(scope.employeeId);
      paramIndex++;
    } else if (employee_id && employee_id !== 'all') {
      whereConditions.push(`d.employee_id = $${paramIndex}`);
      params.push(employee_id);
      paramIndex++;
    }

    // Staff are scoped to their own contractor's documents (superadmin sees all).
    if (!scope.selfScoped && !scope.isSuperadmin) {
      whereConditions.push(`COALESCE(e.contractor_id, d.tenant_id) = $${paramIndex}`);
      params.push(scope.contractorId);
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
        COALESCE(u.first_name, '') as uploader_first_name,
        COALESCE(e.contractor_id, d.tenant_id) as _doc_contractor
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

    // Ownership scoping: self-service callers see only their own employee's docs;
    // staff only their own contractor's (superadmin sees all).
    const scope = await resolveDocScope(req);
    const row = result.rows[0];
    if (isDocOutOfScope(scope, row.employee_id, row._doc_contractor)) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }
    delete row._doc_contractor; // internal scoping field, not part of the API shape

    res.json({
      success: true,
      data: { document: row }
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

    // Verify employee exists if provided, and stamp the document's tenant so it
    // is contractor-scoped from creation (tenant_id was previously left NULL).
    const scope = await resolveDocScope(req);
    let tenantId = scope.contractorId;
    if (employee_id) {
      const empCheck = await query('SELECT contractor_id FROM employees WHERE id = $1', [employee_id]);
      if (empCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott munkavállaló nem található'
        });
      }
      const empContractor = empCheck.rows[0].contractor_id;
      // Staff may only attach documents to their own contractor's employees.
      if (!scope.isSuperadmin && scope.contractorId && empContractor !== scope.contractorId) {
        return res.status(404).json({
          success: false,
          message: 'A megadott munkavállaló nem található'
        });
      }
      tenantId = empContractor || scope.contractorId;
    }

    const insertQuery = `
      INSERT INTO documents (title, description, document_type, employee_id, uploaded_by, file_name, file_path, file_size, mime_type, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      tenantId,
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
      `SELECT d.id, d.employee_id, COALESCE(e.contractor_id, d.tenant_id) AS _doc_contractor
       FROM documents d LEFT JOIN employees e ON d.employee_id = e.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    // Enforce access scope on the target document (contractor for staff).
    const scope = await resolveDocScope(req);
    if (isDocOutOfScope(scope, existing.rows[0].employee_id, existing.rows[0]._doc_contractor)) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    // Verify employee if provided (and that it belongs to the caller's contractor)
    if (employee_id) {
      const empCheck = await query('SELECT contractor_id FROM employees WHERE id = $1', [employee_id]);
      if (empCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott munkavállaló nem található'
        });
      }
      if (!scope.isSuperadmin && scope.contractorId && empCheck.rows[0].contractor_id !== scope.contractorId) {
        return res.status(404).json({
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
      `SELECT d.id, d.employee_id, COALESCE(e.contractor_id, d.tenant_id) AS _doc_contractor
       FROM documents d LEFT JOIN employees e ON d.employee_id = e.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    // Enforce access scope before deleting (contractor for staff).
    const scope = await resolveDocScope(req);
    if (isDocOutOfScope(scope, existing.rows[0].employee_id, existing.rows[0]._doc_contractor)) {
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
      `SELECT d.file_name, d.file_path, d.mime_type, d.employee_id,
              COALESCE(e.contractor_id, d.tenant_id) AS _doc_contractor
       FROM documents d LEFT JOIN employees e ON d.employee_id = e.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dokumentum nem található'
      });
    }

    // Ownership scoping: self-service callers only their own employee's docs;
    // staff only their own contractor's (superadmin sees all).
    const scope = await resolveDocScope(req);
    if (isDocOutOfScope(scope, result.rows[0].employee_id, result.rows[0]._doc_contractor)) {
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
