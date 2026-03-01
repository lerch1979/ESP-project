const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');

const SUPPORTED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

class GmailUniversalPollerService {
  constructor() {
    this.gmail = null;
    this.isProcessing = false;
  }

  /**
   * Initialize Gmail API client with OAuth2
   */
  async initialize() {
    try {
      if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
        logger.warn('Gmail credentials not configured');
        return false;
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      });

      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }

      logger.info('Gmail universal poller initialized');
      return true;
    } catch (error) {
      logger.error('Gmail universal poller initialization failed:', error);
      return false;
    }
  }

  /**
   * Test the Gmail connection (used by getGmailStatus endpoint)
   */
  async testConnection() {
    if (!this.gmail) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    try {
      await this.gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch (error) {
      logger.warn('Gmail connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Poll Gmail for all unread emails
   * Returns { processed, skipped, errors }
   */
  async pollAllEmails() {
    if (this.isProcessing) {
      logger.info('Gmail universal poll already in progress, skipping');
      return { processed: 0, skipped: 0, errors: 0, message: 'Poll already in progress' };
    }

    if (!this.gmail) {
      const initialized = await this.initialize();
      if (!initialized) {
        logger.warn('Gmail universal poller not configured, skipping poll');
        return { processed: 0, skipped: 0, errors: 0, message: 'Gmail not configured' };
      }
    }

    this.isProcessing = true;
    const stats = { processed: 0, skipped: 0, errors: 0 };

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 20,
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        logger.debug('No new unread emails found');
        return stats;
      }

      logger.info(`Found ${messages.length} unread emails to process`);

      for (const msg of messages) {
        try {
          const result = await this.processEmail(msg.id);
          if (result === 'processed') stats.processed++;
          else if (result === 'skipped') stats.skipped++;
        } catch (error) {
          logger.error(`Error processing email ${msg.id}:`, error);
          stats.errors++;
        }
      }

      logger.info(`Gmail poll complete: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`);
      return stats;
    } catch (error) {
      logger.error('Gmail universal poll error:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single email message
   * Returns 'processed' | 'skipped'
   */
  async processEmail(messageId) {
    // Dedup check against email_inbox
    const existingInbox = await query(
      'SELECT id FROM email_inbox WHERE email_message_id = $1',
      [messageId]
    );
    if (existingInbox.rows.length > 0) {
      logger.debug(`Email ${messageId} already in email_inbox, skipping`);
      return 'skipped';
    }

    // Dedup check against invoice_drafts (old poller)
    const existingDraft = await query(
      'SELECT id FROM invoice_drafts WHERE email_message_id = $1',
      [messageId]
    );
    if (existingDraft.rows.length > 0) {
      logger.debug(`Email ${messageId} already in invoice_drafts, skipping`);
      return 'skipped';
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

    // Find supported attachments
    const attachmentParts = this.findAttachmentParts(message.data.payload);

    const { processDocumentFile, processEmailBody } = require('../controllers/emailInbox.controller');

    if (attachmentParts.length > 0) {
      // Process each attachment
      for (const part of attachmentParts) {
        try {
          const filePath = await this.downloadAttachment(messageId, part);
          await processDocumentFile(filePath, {
            emailFrom: from,
            emailSubject: subject,
            originalFilename: part.filename,
            emailMessageId: messageId,
            source: 'gmail',
          });
        } catch (error) {
          logger.error(`Error processing attachment ${part.filename}:`, error);
        }
      }
    } else {
      // No attachments — process email body as text
      const bodyText = this.extractBodyText(message.data.payload);
      if (bodyText && bodyText.trim().length > 20) {
        await processEmailBody(bodyText, {
          emailFrom: from,
          emailSubject: subject,
          emailMessageId: messageId,
          source: 'gmail',
        });
      } else {
        logger.debug(`Email ${messageId} has no attachments and insufficient body text, skipping`);
        // Still mark as read to avoid re-processing
        await this.markAsRead(messageId);
        return 'skipped';
      }
    }

    // Mark email as read
    await this.markAsRead(messageId);
    return 'processed';
  }

  /**
   * Recursively find supported attachment parts in message payload
   */
  findAttachmentParts(payload, parts = []) {
    if (payload.body?.attachmentId && payload.filename) {
      const mimeType = payload.mimeType || '';
      if (SUPPORTED_MIME_TYPES[mimeType]) {
        parts.push({
          attachmentId: payload.body.attachmentId,
          filename: payload.filename,
          mimeType,
        });
      }
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        this.findAttachmentParts(part, parts);
      }
    }

    return parts;
  }

  /**
   * Extract plain text body from email payload
   */
  extractBodyText(payload) {
    if (payload.mimeType === 'text/plain' && payload.body?.data && !payload.filename) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractBodyText(part);
        if (text) return text;
      }
    }

    return '';
  }

  /**
   * Download an attachment and save to disk
   * @returns {string} Absolute file path
   */
  async downloadAttachment(messageId, part) {
    const attachment = await this.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: part.attachmentId,
    });

    const buffer = Buffer.from(attachment.data.data, 'base64');
    const timestamp = Date.now();
    const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${timestamp}_${safeName}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    logger.info(`Saved attachment: ${fileName} (${buffer.length} bytes)`);

    return filePath;
  }

  /**
   * Mark an email as read
   */
  async markAsRead(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      logger.warn(`Failed to mark email ${messageId} as read:`, error.message);
    }
  }
}

module.exports = new GmailUniversalPollerService();
