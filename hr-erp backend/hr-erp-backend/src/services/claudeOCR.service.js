const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

// ============================================
// CLAUDE API CODE (commented out — billing down)
// Uncomment and set USE_CLAUDE=true to switch back
// ============================================

/*
const Anthropic = require('@anthropic-ai/sdk');

const EXTRACTION_PROMPT = `Analyze this invoice image/PDF and extract the following information in JSON format.
Return ONLY valid JSON, no additional text.
Required fields:
{
  "invoiceNumber": "string", "vendorName": "string", "vendorTaxNumber": "string",
  "netAmount": number, "vatAmount": number, "grossAmount": number,
  "invoiceDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD",
  "beneficiaryIban": "string", "description": "string",
  "currency": "string", "vendorAddress": "string", "vatRate": "string"
}
If a field is not found, set it to null. Return only the JSON object.`;

async function extractWithClaude(absolutePath, ext) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString('base64');
  const mediaType = ext === '.pdf' ? 'application/pdf' :
    ext === '.png' ? 'image/png' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  });

  const jsonMatch = response.content[0]?.text?.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}
*/

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
