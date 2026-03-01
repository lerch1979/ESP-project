const { logger } = require('../utils/logger');

class EntityExtractorService {

  /**
   * Extract entities based on document type
   */
  extract(text, documentType) {
    switch (documentType) {
      case 'invoice':
        return this.extractInvoice(text);
      case 'damage_report':
        return this.extractDamageReport(text);
      case 'employee_contract':
        return this.extractContract(text, 'employee');
      case 'service_contract':
        return this.extractContract(text, 'service');
      case 'rental_contract':
        return this.extractContract(text, 'rental');
      case 'tax_document':
        return this.extractTaxDocument(text);
      case 'payment_reminder':
        return this.extractPaymentReminder(text);
      default:
        return this.extractGeneric(text);
    }
  }

  /**
   * Extract invoice-specific entities (delegates to existing OCR service)
   */
  extractInvoice(text) {
    // Invoice extraction handled by claudeOCR.service.js
    return { type: 'invoice', note: 'Handled by OCR service' };
  }

  /**
   * Extract damage report entities
   */
  extractDamageReport(text) {
    const lower = text.toLowerCase();
    const result = {
      location: null,
      roomNumber: null,
      accommodationName: null,
      issueDescription: null,
      urgency: 'medium',
      damageType: null,
    };

    // Room number patterns - label-based first to avoid matching address numbers
    const roomPatterns = [
      /szoba[:\s#]*(\d{1,4})/i,
      /room[:\s#]*(\d{1,4})/i,
      /(?:szobasz[aá]m|room\s*(?:no|number))[:\s]*(\d{1,4})/i,
      /(\d{1,4})[\s.-]*(?:os|as|es|ös)?\s*szoba/i,
    ];

    for (const pattern of roomPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.roomNumber = match[1];
        break;
      }
    }

    // Accommodation/address patterns
    const addressPatterns = [
      /(?:c[ií]m|address|helysz[ií]n|location)[:\s]*(.+?)(?:\n|$)/i,
      /(?:sz[aá]ll[aá]s|accommodation)[:\s]*(.+?)(?:\n|$)/i,
      /(\d{4}\s+\w+[,.]?\s+\w+\s+(?:utca|[uú]t|k[oö]r[uú]t|t[eé]r)\s*\d*)/i,
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.location = match[1].trim();
        break;
      }
    }

    // Extract accommodation name (often a building/complex name)
    const accommPatterns = [
      /(?:épület|building|ház|house|complex)[:\s]*(.+?)(?:\n|$)/i,
      /(?:munkásszálló|workers?\s*hostel|dormitory|kollégium)[:\s]*(.+?)(?:\n|$)/i,
    ];

    for (const pattern of accommPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.accommodationName = match[1].trim();
        break;
      }
    }

    // Issue description: look for problem descriptions (consume label + content on next line)
    const issuePatterns = [
      /(?:hiba\s*le[ií]r[aá]s[a]?|hiba)[:\s]*\n\s*(.+?)(?:\n\n|\nBejelent|$)/is,
      /(?:le[ií]r[aá]s|description)[:\s]*\n?\s*(.+?)(?:\n\n|\nBejelent|$)/is,
      /(?:probl[eé]ma|issue|problem)[:\s]*\n?\s*(.+?)(?:\n\n|\n[A-Z]|$)/is,
      /(?:panasz|complaint)[:\s]*\n?\s*(.+?)(?:\n\n|\n[A-Z]|$)/is,
    ];

    for (const pattern of issuePatterns) {
      const match = text.match(pattern);
      if (match) {
        result.issueDescription = match[1].trim().substring(0, 500);
        break;
      }
    }

    // If no explicit issue description, use the main text body
    if (!result.issueDescription) {
      // Take first meaningful paragraph after any header
      const lines = text.split('\n').filter(l => l.trim().length > 20);
      if (lines.length > 0) {
        result.issueDescription = lines.slice(0, 3).join(' ').substring(0, 500);
      }
    }

    // Urgency detection
    const urgentKeywords = ['sürgős', 'surgos', 'urgent', 'azonnal', 'immediately', 'kritikus', 'critical', 'veszélyes', 'veszelyes'];
    const highKeywords = ['fontos', 'important', 'gyorsan', 'quickly', 'mielőbb', 'mielobb'];
    const lowKeywords = ['nem sürgős', 'nem surgos', 'ráér', 'raer', 'low priority'];

    if (urgentKeywords.some(kw => lower.includes(kw))) {
      result.urgency = 'critical';
    } else if (highKeywords.some(kw => lower.includes(kw))) {
      result.urgency = 'high';
    } else if (lowKeywords.some(kw => lower.includes(kw))) {
      result.urgency = 'low';
    }

    // Damage type detection
    const damageTypes = {
      'water': ['víz', 'viz', 'beázás', 'beazas', 'csőtörés', 'csotores', 'water', 'leak', 'flooding'],
      'electrical': ['áram', 'aram', 'elektromos', 'villany', 'konnekt', 'electrical', 'power', 'fuse'],
      'structural': ['fal', 'wall', 'padló', 'padlo', 'plafon', 'ceiling', 'ajtó', 'ajto', 'ablak', 'window'],
      'hvac': ['fűtés', 'futes', 'heating', 'klíma', 'klima', 'légkondicionáló', 'air conditioning'],
      'plumbing': ['csap', 'wc', 'toilet', 'mosdó', 'mosdo', 'lefolyó', 'lefolyo', 'drain'],
      'appliance': ['gép', 'gep', 'mosógép', 'mosogep', 'hűtő', 'huto', 'tűzhely', 'tuzhely'],
    };

    for (const [type, keywords] of Object.entries(damageTypes)) {
      if (keywords.some(kw => lower.includes(kw))) {
        result.damageType = type;
        break;
      }
    }

    logger.info(`Damage report extracted: room=${result.roomNumber}, urgency=${result.urgency}, type=${result.damageType}`);

    return result;
  }

  /**
   * Extract contract entities
   */
  extractContract(text, subtype) {
    const result = {
      contractType: subtype,
      parties: [],
      startDate: null,
      endDate: null,
      value: null,
      subject: null,
    };

    // Extract parties (company names)
    const companyPattern = /([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ&][a-záéíóöőúüű]*)*\s+(?:Kft|Bt|Zrt|Nyrt|Ltd|GmbH|Inc)\.?)/g;
    let match;
    while ((match = companyPattern.exec(text)) !== null) {
      if (!result.parties.includes(match[1])) {
        result.parties.push(match[1]);
      }
    }

    // Extract dates
    const datePatterns = [
      /(?:kezd[eő]|start|hat[aá]lyba\s*l[eé]p|effective)[:\s]*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
      /(?:lej[aá]rat|end|v[eé]ge|expir)[:\s]*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
    ];

    const startMatch = text.match(datePatterns[0]);
    if (startMatch) result.startDate = this.normalizeDate(startMatch[1]);

    const endMatch = text.match(datePatterns[1]);
    if (endMatch) result.endDate = this.normalizeDate(endMatch[1]);

    // Contract subject
    const subjectPatterns = [
      /(?:t[aá]rgya?|subject)[:\s]*(.+?)(?:\n|$)/i,
      /(?:szerz[oő]d[eé]s\s*t[aá]rgya)[:\s]*(.+?)(?:\n|$)/i,
    ];

    for (const pattern of subjectPatterns) {
      const subjMatch = text.match(pattern);
      if (subjMatch) {
        result.subject = subjMatch[1].trim().substring(0, 200);
        break;
      }
    }

    // Contract value
    const valueMatch = text.match(/(?:d[ií]j|[eé]rt[eé]k|value|amount)[:\s]*([\d\s.,]+)\s*(?:Ft|HUF|EUR)/i);
    if (valueMatch) {
      result.value = valueMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    }

    return result;
  }

  /**
   * Extract tax document entities
   */
  extractTaxDocument(text) {
    return {
      documentType: 'tax',
      taxNumber: (text.match(/ad[oó]sz[aá]m[:\s]*(\d{8}[-–]\d[-–]\d{2})/i) || [])[1] || null,
      period: (text.match(/(?:id[oő]szak|period)[:\s]*(.+?)(?:\n|$)/i) || [])[1]?.trim() || null,
      taxType: (text.match(/(?:ad[oó]nem|tax\s*type)[:\s]*(.+?)(?:\n|$)/i) || [])[1]?.trim() || null,
    };
  }

  /**
   * Extract payment reminder entities
   */
  extractPaymentReminder(text) {
    return {
      invoiceNumber: (text.match(/sz[aá]mlasz[aá]m[:\s]*([A-Z0-9/_-]+)/i) || [])[1] || null,
      originalAmount: this.parseAmount(text.match(/(?:eredeti|original)\s*(?:[oö]sszeg|amount)[:\s]*([\d\s.,]+)/i)?.[1]),
      overdueAmount: this.parseAmount(text.match(/(?:tartoz[aá]s|h[aá]tral[eé]k|overdue)[:\s]*([\d\s.,]+)/i)?.[1]),
      dueDate: (text.match(/(?:hat[aá]rid[oő]|due)[:\s]*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i) || [])[1] || null,
      vendor: (text.match(/([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ&][a-záéíóöőúüű]*)*\s+(?:Kft|Bt|Zrt|Nyrt)\.?)/)?.[1]) || null,
    };
  }

  /**
   * Generic extraction for unclassified documents
   */
  extractGeneric(text) {
    const dates = [];
    const datePattern = /\d{4}[.\-/]\d{2}[.\-/]\d{2}/g;
    let m;
    while ((m = datePattern.exec(text)) !== null) {
      dates.push(this.normalizeDate(m[0]));
    }

    const companies = [];
    const companyPattern = /([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ&][a-záéíóöőúüű]*)*\s+(?:Kft|Bt|Zrt|Nyrt|Ltd|GmbH)\.?)/g;
    while ((m = companyPattern.exec(text)) !== null) {
      if (!companies.includes(m[1])) companies.push(m[1]);
    }

    return {
      dates,
      companies,
      summary: text.substring(0, 300),
    };
  }

  normalizeDate(dateStr) {
    if (!dateStr) return null;
    return dateStr.replace(/\s/g, '').replace(/\./g, '-').replace(/\//g, '-');
  }

  parseAmount(value) {
    if (!value) return null;
    const cleaned = String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
}

module.exports = new EntityExtractorService();
