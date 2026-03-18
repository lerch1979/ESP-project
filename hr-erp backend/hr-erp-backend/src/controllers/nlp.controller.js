const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const sentimentService = require('../services/nlp/sentimentAnalysis.service');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG ENDPOINTS (admin only)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/nlp/config */
const getConfig = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM nlp_sentiment_config WHERE contractor_id = $1`,
      [req.user.contractorId]
    );
    res.json({ success: true, data: result.rows[0] || { enabled: false } });
  } catch (error) {
    logger.error('Error fetching NLP config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/nlp/config */
const updateConfig = async (req, res) => {
  try {
    const {
      enabled, require_user_consent, auto_escalate_critical,
      auto_escalate_high, confidence_threshold,
    } = req.body;

    // Validate threshold
    if (confidence_threshold !== undefined && (confidence_threshold < 0.5 || confidence_threshold > 0.99)) {
      return res.status(400).json({ success: false, message: 'Megbízhatósági küszöb 0.50-0.99 között legyen' });
    }

    const result = await query(
      `INSERT INTO nlp_sentiment_config
         (contractor_id, enabled, require_user_consent, auto_escalate_critical,
          auto_escalate_high, confidence_threshold)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contractor_id)
       DO UPDATE SET
         enabled = COALESCE($2, nlp_sentiment_config.enabled),
         require_user_consent = COALESCE($3, nlp_sentiment_config.require_user_consent),
         auto_escalate_critical = COALESCE($4, nlp_sentiment_config.auto_escalate_critical),
         auto_escalate_high = COALESCE($5, nlp_sentiment_config.auto_escalate_high),
         confidence_threshold = COALESCE($6, nlp_sentiment_config.confidence_threshold),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.contractorId,
        enabled ?? false,
        require_user_consent ?? true,
        auto_escalate_critical ?? true,
        auto_escalate_high ?? false,
        confidence_threshold ?? 0.80,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating NLP config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/nlp/alerts */
const getAlerts = async (req, res) => {
  try {
    const { urgency, escalated, limit = 50, offset = 0 } = req.query;

    const alerts = await sentimentService.getAlerts(req.user.contractorId, {
      urgency,
      escalated: escalated === 'true' ? true : escalated === 'false' ? false : undefined,
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: parseInt(offset) || 0,
    });

    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Error fetching NLP alerts:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/nlp/alerts/:id/review */
const reviewAlert = async (req, res) => {
  try {
    const { review_notes } = req.body;

    const result = await sentimentService.reviewAlert(
      req.params.id, req.user.id, review_notes || ''
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Elemzés nem található' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error reviewing alert:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS & HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/nlp/stats */
const getStats = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const stats = await sentimentService.getStats(req.user.contractorId, days);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error fetching NLP stats:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/nlp/sentiment-history */
const getSentimentHistory = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const history = await sentimentService.getSentimentHistory(req.user.contractorId, days);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Error fetching sentiment history:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/nlp/test */
const testAnalysis = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Szöveg megadása kötelező (min 5 karakter)' });
    }

    // Try Claude first, fallback to keywords
    let result;
    try {
      result = await sentimentService.analyzeWithClaude(text);
      result._method = 'claude';
    } catch {
      result = sentimentService.keywordFallbackAnalysis(text);
      result._method = 'keyword_fallback';
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error in NLP test:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT ENDPOINTS (employee)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/nlp/consent */
const getConsent = async (req, res) => {
  try {
    // First check if NLP is even enabled for contractor
    const enabled = await sentimentService.isEnabled(req.user.contractorId);

    const result = await query(
      `SELECT * FROM user_nlp_consent WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        feature_enabled: enabled,
        consent: result.rows[0] || { consented: false },
      },
    });
  } catch (error) {
    logger.error('Error fetching NLP consent:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/nlp/consent */
const updateConsent = async (req, res) => {
  try {
    const { consented } = req.body;

    if (typeof consented !== 'boolean') {
      return res.status(400).json({ success: false, message: 'consented mező kötelező (true/false)' });
    }

    const result = await query(
      `INSERT INTO user_nlp_consent (user_id, contractor_id, consented, consent_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         consented = $3,
         consent_date = CASE WHEN $3 = true THEN NOW() ELSE user_nlp_consent.consent_date END,
         consent_withdrawn_date = CASE WHEN $3 = false THEN NOW() ELSE NULL END
       RETURNING *`,
      [req.user.id, req.user.contractorId, consented, consented ? new Date() : null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating NLP consent:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getAlerts,
  reviewAlert,
  getStats,
  getSentimentHistory,
  testAnalysis,
  getConsent,
  updateConsent,
};
