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

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

// Strict financial-document filter. All lowercase, accent-agnostic matching below.
const FINANCIAL_KEYWORDS = [
  // HU
  'szamla', 'számla', 'faktura', 'proforma', 'dijbekero', 'díjbekérő',
  'nyugta', 'elismervény', 'elismerveny',
  'szerzodes', 'szerződés', 'megallapodas', 'megállapodás',
  'fizetes', 'fizetés', 'utalas', 'utalás',
  'szamlaerkezes', 'számlaérkezés', 'e-szamla', 'e-számla',
  'foldgaz', 'földgáz', 'villamosenergia', 'villany',
  'berlet', 'bérlet', 'termekdij', 'termékdíj',
  // EN
  'invoice', 'bill', 'receipt', 'contract', 'agreement', 'payment',
  'payslip', 'pro forma', 'tax', 'vat', 'remittance',
];

const NEGATIVE_KEYWORDS = [
  'hírlevél', 'hirlevel', 'newsletter', 'unsubscribe', 'promotion', 'reklám', 'reklam',
  'automatikus', 'auto-reply', 'auto reply', 'out of office', 'ooo',
  'biztonsági értesítés', 'biztonsagi ertesites', 'security alert', 'verification',
  'confirm your email', 'password reset',
];

// Attachment size thresholds
const MIN_IMAGE_BYTES = 100 * 1024;    // <100KB = likely logo/signature, ignore
const MIN_LOGO_BYTES = 50 * 1024;      // small images are almost always decorative

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

    // Find supported attachments first — filter decision needs them
    const attachmentParts = this.findAttachmentParts(message.data.payload);

    // ── STRICT FILTER ──────────────────────────────────────────────
    // Cheap header+attachment check BEFORE the expensive Claude OCR call.
    // ────────────────────────────────────────────────────────────────
    const decision = this.shouldProcessEmail(subject, from, attachmentParts);
    if (!decision.should) {
      logger.info(`FILTER SKIP: "${subject.slice(0, 60)}" — ${decision.reason}`);

      // Email assistant bridge: any "no-signal" reject (no financial
      // keyword + no doc attachment) is candidate for AI handling OR
      // ticket-reply routing if the subject carries a [#TICKET-N] token.
      // Negative-keyword rejects (newsletters, security alerts, password
      // resets) stay on the floor — they're noise, never user intent.
      // Gated by EMAIL_ASSISTANT_ENABLED so the feature is opt-in.
      const isNegativeKeyword = (decision.reason || '').toLowerCase().includes('negatív kulcsszó');
      if (process.env.EMAIL_ASSISTANT_ENABLED === 'true' && !isNegativeKeyword) {
        try {
          const emailAssistant = require('./emailAssistant.service');
          const bodyText = this.extractBodyText(message.data.payload);
          const receivedHeader = headers.find(h => h.name === 'Date')?.value;
          const receivedAt = receivedHeader ? new Date(receivedHeader) : null;
          // Forward a small headers map so the assistant can do
          // auto-reply / loop detection (Auto-Submitted, Precedence,
          // X-Auto-Response-Suppress) and email threading
          // (Message-ID, In-Reply-To, References).
          const interesting = [
            'Message-ID', 'Message-Id', 'In-Reply-To', 'References',
            'Auto-Submitted', 'Precedence',
            'X-Auto-Response-Suppress', 'X-Autoreply', 'X-Autorespond',
          ];
          const headersMap = {};
          for (const h of headers) {
            if (interesting.some(i => i.toLowerCase() === h.name.toLowerCase())) {
              headersMap[h.name] = h.value;
            }
          }
          const result = await emailAssistant.processEmail({
            messageId, from, subject, bodyText, receivedAt, headers: headersMap,
          });
          if (result?.handled) {
            logger.info(`EMAIL ASSISTANT: "${subject.slice(0, 60)}" → ${result.intent || result.reason}`);
          }
        } catch (err) {
          // Never let assistant failure block the poll loop
          logger.error('[gmailPoller→emailAssistant] error:', err.message);
        }
      }

      await this.markAsRead(messageId);
      return 'skipped';
    }

    logger.info(`FILTER ACCEPT [${decision.priority}]: "${subject.slice(0, 60)}" — ${decision.reason}`);

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
   * Also records size in bytes (from Gmail payload.body.size) so the filter
   * can distinguish a 3KB logo from a 300KB scanned invoice.
   */
  findAttachmentParts(payload, parts = []) {
    if (payload.body?.attachmentId && payload.filename) {
      const mimeType = payload.mimeType || '';
      if (SUPPORTED_MIME_TYPES[mimeType]) {
        parts.push({
          attachmentId: payload.body.attachmentId,
          filename: payload.filename,
          mimeType,
          size: payload.body.size || 0,
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
   * Decide whether an email is worth running through Claude OCR.
   * Pure header+attachment-list check — no Claude calls, no DB writes.
   * Returns { should, reason, priority }.
   *
   * Rules (first match wins):
   *   1. Negative keyword in subject → REJECT unconditionally
   *   2. Any PDF/DOC/DOCX attachment → HIGH (accept)
   *   3. Image attachment ≥100KB + financial keyword → MEDIUM
   *   4. No attachment but strong financial keyword → LOW (rare body-only invoice)
   *   5. Anything else → REJECT
   */
  shouldProcessEmail(subject, from, attachmentParts) {
    const subjLower = (subject || '').toLowerCase();
    const fromLower = (from || '').toLowerCase();

    // 1. Hard reject on negative keywords (newsletters, alerts, auto-replies)
    for (const neg of NEGATIVE_KEYWORDS) {
      if (subjLower.includes(neg) || fromLower.includes(neg)) {
        return { should: false, reason: `Negatív kulcsszó: "${neg}"`, priority: null };
      }
    }

    // Large file = probable document; small = likely logo/signature
    const bigDocs = attachmentParts.filter((p) => DOC_MIME_TYPES.has(p.mimeType));
    const bigImages = attachmentParts.filter(
      (p) => IMAGE_MIME_TYPES.has(p.mimeType) && p.size >= MIN_IMAGE_BYTES
    );
    const anyImages = attachmentParts.filter((p) => IMAGE_MIME_TYPES.has(p.mimeType));
    const tinyImages = anyImages.filter((p) => p.size < MIN_LOGO_BYTES);

    const hasFinancialKeyword = FINANCIAL_KEYWORDS.some((kw) => subjLower.includes(kw));

    // 2. PDF/DOC is strongest signal → accept regardless of subject
    if (bigDocs.length > 0) {
      return {
        should: true,
        reason: `PDF/DOC melléklet (${bigDocs.map((d) => d.filename).join(', ')})`,
        priority: 'HIGH',
      };
    }

    // 3. Large image + financial keyword → probable scanned invoice
    if (bigImages.length > 0 && hasFinancialKeyword) {
      return {
        should: true,
        reason: `Nagy kép (${(bigImages[0].size / 1024).toFixed(0)}KB) + pénzügyi kulcsszó a subject-ben`,
        priority: 'MEDIUM',
      };
    }

    // 4. No document but very strong financial keyword (rare body-only invoice)
    if (attachmentParts.length === 0 && hasFinancialKeyword) {
      return {
        should: true,
        reason: 'Melléklet nélküli email pénzügyi kulcsszóval a subject-ben',
        priority: 'LOW',
      };
    }

    // 5. Anything else: skip with specific reason
    if (attachmentParts.length === 0) {
      return { should: false, reason: 'Nincs melléklet és nincs pénzügyi kulcsszó', priority: null };
    }
    if (tinyImages.length === anyImages.length && anyImages.length > 0) {
      return { should: false, reason: `Csak kis képek (< ${MIN_LOGO_BYTES / 1024}KB) — valószínűleg logó/aláírás`, priority: null };
    }
    return {
      should: false,
      reason: 'Csak nem-dokumentum mellékletek és nincs pénzügyi kulcsszó',
      priority: null,
    };
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
