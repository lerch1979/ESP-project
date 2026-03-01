const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const claudeOCR = require('./claudeOCR.service');
const costCenterPredictor = require('./costCenterPredictor.service');

const INVOICE_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'invoices');
const SEARCH_KEYWORDS = ['számla', 'invoice', 'faktura', 'számla melléklet'];

class GmailMCPService {
  constructor() {
    this.gmail = null;
    this.isProcessing = false;
  }

  /**
   * Initialize Gmail API client with OAuth2
   */
  async initialize() {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      });

      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Ensure upload directory exists
      if (!fs.existsSync(INVOICE_UPLOAD_DIR)) {
        fs.mkdirSync(INVOICE_UPLOAD_DIR, { recursive: true });
      }

      logger.info('Gmail MCP service initialized');
      return true;
    } catch (error) {
      logger.error('Gmail MCP initialization failed:', error);
      return false;
    }
  }

  /**
   * Poll Gmail for new invoice emails
   * Called by cron job every 5 minutes
   */
  async pollForInvoices() {
    if (this.isProcessing) {
      logger.info('Gmail poll already in progress, skipping');
      return;
    }

    if (!this.gmail) {
      const initialized = await this.initialize();
      if (!initialized) {
        logger.warn('Gmail MCP not configured, skipping poll');
        return;
      }
    }

    this.isProcessing = true;

    try {
      // Build search query for invoice-related emails with PDF attachments
      const searchQuery = SEARCH_KEYWORDS
        .map(kw => `subject:${kw}`)
        .join(' OR ');

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: `(${searchQuery}) has:attachment filename:pdf is:unread`,
        maxResults: 10,
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        logger.debug('No new invoice emails found');
        return;
      }

      logger.info(`Found ${messages.length} potential invoice emails`);

      for (const msg of messages) {
        await this.processEmail(msg.id);
      }
    } catch (error) {
      logger.error('Gmail poll error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single email message
   */
  async processEmail(messageId) {
    try {
      // Check if already processed
      const existing = await query(
        'SELECT id FROM invoice_drafts WHERE email_message_id = $1',
        [messageId]
      );
      if (existing.rows.length > 0) {
        logger.debug(`Email ${messageId} already processed, skipping`);
        return;
      }

      // Get full message
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = message.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '';

      logger.info(`Processing email: "${subject}" from ${from}`);

      // Find PDF attachments
      const pdfParts = this.findPDFParts(message.data.payload);

      if (pdfParts.length === 0) {
        logger.info(`No PDF attachments in email ${messageId}`);
        return;
      }

      // Process each PDF attachment
      for (const pdfPart of pdfParts) {
        await this.processPDFAttachment(messageId, from, subject, pdfPart);
      }

      // Mark email as read
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      logger.error(`Error processing email ${messageId}:`, error);
    }
  }

  /**
   * Recursively find PDF attachment parts in message payload
   */
  findPDFParts(payload) {
    const pdfParts = [];

    if (payload.mimeType === 'application/pdf' && payload.body?.attachmentId) {
      pdfParts.push({
        attachmentId: payload.body.attachmentId,
        filename: payload.filename || 'invoice.pdf',
      });
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        pdfParts.push(...this.findPDFParts(part));
      }
    }

    return pdfParts;
  }

  /**
   * Download and process a single PDF attachment
   */
  async processPDFAttachment(messageId, from, subject, pdfPart) {
    try {
      // Download attachment
      const attachment = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: pdfPart.attachmentId,
      });

      const pdfBuffer = Buffer.from(attachment.data.data, 'base64');

      // Save PDF to disk
      const timestamp = Date.now();
      const safeName = pdfPart.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${timestamp}_${safeName}`;
      const filePath = path.join(INVOICE_UPLOAD_DIR, fileName);

      fs.writeFileSync(filePath, pdfBuffer);
      logger.info(`Saved PDF: ${fileName} (${pdfBuffer.length} bytes)`);

      // OCR extraction via Claude
      const extractedData = await claudeOCR.extractInvoiceData(filePath);

      if (!extractedData) {
        logger.warn(`OCR extraction failed for ${fileName}`);
        // Still create draft with minimal data
        await this.createDraft({
          emailMessageId: messageId,
          emailFrom: from,
          emailSubject: subject,
          pdfFilePath: `uploads/invoices/${fileName}`,
          extractedData: null,
          status: 'ocr_failed',
        });
        return;
      }

      // Predict cost center
      const prediction = await costCenterPredictor.predict(extractedData);

      // Create invoice draft
      await this.createDraft({
        emailMessageId: messageId,
        emailFrom: from,
        emailSubject: subject,
        pdfFilePath: `uploads/invoices/${fileName}`,
        extractedData,
        prediction,
      });

      logger.info(`Invoice draft created from email: ${subject}`);
    } catch (error) {
      logger.error(`Error processing PDF attachment:`, error);
    }
  }

  /**
   * Create an invoice draft record in the database
   */
  async createDraft({ emailMessageId, emailFrom, emailSubject, pdfFilePath, extractedData, prediction, status }) {
    const result = await query(
      `INSERT INTO invoice_drafts (
        email_message_id, email_from, email_subject, pdf_file_path,
        invoice_number, vendor_name, vendor_tax_number,
        net_amount, vat_amount, gross_amount,
        invoice_date, due_date, beneficiary_iban,
        description, extracted_data,
        suggested_cost_center_id, cost_center_confidence, suggestion_reasoning,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        emailMessageId,
        emailFrom,
        emailSubject,
        pdfFilePath,
        extractedData?.invoiceNumber || null,
        extractedData?.vendorName || null,
        extractedData?.vendorTaxNumber || null,
        extractedData?.netAmount || null,
        extractedData?.vatAmount || null,
        extractedData?.grossAmount || null,
        extractedData?.invoiceDate || null,
        extractedData?.dueDate || null,
        extractedData?.beneficiaryIban || null,
        extractedData?.description || null,
        extractedData ? JSON.stringify(extractedData) : null,
        prediction?.costCenterId || null,
        prediction?.confidence || null,
        prediction?.reasoning || null,
        status || 'pending',
      ]
    );

    return result.rows[0];
  }

  /**
   * Manual trigger: process a specific email by ID
   */
  async processEmailById(messageId) {
    if (!this.gmail) {
      await this.initialize();
    }
    return await this.processEmail(messageId);
  }

  /**
   * Manual trigger: upload and process a PDF file directly (no email)
   */
  async processUploadedPDF(filePath, metadata = {}) {
    try {
      const extractedData = await claudeOCR.extractInvoiceData(filePath);

      if (!extractedData) {
        return await this.createDraft({
          emailMessageId: null,
          emailFrom: metadata.from || 'manual_upload',
          emailSubject: metadata.subject || 'Kézi feltöltés',
          pdfFilePath: filePath,
          extractedData: null,
          status: 'ocr_failed',
        });
      }

      const prediction = await costCenterPredictor.predict(extractedData);

      return await this.createDraft({
        emailMessageId: null,
        emailFrom: metadata.from || 'manual_upload',
        emailSubject: metadata.subject || 'Kézi feltöltés',
        pdfFilePath: filePath,
        extractedData,
        prediction,
      });
    } catch (error) {
      logger.error('Error processing uploaded PDF:', error);
      throw error;
    }
  }
}

module.exports = new GmailMCPService();
