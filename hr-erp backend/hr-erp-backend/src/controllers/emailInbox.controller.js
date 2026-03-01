const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const claudeOCR = require('../services/claudeOCR.service');
const documentClassifier = require('../services/documentClassifier.service');
const entityExtractor = require('../services/entityExtractor.service');
const documentRouter = require('../services/documentRouter.service');
const path = require('path');

/**
 * Format an email inbox row for API response
 */
function formatInbox(row) {
  return {
    id: row.id,
    emailFrom: row.email_from,
    emailSubject: row.email_subject,
    emailDate: row.email_date,
    attachmentFilename: row.attachment_filename,
    attachmentPath: row.attachment_path,
    documentType: row.document_type,
    confidenceScore: row.confidence_score,
    classificationReasoning: row.classification_reasoning,
    extractedText: row.extracted_text,
    extractedData: row.extracted_data,
    status: row.status,
    routedTo: row.routed_to,
    routedId: row.routed_id,
    needsReview: row.needs_review,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name || null,
    contractorId: row.contractor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/v1/email-inbox
 */
const getAll = async (req, res) => {
  try {
    const {
      status,
      document_type,
      search,
      sort_by = 'created_at',
      sort_dir = 'DESC',
      page = 1,
      limit = 20,
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`e.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (document_type) {
      conditions.push(`e.document_type = $${paramIndex}`);
      params.push(document_type);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        e.email_from ILIKE $${paramIndex}
        OR e.email_subject ILIKE $${paramIndex}
        OR e.attachment_filename ILIKE $${paramIndex}
        OR e.classification_reasoning ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const allowedSorts = ['created_at', 'email_subject', 'document_type', 'status', 'confidence_score'];
    const sortCol = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [listResult, countResult] = await Promise.all([
      query(`
        SELECT e.*,
          u.first_name || ' ' || u.last_name as reviewer_name
        FROM email_inbox e
        LEFT JOIN users u ON e.reviewed_by = u.id
        ${whereClause}
        ORDER BY e.${sortCol} ${sortDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),
      query(`SELECT COUNT(*) FROM email_inbox e ${whereClause}`, params),
    ]);

    res.json({
      success: true,
      data: listResult.rows.map(formatInbox),
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Error fetching email inbox:', error);
    res.status(500).json({ success: false, message: 'Hiba az email postafiók lekérésekor' });
  }
};

/**
 * GET /api/v1/email-inbox/stats
 */
const getStats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processed') as processed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'needs_review') as needs_review,
        COUNT(*) FILTER (WHERE document_type = 'invoice') as invoices,
        COUNT(*) FILTER (WHERE document_type = 'damage_report') as damage_reports,
        COUNT(*) FILTER (WHERE document_type = 'employee_contract') as employee_contracts,
        COUNT(*) FILTER (WHERE document_type = 'service_contract') as service_contracts,
        COUNT(*) FILTER (WHERE document_type = 'rental_contract') as rental_contracts,
        COUNT(*) FILTER (WHERE document_type = 'tax_document') as tax_documents,
        COUNT(*) FILTER (WHERE document_type = 'payment_reminder') as payment_reminders,
        COUNT(*) FILTER (WHERE document_type = 'other' OR document_type IS NULL) as other
      FROM email_inbox
    `);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching inbox stats:', error);
    res.status(500).json({ success: false, message: 'Hiba a statisztikák lekérésekor' });
  }
};

/**
 * GET /api/v1/email-inbox/:id
 */
const getById = async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*,
        u.first_name || ' ' || u.last_name as reviewer_name
      FROM email_inbox e
      LEFT JOIN users u ON e.reviewed_by = u.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nem található' });
    }

    res.json({ success: true, data: formatInbox(result.rows[0]) });
  } catch (error) {
    logger.error('Error fetching inbox item:', error);
    res.status(500).json({ success: false, message: 'Hiba a lekérésekor' });
  }
};

/**
 * POST /api/v1/email-inbox/upload
 * Upload a document for classification and routing
 */
const upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Fájl szükséges' });
    }

    const filePath = req.file.path;
    const relativePath = path.relative(
      path.join(__dirname, '..', '..'),
      filePath
    );

    // Step 1: OCR text extraction
    let extractedText = '';
    try {
      const ocrData = await claudeOCR.extractInvoiceData(filePath);
      if (ocrData) {
        // Build full text from extracted data for classification
        extractedText = Object.values(ocrData).filter(v => typeof v === 'string' && v).join(' ');
      }
    } catch (e) {
      logger.warn('OCR extraction failed:', e.message);
    }

    // Also try raw text extraction for classification
    const fs = require('fs');
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);
        if (pdfData.text && pdfData.text.length > extractedText.length) {
          extractedText = pdfData.text;
        }
      } catch (e) {
        logger.warn('PDF text extraction for classification failed:', e.message);
      }
    }

    // Step 2: Classify document
    const classification = documentClassifier.classifyDocument(
      extractedText,
      req.file.originalname
    );

    // Step 3: Extract entities based on type
    let extractedData = {};
    if (classification.documentType === 'invoice') {
      // Use full OCR extraction for invoices
      try {
        extractedData = await claudeOCR.extractInvoiceData(filePath) || {};
      } catch (e) {
        logger.warn('Invoice OCR failed:', e.message);
      }
    } else {
      extractedData = entityExtractor.extract(extractedText, classification.documentType);
    }

    // Step 4: Create email_inbox record
    const needsReview = classification.confidence < 70 || classification.documentType === 'other';

    const result = await query(`
      INSERT INTO email_inbox (
        email_from, email_subject, email_date,
        attachment_filename, attachment_path,
        document_type, confidence_score, classification_reasoning,
        extracted_text, extracted_data,
        status, needs_review
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      req.user.email || 'manual_upload',
      req.body.subject || req.file.originalname || 'Kézi feltöltés',
      req.file.originalname,
      relativePath,
      classification.documentType,
      classification.confidence,
      classification.reasoning,
      extractedText.substring(0, 10000),
      JSON.stringify(extractedData),
      needsReview ? 'needs_review' : 'pending',
      needsReview,
    ]);

    const inboxItem = result.rows[0];

    // Step 5: Auto-route if confidence is high enough
    let routingResult = null;
    if (!needsReview) {
      try {
        routingResult = await documentRouter.routeDocument(inboxItem.id);
      } catch (e) {
        logger.error('Auto-routing failed:', e.message);
      }
    }

    // Re-fetch for response
    const finalResult = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name
      FROM email_inbox e
      LEFT JOIN users u ON e.reviewed_by = u.id
      WHERE e.id = $1
    `, [inboxItem.id]);

    res.json({
      success: true,
      message: needsReview
        ? 'Dokumentum feltöltve, manuális felülvizsgálat szükséges'
        : 'Dokumentum feldolgozva és továbbítva',
      data: formatInbox(finalResult.rows[0]),
      routing: routingResult,
    });
  } catch (error) {
    logger.error('Error uploading document:', error);
    res.status(500).json({ success: false, message: 'Hiba a dokumentum feldolgozásakor' });
  }
};

/**
 * POST /api/v1/email-inbox/classify/:id
 * Manually trigger classification
 */
const classify = async (req, res) => {
  try {
    const { id } = req.params;

    const inbox = await query('SELECT * FROM email_inbox WHERE id = $1', [id]);
    if (inbox.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nem található' });
    }

    const doc = inbox.rows[0];
    const text = doc.extracted_text || '';

    const classification = documentClassifier.classifyDocument(text, doc.attachment_filename);
    const extractedData = entityExtractor.extract(text, classification.documentType);

    await query(`
      UPDATE email_inbox SET
        document_type = $1,
        confidence_score = $2,
        classification_reasoning = $3,
        extracted_data = $4,
        needs_review = $5,
        status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END
      WHERE id = $6
    `, [
      classification.documentType,
      classification.confidence,
      classification.reasoning,
      JSON.stringify(extractedData),
      classification.confidence < 70,
      id,
    ]);

    const result = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      WHERE e.id = $1
    `, [id]);

    res.json({ success: true, data: formatInbox(result.rows[0]) });
  } catch (error) {
    logger.error('Error classifying:', error);
    res.status(500).json({ success: false, message: 'Hiba a besorolásnál' });
  }
};

/**
 * POST /api/v1/email-inbox/route/:id
 * Manually trigger routing
 */
const route = async (req, res) => {
  try {
    const { id } = req.params;

    const inbox = await query('SELECT * FROM email_inbox WHERE id = $1', [id]);
    if (inbox.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nem található' });
    }

    if (inbox.rows[0].status === 'processed') {
      return res.status(400).json({ success: false, message: 'Már feldolgozva' });
    }

    const routingResult = await documentRouter.routeDocument(id);

    // Mark as reviewed
    await query(`UPDATE email_inbox SET reviewed_by = $1 WHERE id = $2`, [req.user.id, id]);

    const result = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      WHERE e.id = $1
    `, [id]);

    res.json({
      success: true,
      message: 'Dokumentum sikeresen továbbítva',
      data: formatInbox(result.rows[0]),
      routing: routingResult,
    });
  } catch (error) {
    logger.error('Error routing:', error);
    res.status(500).json({ success: false, message: 'Hiba a továbbításnál' });
  }
};

/**
 * POST /api/v1/email-inbox/reclassify/:id
 * Manually reclassify a document
 */
const reclassify = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;

    if (!documentType) {
      return res.status(400).json({ success: false, message: 'Dokumentum típus megadása kötelező' });
    }

    const inbox = await query('SELECT * FROM email_inbox WHERE id = $1', [id]);
    if (inbox.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nem található' });
    }

    const doc = inbox.rows[0];
    const extractedData = entityExtractor.extract(doc.extracted_text || '', documentType);

    await query(`
      UPDATE email_inbox SET
        document_type = $1,
        confidence_score = 100,
        classification_reasoning = 'Manuálisan átsorolt',
        extracted_data = $2,
        needs_review = false,
        status = CASE WHEN status = 'processed' THEN status ELSE 'pending' END,
        reviewed_by = $3
      WHERE id = $4
    `, [documentType, JSON.stringify(extractedData), req.user.id, id]);

    const result = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      WHERE e.id = $1
    `, [id]);

    res.json({ success: true, data: formatInbox(result.rows[0]) });
  } catch (error) {
    logger.error('Error reclassifying:', error);
    res.status(500).json({ success: false, message: 'Hiba az átsorolásnál' });
  }
};

/**
 * GET /api/v1/email-inbox/routing-log/:id
 */
const getRoutingLog = async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM document_routing_log
      WHERE email_inbox_id = $1
      ORDER BY created_at DESC
    `, [req.params.id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching routing log:', error);
    res.status(500).json({ success: false, message: 'Hiba a napló lekérésekor' });
  }
};

/**
 * DELETE /api/v1/email-inbox/:id
 */
const remove = async (req, res) => {
  try {
    const result = await query(
      "DELETE FROM email_inbox WHERE id = $1 AND status != 'processed' RETURNING id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nem található vagy már feldolgozott' });
    }

    res.json({ success: true, message: 'Törölve' });
  } catch (error) {
    logger.error('Error deleting inbox item:', error);
    res.status(500).json({ success: false, message: 'Hiba a törlésnél' });
  }
};

module.exports = {
  getAll,
  getStats,
  getById,
  upload,
  classify,
  route,
  reclassify,
  getRoutingLog,
  remove,
};
