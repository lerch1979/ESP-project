const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const POINTS_CONFIG = {
  pulse_survey: 10,
  assessment_complete: 50,
  coaching_session: 100,
  intervention_complete: 75,
  carepath_case_resolved: 50,
};

class GamificationService {

  // ═══════════════════════════════════════════════════════════════════════
  // POINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Award points for completing an action.
   */
  async awardPoints(userId, contractorId, actionType, actionId) {
    const points = POINTS_CONFIG[actionType] || 0;
    if (points === 0) return 0;

    const result = await query(
      `INSERT INTO wellbeing_points (user_id, contractor_id, points, action_type, action_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, contractorId, points, actionType, actionId]
    );

    // Check if any badges should be unlocked
    await this.checkBadgeUnlocks(userId, actionType);

    return points;
  }

  /**
   * Get user total points and action count.
   */
  async getUserPoints(userId) {
    const result = await query(
      `SELECT
         COALESCE(SUM(points), 0)::int AS total,
         COUNT(*)::int AS actions_count
       FROM wellbeing_points
       WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STREAKS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Update daily streak after a qualifying activity.
   */
  async updateStreak(userId, streakType = 'pulse_survey') {
    const today = new Date().toISOString().split('T')[0];

    const existing = await query(
      `SELECT * FROM wellbeing_streaks WHERE user_id = $1 AND streak_type = $2`,
      [userId, streakType]
    );

    if (existing.rows.length === 0) {
      // First activity ever
      await query(
        `INSERT INTO wellbeing_streaks
           (user_id, streak_type, current_streak, longest_streak, last_activity_date)
         VALUES ($1, $2, 1, 1, $3)`,
        [userId, streakType, today]
      );

      await this.checkStreakBadges(userId, 1);
      return { currentStreak: 1, longestStreak: 1 };
    }

    const { current_streak, longest_streak, last_activity_date } = existing.rows[0];

    if (last_activity_date === today) {
      // Already completed today
      return { currentStreak: current_streak, longestStreak: longest_streak };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newCurrent, newLongest;

    if (last_activity_date === yesterdayStr) {
      // Consecutive day — increment streak
      newCurrent = current_streak + 1;
      newLongest = Math.max(longest_streak, newCurrent);
    } else {
      // Streak broken — reset to 1
      newCurrent = 1;
      newLongest = longest_streak;
    }

    await query(
      `UPDATE wellbeing_streaks
       SET current_streak = $1,
           longest_streak = $2,
           last_activity_date = $3,
           updated_at = NOW()
       WHERE user_id = $4 AND streak_type = $5`,
      [newCurrent, newLongest, today, userId, streakType]
    );

    await this.checkStreakBadges(userId, newCurrent);

    return { currentStreak: newCurrent, longestStreak: newLongest };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BADGES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check and award badges based on current state.
   */
  async checkBadgeUnlocks(userId, actionType) {
    // Points-based badges
    const userPoints = await this.getUserPoints(userId);
    const pointsBadges = await query(
      `SELECT * FROM wellbeing_badges
       WHERE points_required IS NOT NULL
         AND points_required <= $1`,
      [userPoints.total]
    );

    for (const badge of pointsBadges.rows) {
      await this.awardBadge(userId, badge.id);
    }

    // Action count badges
    if (actionType === 'pulse_survey') {
      const pulseCount = await query(
        `SELECT COUNT(*) AS count FROM wellbeing_points
         WHERE user_id = $1 AND action_type = 'pulse_survey'`,
        [userId]
      );

      const count = parseInt(pulseCount.rows[0].count);

      // Early bird (50 before 9am)
      const earlyCount = await query(
        `SELECT COUNT(*) AS count FROM wellbeing_points
         WHERE user_id = $1
           AND action_type = 'pulse_survey'
           AND EXTRACT(HOUR FROM earned_at) < 9`,
        [userId]
      );

      if (parseInt(earlyCount.rows[0].count) >= 50) {
        const earlyBadge = await query(
          `SELECT id FROM wellbeing_badges WHERE badge_type = 'early_bird'`
        );
        if (earlyBadge.rows.length > 0) {
          await this.awardBadge(userId, earlyBadge.rows[0].id);
        }
      }

      // Consistency king (100 total)
      if (count >= 100) {
        const consistencyBadge = await query(
          `SELECT id FROM wellbeing_badges WHERE badge_type = 'consistency_king'`
        );
        if (consistencyBadge.rows.length > 0) {
          await this.awardBadge(userId, consistencyBadge.rows[0].id);
        }
      }
    }

    if (actionType === 'assessment_complete') {
      const assessmentCount = await query(
        `SELECT COUNT(*) AS count FROM wellbeing_points
         WHERE user_id = $1 AND action_type = 'assessment_complete'`,
        [userId]
      );

      if (parseInt(assessmentCount.rows[0].count) >= 10) {
        const assessmentBadge = await query(
          `SELECT id FROM wellbeing_badges WHERE badge_type = 'assessment_master'`
        );
        if (assessmentBadge.rows.length > 0) {
          await this.awardBadge(userId, assessmentBadge.rows[0].id);
        }
      }
    }
  }

  /**
   * Check streak-based badges.
   */
  async checkStreakBadges(userId, currentStreak) {
    const streakMilestones = [
      { days: 7,  badgeType: '7_day_streak' },
      { days: 30, badgeType: '30_day_streak' },
      { days: 90, badgeType: '90_day_streak' },
    ];

    for (const { days, badgeType } of streakMilestones) {
      if (currentStreak >= days) {
        const badge = await query(
          `SELECT id FROM wellbeing_badges WHERE badge_type = $1`,
          [badgeType]
        );

        if (badge.rows.length > 0) {
          await this.awardBadge(userId, badge.rows[0].id);
        }
      }
    }
  }

  /**
   * Award badge to user (idempotent).
   */
  async awardBadge(userId, badgeId) {
    try {
      const result = await query(
        `INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, badge_id) DO NOTHING
         RETURNING id`,
        [userId, badgeId]
      );

      if (result.rows.length > 0) {
        // New badge earned — create notification
        const badge = await query(
          `SELECT name, description FROM wellbeing_badges WHERE id = $1`,
          [badgeId]
        );

        // Try to insert notification (table may not exist in tests)
        try {
          await query(
            `INSERT INTO notifications
               (user_id, notification_type, title, message, priority)
             VALUES ($1, 'badge_earned', $2, $3, 'low')`,
            [
              userId,
              'Új Jelvény Megszerzve!',
              `Gratulálunk! Elnyerte: ${badge.rows[0].name} - ${badge.rows[0].description}`,
            ]
          );
        } catch (notifErr) {
          logger.debug('Badge notification insert skipped:', notifErr.message);
        }

        logger.info(`Badge earned: ${badge.rows[0].name} by user ${userId}`);
        return true;
      }
      return false; // Already had this badge
    } catch (err) {
      logger.error('Error awarding badge:', err);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USER STATS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get complete user gamification stats.
   */
  async getUserStats(userId) {
    const points = await this.getUserPoints(userId);

    const badges = await query(
      `SELECT wb.id, wb.badge_type, wb.name, wb.description, wb.icon_url, ub.earned_at
       FROM wellbeing_badges wb
       JOIN user_badges ub ON ub.badge_id = wb.id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [userId]
    );

    const streak = await query(
      `SELECT current_streak, longest_streak
       FROM wellbeing_streaks
       WHERE user_id = $1 AND streak_type = 'pulse_survey'`,
      [userId]
    );

    // Available (unearned) badges
    const available = await query(
      `SELECT wb.*
       FROM wellbeing_badges wb
       WHERE wb.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)
       ORDER BY wb.points_required NULLS FIRST`,
      [userId]
    );

    return {
      points: points.total,
      actionsCount: points.actions_count,
      badgesEarned: badges.rows,
      badgesAvailable: available.rows,
      currentStreak: streak.rows[0]?.current_streak || 0,
      longestStreak: streak.rows[0]?.longest_streak || 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get privacy-safe leaderboard (minimum 5 actions required to appear).
   */
  async getLeaderboard(contractorId, period = '30days') {
    const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
    const days = daysMap[period] || 30;

    const result = await query(
      `SELECT
         u.id,
         u.name,
         SUM(wp.points)::int AS total_points,
         COUNT(DISTINCT DATE(wp.earned_at))::int AS active_days
       FROM users u
       JOIN wellbeing_points wp ON wp.user_id = u.id
       WHERE u.contractor_id = $1
         AND wp.earned_at >= NOW() - CAST($2 || ' days' AS INTERVAL)
       GROUP BY u.id, u.name
       HAVING COUNT(*) >= 5
       ORDER BY total_points DESC
       LIMIT 10`,
      [contractorId, days.toString()]
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      name: row.name,
      points: row.total_points,
      activeDays: row.active_days,
    }));
  }

  /**
   * Get points history for a user, grouped by day.
   */
  async getPointsHistory(userId, days = 30) {
    const result = await query(
      `SELECT
         DATE(earned_at) AS day,
         SUM(points)::int AS points,
         array_agg(DISTINCT action_type) AS actions
       FROM wellbeing_points
       WHERE user_id = $1 AND earned_at >= NOW() - CAST($2 || ' days' AS INTERVAL)
       GROUP BY DATE(earned_at)
       ORDER BY day DESC`,
      [userId, days.toString()]
    );
    return result.rows;
  }
}

module.exports = new GamificationService();
