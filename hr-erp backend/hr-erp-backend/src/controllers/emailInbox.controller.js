const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const claudeOCR = require('../services/claudeOCR.service');
const documentClassifier = require('../services/documentClassifier.service');
const entityExtractor = require('../services/entityExtractor.service');
const documentRouter = require('../services/documentRouter.service');
const invoiceClassifier = require('../services/invoiceClassification.service');
const path = require('path');
const fs = require('fs');

/**
 * Safely coerce a JSON-extracted value to a DB-typed value.
 * Returns null for non-matching inputs so DECIMAL/DATE columns never reject.
 */
function safeDecimal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function safeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function safeString(v, maxLen) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Derive dedicated invoice columns from extracted_data JSONB.
 * Used by INSERT (new inbox rows) and UPDATE (re-process script).
 */
function extractInvoiceColumns(extractedData) {
  const d = extractedData || {};
  return {
    invoice_number: safeString(d.invoiceNumber, 100),
    vendor_name: safeString(d.vendorName, 255),
    vendor_tax_number: safeString(d.vendorTaxNumber, 32),
    currency: safeString(d.currency, 10),
    invoice_date: safeDate(d.invoiceDate),
    due_date: safeDate(d.dueDate),
    net_amount: safeDecimal(d.netAmount),
    vat_amount: safeDecimal(d.vatAmount),
    gross_amount: safeDecimal(d.grossAmount),
  };
}

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
    // Dedicated invoice columns (from migration 082)
    invoiceNumber: row.invoice_number || null,
    invoiceDate: row.invoice_date || null,
    dueDate: row.due_date || null,
    vendorName: row.vendor_name || null,
    vendorTaxNumber: row.vendor_tax_number || null,
    netAmount: row.net_amount !== null && row.net_amount !== undefined ? Number(row.net_amount) : null,
    vatAmount: row.vat_amount !== null && row.vat_amount !== undefined ? Number(row.vat_amount) : null,
    grossAmount: row.gross_amount !== null && row.gross_amount !== undefined ? Number(row.gross_amount) : null,
    currency: row.currency || null,
    // Classification result (from migration 083)
    costCenterId: row.cost_center_id || null,
    costCenterCode: row.cost_center_code || null,
    costCenterName: row.cost_center_name || null,
    classificationReason: row.classification_reason || null,
    autoClassified: row.auto_classified || false,
    notes: row.notes || null,
    status: row.status,
    routedTo: row.routed_to,
    routedId: row.routed_id,
    needsReview: row.needs_review,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name || null,
    contractorId: row.contractor_id,
    emailMessageId: row.email_message_id || null,
    source: row.source || 'manual',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Reusable document processing pipeline: OCR → classify → extract → insert → auto-route
 * Called by both the upload endpoint and the Gmail universal poller.
 *
 * @param {string} filePath - Absolute path to the file on disk
 * @param {object} metadata - { emailFrom, emailSubject, originalFilename, emailMessageId, source }
 * @returns {object} { inboxItem, routingResult }
 */
async function processDocumentFile(filePath, metadata = {}) {
  const relativePath = path.relative(path.join(__dirname, '..', '..'), filePath);
  const filename = metadata.originalFilename || path.basename(filePath);

  // Step 1: OCR text extraction
  let extractedText = '';
  try {
    const ocrData = await claudeOCR.extractInvoiceData(filePath);
    if (ocrData) {
      extractedText = Object.values(ocrData).filter(v => typeof v === 'string' && v).join(' ');
    }
  } catch (e) {
    logger.warn('OCR extraction failed:', e.message);
  }

  // Also try raw text extraction for classification
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
  } else if (ext === '.txt') {
    try {
      const textContent = fs.readFileSync(filePath, 'utf8');
      if (textContent.length > extractedText.length) {
        extractedText = textContent;
      }
    } catch (e) {
      logger.warn('Text file read failed:', e.message);
    }
  }

  // Step 2: Classify document
  const classification = documentClassifier.classifyDocument(extractedText, filename);

  // Step 3: Extract entities based on type
  let extractedData = {};
  if (classification.documentType === 'invoice') {
    try {
      extractedData = await claudeOCR.extractInvoiceData(filePath) || {};
    } catch (e) {
      logger.warn('Invoice OCR failed:', e.message);
    }
  } else {
    extractedData = entityExtractor.extract(extractedText, classification.documentType);
  }

  // Step 4: Post-OCR validation — reject obviously non-financial documents
  // instead of inserting them with misleading values.
  const hasConcreteField = !!(
    extractedData?.invoiceNumber || extractedData?.grossAmount || extractedData?.netAmount
  );
  const isFinancialType = ['invoice', 'contract', 'receipt'].includes(classification.documentType);

  let rejectReason = null;
  if (classification.confidence < 30 && !hasConcreteField) {
    rejectReason = `Alacsony besorolási magabiztosság (${classification.confidence}%) és nincs konkrét számla-mező`;
  } else if (classification.documentType === 'other' && classification.confidence < 40 && !hasConcreteField) {
    rejectReason = `'other' típus és alacsony magabiztosság (${classification.confidence}%)`;
  } else if (!isFinancialType && !hasConcreteField && classification.confidence < 60) {
    rejectReason = `Nem pénzügyi dokumentum és nincs számla-mező (${classification.confidence}%)`;
  }

  if (rejectReason) {
    logger.info(`POST-OCR REJECT: ${filename} — ${rejectReason}`);
  }

  // Step 4.5: Run rule-based cost center classification (only for invoices
  // that passed post-OCR validation). Uses vendor name + sender email for
  // PARTNER rules; settlement/keyword rules require admin-authored `notes`
  // (empty at initial ingest — filled later via reclassify-cost-center).
  let classifyResult = null;
  if (!rejectReason && classification.documentType === 'invoice') {
    try {
      classifyResult = await invoiceClassifier.classifyInvoice({
        vendorName: extractedData?.vendorName,
        subject: metadata.emailSubject,
        notes: null, // initial ingest — notes empty; admin fills via UI later
        emailFrom: metadata.emailFrom,
      });
      logger.info(`Cost center: ${classifyResult.cost_center_code || '?'} ` +
                  `(conf ${classifyResult.confidence}, source ${classifyResult.source}) — ${classifyResult.reason}`);
    } catch (e) {
      logger.warn('Cost center classification failed:', e.message);
    }
  }

  // Step 5: Create email_inbox record. needs_review is set if EITHER
  // the OCR classification is weak OR the cost-center classifier says so.
  const ocrNeedsReview = !rejectReason && (classification.confidence < 70 || classification.documentType === 'other');
  const ccNeedsReview = classifyResult?.needs_review === true;
  const needsReview = ocrNeedsReview || ccNeedsReview;
  const invCols = extractInvoiceColumns(extractedData);

  const result = await query(`
    INSERT INTO email_inbox (
      email_from, email_subject, email_date,
      attachment_filename, attachment_path,
      document_type, confidence_score, classification_reasoning,
      extracted_text, extracted_data,
      status, needs_review,
      email_message_id, source,
      invoice_number, invoice_date, due_date,
      vendor_name, vendor_tax_number,
      net_amount, vat_amount, gross_amount, currency,
      cost_center_id, classification_reason, auto_classified
    ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, $22,
              $23, $24, $25)
    RETURNING *
  `, [
    metadata.emailFrom || 'manual_upload',
    metadata.emailSubject || filename || 'Kézi feltöltés',
    filename,
    relativePath,
    classification.documentType,
    classification.confidence,
    rejectReason ? `${classification.reasoning} | REJECT: ${rejectReason}` : classification.reasoning,
    extractedText.substring(0, 10000),
    JSON.stringify(extractedData),
    rejectReason ? 'rejected' : (needsReview ? 'needs_review' : 'pending'),
    needsReview,
    metadata.emailMessageId || null,
    metadata.source || 'manual',
    invCols.invoice_number, invCols.invoice_date, invCols.due_date,
    invCols.vendor_name, invCols.vendor_tax_number,
    invCols.net_amount, invCols.vat_amount, invCols.gross_amount, invCols.currency,
    classifyResult?.cost_center_id || null,
    classifyResult?.reason || null,
    classifyResult?.auto_approved || false,
  ]);

  const inboxItem = result.rows[0];

  // Step 6: Auto-route if confidence is high enough AND not rejected
  let routingResult = null;
  if (!needsReview && !rejectReason) {
    try {
      routingResult = await documentRouter.routeDocument(inboxItem.id);
    } catch (e) {
      logger.error('Auto-routing failed:', e.message);
    }
  }

  return { inboxItem, routingResult, needsReview };
}

/**
 * Process an email body (no attachment) — save as .txt then run the pipeline
 *
 * @param {string} bodyText - Plain text email body
 * @param {object} metadata - { emailFrom, emailSubject, emailMessageId, source }
 * @returns {object} { inboxItem, routingResult }
 */
async function processEmailBody(bodyText, metadata = {}) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const safeName = (metadata.emailSubject || 'email_body').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${timestamp}_${safeName}.txt`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, bodyText, 'utf8');

  return processDocumentFile(filePath, {
    ...metadata,
    originalFilename: fileName,
  });
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
          u.first_name || ' ' || u.last_name as reviewer_name,
          cc.code as cost_center_code,
          cc.name as cost_center_name
        FROM email_inbox e
        LEFT JOIN users u ON e.reviewed_by = u.id
        LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
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
        u.first_name || ' ' || u.last_name as reviewer_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM email_inbox e
      LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
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

    const { inboxItem, routingResult, needsReview } = await processDocumentFile(req.file.path, {
      emailFrom: req.user.email || 'manual_upload',
      emailSubject: req.body.emailSubject || req.body.subject || req.file.originalname || 'Kézi feltöltés',
      originalFilename: req.file.originalname,
      source: 'manual',
    });

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
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name,
        cc.code as cost_center_code, cc.name as cost_center_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
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
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name,
        cc.code as cost_center_code, cc.name as cost_center_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
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
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name,
        cc.code as cost_center_code, cc.name as cost_center_name
      FROM email_inbox e LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      WHERE e.id = $1
    `, [id]);

    res.json({ success: true, data: formatInbox(result.rows[0]) });
  } catch (error) {
    logger.error('Error reclassifying:', error);
    res.status(500).json({ success: false, message: 'Hiba az átsorolásnál' });
  }
};

/**
 * POST /api/v1/email-inbox/:id/reclassify-cost-center
 * Body: { notes? }   — optional; if provided, updates email_inbox.notes first
 *
 * Admin workflow: admin types "Beled szálló — rezsi" in notes, we re-run
 * the rule-engine with the new notes, and the Beled settlement keyword rule
 * catches it → CC assigned automatically.
 */
const reclassifyCostCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    // Update notes if provided
    if (typeof notes === 'string') {
      await query('UPDATE email_inbox SET notes = $1, updated_at = NOW() WHERE id = $2',
        [notes, id]);
    }

    // Fetch the row (join cost_centers for the new code/name in response)
    const row = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name,
             cc.code as cost_center_code, cc.name as cost_center_name
      FROM email_inbox e
      LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      WHERE e.id = $1
    `, [id]);
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email nem található' });
    }
    const item = row.rows[0];

    // Re-run classification
    const result = await invoiceClassifier.classifyInvoice({
      vendorName: item.vendor_name,
      subject: item.email_subject,
      notes: item.notes,
      emailFrom: item.email_from,
    });

    // Persist result
    await query(`
      UPDATE email_inbox SET
        cost_center_id = $1,
        classification_reason = $2,
        auto_classified = $3,
        needs_review = $4,
        updated_at = NOW()
      WHERE id = $5
    `, [
      result.cost_center_id,
      result.reason,
      result.auto_approved,
      result.needs_review,
      id,
    ]);

    // Return updated row
    const updated = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as reviewer_name,
             cc.code as cost_center_code, cc.name as cost_center_name
      FROM email_inbox e
      LEFT JOIN users u ON e.reviewed_by = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      WHERE e.id = $1
    `, [id]);

    res.json({
      success: true,
      data: {
        emailInbox: formatInbox(updated.rows[0]),
        classification: result,
      },
    });
  } catch (err) {
    logger.error('[reclassifyCostCenter]', err);
    res.status(500).json({ success: false, message: 'Költséghely újraosztályozási hiba' });
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

/**
 * POST /api/v1/email-inbox/poll-emails
 * Trigger Gmail universal poller manually
 */
const pollEmails = async (req, res) => {
  try {
    const gmailUniversalPoller = require('../services/gmailUniversalPoller.service');
    const result = await gmailUniversalPoller.pollAllEmails();
    res.json({
      success: true,
      message: 'Email lekérdezés befejezve',
      data: result,
    });
  } catch (error) {
    logger.error('Error polling emails:', error);
    res.status(500).json({ success: false, message: 'Hiba az email lekérdezéskor' });
  }
};

/**
 * GET /api/v1/email-inbox/gmail-status
 * Returns whether Gmail integration is configured and connected
 */
const getGmailStatus = async (req, res) => {
  try {
    const configured = !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN
    );

    let connected = false;
    if (configured) {
      try {
        const gmailUniversalPoller = require('../services/gmailUniversalPoller.service');
        connected = await gmailUniversalPoller.testConnection();
      } catch (e) {
        logger.warn('Gmail connection test failed:', e.message);
      }
    }

    res.json({
      success: true,
      data: { configured, connected },
    });
  } catch (error) {
    logger.error('Error checking Gmail status:', error);
    res.status(500).json({ success: false, message: 'Hiba a Gmail státusz ellenőrzésekor' });
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
  pollEmails,
  getGmailStatus,
  processDocumentFile,
  processEmailBody,
  extractInvoiceColumns,
  reclassifyCostCenter,
};
