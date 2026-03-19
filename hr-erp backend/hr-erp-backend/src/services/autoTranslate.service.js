/**
 * AutoTranslate Service
 * Translates user-generated content between 5 supported languages.
 * Uses Google Translate API when available, mock mode for development.
 * 30-day cache to minimize API costs.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const SUPPORTED_LANGS = ['hu', 'en', 'tl', 'uk', 'de'];
const COST_PER_CHAR = 0.00002; // Google Translate: $20 per 1M chars

class AutoTranslateService {
  constructor() {
    this.enabled = process.env.GOOGLE_TRANSLATE_ENABLED === 'true';
    this.mockMode = process.env.GOOGLE_TRANSLATE_MOCK === 'true' || !this.enabled;
    this.translator = null;

    if (this.enabled && process.env.GOOGLE_TRANSLATE_API_KEY) {
      try {
        const { Translate } = require('@google-cloud/translate').v2;
        this.translator = new Translate({ key: process.env.GOOGLE_TRANSLATE_API_KEY });
        logger.info('[AutoTranslate] Google Translate API initialized');
      } catch (err) {
        logger.warn('[AutoTranslate] Google Translate not available, using mock mode');
        this.mockMode = true;
      }
    } else {
      logger.info('[AutoTranslate] Running in mock mode (set GOOGLE_TRANSLATE_ENABLED=true + API key for real translation)');
    }
  }

  async getUserLanguage(userId) {
    try {
      const result = await query('SELECT preferred_language FROM users WHERE id = $1', [userId]);
      return result.rows[0]?.preferred_language || 'hu';
    } catch { return 'hu'; }
  }

  async translateText(text, sourceLang, targetLang) {
    if (!text || typeof text !== 'string' || !text.trim()) return text || '';
    if (sourceLang === targetLang) return text;
    if (!SUPPORTED_LANGS.includes(targetLang)) return text;

    text = text.trim();

    // Check cache
    const cached = await this.getCached(text, sourceLang, targetLang);
    if (cached) {
      this.recordStat(sourceLang, targetLang, 0, 1, 0);
      return cached;
    }

    // Mock mode: prefix with language tag
    if (this.mockMode) {
      const mock = `[${targetLang.toUpperCase()}] ${text}`;
      await this.cache(text, sourceLang, targetLang, mock);
      return mock;
    }

    // Real Google Translate
    try {
      const [translation] = await this.translator.translate(text, { from: sourceLang, to: targetLang });
      await this.cache(text, sourceLang, targetLang, translation);
      this.recordStat(sourceLang, targetLang, 1, 0, text.length);
      return translation;
    } catch (err) {
      logger.error('[AutoTranslate] API error:', err.message);
      return text; // Return original on failure
    }
  }

  async getCached(text, sourceLang, targetLang) {
    try {
      const result = await query(
        `SELECT translated_text FROM translation_cache
         WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3 AND expires_at > NOW()`,
        [text, sourceLang, targetLang]
      );
      if (result.rows.length > 0) {
        // Update hit count async (fire and forget)
        query(`UPDATE translation_cache SET hit_count = hit_count + 1, last_hit_at = NOW()
               WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3`,
          [text, sourceLang, targetLang]).catch(() => {});
        return result.rows[0].translated_text;
      }
      return null;
    } catch { return null; }
  }

  async cache(text, sourceLang, targetLang, translation) {
    try {
      await query(
        `INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, char_count, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')
         ON CONFLICT (source_text, source_lang, target_lang)
         DO UPDATE SET translated_text = $4, expires_at = NOW() + INTERVAL '30 days', hit_count = 0`,
        [text, sourceLang, targetLang, translation, text.length]
      );
    } catch (err) { logger.warn('[AutoTranslate] Cache write error:', err.message); }
  }

  async recordStat(sourceLang, targetLang, apiCalls, cacheHits, chars) {
    try {
      const cost = chars * COST_PER_CHAR;
      await query(
        `INSERT INTO translation_stats (date, source_lang, target_lang, api_calls, cache_hits, total_chars, estimated_cost)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
         ON CONFLICT (date, source_lang, target_lang)
         DO UPDATE SET api_calls = translation_stats.api_calls + $3,
                       cache_hits = translation_stats.cache_hits + $4,
                       total_chars = translation_stats.total_chars + $5,
                       estimated_cost = translation_stats.estimated_cost + $6`,
        [sourceLang, targetLang, apiCalls, cacheHits, chars, cost]
      );
    } catch { /* silent */ }
  }

  async translateObject(obj, sourceLangField, targetLang, fields) {
    if (!obj) return obj;
    const sourceLang = obj[sourceLangField] || 'hu';
    if (sourceLang === targetLang) return obj;

    const translated = { ...obj };
    for (const field of fields) {
      if (obj[field]) {
        translated[`original_${field}`] = obj[field];
        translated[field] = await this.translateText(obj[field], sourceLang, targetLang);
      }
    }
    translated._translated = true;
    translated._sourceLang = sourceLang;
    translated._targetLang = targetLang;
    return translated;
  }

  async translateArray(items, sourceLangField, targetLang, fields) {
    if (!items || !Array.isArray(items)) return items;
    return Promise.all(items.map(item => this.translateObject(item, sourceLangField, targetLang, fields)));
  }

  async getStats(days = 7) {
    try {
      const result = await query(
        `SELECT * FROM translation_stats WHERE date >= CURRENT_DATE - CAST($1 AS INTEGER) ORDER BY date DESC`,
        [days]
      );
      const totals = result.rows.reduce((acc, r) => ({
        apiCalls: acc.apiCalls + r.api_calls,
        cacheHits: acc.cacheHits + r.cache_hits,
        totalChars: acc.totalChars + r.total_chars,
        cost: acc.cost + parseFloat(r.estimated_cost || 0),
      }), { apiCalls: 0, cacheHits: 0, totalChars: 0, cost: 0 });

      const total = totals.apiCalls + totals.cacheHits;
      return {
        daily: result.rows,
        totals,
        cacheHitRate: total > 0 ? `${((totals.cacheHits / total) * 100).toFixed(1)}%` : '0%',
        period: `${days} days`,
      };
    } catch { return null; }
  }
}

module.exports = new AutoTranslateService();
