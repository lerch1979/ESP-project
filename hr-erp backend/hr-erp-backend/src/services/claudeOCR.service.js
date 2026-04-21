const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================
// CLAUDE API — primary extractor
// ============================================
// Model: claude-sonnet-4-6 by default (override via CLAUDE_OCR_MODEL).
// Sonnet 4.6 is accurate enough for dense HU/EN invoices with mixed layouts.
// Cost per 1-page PDF: ~$0.01-0.02. Scales well with prompt caching.
// Disable with INVOICE_OCR_PROVIDER=regex (uses pure regex path below).

const CLAUDE_MODEL = process.env.CLAUDE_OCR_MODEL || 'claude-sonnet-4-6';
const OCR_PROVIDER = process.env.INVOICE_OCR_PROVIDER || 'auto'; // 'claude' | 'regex' | 'auto'
const claudeClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const EXTRACTION_SYSTEM_PROMPT = `You are a precise invoice/document data extractor specializing in Hungarian (hu) and English (en) business documents.

You receive a PDF or image of a document (invoice, receipt, bank statement, contract). Extract structured data and return ONLY a valid JSON object — no prose, no markdown fence, no explanation.

Schema (use exactly these field names, null if not found):
{
  "invoiceNumber": string | null,       // e.g. "2026/0042", "INV-12345"
  "vendorName": string | null,          // company that issued the invoice
  "vendorTaxNumber": string | null,     // HU format: 8+1+2 digits, e.g. "12345678-1-42"
  "vendorAddress": string | null,
  "netAmount": number | null,           // "Nettó összeg" / net amount — NUMBER only, no currency
  "vatAmount": number | null,           // "ÁFA összeg" / VAT amount
  "grossAmount": number | null,         // "Bruttó összeg" / "Fizetendő összeg" / total
  "currency": "HUF" | "EUR" | "USD" | "GBP" | "CHF" | null,
  "vatRate": string | null,             // e.g. "27%" or "5%"
  "invoiceDate": string | null,         // ISO YYYY-MM-DD
  "dueDate": string | null,             // ISO YYYY-MM-DD
  "beneficiaryIban": string | null,     // e.g. "HU12 1234 5678 9012 3456 7890 1234"
  "description": string | null,         // 1-3 line items joined by "; "
  "confidence": number                  // 0-100 — your certainty the doc is a real invoice
}

Rules:
- Hungarian number format uses "." or space as thousands separator and "," as decimal:
  "32.860 Ft" → 32860, "1 234 567,89 HUF" → 1234567.89.
- Do NOT include currency symbol in amount fields. Put the currency code in "currency".
- If net + VAT are present but gross is missing (or vice-versa), compute the missing one.
- If the document is NOT an invoice (e.g. security notification, product list email),
  return all fields null with "confidence": 0.
- Preserve exact vendor names including accents and company suffixes (Kft., Zrt., Bt., Nyrt.).
- If multiple candidate amounts exist, pick the one labeled "Bruttó" / "Fizetendő" / "Végösszeg" as grossAmount.`;

async function extractWithClaude(absolutePath, ext) {
  if (!claudeClient) return null;

  const supported = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const mediaType = supported[ext];
  if (!mediaType) return null;

  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString('base64');
  const isPdf = ext === '.pdf';

  const response = await claudeClient.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        {
          type: isPdf ? 'document' : 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Data },
        },
        { type: 'text', text: 'Extract invoice data from the attached document.' },
      ],
    }],
  });

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  // Strip ```json fences if the model slipped them in
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('[claudeOCR] Claude returned no JSON object');
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Sanity-check: must have at least one concrete field
    const hasAnyField = parsed.invoiceNumber || parsed.vendorName || parsed.grossAmount ||
                        parsed.netAmount || parsed.invoiceDate;
    if (!hasAnyField && (parsed.confidence || 0) < 30) {
      logger.info('[claudeOCR] Claude says doc is not an invoice (confidence < 30)');
    }
    return parsed;
  } catch (err) {
    logger.warn('[claudeOCR] Could not parse Claude JSON:', err.message);
    return null;
  }
}

// ============================================
// REGEX PATTERNS for Hungarian invoice parsing
// ============================================

// Bilingual separator: consumes optional " / English Label" between HU label and value
const BI = '(?:\\s*/\\s*[A-Za-z][A-Za-z\\s]*)?';

const PATTERNS = {
  invoiceNumber: [
    new RegExp(`sz[aá]mlasz[aá]m${BI}[:\\s]*([A-Z0-9/_-]*\\d[A-Z0-9/_-]*)`, 'i'),
    new RegExp(`invoice\\s*(?:no|number|#)?[:\\s]*([A-Z0-9/_-]*\\d[A-Z0-9/_-]*)`, 'i'),
    /(?:INV|SZ|SZLA)[-/]?\d{4}[-/]\d{3,6}/i,
    new RegExp(`sorsz[aá]m${BI}[:\\s]*([A-Z0-9/_-]*\\d[A-Z0-9/_-]*)`, 'i'),
  ],
  vendorName: [
    /sz[aá]ll[ií]t[oó](?:\s*\/\s*supplier)?[:\s]*\n\s*(.+?)(?:\n|$)/i,
    /supplier[:\s]*\n\s*(.+?)(?:\n|$)/i,
    /elad[oó][:\s]*\n\s*(.+?)(?:\n|$)/i,
    /ki[aá]ll[ií]t[oó][:\s]*\n\s*(.+?)(?:\n|$)/i,
  ],
  vendorTaxNumber: [
    new RegExp(`ad[oó]sz[aá]m${BI}[:\\s]*(\\d{8}[-–]\\d[-–]\\d{2})`, 'i'),
    /tax\s*(?:no|number|id)?[:\s]*(\d{8}[-–]\d[-–]\d{2})/i,
    /(\d{8}-\d-\d{2})/,
  ],
  iban: [
    new RegExp(`(?:IBAN|banksz[aá]mlasz[aá]m|banksz[aá]mla)${BI}\\)?[:\\s]*([A-Z]{2}\\d{2}[\\s\\d]{10,30})`, 'i'),
    /(HU\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4})/i,
    /(?:banksz[aá]mla|sz[aá]mlasz[aá]m)[:\s]*([\d\s-]{16,34})/i,
  ],
  netAmount: [
    new RegExp(`nett[oó]\\s*(?:[oö]sszeg)?${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
    /net\s*(?:amount|total)?[:\s]*([\d\s.,]+)\s*(?:Ft|HUF|EUR)?/i,
    new RegExp(`ad[oó]alap${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
  ],
  vatAmount: [
    new RegExp(`[aá]fa\\s*(?:[oö]sszeg)?${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
    /(?:VAT|[aá]fa)\s*\(\d+%?\)[:\s]*([\d\s.,]+)/i,
    /[aá]fa\s*\d+%?[:\s]*([\d\s.,]+)\s*(?:Ft|HUF|EUR)?/i,
  ],
  grossAmount: [
    new RegExp(`brutt[oó]\\s*(?:[oö]sszeg)?${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
    /gross\s*(?:amount|total)?[:\s]*([\d\s.,]+)\s*(?:Ft|HUF|EUR)?/i,
    new RegExp(`fizetend[oő]\\s*(?:[oö]sszeg)?${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
    new RegExp(`[oö]sszesen${BI}[:\\s]*([\\d\\s.,]+)\\s*(?:Ft|HUF|EUR)?`, 'i'),
  ],
  invoiceDate: [
    new RegExp(`kelte?${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
    new RegExp(`sz[aá]mla\\s*d[aá]tum[a]?${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
    /invoice\s*date[:\s]*(\d{4}[.\-/]\s?\d{2}[.\-/]\s?\d{2})/i,
    new RegExp(`ki[aá]ll[ií]t[aá]s[ai]?${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
  ],
  dueDate: [
    new RegExp(`fizet[eé]si\\s*hat[aá]rid[oő]${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
    /due\s*date[:\s]*(\d{4}[.\-/]\s?\d{2}[.\-/]\s?\d{2})/i,
    new RegExp(`esed[eé]kess[eé]g${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
    new RegExp(`hat[aá]rid[oő]${BI}[:\\s]*(\\d{4}[.\\-/]\\s?\\d{2}[.\\-/]\\s?\\d{2})`, 'i'),
  ],
  currency: [
    new RegExp(`p[eé]nznem${BI}[:\\s]*(HUF|EUR|USD|GBP|CHF)`, 'i'),
    /currency[:\s]*(HUF|EUR|USD|GBP|CHF)/i,
  ],
};

class ClaudeOCRService {

  /**
   * Extract invoice data from a PDF/image file
   * Primary: pdf-parse for text-based PDFs
   * Fallback: Tesseract.js OCR for scanned/image PDFs
   */
  async extractInvoiceData(filePath) {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(__dirname, '..', '..', filePath);

      if (!fs.existsSync(absolutePath)) {
        logger.error(`File not found: ${absolutePath}`);
        return null;
      }

      const ext = path.extname(filePath).toLowerCase();
      const fileBuffer = fs.readFileSync(absolutePath);

      logger.info(`Starting OCR extraction for: ${path.basename(filePath)} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

      // ──────────────────────────────────────────────
      // Primary path: Claude Sonnet 4.6 (document + vision API)
      // Handles PDFs and images natively; extracts HU/EN invoices reliably.
      // ──────────────────────────────────────────────
      if ((OCR_PROVIDER === 'auto' || OCR_PROVIDER === 'claude') && claudeClient &&
          ['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
        try {
          const claudeResult = await extractWithClaude(absolutePath, ext);
          if (claudeResult && (claudeResult.vendorName || claudeResult.grossAmount ||
              claudeResult.invoiceNumber || claudeResult.netAmount)) {
            logger.info(`Claude OCR success: ${claudeResult.vendorName || '?'} — ` +
                        `${claudeResult.grossAmount || '?'} ${claudeResult.currency || ''} — ` +
                        `#${claudeResult.invoiceNumber || '?'} (conf: ${claudeResult.confidence || '?'})`);
            return claudeResult;
          }
          logger.info('Claude OCR returned empty — falling back to regex');
        } catch (err) {
          logger.warn(`Claude OCR failed (${err.message}) — falling back to regex`);
        }
        if (OCR_PROVIDER === 'claude') {
          return null; // strict Claude mode — no fallback
        }
      }

      // ──────────────────────────────────────────────
      // Fallback path: pdf-parse / Tesseract + regex
      // ──────────────────────────────────────────────
      let text = '';

      // Strategy 1: Direct text extraction from PDF
      if (ext === '.pdf') {
        try {
          const pdfData = await pdfParse(fileBuffer);
          text = pdfData.text || '';
          logger.info(`PDF text extraction: ${text.length} chars`);
        } catch (e) {
          logger.warn('PDF text extraction failed, falling back to Tesseract:', e.message);
        }
      }

      // Strategy 2: Tesseract OCR for images (not PDFs — Tesseract.js can't read PDFs)
      if (text.trim().length < 50 && ['.png', '.jpg', '.jpeg'].includes(ext)) {
        text = await this.ocrWithTesseract(absolutePath);
      }

      if (text.trim().length < 50 && ext === '.pdf') {
        logger.warn('PDF has no embedded text and Tesseract cannot process PDFs directly. Convert to image first.');
      }

      if (text.trim().length < 20) {
        logger.error('Could not extract meaningful text from file');
        return null;
      }

      logger.info(`Extracted text preview: ${text.substring(0, 200).replace(/\n/g, ' | ')}`);

      // Parse structured data from text
      const extractedData = this.parseInvoiceText(text);

      if (!extractedData.vendorName && !extractedData.invoiceNumber && !extractedData.grossAmount) {
        logger.error('Could not extract any key invoice fields');
        return null;
      }

      logger.info(`OCR extraction successful: ${extractedData.vendorName || 'Unknown'} - ${extractedData.invoiceNumber || 'No number'} - ${extractedData.grossAmount || 'No amount'}`);

      return extractedData;
    } catch (error) {
      logger.error('OCR extraction error:', error);
      return null;
    }
  }

  /**
   * OCR with Tesseract.js (for images and scanned PDFs)
   */
  async ocrWithTesseract(filePath) {
    try {
      logger.info('Running Tesseract OCR...');
      const { data: { text } } = await Tesseract.recognize(filePath, 'hun+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.debug(`Tesseract progress: ${(m.progress * 100).toFixed(0)}%`);
          }
        },
      });
      logger.info(`Tesseract OCR: ${text.length} chars extracted`);
      return text;
    } catch (error) {
      logger.error('Tesseract OCR failed:', error.message);
      return '';
    }
  }

  /**
   * Parse invoice text using regex patterns
   */
  parseInvoiceText(text) {
    const result = {
      invoiceNumber: null,
      vendorName: null,
      vendorTaxNumber: null,
      netAmount: null,
      vatAmount: null,
      grossAmount: null,
      invoiceDate: null,
      dueDate: null,
      beneficiaryIban: null,
      description: null,
      currency: null,
      vendorAddress: null,
      vatRate: null,
    };

    // Invoice number
    for (const pattern of PATTERNS.invoiceNumber) {
      const match = text.match(pattern);
      if (match) {
        result.invoiceNumber = (match[1] || match[0]).trim();
        break;
      }
    }

    // Vendor name
    for (const pattern of PATTERNS.vendorName) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();
        // Clean up: remove trailing special chars
        name = name.replace(/[:\-–|]+$/, '').trim();
        if (name.length > 2 && name.length < 200) {
          result.vendorName = name;
          break;
        }
      }
    }

    // If no vendor found via label, try first line that looks like a company name
    if (!result.vendorName) {
      const companyMatch = text.match(/([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ&][a-záéíóöőúüű]*)*\s+(?:Kft|Bt|Zrt|Nyrt|Ltd|GmbH|Inc)\.?)/);
      if (companyMatch) {
        result.vendorName = companyMatch[1].trim();
      }
    }

    // Tax number
    for (const pattern of PATTERNS.vendorTaxNumber) {
      const match = text.match(pattern);
      if (match) {
        result.vendorTaxNumber = (match[1] || match[0]).replace(/–/g, '-').trim();
        break;
      }
    }

    // IBAN
    for (const pattern of PATTERNS.iban) {
      const match = text.match(pattern);
      if (match) {
        result.beneficiaryIban = (match[1] || match[0]).replace(/\s+/g, ' ').trim();
        break;
      }
    }

    // Amounts
    result.netAmount = this.extractAmount(text, PATTERNS.netAmount);
    result.vatAmount = this.extractAmount(text, PATTERNS.vatAmount);
    result.grossAmount = this.extractAmount(text, PATTERNS.grossAmount);

    // If we have net + VAT but no gross, calculate it
    if (result.netAmount && result.vatAmount && !result.grossAmount) {
      result.grossAmount = result.netAmount + result.vatAmount;
    }
    // If we have gross + net but no VAT, calculate it
    if (result.grossAmount && result.netAmount && !result.vatAmount) {
      result.vatAmount = result.grossAmount - result.netAmount;
    }

    // Dates
    result.invoiceDate = this.extractDate(text, PATTERNS.invoiceDate);
    result.dueDate = this.extractDate(text, PATTERNS.dueDate);

    // Currency
    for (const pattern of PATTERNS.currency) {
      const match = text.match(pattern);
      if (match) {
        result.currency = match[1].toUpperCase();
        break;
      }
    }
    if (!result.currency) {
      if (text.match(/Ft(?:\s|$|\b)/)) result.currency = 'HUF';
      else if (text.match(/EUR|€/)) result.currency = 'EUR';
    }

    // VAT rate
    const vatRateMatch = text.match(/(?:[aá]fa|VAT)\s*(?:kulcs)?[:\s]*(\d{1,2})\s*%/i);
    if (vatRateMatch) {
      result.vatRate = vatRateMatch[1] + '%';
    } else if (result.netAmount && result.vatAmount) {
      const rate = Math.round((result.vatAmount / result.netAmount) * 100);
      if ([5, 18, 27].includes(rate)) result.vatRate = rate + '%';
    }

    // Description — grab invoice item lines
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    const itemLines = lines.filter(l =>
      /\d+\s*(?:db|zsák|t\b|kg|m2|m3|óra|nap)/i.test(l) ||
      /\d+\s*(?:Ft|HUF|EUR)/i.test(l)
    ).slice(0, 5);
    if (itemLines.length > 0) {
      result.description = itemLines.map(l => l.trim()).join('; ');
    }

    return result;
  }

  /**
   * Extract an amount using an array of patterns
   */
  extractAmount(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return this.parseAmount(match[1]);
      }
    }
    return null;
  }

  /**
   * Extract a date using an array of patterns
   */
  extractDate(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return this.parseDate(match[1]);
      }
    }
    return null;
  }

  /**
   * Parse amount value - handle strings with spaces, commas, etc.
   */
  parseAmount(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;

    const cleaned = String(value)
      .replace(/\s/g, '')
      .replace(/[^\d.,-]/g, '');

    // Hungarian format: 1.234.567 or 1 234 567 (dots/spaces as thousands)
    // Check if there are multiple dots → thousand separators
    const dotCount = (cleaned.match(/\./g) || []).length;
    let normalized;
    if (dotCount > 1) {
      // All dots are thousand separators
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (dotCount === 1 && cleaned.includes(',')) {
      // Dot is thousands, comma is decimal
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (dotCount === 1) {
      // Check if dot is thousand separator: e.g. 238.000
      const afterDot = cleaned.split('.')[1];
      if (afterDot && afterDot.length === 3 && !cleaned.includes(',')) {
        normalized = cleaned.replace('.', '');
      } else {
        normalized = cleaned;
      }
    } else {
      normalized = cleaned.replace(',', '.');
    }

    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Parse and validate date string to YYYY-MM-DD
   */
  parseDate(value) {
    if (!value) return null;

    const cleaned = String(value).replace(/\s/g, '');

    // YYYY-MM-DD
    const isoMatch = cleaned.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    // YYYY.MM.DD (Hungarian)
    const hunMatch = cleaned.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (hunMatch) return `${hunMatch[1]}-${hunMatch[2]}-${hunMatch[3]}`;

    // YYYY/MM/DD
    const slashMatch = cleaned.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;

    // DD/MM/YYYY or DD.MM.YYYY
    const euMatch = cleaned.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;

    return null;
  }
}

module.exports = new ClaudeOCRService();
