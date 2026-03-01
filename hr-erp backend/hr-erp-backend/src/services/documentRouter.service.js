const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const claudeOCR = require('./claudeOCR.service');
const costCenterPredictor = require('./costCenterPredictor.service');

class DocumentRouterService {

  /**
   * Route a classified document to the appropriate system
   */
  async routeDocument(emailInboxId) {
    const inbox = await query('SELECT * FROM email_inbox WHERE id = $1', [emailInboxId]);
    if (inbox.rows.length === 0) {
      throw new Error('Email inbox record not found');
    }

    const doc = inbox.rows[0];
    let result;

    try {
      switch (doc.document_type) {
        case 'invoice':
          result = await this.createInvoiceDraft(doc);
          break;
        case 'damage_report':
          result = await this.createTicket(doc);
          break;
        case 'employee_contract':
          result = await this.createDocument(doc, 'contract');
          break;
        case 'service_contract':
          result = await this.createDocument(doc, 'contract');
          break;
        case 'rental_contract':
          result = await this.createDocument(doc, 'contract');
          break;
        case 'tax_document':
          result = await this.createDocument(doc, 'tax');
          break;
        case 'payment_reminder':
          result = await this.flagUnpaidInvoice(doc);
          break;
        default:
          result = await this.createDocument(doc, 'other');
          break;
      }

      // Log success
      await this.logRouting(emailInboxId, doc.document_type, result.action, result.targetTable, result.targetId, true, null);

      // Update inbox status
      await query(`
        UPDATE email_inbox SET
          status = 'processed',
          routed_to = $1,
          routed_id = $2
        WHERE id = $3
      `, [result.targetTable, result.targetId, emailInboxId]);

      logger.info(`Document ${emailInboxId} routed to ${result.targetTable}/${result.targetId}`);
      return result;

    } catch (error) {
      // Log failure
      await this.logRouting(emailInboxId, doc.document_type, 'route_failed', null, null, false, error.message);

      await query(`UPDATE email_inbox SET status = 'failed' WHERE id = $1`, [emailInboxId]);

      logger.error(`Document routing failed for ${emailInboxId}:`, error);
      throw error;
    }
  }

  /**
   * Route invoice → invoice_drafts table
   */
  async createInvoiceDraft(doc) {
    const extractedData = doc.extracted_data || {};

    // Run cost center prediction
    let prediction = null;
    try {
      prediction = await costCenterPredictor.predict(extractedData);
    } catch (e) {
      logger.warn('Cost center prediction failed:', e.message);
    }

    const result = await query(`
      INSERT INTO invoice_drafts (
        email_from, email_subject, pdf_file_path,
        invoice_number, vendor_name, vendor_tax_number,
        net_amount, vat_amount, gross_amount,
        invoice_date, due_date, beneficiary_iban,
        description, extracted_data,
        suggested_cost_center_id, cost_center_confidence, suggestion_reasoning,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending')
      RETURNING id
    `, [
      doc.email_from,
      doc.email_subject,
      doc.attachment_path,
      extractedData.invoiceNumber || null,
      extractedData.vendorName || null,
      extractedData.vendorTaxNumber || null,
      extractedData.netAmount || null,
      extractedData.vatAmount || null,
      extractedData.grossAmount || null,
      extractedData.invoiceDate || null,
      extractedData.dueDate || null,
      extractedData.beneficiaryIban || null,
      extractedData.description || null,
      JSON.stringify(extractedData),
      prediction?.costCenterId || null,
      prediction?.confidence || null,
      prediction?.reasoning || null,
    ]);

    return {
      action: 'create_invoice_draft',
      targetTable: 'invoice_drafts',
      targetId: result.rows[0].id,
    };
  }

  /**
   * Route damage_report → tickets table with auto-assign
   */
  async createTicket(doc) {
    const entities = doc.extracted_data || {};
    const lower = (doc.extracted_text || '').toLowerCase();

    // Map urgency to priority
    const priorityMap = {
      critical: 'critical',
      high: 'urgent',
      medium: 'normal',
      low: 'low',
    };
    const prioritySlug = priorityMap[entities.urgency] || 'normal';

    return await transaction(async (client) => {
      // Get priority ID
      const priorityResult = await client.query(
        'SELECT id FROM priorities WHERE slug = $1 LIMIT 1',
        [prioritySlug]
      );
      const priorityId = priorityResult.rows[0]?.id || null;

      // Get "Technikai" category
      const categoryResult = await client.query(
        "SELECT id FROM ticket_categories WHERE slug = 'technical' LIMIT 1"
      );
      const categoryId = categoryResult.rows[0]?.id || null;

      // Get "new" status
      const statusResult = await client.query(
        "SELECT id FROM ticket_statuses WHERE slug = 'new' LIMIT 1"
      );
      const statusId = statusResult.rows[0]?.id || null;

      // Generate ticket number
      const ticketNumResult = await client.query(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)), 0) + 1 as next_number FROM tickets'
      );
      const ticketNumber = `#${ticketNumResult.rows[0].next_number}`;

      // Build title from issue
      let title = entities.issueDescription
        ? entities.issueDescription.substring(0, 100)
        : doc.email_subject || 'Kárbejelentés emailből';

      if (entities.roomNumber) {
        title = `${entities.roomNumber}. szoba - ${title}`;
      }

      // Build description
      const descParts = [];
      if (entities.location) descParts.push(`Helyszín: ${entities.location}`);
      if (entities.roomNumber) descParts.push(`Szoba: ${entities.roomNumber}`);
      if (entities.damageType) descParts.push(`Típus: ${entities.damageType}`);
      if (entities.urgency) descParts.push(`Sürgősség: ${entities.urgency}`);
      descParts.push('');
      descParts.push('--- Email tartalom ---');
      descParts.push(doc.extracted_text?.substring(0, 2000) || '');

      // Find accommodation by room number or name
      let accommodationId = null;
      if (entities.roomNumber) {
        const accommResult = await client.query(
          "SELECT id FROM accommodations WHERE name ILIKE $1 LIMIT 1",
          [`%${entities.roomNumber}%`]
        );
        if (accommResult.rows.length > 0) {
          accommodationId = accommResult.rows[0].id;
        }
      }

      // Get a system/admin user for created_by
      const adminResult = await client.query(
        "SELECT u.id, u.contractor_id FROM users u JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id WHERE r.slug = 'superadmin' LIMIT 1"
      );
      const createdBy = adminResult.rows[0]?.id || null;
      const contractorId = adminResult.rows[0]?.contractor_id || null;

      // Create ticket
      const ticketResult = await client.query(`
        INSERT INTO tickets (
          contractor_id, ticket_number, title, description,
          category_id, status_id, priority_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        contractorId,
        ticketNumber,
        title,
        descParts.join('\n'),
        categoryId,
        statusId,
        priorityId,
        createdBy,
      ]);

      const ticketId = ticketResult.rows[0].id;

      // Add ticket history entry
      await client.query(`
        INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
        VALUES ($1, $2, 'created', 'Automatikusan létrehozva email kárbejelentésből')
      `, [ticketId, createdBy]);

      // Try auto-assign
      try {
        const autoAssign = require('./autoAssign.service');
        await autoAssign.assignTicket(ticketId);
      } catch (e) {
        logger.warn('Auto-assign failed for ticket:', e.message);
      }

      logger.info(`Damage report routed to ticket ${ticketNumber} (priority: ${prioritySlug})`);

      return {
        action: 'create_ticket',
        targetTable: 'tickets',
        targetId: ticketId,
      };
    });
  }

  /**
   * Route contracts/tax/other → documents table
   */
  async createDocument(doc, documentType) {
    const title = doc.email_subject || doc.attachment_filename || 'Ismeretlen dokumentum';

    // Get admin user for uploaded_by
    const adminResult = await query(
      "SELECT u.id FROM users u JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id WHERE r.slug = 'superadmin' LIMIT 1"
    );
    const uploadedBy = adminResult.rows[0]?.id || null;

    const result = await query(`
      INSERT INTO documents (
        uploaded_by, title, description, file_path, file_name,
        file_size, mime_type, document_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      uploadedBy,
      title,
      doc.classification_reasoning || null,
      doc.attachment_path || '',
      doc.attachment_filename || 'unknown',
      0,
      'application/pdf',
      documentType,
    ]);

    return {
      action: 'create_document',
      targetTable: 'documents',
      targetId: result.rows[0].id,
    };
  }

  /**
   * Route payment_reminder → flag unpaid invoice
   */
  async flagUnpaidInvoice(doc) {
    const entities = doc.extracted_data || {};

    // Try to find matching unpaid invoice
    if (entities.invoiceNumber) {
      const invoiceResult = await query(
        "SELECT id FROM invoices WHERE invoice_number = $1 AND payment_status != 'paid' LIMIT 1",
        [entities.invoiceNumber]
      );

      if (invoiceResult.rows.length > 0) {
        await query(
          "UPDATE invoices SET payment_status = 'overdue', notes = COALESCE(notes, '') || $1 WHERE id = $2",
          ['\n[Fizetési felszólítás érkezett: ' + new Date().toISOString().split('T')[0] + ']', invoiceResult.rows[0].id]
        );

        return {
          action: 'flag_overdue_invoice',
          targetTable: 'invoices',
          targetId: invoiceResult.rows[0].id,
        };
      }
    }

    // If no matching invoice found, create a document record
    return await this.createDocument(doc, 'payment_reminder');
  }

  /**
   * Log routing action
   */
  async logRouting(emailInboxId, documentType, action, targetTable, targetId, success, errorMessage) {
    await query(`
      INSERT INTO document_routing_log (
        email_inbox_id, document_type, action_taken,
        target_table, target_id, success, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [emailInboxId, documentType, action, targetTable, targetId, success, errorMessage]);
  }
}

module.exports = new DocumentRouterService();
