const fs = require('fs/promises');
const path = require('path');
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');
const gmailMCP = require('../services/gmailMCP.service');
const claudeOCR = require('../services/claudeOCR.service');
const costCenterPredictor = require('../services/costCenterPredictor.service');
const expenseService = require('../services/expense.service');
const storage = require('../services/storage.service');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'ocr_failed', 'converted'];

// MIME sniff for the PDF copy on convert. invoice_drafts pdf_file_path
// is always a PDF in practice (claudeOCR.service.js + Gmail attachment
// filter both require it), but we double-check the extension before
// pushing into the expense storage adapter.
function mimeFromPath(p) {
  const ext = path.extname(p || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return null;
}

// pg returns DATE columns as JS Date objects at LOCAL midnight. Passing
// those back to another INSERT serialises them via .toISOString() which
// flips to UTC and drops the day by ~1 under CEST. Same root cause as the
// frontend fmtDateInput fix — use local components, never UTC.
function dateToISODate(d) {
  if (d == null) return null;
  if (typeof d === 'string') {
    // Already a string — keep just the date portion.
    return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d;
  }
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
}

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
    performanceDate: row.performance_date,
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
  // DEPRECATED 2026-06-21 — this wrote drafts into the dormant `invoices` table.
  // The correct, live path is convert() → accommodation_expenses (the cost source
  // for the billing/margin model). Retired to remove the foot-gun: reviewers use
  // "Convert" only. The old implementation is kept below (unreachable) for
  // reference / possible revival.
  return res.status(410).json({
    success: false,
    message: 'Az "approve" megszűnt. Használd a "Konvertálás" műveletet (convert → accommodation_expenses).',
    use: 'POST /api/v1/invoice-drafts/:id/convert',
  });
  /* eslint-disable no-unreachable */
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

    // Validate NOT NULL fields for invoices table, provide defaults
    const invoiceDate = d.invoice_date || new Date().toISOString().split('T')[0];
    const amount = d.net_amount || d.gross_amount || 0;

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
        amount,
        d.vat_amount,
        d.gross_amount,
        invoiceDate,
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
        performance_date = $8,
        due_date = $9,
        beneficiary_iban = $10,
        description = $11,
        extracted_data = $12,
        suggested_cost_center_id = $13,
        cost_center_confidence = $14,
        suggestion_reasoning = $15,
        status = 'pending'
      WHERE id = $16
    `, [
      extractedData.invoiceNumber,
      extractedData.vendorName,
      extractedData.vendorTaxNumber,
      extractedData.netAmount,
      extractedData.vatAmount,
      extractedData.grossAmount,
      extractedData.invoiceDate,
      extractedData.performanceDate || null,
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
 * Manually trigger email polling (delegates to universal poller)
 */
const pollEmails = async (req, res) => {
  try {
    const gmailUniversalPoller = require('../services/gmailUniversalPoller.service');
    const result = await gmailUniversalPoller.pollAllEmails();
    res.json({ success: true, message: 'Email lekérdezés befejezve', data: result });
  } catch (error) {
    logger.error('Error polling emails:', error);
    res.status(500).json({ success: false, message: 'Hiba az email lekérdezéskor' });
  }
};

/**
 * POST /api/v1/invoice-drafts/:id/convert
 *
 * Day-3 (2026-05-21) bridge from the dormant old AI pipeline to the
 * live accommodation_expenses table. The UI calls this with a full
 * expense payload — the human has filled accommodation/category/amount
 * already. We:
 *   1. Verify the draft exists and is convertible (status='pending').
 *      If already 'converted', return 409 with the existing
 *      final_expense_id so the UI can show the linked expense.
 *   2. Pre-merge draft metadata (vendor_name, vendor_tax_number,
 *      invoice_number, invoice_date) into the payload BEFORE handing
 *      it to expenseService.create — the UI normally fills these but
 *      we don't want a half-converted draft losing the OCR work if
 *      the human accidentally cleared a field.
 *   3. Run expenseService.create + dedup is skipped here (the user
 *      saw the source draft, so they're aware of duplication risk;
 *      we don't want them blocked when the original email came in
 *      twice — which IS the case for 2 of our 5 stale drafts).
 *   4. Copy invoice_drafts.pdf_file_path → storage.save() under the
 *      new expense's uploads/expenses/YYYY/MM/<id>/ path.
 *   5. Update the draft: status='converted', final_expense_id=<id>.
 *   6. Audit via activityLogger on both entities.
 *
 * Body: same shape as POST /expenses + override_note for the audit log.
 */
const convert = async (req, res) => {
  try {
    // Step 1: load + guard
    const draftRes = await query(
      'SELECT * FROM invoice_drafts WHERE id = $1',
      [req.params.id],
    );
    if (draftRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Számla piszkozat nem található' });
    }
    const draft = draftRes.rows[0];

    if (draft.status === 'converted') {
      return res.status(409).json({
        success: false,
        message: 'A piszkozat már át lett konvertálva költséggé',
        final_expense_id: draft.final_expense_id,
      });
    }
    if (draft.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `Csak 'pending' státuszú piszkozat konvertálható (jelenleg: ${draft.status})`,
      });
    }

    // Step 2: merge draft metadata into the payload as fallbacks.
    // performance_date priority: caller > draft.performance_date >
    // draft.invoice_date. The invoice_date fallback covers legacy
    // drafts created before migration 116 / the OCR prompt update.
    // Date fields go through dateToISODate to dodge the local-midnight →
    // UTC-previous-day flip when DB rows are re-INSERTed downstream.
    const payload = {
      ...req.body,
      vendor_name:       req.body.vendor_name       || draft.vendor_name       || null,
      vendor_tax_number: req.body.vendor_tax_number || draft.vendor_tax_number || null,
      invoice_number:    req.body.invoice_number    || draft.invoice_number    || null,
      // Cost center: the human's override wins; else fall back to the AI's
      // suggested_cost_center_id so the classification isn't lost on Convert.
      cost_center_id:    req.body.cost_center_id    || draft.suggested_cost_center_id || null,
      invoice_date:      req.body.invoice_date      || dateToISODate(draft.invoice_date),
      performance_date:  req.body.performance_date
                       || dateToISODate(draft.performance_date)
                       || dateToISODate(draft.invoice_date)
                       || null,
      source: 'email_ocr',
    };

    // Step 3: create the expense (dedup gate skipped — same vendor +
    // amount across drafts is expected for monthly recurring bills).
    const result = await expenseService.create(payload, req.user.id);
    if (result.error) {
      return res.status(result.status || 400).json({ success: false, message: result.error });
    }
    const expense = result.data;

    // Step 4: copy the PDF (if any) into the expense's file_attachments.
    // Failure here is non-fatal — the expense is already created;
    // we log + return a soft warning rather than rolling back.
    let pdfCopyError = null;
    if (draft.pdf_file_path) {
      try {
        const absSrc = path.isAbsolute(draft.pdf_file_path)
          ? draft.pdf_file_path
          : path.join(__dirname, '..', '..', draft.pdf_file_path);
        const buffer = await fs.readFile(absSrc);
        const mime = mimeFromPath(draft.pdf_file_path) || 'application/pdf';
        const original_name = path.basename(draft.pdf_file_path);

        const saved = await storage.save({
          buffer, mime,
          expense_id: expense.id,
          billing_month: expense.billing_month,
          original_name,
          uploaded_by: req.user.id,
        });

        const upd = await query(
          `UPDATE accommodation_expenses
              SET file_attachments = COALESCE(file_attachments, '[]'::jsonb) || $1::jsonb
            WHERE id = $2 RETURNING file_attachments`,
          [JSON.stringify([saved]), expense.id],
        );
        expense.file_attachments = upd.rows[0].file_attachments;
      } catch (e) {
        pdfCopyError = e.message;
        logger.error('PDF copy failed during draft convert:', e);
      }
    }

    // Step 5: mark the draft converted
    await query(
      `UPDATE invoice_drafts
          SET status = 'converted',
              final_expense_id = $1,
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at  = CURRENT_TIMESTAMP
        WHERE id = $3`,
      [expense.id, req.user.id, draft.id],
    );

    // Step 6: audit (action names ≤20 chars for the VARCHAR(20) column)
    await logActivity({
      userId: req.user.id,
      entityType: 'invoice_draft',
      entityId: draft.id,
      action: 'draft_convert',
      metadata: {
        final_expense_id: expense.id,
        vendor_name: draft.vendor_name,
        invoice_number: draft.invoice_number,
        pdf_copied: !pdfCopyError,
        pdf_copy_error: pdfCopyError,
      },
    });
    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: expense.id,
      action: 'from_draft',
      metadata: { invoice_draft_id: draft.id },
    });

    res.status(201).json({
      success: true,
      message: pdfCopyError
        ? 'Költség létrehozva, de a PDF másolás sikertelen'
        : 'Költség létrehozva a piszkozatból',
      data: {
        expense,
        invoice_draft_id: draft.id,
        pdf_copy_error: pdfCopyError,
      },
    });
  } catch (error) {
    logger.error('Piszkozat konvertálási hiba:', error);
    res.status(500).json({ success: false, message: 'Piszkozat konvertálási hiba' });
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
  convert,
};
