const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Ertesitesek listazasa (lapozassal)
 */
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM notifications
       WHERE user_id = $1 OR user_id IS NULL`,
      [userId]
    );

    const unreadResult = await query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
      [userId]
    );

    const result = await query(
      `SELECT id, type, title, message, data, link, is_read, read_at, created_at
       FROM notifications
       WHERE user_id = $1 OR user_id IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unread_count: parseInt(unreadResult.rows[0].count),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Ertesitesek lekerdesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ertesitesek lekerdesi hiba'
    });
  }
};

/**
 * Ertesites olvasottnak jelolese
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ertesites nem talalhato'
      });
    }

    res.json({
      success: true,
      message: 'Ertesites olvasottnak jelolve'
    });
  } catch (error) {
    logger.error('Ertesites olvasottnak jelolesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ertesites olvasottnak jelolesi hiba'
    });
  }
};

/**
 * Osszes ertesites olvasottnak jelolese.
 * Returns the number of rows that were flipped (so a UI can show
 * "Marked N as read"). NotificationBell ignores extras — safe to add.
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false
       RETURNING id`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Minden ertesites olvasottnak jelolve',
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Osszes ertesites olvasottnak jelolesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Osszes ertesites olvasottnak jelolesi hiba'
    });
  }
};

/**
 * Olvasatlan ertesitesek szama
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
      [userId]
    );

    res.json({
      success: true,
      data: { count: parseInt(result.rows[0].count) }
    });
  } catch (error) {
    logger.error('Olvasatlan ertesitesek szamlalasi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Olvasatlan ertesitesek szamlalasi hiba'
    });
  }
};

/**
 * Ertesites torlese — csak a sajat (user_id = self) ertesiteset torolheti.
 * Broadcast (user_id IS NULL) ertesitest senki nem tud torolni a UI-rol;
 * azokat csak admin script tudja kezelni.
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ertesites nem talalhato vagy nincs jogosultsag'
      });
    }

    res.json({
      success: true,
      message: 'Ertesites torolve'
    });
  } catch (error) {
    logger.error('Ertesites torlesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ertesites torlesi hiba'
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
};
