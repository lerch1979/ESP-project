const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const EXTRACTION_PROMPT = `Analyze this invoice image/PDF and extract the following information in JSON format.
Return ONLY valid JSON, no additional text.

Required fields:
{
  "invoiceNumber": "string - invoice number (számlaszám)",
  "vendorName": "string - vendor/supplier name (szállító neve)",
  "vendorTaxNumber": "string - vendor tax number (adószám)",
  "netAmount": number - net amount without VAT (nettó összeg),
  "vatAmount": number - VAT amount (ÁFA összeg),
  "grossAmount": number - gross/total amount with VAT (bruttó összeg),
  "invoiceDate": "YYYY-MM-DD - invoice issue date (számla kelte)",
  "dueDate": "YYYY-MM-DD - payment due date (fizetési határidő)",
  "beneficiaryIban": "string - beneficiary IBAN/bank account (bankszámlaszám)",
  "description": "string - brief description of invoice items (tételek rövid leírása)",
  "currency": "string - currency code e.g. HUF, EUR (pénznem)",
  "vendorAddress": "string - vendor address if visible",
  "vatRate": "string - VAT rate percentage if visible e.g. 27%"
}

Important:
- For Hungarian invoices, "számla" = invoice, "szállító" = vendor, "adószám" = tax number
- Amounts should be numbers without currency symbols or thousand separators
- Dates must be in YYYY-MM-DD format
- If a field is not found, set it to null
- Return only the JSON object, nothing else`;

class ClaudeOCRService {
  constructor() {
    this.client = null;
  }

  getClient() {
    if (!this.client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set');
      }
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  /**
   * Extract invoice data from a PDF file using Claude's vision API
   */
  async extractInvoiceData(filePath) {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(__dirname, '..', '..', filePath);

      if (!fs.existsSync(absolutePath)) {
        logger.error(`PDF file not found: ${absolutePath}`);
        return null;
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      const base64Data = fileBuffer.toString('base64');
      const ext = path.extname(filePath).toLowerCase();

      // Determine media type
      let mediaType;
      if (ext === '.pdf') {
        mediaType = 'application/pdf';
      } else if (ext === '.png') {
        mediaType = 'image/png';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        mediaType = 'image/jpeg';
      } else {
        logger.error(`Unsupported file type: ${ext}`);
        return null;
      }

      logger.info(`Starting OCR extraction for: ${path.basename(filePath)} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      });

      const responseText = response.content[0]?.text;

      if (!responseText) {
        logger.error('Empty response from Claude API');
        return null;
      }

      // Parse JSON from response (handle potential markdown wrapping)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('No JSON found in Claude response:', responseText);
        return null;
      }

      const extractedData = JSON.parse(jsonMatch[0]);

      // Validate and clean amounts
      extractedData.netAmount = this.parseAmount(extractedData.netAmount);
      extractedData.vatAmount = this.parseAmount(extractedData.vatAmount);
      extractedData.grossAmount = this.parseAmount(extractedData.grossAmount);

      // Validate dates
      extractedData.invoiceDate = this.parseDate(extractedData.invoiceDate);
      extractedData.dueDate = this.parseDate(extractedData.dueDate);

      logger.info(`OCR extraction successful: ${extractedData.vendorName || 'Unknown'} - ${extractedData.invoiceNumber || 'No number'}`);

      return extractedData;
    } catch (error) {
      logger.error('Claude OCR extraction error:', error);
      return null;
    }
  }

  /**
   * Parse amount value - handle strings with spaces, commas, etc.
   */
  parseAmount(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;

    // Remove currency symbols, spaces, and thousand separators
    const cleaned = String(value)
      .replace(/[^\d.,-]/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '') // Remove thousand-separator dots (Hungarian format)
      .replace(',', '.'); // Convert decimal comma to dot

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Parse and validate date string to YYYY-MM-DD
   */
  parseDate(value) {
    if (!value) return null;

    // Try direct YYYY-MM-DD
    const isoMatch = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return value;

    // Try Hungarian format: YYYY.MM.DD
    const hunMatch = String(value).match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (hunMatch) return `${hunMatch[1]}-${hunMatch[2]}-${hunMatch[3]}`;

    // Try DD/MM/YYYY or DD.MM.YYYY
    const euMatch = String(value).match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;

    return null;
  }
}

module.exports = new ClaudeOCRService();
