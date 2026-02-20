const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * GET /preferences — Get current user's preferences
 */
const getPreferences = async (req, res) => {
  try {
    const result = await query(
      'SELECT preferences FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );

    const preferences = result.rows.length > 0 ? result.rows[0].preferences : {};

    res.json({ success: true, data: { preferences } });
  } catch (error) {
    logger.error('Beállítások lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Beállítások lekérési hiba' });
  }
};

/**
 * PUT /preferences — Upsert current user's preferences
 */
const updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ success: false, message: 'Érvénytelen beállítások' });
    }

    await query(
      `INSERT INTO user_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET preferences = $2, updated_at = NOW()`,
      [req.user.id, JSON.stringify(preferences)]
    );

    res.json({ success: true, data: { preferences } });
  } catch (error) {
    logger.error('Beállítások mentési hiba:', error);
    res.status(500).json({ success: false, message: 'Beállítások mentési hiba' });
  }
};

module.exports = { getPreferences, updatePreferences };
