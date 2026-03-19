const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const SUPPORTED_LANGUAGES = ['hu', 'en', 'tl', 'uk', 'de'];

const LANGUAGE_LABELS = {
  hu: '🇭🇺 Magyar',
  en: '🇬🇧 English',
  tl: '🇵🇭 Tagalog',
  uk: '🇺🇦 Українська',
  de: '🇩🇪 Deutsch',
};

// ─── Self-service: own language ─────────────────────────────────────

const getMyLanguage = async (req, res) => {
  try {
    const result = await query('SELECT preferred_language FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, language: result.rows[0]?.preferred_language || 'hu' });
  } catch (error) {
    logger.error('Error getting language:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const updateMyLanguage = async (req, res) => {
  try {
    const { language } = req.body;
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ success: false, message: 'Nem támogatott nyelv', supported: SUPPORTED_LANGUAGES });
    }
    await query('UPDATE users SET preferred_language = $2 WHERE id = $1', [req.user.id, language]);
    res.json({ success: true, message: 'Nyelv frissítve', language });
  } catch (error) {
    logger.error('Error updating language:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Admin: any user's language ─────────────────────────────────────

const updateUserLanguage = async (req, res) => {
  try {
    const { language } = req.body;
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ success: false, message: 'Nem támogatott nyelv' });
    }
    const result = await query(
      'UPDATE users SET preferred_language = $2 WHERE id = $1 RETURNING id, first_name, last_name, preferred_language',
      [req.params.id, language]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Felhasználó nem található' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating user language:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Bulk assign by contractor ──────────────────────────────────────

const bulkLanguageAssignment = async (req, res) => {
  try {
    const { contractor_id, language } = req.body;
    if (!contractor_id || !SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ success: false, message: 'contractor_id és érvényes nyelv kötelező' });
    }
    const result = await query(
      'UPDATE users SET preferred_language = $2 WHERE contractor_id = $1 RETURNING id',
      [contractor_id, language]
    );
    // Also update contractor default
    await query('UPDATE contractors SET default_language = $2 WHERE id = $1', [contractor_id, language]);

    res.json({ success: true, message: `${result.rowCount} felhasználó nyelve frissítve`, count: result.rowCount });
  } catch (error) {
    logger.error('Error bulk assigning language:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Language statistics ────────────────────────────────────────────

const getLanguageStats = async (req, res) => {
  try {
    const result = await query(
      `SELECT preferred_language, COUNT(*) AS count
       FROM users WHERE is_active = true
       GROUP BY preferred_language ORDER BY count DESC`
    );
    const distribution = {};
    let total = 0;
    result.rows.forEach(r => {
      distribution[r.preferred_language || 'hu'] = parseInt(r.count);
      total += parseInt(r.count);
    });
    res.json({
      success: true,
      data: { distribution, total, supported: SUPPORTED_LANGUAGES, labels: LANGUAGE_LABELS },
    });
  } catch (error) {
    logger.error('Error getting language stats:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Supported languages list ───────────────────────────────────────

const getSupportedLanguages = async (req, res) => {
  res.json({
    success: true,
    data: SUPPORTED_LANGUAGES.map(code => ({ code, label: LANGUAGE_LABELS[code] })),
  });
};

module.exports = {
  getMyLanguage, updateMyLanguage, updateUserLanguage,
  bulkLanguageAssignment, getLanguageStats, getSupportedLanguages,
  SUPPORTED_LANGUAGES, LANGUAGE_LABELS,
};
