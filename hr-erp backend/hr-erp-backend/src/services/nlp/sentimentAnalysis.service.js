const { query } = require('../../database/connection');
const { logger } = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD DICTIONARIES (Hungarian + English)
// ═══════════════════════════════════════════════════════════════════════════

const CRISIS_KEYWORDS = [
  'öngyilkos', 'megölöm magam', 'vége mindennek', 'befejezem', 'nem akarok élni',
  'meg akarok halni', 'önkárosítás', 'felvágom',
  'suicide', 'kill myself', 'end it all', 'want to die', 'self-harm',
];

const DEPRESSION_KEYWORDS = [
  'reménytelen', 'depressziós', 'üres', 'kimerült', 'nincs értelme',
  'feladom', 'magányos', 'semmit sem érzek', 'tehetetlenség', 'kilátástalan',
  'hopeless', 'depressed', 'empty', 'exhausted', 'no point', 'give up',
];

const ANXIETY_KEYWORDS = [
  'szorongok', 'pánik', 'aggódom', 'félelem', 'ideges', 'nem bírom',
  'szorít a mellkasom', 'nem tudok aludni', 'feszült',
  'anxious', 'panic', 'worried', 'fear', 'nervous', "can't take it",
];

const CONFLICT_KEYWORDS = [
  'kolléga bánt', 'főnök kiabál', 'zaklatás', 'bántalmazás', 'konfliktus',
  'megfélemlítés', 'kirekesztenek', 'mobbing', 'diszkrimináció',
  'harassment', 'bullying', 'abuse', 'yells', 'discrimination',
];

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Te egy munkahelyi jólléti szakértő AI asszisztens vagy. Feladatod a munkavállalók pulzus felmérés megjegyzéseinek elemzése, a mentális állapot kategorizálása, és a sürgősség meghatározása.

Válaszolj KIZÁRÓLAG érvényes JSON formátumban, semmilyen egyéb szöveget ne adj hozzá.

JSON séma:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "ANXIOUS" | "DEPRESSED" | "CONFLICT" | "CRISIS",
  "confidence": <szám 0.00 és 1.00 között>,
  "keywords": ["kulcsszó1", "kulcsszó2"],
  "urgency": "low" | "medium" | "high" | "critical",
  "recommended_action": "Rövid, 1-2 mondatos javaslat magyar nyelven"
}

Szabályok:
- POSITIVE: pozitív, boldog, elégedett hangulat → urgency: low
- NEUTRAL: semleges, nincs különös jelzés → urgency: low
- ANXIOUS: szorongás, aggodalom, stressz → urgency: medium
- DEPRESSED: depresszió jelei (reménytelen, kimerült, nincs értelme) → urgency: high
- CONFLICT: munkahelyi konfliktus, zaklatás → urgency: high
- CRISIS: öngyilkossági gondolatok, önkárosítás → urgency: critical

KRITIKUS: Ha bármi öngyilkossági szándékra, önkárosításra vagy súlyos krízisre utal, MINDIG "CRISIS" és "critical"!`;

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class SentimentAnalysisService {
  constructor() {
    this.client = null;
    this._initClient();
  }

  _initClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.warn('ANTHROPIC_API_KEY not set — NLP sentiment will use keyword fallback only');
      return;
    }

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch (err) {
      logger.warn('Failed to initialize Anthropic client:', err.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // CONFIG & CONSENT CHECKS
  // ═════════════════════════════════════════════════════════════════════

  async isEnabled(contractorId) {
    const result = await query(
      `SELECT enabled FROM nlp_sentiment_config WHERE contractor_id = $1`,
      [contractorId]
    );
    return result.rows.length > 0 && result.rows[0].enabled === true;
  }

  async hasUserConsent(userId) {
    const result = await query(
      `SELECT consented FROM user_nlp_consent WHERE user_id = $1`,
      [userId]
    );
    return result.rows.length > 0 && result.rows[0].consented === true;
  }

  async getConfig(contractorId) {
    const result = await query(
      `SELECT * FROM nlp_sentiment_config WHERE contractor_id = $1`,
      [contractorId]
    );
    return result.rows[0] || null;
  }

  // ═════════════════════════════════════════════════════════════════════
  // CLAUDE API ANALYSIS
  // ═════════════════════════════════════════════════════════════════════

  async analyzeWithClaude(noteText) {
    if (!this.client) {
      throw new Error('Claude API not configured');
    }

    const message = await this.client.messages.create({
      model: process.env.CLAUDE_SENTIMENT_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Elemezd ezt a pulzus felmérés megjegyzést:\n\n"${noteText}"`,
      }],
    });

    const responseText = message.content[0].text.trim();

    // Strip markdown code fences if present
    const jsonText = responseText
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    return JSON.parse(jsonText);
  }

  // ═════════════════════════════════════════════════════════════════════
  // KEYWORD FALLBACK ANALYSIS
  // ═════════════════════════════════════════════════════════════════════

  keywordFallbackAnalysis(noteText) {
    const lower = noteText.toLowerCase();

    if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        sentiment: 'CRISIS',
        confidence: 0.70,
        keywords: CRISIS_KEYWORDS.filter(kw => lower.includes(kw)),
        urgency: 'critical',
        recommended_action: 'AZONNALI HR beavatkozás szükséges. Krízis protokoll aktiválása.',
      };
    }

    if (DEPRESSION_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        sentiment: 'DEPRESSED',
        confidence: 0.65,
        keywords: DEPRESSION_KEYWORDS.filter(kw => lower.includes(kw)),
        urgency: 'high',
        recommended_action: 'HR értesítés 24 órán belül. CarePath ajánlás.',
      };
    }

    if (CONFLICT_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        sentiment: 'CONFLICT',
        confidence: 0.60,
        keywords: CONFLICT_KEYWORDS.filter(kw => lower.includes(kw)),
        urgency: 'high',
        recommended_action: 'HR értesítés munkahelyi konfliktus miatt.',
      };
    }

    if (ANXIETY_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        sentiment: 'ANXIOUS',
        confidence: 0.60,
        keywords: ANXIETY_KEYWORDS.filter(kw => lower.includes(kw)),
        urgency: 'medium',
        recommended_action: 'Stressz-kezelő források ajánlása.',
      };
    }

    return {
      sentiment: 'NEUTRAL',
      confidence: 0.50,
      keywords: [],
      urgency: 'low',
      recommended_action: 'Nincs azonnali cselekvés szükséges.',
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // MAIN ANALYSIS PIPELINE
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Analyze a pulse note — checks feature flag + consent, then runs
   * Claude API with keyword fallback.
   */
  async analyzePulseNote(userId, contractorId, pulseId, noteText) {
    // 1. Feature must be enabled
    const enabled = await this.isEnabled(contractorId);
    if (!enabled) {
      logger.debug(`NLP sentiment disabled for contractor ${contractorId}`);
      return null;
    }

    // 2. Check user consent
    const config = await this.getConfig(contractorId);
    if (config?.require_user_consent) {
      const hasConsent = await this.hasUserConsent(userId);
      if (!hasConsent) {
        logger.debug(`User ${userId} has not consented to NLP analysis`);
        return null;
      }
    }

    // 3. Analyze — Claude API first, keyword fallback if API fails
    let analysis;
    try {
      analysis = await this.analyzeWithClaude(noteText);
    } catch (error) {
      logger.warn('Claude API error, using keyword fallback:', error.message);
      analysis = this.keywordFallbackAnalysis(noteText);
    }

    // 4. Confidence threshold check
    const threshold = config?.confidence_threshold || 0.80;
    if (analysis.confidence < threshold && analysis.urgency === 'low') {
      logger.debug(`Analysis confidence ${analysis.confidence} below threshold ${threshold}, skipping storage`);
      return null;
    }

    // 5. Always store critical/high regardless of confidence
    // (keyword fallback may have lower confidence but we must not miss crises)

    // 6. Store analysis
    const result = await query(
      `INSERT INTO wellbeing_sentiment_analysis
         (user_id, contractor_id, pulse_id, pulse_note, sentiment,
          confidence, keywords, urgency, recommended_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId, contractorId, pulseId, noteText,
        analysis.sentiment, analysis.confidence,
        JSON.stringify(analysis.keywords), analysis.urgency,
        analysis.recommended_action,
      ]
    );

    const stored = result.rows[0];

    // 7. Auto-escalation
    if (config?.auto_escalate_critical && analysis.urgency === 'critical') {
      await this.escalateToHR(stored.id, contractorId, 'Automatikus eszkaláció — KRÍZIS észlelve');
    } else if (config?.auto_escalate_high && analysis.urgency === 'high') {
      await this.escalateToHR(stored.id, contractorId, 'Automatikus eszkaláció — magas sürgősség');
    }

    logger.info(`NLP sentiment: ${analysis.sentiment} (${analysis.urgency}) for user ${userId}`);
    return stored;
  }

  // ═════════════════════════════════════════════════════════════════════
  // ESCALATION
  // ═════════════════════════════════════════════════════════════════════

  async escalateToHR(analysisId, contractorId, reason) {
    await query(
      `UPDATE wellbeing_sentiment_analysis
       SET escalated = true, escalated_at = NOW()
       WHERE id = $1`,
      [analysisId]
    );

    // Notify admins
    try {
      const admins = await query(
        `SELECT DISTINCT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.contractor_id = $1 AND u.is_active = true
           AND r.name IN ('admin', 'superadmin')`,
        [contractorId]
      );

      for (const admin of admins.rows) {
        await query(
          `INSERT INTO wellbeing_notifications
             (user_id, contractor_id, notification_type, notification_channel,
              title, message, priority, source_module)
           VALUES ($1, $2, 'sentiment_alert', 'push', $3, $4, $5, 'nlp')`,
          [
            admin.id, contractorId,
            reason.includes('KRÍZIS') ? 'KRÍZIS RIASZTÁS' : 'Fontos figyelmeztetés',
            `${reason}. Kérem tekintse át a jólléti elemzés eredményeit.`,
            reason.includes('KRÍZIS') ? 'urgent' : 'high',
          ]
        );
      }
    } catch (err) {
      logger.error('Escalation notification error:', err.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // QUERY METHODS (for admin dashboard)
  // ═════════════════════════════════════════════════════════════════════

  async getAlerts(contractorId, { urgency, escalated, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT sa.*, u.name AS user_name
      FROM wellbeing_sentiment_analysis sa
      JOIN users u ON u.id = sa.user_id
      WHERE sa.contractor_id = $1`;
    const params = [contractorId];
    let idx = 2;

    if (urgency) {
      sql += ` AND sa.urgency = $${idx}`;
      params.push(urgency);
      idx++;
    }

    if (escalated !== undefined) {
      sql += ` AND sa.escalated = $${idx}`;
      params.push(escalated);
      idx++;
    }

    sql += ` ORDER BY
      CASE sa.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      sa.analyzed_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  async reviewAlert(analysisId, reviewedBy, reviewNotes) {
    const result = await query(
      `UPDATE wellbeing_sentiment_analysis
       SET escalated = true, escalated_at = NOW(), escalated_by = $2, review_notes = $3
       WHERE id = $1
       RETURNING *`,
      [analysisId, reviewedBy, reviewNotes]
    );
    return result.rows[0] || null;
  }

  async getStats(contractorId, days = 30) {
    const result = await query(
      `SELECT sentiment, urgency, COUNT(*)::int AS count, AVG(confidence)::numeric(3,2) AS avg_confidence
       FROM wellbeing_sentiment_analysis
       WHERE contractor_id = $1 AND analyzed_at >= NOW() - CAST($2 || ' days' AS INTERVAL)
       GROUP BY sentiment, urgency
       ORDER BY count DESC`,
      [contractorId, days.toString()]
    );
    return result.rows;
  }

  async getSentimentHistory(contractorId, days = 30) {
    const result = await query(
      `SELECT DATE(analyzed_at) AS day, sentiment, COUNT(*)::int AS count
       FROM wellbeing_sentiment_analysis
       WHERE contractor_id = $1 AND analyzed_at >= NOW() - CAST($2 || ' days' AS INTERVAL)
       GROUP BY DATE(analyzed_at), sentiment
       ORDER BY day`,
      [contractorId, days.toString()]
    );
    return result.rows;
  }
}

// Export constants for testing
SentimentAnalysisService.CRISIS_KEYWORDS = CRISIS_KEYWORDS;
SentimentAnalysisService.DEPRESSION_KEYWORDS = DEPRESSION_KEYWORDS;
SentimentAnalysisService.ANXIETY_KEYWORDS = ANXIETY_KEYWORDS;
SentimentAnalysisService.CONFLICT_KEYWORDS = CONFLICT_KEYWORDS;

module.exports = new SentimentAnalysisService();
module.exports.SentimentAnalysisService = SentimentAnalysisService;
