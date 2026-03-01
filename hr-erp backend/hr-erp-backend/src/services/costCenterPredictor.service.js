const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// Keyword-to-cost-center-code mapping for fallback prediction
const KEYWORD_MAPPINGS = {
  // Utilities / Rezsi
  'áram': 'OPR-BP-REZSI',
  'villany': 'OPR-BP-REZSI',
  'elektromos': 'OPR-BP-REZSI',
  'víz': 'OPR-BP-REZSI',
  'gáz': 'OPR-BP-REZSI',
  'közüzemi': 'OPR-BP-REZSI',
  'rezsi': 'OPR-BP-REZSI',
  'internet': 'OPR-BP-REZSI',
  'telefon': 'OPR-BP-REZSI',
  'távközlés': 'OPR-BP-REZSI',
  'telekom': 'OPR-BP-REZSI',
  'vodafone': 'OPR-BP-REZSI',
  'digi': 'OPR-BP-REZSI',
  'elmű': 'OPR-BP-REZSI',
  'főgáz': 'OPR-BP-REZSI',
  'fővárosi vízművek': 'OPR-BP-REZSI',

  // Building materials / Anyagok
  'építőanyag': 'OPR-BP-ANYAG',
  'cement': 'OPR-BP-ANYAG',
  'tégla': 'OPR-BP-ANYAG',
  'festék': 'OPR-BP-ANYAG',
  'csavar': 'OPR-BP-ANYAG',
  'szerszám': 'OPR-BP-ANYAG',
  'obi': 'OPR-BP-ANYAG',
  'bauhaus': 'OPR-BP-ANYAG',
  'diego': 'OPR-BP-ANYAG',

  // Subcontractors / Alvállalkozók
  'alvállalkozó': 'OPR-BP-ALVAL',
  'munkadíj': 'OPR-BP-ALVAL',
  'kivitelezés': 'OPR-BP-ALVAL',
  'szerelés': 'OPR-BP-ALVAL',

  // Accommodation / Szállás
  'szállás': 'OPR-SZALL',
  'lakás': 'OPR-SZALL',
  'bérleti': 'OPR-SZALL',
  'albérlet': 'OPR-SZALL',

  // Office / Iroda
  'iroda': 'OPR-IRODA',
  'irodaszer': 'OPR-IRODA',
  'nyomtató': 'OPR-IRODA',
  'papír': 'OPR-IRODA',

  // IT
  'szoftver': 'STR-IT',
  'licenc': 'STR-IT',
  'software': 'STR-IT',
  'hosting': 'STR-IT',
  'domain': 'STR-IT',
  'server': 'STR-IT',

  // HR / Training
  'képzés': 'HR-KEPZES',
  'tréning': 'HR-KEPZES',
  'oktatás': 'HR-KEPZES',
  'tanfolyam': 'HR-KEPZES',

  // HR / Salaries
  'bér': 'HR-BER',
  'fizetés': 'HR-BER',
  'juttatás': 'HR-BER',
};

class CostCenterPredictorService {

  /**
   * Predict the most likely cost center for an extracted invoice
   * Strategy:
   *   1. Check vendor history (same vendor → same cost center)
   *   2. Keyword matching on description + vendor name
   *   3. Return null if no confident match
   */
  async predict(extractedData) {
    try {
      // Strategy 1: Vendor history
      const vendorPrediction = await this.predictFromVendorHistory(extractedData);
      if (vendorPrediction && vendorPrediction.confidence >= 70) {
        return vendorPrediction;
      }

      // Strategy 2: Keyword matching
      const keywordPrediction = await this.predictFromKeywords(extractedData);
      if (keywordPrediction) {
        // If vendor history had a lower-confidence match, combine
        if (vendorPrediction && vendorPrediction.costCenterId === keywordPrediction.costCenterId) {
          return {
            ...keywordPrediction,
            confidence: Math.min(95, keywordPrediction.confidence + 15),
            reasoning: `${vendorPrediction.reasoning}; ${keywordPrediction.reasoning}`,
          };
        }
        return keywordPrediction;
      }

      // Return vendor prediction even if low confidence
      if (vendorPrediction) {
        return vendorPrediction;
      }

      logger.info(`No cost center prediction for vendor: ${extractedData.vendorName}`);
      return null;
    } catch (error) {
      logger.error('Cost center prediction error:', error);
      return null;
    }
  }

  /**
   * Strategy 1: Look at past invoices from the same vendor
   */
  async predictFromVendorHistory(extractedData) {
    const vendorName = extractedData.vendorName;
    const taxNumber = extractedData.vendorTaxNumber;

    if (!vendorName && !taxNumber) return null;

    // Find past invoices by tax number (most reliable) or vendor name
    let historyResult;

    if (taxNumber) {
      historyResult = await query(`
        SELECT cost_center_id, COUNT(*) as cnt
        FROM invoices
        WHERE vendor_tax_number = $1
          AND cost_center_id IS NOT NULL
        GROUP BY cost_center_id
        ORDER BY cnt DESC
        LIMIT 1
      `, [taxNumber]);
    }

    if ((!historyResult || historyResult.rows.length === 0) && vendorName) {
      historyResult = await query(`
        SELECT cost_center_id, COUNT(*) as cnt
        FROM invoices
        WHERE LOWER(vendor_name) = LOWER($1)
          AND cost_center_id IS NOT NULL
        GROUP BY cost_center_id
        ORDER BY cnt DESC
        LIMIT 1
      `, [vendorName]);
    }

    // Also check previous drafts
    if (!historyResult || historyResult.rows.length === 0) {
      const draftMatch = taxNumber
        ? await query(`
            SELECT suggested_cost_center_id as cost_center_id, COUNT(*) as cnt
            FROM invoice_drafts
            WHERE vendor_tax_number = $1
              AND status = 'approved'
              AND suggested_cost_center_id IS NOT NULL
            GROUP BY suggested_cost_center_id
            ORDER BY cnt DESC
            LIMIT 1
          `, [taxNumber])
        : null;

      if (draftMatch && draftMatch.rows.length > 0) {
        historyResult = draftMatch;
      }
    }

    if (!historyResult || historyResult.rows.length === 0) return null;

    const { cost_center_id, cnt } = historyResult.rows[0];
    const confidence = Math.min(90, 50 + (parseInt(cnt) * 10));

    // Get cost center name for reasoning
    const ccResult = await query(
      'SELECT name, code FROM cost_centers WHERE id = $1',
      [cost_center_id]
    );
    const ccName = ccResult.rows[0]?.name || 'Ismeretlen';
    const ccCode = ccResult.rows[0]?.code || '';

    return {
      costCenterId: cost_center_id,
      confidence,
      reasoning: `Szállítói előzmény: ${vendorName || taxNumber} → ${ccName} (${ccCode}), ${cnt} korábbi számla`,
    };
  }

  /**
   * Strategy 2: Match keywords in description and vendor name against known patterns
   */
  async predictFromKeywords(extractedData) {
    const searchText = [
      extractedData.vendorName,
      extractedData.description,
      extractedData.vendorAddress,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!searchText) return null;

    // Score each keyword match
    const codeScores = {};

    for (const [keyword, code] of Object.entries(KEYWORD_MAPPINGS)) {
      if (searchText.includes(keyword.toLowerCase())) {
        codeScores[code] = (codeScores[code] || 0) + 1;
      }
    }

    // Find the best match
    const bestCode = Object.entries(codeScores)
      .sort((a, b) => b[1] - a[1])[0];

    if (!bestCode) return null;

    const [code, matchCount] = bestCode;
    const confidence = Math.min(80, 40 + (matchCount * 15));

    // Look up cost center by code
    const ccResult = await query(
      'SELECT id, name, code FROM cost_centers WHERE code = $1',
      [code]
    );

    if (ccResult.rows.length === 0) {
      logger.warn(`Cost center code ${code} not found in database`);
      return null;
    }

    const cc = ccResult.rows[0];

    return {
      costCenterId: cc.id,
      confidence,
      reasoning: `Kulcsszó egyezés: ${matchCount} találat → ${cc.name} (${cc.code})`,
    };
  }
}

module.exports = new CostCenterPredictorService();
