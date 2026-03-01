const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const gmailMCP = require('../services/gmailMCP.service');
const claudeOCR = require('../services/claudeOCR.service');
const costCenterPredictor = require('../services/costCenterPredictor.service');
const path = require('path');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'ocr_failed'];

/**
 * Format a draft row for API response
 */
function formatDraft(row) {
  return {
    id: row.id,
    emailFrom: row.email_from,
    emailSubject: row.email_subject,
    emailMessageId: row.email_message_id,
    pdfFilePath: row.pdf_file_path,
    invoiceNumber: row.invoice_number,
    vendorName: row.vendor_name,
    vendorTaxNumber: row.vendor_tax_number,
    netAmount: row.net_amount ? parseFloat(row.net_amount) : null,
    vatAmount: row.vat_amount ? parseFloat(row.vat_amount) : null,
    grossAmount: row.gross_amount ? parseFloat(row.gross_amount) : null,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    beneficiaryIban: row.beneficiary_iban,
    description: row.description,
    extractedData: row.extracted_data,
    suggestedCostCenter: row.cost_center_name ? {
      id: row.suggested_cost_center_id,
      name: row.cost_center_name,
      code: row.cost_center_code,
    } : null,
    costCenterConfidence: row.cost_center_confidence,
    suggestionReasoning: row.suggestion_reasoning,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name || null,
    reviewedAt: row.reviewed_at,
    finalInvoiceId: row.final_invoice_id,
    contractorId: row.contractor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/v1/invoice-drafts
 * List all invoice drafts with filtering
 */
const getAll = async (req, res) => {
  try {
    const {
      status,
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
      conditions.push(`d.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        d.vendor_name ILIKE $${paramIndex}
        OR d.invoice_number ILIKE $${paramIndex}
        OR d.email_subject ILIKE $${paramIndex}
        OR d.email_from ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Validate sort column
    const allowedSorts = ['created_at', 'vendor_name', 'gross_amount', 'invoice_date', 'status'];
    const sortCol = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [draftsResult, countResult] = await Promise.all([
      query(`
        SELECT d.*,
          cc.name as cost_center_name,
          cc.code as cost_center_code,
          u.first_name || ' ' || u.last_name as reviewer_name
        FROM invoice_drafts d
        LEFT JOIN cost_centers cc ON d.suggested_cost_center_id = cc.id
        LEFT JOIN users u ON d.reviewed_by = u.id
        ${whereClause}
        ORDER BY d.${sortCol} ${sortDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),
      query(`SELECT COUNT(*) FROM invoice_drafts d ${whereClause}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: draftsResult.rows.map(formatDraft),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Error fetching invoice drafts:', error);
    res.status(500).json({ success: false, message: 'Hiba a piszkozatok lekérésekor' });
  }
};

/**
 * GET /api/v1/invoice-drafts/stats
 * Get summary statistics
 */
const getStats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE status = 'ocr_failed') as failed_count,
        COUNT(*) as total_count,
        COALESCE(SUM(gross_amount) FILTER (WHERE status = 'pending'), 0) as pending_total,
        COALESCE(SUM(gross_amount) FILTER (WHERE status = 'approved'), 0) as approved_total
      FROM invoice_drafts
    `);

    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        pending: parseInt(stats.pending_count),
        approved: parseInt(stats.approved_count),
        rejected: parseInt(stats.rejected_count),
        failed: parseInt(stats.failed_count),
        total: parseInt(stats.total_count),
        pendingTotal: parseFloat(stats.pending_total),
        approvedTotal: parseFloat(stats.approved_total),
      },
    });
  } catch (error) {
    logger.error('Error fetching draft stats:', error);
    res.status(500).json({ success: false, message: 'Hiba a statisztikák lekérésekor' });
  }
};

/**
 * GET /api/v1/invoice-drafts/:id
 * Get a single draft by ID
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT d.*,
        cc.name as cost_center_name,
        cc.code as cost_center_code,
        u.first_name || ' ' || u.last_name as reviewer_name
      FROM invoice_drafts d
      LEFT JOIN cost_centers cc ON d.suggested_cost_center_id = cc.id
      LEFT JOIN users u ON d.reviewed_by = u.id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található' });
    }

    res.json({ success: true, data: formatDraft(result.rows[0]) });
  } catch (error) {
    logger.error('Error fetching draft:', error);
    res.status(500).json({ success: false, message: 'Hiba a piszkozat lekérésekor' });
  }
};

/**
 * PUT /api/v1/invoice-drafts/:id
 * Update draft fields (before approval)
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      invoiceNumber,
      vendorName,
      vendorTaxNumber,
      netAmount,
      vatAmount,
      grossAmount,
      invoiceDate,
      dueDate,
      beneficiaryIban,
      description,
      suggestedCostCenterId,
    } = req.body;

    // Check draft exists and is still pending
    const existing = await query('SELECT status FROM invoice_drafts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található' });
    }
    if (existing.rows[0].status !== 'pending' && existing.rows[0].status !== 'ocr_failed') {
      return res.status(400).json({ success: false, message: 'Csak pending/ocr_failed státuszú piszkozat szerkeszthető' });
    }

    const result = await query(`
      UPDATE invoice_drafts SET
        invoice_number = COALESCE($1, invoice_number),
        vendor_name = COALESCE($2, vendor_name),
        vendor_tax_number = COALESCE($3, vendor_tax_number),
        net_amount = COALESCE($4, net_amount),
        vat_amount = COALESCE($5, vat_amount),
        gross_amount = COALESCE($6, gross_amount),
        invoice_date = COALESCE($7, invoice_date),
        due_date = COALESCE($8, due_date),
        beneficiary_iban = COALESCE($9, beneficiary_iban),
        description = COALESCE($10, description),
        suggested_cost_center_id = COALESCE($11, suggested_cost_center_id),
        status = CASE WHEN status = 'ocr_failed' THEN 'pending' ELSE status END
      WHERE id = $12
      RETURNING *
    `, [
      invoiceNumber, vendorName, vendorTaxNumber,
      netAmount, vatAmount, grossAmount,
      invoiceDate, dueDate, beneficiaryIban,
      description, suggestedCostCenterId, id,
    ]);

    res.json({ success: true, data: formatDraft(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating draft:', error);
    res.status(500).json({ success: false, message: 'Hiba a piszkozat frissítésekor' });
  }
};

/**
 * POST /api/v1/invoice-drafts/:id/approve
 * Approve draft → create final invoice
 */
const approve = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { costCenterId } = req.body; // Optional override

    const draft = await query('SELECT * FROM invoice_drafts WHERE id = $1', [id]);
    if (draft.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található' });
    }

    const d = draft.rows[0];
    if (d.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Csak pending státuszú piszkozat hagyható jóvá' });
    }

    const finalCostCenterId = costCenterId || d.suggested_cost_center_id;
    if (!finalCostCenterId) {
      return res.status(400).json({ success: false, message: 'Költséghely megadása kötelező' });
    }

    // Transaction: create invoice + update draft
    const result = await transaction(async (client) => {
      // Create final invoice
      const invoiceResult = await client.query(`
        INSERT INTO invoices (
          invoice_number, vendor_name, vendor_tax_number,
          amount, vat_amount, total_amount,
          invoice_date, due_date,
          cost_center_id, description, file_path, ocr_data,
          contractor_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        d.invoice_number,
        d.vendor_name,
        d.vendor_tax_number,
        d.net_amount,
        d.vat_amount,
        d.gross_amount,
        d.invoice_date,
        d.due_date,
        finalCostCenterId,
        d.description,
        d.pdf_file_path,
        d.extracted_data,
        d.contractor_id,
        userId,
      ]);

      const invoiceId = invoiceResult.rows[0].id;

      // Update draft status
      const draftResult = await client.query(`
        UPDATE invoice_drafts SET
          status = 'approved',
          reviewed_by = $1,
          reviewed_at = NOW(),
          final_invoice_id = $2,
          suggested_cost_center_id = $3
        WHERE id = $4
        RETURNING *
      `, [userId, invoiceId, finalCostCenterId, id]);

      return { invoice: invoiceResult.rows[0], draft: draftResult.rows[0] };
    });

    logger.info(`Draft ${id} approved by user ${userId}, invoice created: ${result.invoice.id}`);

    res.json({
      success: true,
      message: 'Számla piszkozat jóváhagyva',
      data: {
        draft: formatDraft(result.draft),
        invoiceId: result.invoice.id,
      },
    });
  } catch (error) {
    logger.error('Error approving draft:', error);
    res.status(500).json({ success: false, message: 'Hiba a jóváhagyás során' });
  }
};

/**
 * POST /api/v1/invoice-drafts/:id/reject
 * Reject a draft
 */
const reject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(`
      UPDATE invoice_drafts SET
        status = 'rejected',
        reviewed_by = $1,
        reviewed_at = NOW()
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [userId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található vagy nem pending' });
    }

    logger.info(`Draft ${id} rejected by user ${userId}`);

    res.json({
      success: true,
      message: 'Számla piszkozat elutasítva',
      data: formatDraft(result.rows[0]),
    });
  } catch (error) {
    logger.error('Error rejecting draft:', error);
    res.status(500).json({ success: false, message: 'Hiba az elutasítás során' });
  }
};

/**
 * DELETE /api/v1/invoice-drafts/:id
 * Delete a draft (only if not approved)
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM invoice_drafts WHERE id = $1 AND status != $2 RETURNING id',
      [id, 'approved']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található vagy már jóváhagyott' });
    }

    res.json({ success: true, message: 'Piszkozat törölve' });
  } catch (error) {
    logger.error('Error deleting draft:', error);
    res.status(500).json({ success: false, message: 'Hiba a törlés során' });
  }
};

/**
 * POST /api/v1/invoice-drafts/upload
 * Manually upload a PDF for OCR processing
 */
const uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'PDF fájl szükséges' });
    }

    const filePath = req.file.path;
    const relativePath = path.relative(
      path.join(__dirname, '..', '..'),
      filePath
    );

    const rawDraft = await gmailMCP.processUploadedPDF(relativePath, {
      from: req.user.email || 'manual_upload',
      subject: req.body.subject || 'Kézi feltöltés',
    });

    // Re-fetch with JOINs for full response
    const result = await query(`
      SELECT d.*,
        cc.name as cost_center_name,
        cc.code as cost_center_code
      FROM invoice_drafts d
      LEFT JOIN cost_centers cc ON d.suggested_cost_center_id = cc.id
      WHERE d.id = $1
    `, [rawDraft.id]);

    res.json({
      success: true,
      message: 'PDF feldolgozva, piszkozat létrehozva',
      data: formatDraft(result.rows[0]),
    });
  } catch (error) {
    logger.error('Error uploading PDF:', error);
    res.status(500).json({ success: false, message: 'Hiba a PDF feldolgozásakor' });
  }
};

/**
 * POST /api/v1/invoice-drafts/:id/re-ocr
 * Re-run OCR on a failed draft
 */
const reRunOCR = async (req, res) => {
  try {
    const { id } = req.params;

    const draft = await query('SELECT * FROM invoice_drafts WHERE id = $1', [id]);
    if (draft.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Piszkozat nem található' });
    }

    const d = draft.rows[0];
    const absolutePath = path.join(__dirname, '..', '..', d.pdf_file_path);

    // Re-run OCR
    const extractedData = await claudeOCR.extractInvoiceData(absolutePath);

    if (!extractedData) {
      return res.status(422).json({ success: false, message: 'OCR feldolgozás ismét sikertelen' });
    }

    // Predict cost center
    const prediction = await costCenterPredictor.predict(extractedData);

    // Update draft
    await query(`
      UPDATE invoice_drafts SET
        invoice_number = $1,
        vendor_name = $2,
        vendor_tax_number = $3,
        net_amount = $4,
        vat_amount = $5,
        gross_amount = $6,
        invoice_date = $7,
        due_date = $8,
        beneficiary_iban = $9,
        description = $10,
        extracted_data = $11,
        suggested_cost_center_id = $12,
        cost_center_confidence = $13,
        suggestion_reasoning = $14,
        status = 'pending'
      WHERE id = $15
    `, [
      extractedData.invoiceNumber,
      extractedData.vendorName,
      extractedData.vendorTaxNumber,
      extractedData.netAmount,
      extractedData.vatAmount,
      extractedData.grossAmount,
      extractedData.invoiceDate,
      extractedData.dueDate,
      extractedData.beneficiaryIban,
      extractedData.description,
      JSON.stringify(extractedData),
      prediction?.costCenterId || null,
      prediction?.confidence || null,
      prediction?.reasoning || null,
      id,
    ]);

    // Re-fetch with JOINs for full response
    const result = await query(`
      SELECT d.*,
        cc.name as cost_center_name,
        cc.code as cost_center_code
      FROM invoice_drafts d
      LEFT JOIN cost_centers cc ON d.suggested_cost_center_id = cc.id
      WHERE d.id = $1
    `, [id]);

    res.json({
      success: true,
      message: 'OCR újrafuttatás sikeres',
      data: formatDraft(result.rows[0]),
    });
  } catch (error) {
    logger.error('Error re-running OCR:', error);
    res.status(500).json({ success: false, message: 'Hiba az OCR újrafuttatásakor' });
  }
};

/**
 * POST /api/v1/invoice-drafts/poll-emails
 * Manually trigger email polling
 */
const pollEmails = async (req, res) => {
  try {
    await gmailMCP.pollForInvoices();
    res.json({ success: true, message: 'Email lekérdezés elindítva' });
  } catch (error) {
    logger.error('Error polling emails:', error);
    res.status(500).json({ success: false, message: 'Hiba az email lekérdezéskor' });
  }
};

module.exports = {
  getAll,
  getStats,
  getById,
  update,
  approve,
  reject,
  remove,
  uploadPDF,
  reRunOCR,
  pollEmails,
};
