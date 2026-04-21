/**
 * Classification Rules Controller
 * CRUD + test endpoint for invoice_classification_rules table.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const classifier = require('../services/invoiceClassification.service');

const VALID_TYPES = ['partner', 'settlement', 'keyword', 'combined'];

function formatRule(row) {
  return {
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    partnerName: row.partner_name,
    settlementName: row.settlement_name,
    keyword: row.keyword,
    costCenterId: row.cost_center_id,
    costCenterCode: row.cost_center_code,
    costCenterName: row.cost_center_name,
    priority: row.priority,
    confidenceBoost: row.confidence_boost,
    isActive: row.is_active,
    matchCount: row.match_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateRuleBody(body) {
  const errors = [];
  if (!body.name || !String(body.name).trim()) errors.push('name kötelező');
  if (!body.ruleType || !VALID_TYPES.includes(body.ruleType)) {
    errors.push(`ruleType kötelező — egyik: ${VALID_TYPES.join(', ')}`);
  }
  if (!body.costCenterId) errors.push('costCenterId kötelező');
  if (!body.partnerName && !body.settlementName && !body.keyword) {
    errors.push('legalább egy illesztési feltétel kötelező (partnerName / settlementName / keyword)');
  }
  if (body.priority !== undefined && (body.priority < 1 || body.priority > 10)) {
    errors.push('priority 1 és 10 között');
  }
  if (body.confidenceBoost !== undefined && (body.confidenceBoost < 0 || body.confidenceBoost > 50)) {
    errors.push('confidenceBoost 0 és 50 között');
  }
  return errors;
}

// GET /api/v1/classification-rules
const list = async (req, res) => {
  try {
    const { active, type, costCenterId } = req.query;
    const params = [];
    const clauses = [];
    if (active === 'true' || active === 'false') {
      params.push(active === 'true');
      clauses.push(`r.is_active = $${params.length}`);
    }
    if (type && VALID_TYPES.includes(type)) {
      params.push(type);
      clauses.push(`r.rule_type = $${params.length}`);
    }
    if (costCenterId) {
      params.push(costCenterId);
      clauses.push(`r.cost_center_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await query(
      `SELECT r.*, c.code AS cost_center_code, c.name AS cost_center_name
       FROM invoice_classification_rules r
       JOIN cost_centers c ON r.cost_center_id = c.id
       ${where}
       ORDER BY r.priority ASC, r.match_count DESC, r.name ASC`,
      params
    );
    res.json({ success: true, data: result.rows.map(formatRule) });
  } catch (err) {
    logger.error('[classificationRules] list error:', err);
    res.status(500).json({ success: false, message: 'Szabályok lekérési hiba' });
  }
};

// POST /api/v1/classification-rules
const create = async (req, res) => {
  try {
    const errors = validateRuleBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const result = await query(
      `INSERT INTO invoice_classification_rules
        (name, rule_type, partner_name, settlement_name, keyword,
         cost_center_id, priority, confidence_boost, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        String(req.body.name).trim(),
        req.body.ruleType,
        req.body.partnerName || null,
        req.body.settlementName || null,
        req.body.keyword || null,
        req.body.costCenterId,
        req.body.priority || 5,
        req.body.confidenceBoost || 20,
        req.body.isActive !== false,
        req.user?.id || null,
      ]
    );

    // Re-query with JOIN for the response format
    const formatted = await query(
      `SELECT r.*, c.code AS cost_center_code, c.name AS cost_center_name
       FROM invoice_classification_rules r
       JOIN cost_centers c ON r.cost_center_id = c.id
       WHERE r.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json({ success: true, data: formatRule(formatted.rows[0]) });
  } catch (err) {
    logger.error('[classificationRules] create error:', err);
    res.status(500).json({ success: false, message: 'Szabály létrehozási hiba' });
  }
};

// PUT /api/v1/classification-rules/:id
const update = async (req, res) => {
  try {
    const errors = validateRuleBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const result = await query(
      `UPDATE invoice_classification_rules SET
         name = $1, rule_type = $2,
         partner_name = $3, settlement_name = $4, keyword = $5,
         cost_center_id = $6, priority = $7, confidence_boost = $8,
         is_active = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING id`,
      [
        String(req.body.name).trim(),
        req.body.ruleType,
        req.body.partnerName || null,
        req.body.settlementName || null,
        req.body.keyword || null,
        req.body.costCenterId,
        req.body.priority || 5,
        req.body.confidenceBoost || 20,
        req.body.isActive !== false,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szabály nem található' });
    }

    const formatted = await query(
      `SELECT r.*, c.code AS cost_center_code, c.name AS cost_center_name
       FROM invoice_classification_rules r
       JOIN cost_centers c ON r.cost_center_id = c.id
       WHERE r.id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: formatRule(formatted.rows[0]) });
  } catch (err) {
    logger.error('[classificationRules] update error:', err);
    res.status(500).json({ success: false, message: 'Szabály frissítési hiba' });
  }
};

// DELETE /api/v1/classification-rules/:id
const remove = async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM invoice_classification_rules WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szabály nem található' });
    }
    res.json({ success: true, message: 'Szabály törölve' });
  } catch (err) {
    logger.error('[classificationRules] delete error:', err);
    res.status(500).json({ success: false, message: 'Szabály törlési hiba' });
  }
};

// POST /api/v1/classification-rules/test
// Body: { vendorName?, extractedText?, subject?, notes? }
const test = async (req, res) => {
  try {
    const { vendorName, extractedText, subject, notes } = req.body || {};
    if (!vendorName && !extractedText && !subject && !notes) {
      return res.status(400).json({
        success: false,
        message: 'legalább egy mező kötelező (vendorName, extractedText, subject, notes)',
      });
    }
    const result = await classifier.testClassify({ vendorName, extractedText, subject, notes });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[classificationRules] test error:', err);
    res.status(500).json({ success: false, message: 'Tesztelési hiba' });
  }
};

module.exports = { list, create, update, remove, test };
