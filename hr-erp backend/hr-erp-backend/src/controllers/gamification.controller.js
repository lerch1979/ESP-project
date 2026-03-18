const { logger } = require('../utils/logger');
const gamificationService = require('../services/gamification.service');

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/gamification/my-stats */
const getMyStats = async (req, res) => {
  try {
    const stats = await gamificationService.getUserStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error fetching gamification stats:', error);
    res.status(500).json({ success: false, message: 'Nem sikerült a statisztikák lekérése' });
  }
};

/** GET /api/v1/gamification/leaderboard */
const getLeaderboard = async (req, res) => {
  try {
    const { period = '30days' } = req.query;

    if (!['7days', '30days', '90days'].includes(period)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen időszak. Használjon: 7days, 30days, 90days' });
    }

    const leaderboard = await gamificationService.getLeaderboard(
      req.user.contractorId,
      period
    );

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, message: 'Nem sikerült a ranglista lekérése' });
  }
};

/** GET /api/v1/gamification/badges/available */
const getAvailableBadges = async (req, res) => {
  try {
    const { query } = require('../database/connection');
    const badges = await query(
      `SELECT * FROM wellbeing_badges ORDER BY points_required NULLS FIRST`
    );
    res.json({ success: true, data: badges.rows });
  } catch (error) {
    logger.error('Error fetching badges:', error);
    res.status(500).json({ success: false, message: 'Nem sikerült a jelvények lekérése' });
  }
};

/** GET /api/v1/gamification/points-history */
const getPointsHistory = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const history = await gamificationService.getPointsHistory(req.user.id, days);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Error fetching points history:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  getMyStats,
  getLeaderboard,
  getAvailableBadges,
  getPointsHistory,
};
