/**
 * Invoice Classification Service — DB-driven rule engine
 *
 * CRITICAL FIX (2026-04-21):
 *   Settlement / keyword rules MUST match ONLY against the admin-authored
 *   `notes` field — NOT the OCR text. Our office address is in Fertőd, so
 *   Fertőd appears in most invoices' OCR text and would cause false
 *   classification to `OPR-SZALL-HS-FERTD`.
 *
 * Field-scope rules:
 *   - Partner rules  → match in `vendorName` + `emailFrom` only
 *   - Combined rules → partner in `vendorName`/`emailFrom`, settlement in `notes`
 *                      (partner alone qualifies; settlement adds confirmation)
 *   - Settlement rules → match in `notes` ONLY
 *   - Keyword rules  → match in `notes` ONLY
 *
 * Fallback: if no DB rule matches, tries the legacy keyword predictor
 * (costCenterPredictor), which has its own narrow partner mappings and is
 * also vendor-scoped. Never defaults to a specific settlement.
 *
 * Score: (10 - priority) * 10 + confidence_boost, capped at 95.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const costCenterPredictor = require('./costCenterPredictor.service');

const AUTO_APPROVE_THRESHOLD = 70;

/**
 * @param {object} invoiceData - {vendorName, extractedText, subject, notes, emailFrom}
 * @returns {object} classification result + `needs_review` flag
 */
async function classifyInvoice(invoiceData = {}) {
  const { vendorName, notes, emailFrom } = invoiceData;

  // ── Field-scoped search pools ─────────────────────────────────────
  // Partner rules: only vendor name + sender email (both are "who's invoicing")
  const partnerText = [vendorName, emailFrom].filter(Boolean).join(' ').toLowerCase();
  // Settlement + keyword rules: ONLY the admin-authored notes field
  const notesText = (notes || '').toLowerCase();

  if (!partnerText.trim() && !notesText.trim()) {
    return unresolvedResult('Nincs besorolandó adat (hiányzik partner neve és megjegyzés is)');
  }

  const rules = await fetchActiveRules();
  const matches = [];

  for (const rule of rules) {
    const partnerHit = rule.partner_name &&
      partnerText.includes(rule.partner_name.toLowerCase());
    const settlementHit = rule.settlement_name &&
      notesText.includes(rule.settlement_name.toLowerCase());
    const keywordHit = rule.keyword &&
      notesText.includes(rule.keyword.toLowerCase());

    let qualified = false;
    const reasons = [];

    switch (rule.rule_type) {
      case 'partner':
        if (partnerHit) {
          qualified = true;
          reasons.push(`Partner "${rule.partner_name}" megtalálva a szállító nevében`);
        }
        break;
      case 'settlement':
        if (settlementHit) {
          qualified = true;
          reasons.push(`Település "${rule.settlement_name}" megtalálva a megjegyzésben`);
        }
        break;
      case 'keyword':
        if (keywordHit) {
          qualified = true;
          reasons.push(`Kulcsszó "${rule.keyword}" megtalálva a megjegyzésben`);
        }
        break;
      case 'combined':
        // Partner match in vendor is the primary signal; settlement in notes is bonus.
        // Partner alone qualifies at full score.
        if (partnerHit) {
          qualified = true;
          reasons.push(`Partner "${rule.partner_name}" megtalálva a szállító nevében`);
          if (settlementHit) {
            reasons.push(`Település "${rule.settlement_name}" megerősítve a megjegyzésben`);
          }
        }
        break;
    }

    if (qualified) {
      const score = (10 - rule.priority) * 10 + rule.confidence_boost;
      matches.push({ rule, reason: reasons.join(' + '), score });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    const best = matches[0];
    incrementMatchCount(best.rule.id).catch(() => {});

    const confidence = Math.min(95, best.score);
    return {
      cost_center_id: best.rule.cost_center_id,
      cost_center_code: best.rule.cost_center_code,
      cost_center_name: best.rule.cost_center_name,
      confidence,
      reason: `Szabály: "${best.rule.name}" — ${best.reason}`,
      all_matches: matches.slice(0, 5).map((m) => ({
        rule_name: m.rule.name,
        cost_center_code: m.rule.cost_center_code,
        reason: m.reason,
        score: m.score,
      })),
      auto_approved: confidence >= AUTO_APPROVE_THRESHOLD,
      needs_review: confidence < AUTO_APPROVE_THRESHOLD,
      source: 'rule',
    };
  }

  // ── Legacy keyword predictor fallback (vendor-scoped only) ──────────
  try {
    const legacy = await costCenterPredictor.predict(invoiceData);
    if (legacy && legacy.costCenterId) {
      const confidence = Math.min(65, legacy.confidence || 50);
      return {
        cost_center_id: legacy.costCenterId,
        cost_center_code: legacy.costCenterCode || null,
        cost_center_name: legacy.costCenterName || null,
        confidence,
        reason: `Legacy predictor: ${legacy.reasoning || 'keyword match'}`,
        all_matches: [],
        auto_approved: false,
        needs_review: true,
        source: 'predictor',
      };
    }
  } catch (err) {
    logger.warn('[invoiceClassification] Legacy predictor failed:', err.message);
  }

  return unresolvedResult('Nincs illeszkedő szabály — általános költséghely, emberi review szükséges');
}

async function fetchActiveRules() {
  const result = await query(`
    SELECT r.*, c.code AS cost_center_code, c.name AS cost_center_name
    FROM invoice_classification_rules r
    JOIN cost_centers c ON r.cost_center_id = c.id
    WHERE r.is_active = true
    ORDER BY r.priority ASC, r.confidence_boost DESC
  `);
  return result.rows;
}

async function incrementMatchCount(ruleId) {
  await query(
    `UPDATE invoice_classification_rules
     SET match_count = match_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [ruleId]
  );
}

async function unresolvedResult(reason) {
  const result = await query(
    `SELECT id, code, name FROM cost_centers
     WHERE code IN ('OPR-SZALL', 'CC-MAIN', 'OPR')
     ORDER BY CASE code WHEN 'OPR-SZALL' THEN 1 WHEN 'CC-MAIN' THEN 2 ELSE 3 END
     LIMIT 1`
  );
  const cc = result.rows[0] || null;
  return {
    cost_center_id: cc?.id || null,
    cost_center_code: cc?.code || null,
    cost_center_name: cc?.name || null,
    confidence: 25,
    reason,
    all_matches: [],
    auto_approved: false,
    needs_review: true,
    source: 'default',
  };
}

/** Test classification without incrementing match_count. */
async function testClassify(invoiceData) {
  const result = await classifyInvoice(invoiceData);
  if (result.source === 'rule') {
    const bestName = result.reason.match(/Szabály: "([^"]+)"/)?.[1];
    if (bestName) {
      await query(
        `UPDATE invoice_classification_rules
         SET match_count = GREATEST(match_count - 1, 0)
         WHERE name = $1`,
        [bestName]
      );
    }
  }
  return result;
}

module.exports = { classifyInvoice, testClassify, AUTO_APPROVE_THRESHOLD };
