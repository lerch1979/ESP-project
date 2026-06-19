/**
 * Device push-token registration for the authenticated user.
 *   POST   /api/v1/push/tokens   { token, platform?, deviceName? }  → upsert
 *   DELETE /api/v1/push/tokens   { token }                          → remove (logout)
 *
 * A token is globally unique; re-registering it moves it to the current user
 * (a shared/handed-down device shouldn't push to the previous owner).
 */
const { Expo } = require('expo-server-sdk');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const registerToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform, deviceName } = req.body || {};
    if (!token || !Expo.isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen push token' });
    }
    await query(
      `INSERT INTO user_push_tokens (user_id, expo_push_token, platform, device_name, last_used_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (expo_push_token)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     platform = EXCLUDED.platform,
                     device_name = EXCLUDED.device_name,
                     last_used_at = now()`,
      [userId, token, platform || null, deviceName || null]
    );
    return res.status(201).json({ success: true });
  } catch (err) {
    logger.error('[pushTokens.register]', err.message);
    return res.status(500).json({ success: false, message: 'Token regisztrációs hiba' });
  }
};

const deleteToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Hiányzó token' });
    await query(
      'DELETE FROM user_push_tokens WHERE expo_push_token = $1 AND user_id = $2',
      [token, userId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error('[pushTokens.delete]', err.message);
    return res.status(500).json({ success: false, message: 'Token törlési hiba' });
  }
};

module.exports = { registerToken, deleteToken };
