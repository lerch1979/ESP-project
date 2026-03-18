const cron = require('node-cron');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const {
  dailyPulseReminder,
  quarterlyAssessmentReminders,
  carepathAppointmentReminders,
  weeklyHighRiskAlert,
  weeklyManagerSummary,
  expireOldReferrals,
  processNotificationQueue,
  refreshWellbeingSummary,
} = require('../services/cron/wellbeingCronJobs');
const slackBotService = require('../services/slack/slackBot.service');

const TZ = 'Europe/Budapest';

function initializeWellbeingCronJobs() {
  // 1. Daily pulse reminder — 9:00 AM Mon-Fri
  cron.schedule('0 9 * * 1-5', wrap('dailyPulseReminder', dailyPulseReminder), { timezone: TZ });

  // 2. Quarterly assessment reminders — 10:00 AM daily (checks if reminder day)
  cron.schedule('0 10 * * *', wrap('quarterlyAssessmentReminders', quarterlyAssessmentReminders), { timezone: TZ });

  // 3. CarePath appointment reminders — 3:00 PM daily
  cron.schedule('0 15 * * *', wrap('carepathAppointmentReminders', carepathAppointmentReminders), { timezone: TZ });

  // 4. Weekly high risk alert — Monday 8:00 AM
  cron.schedule('0 8 * * 1', wrap('weeklyHighRiskAlert', weeklyHighRiskAlert), { timezone: TZ });

  // 5. Weekly manager summary — Sunday 6:00 PM
  cron.schedule('0 18 * * 0', wrap('weeklyManagerSummary', weeklyManagerSummary), { timezone: TZ });

  // 6. Expire old referrals — 2:00 AM daily
  cron.schedule('0 2 * * *', wrap('expireOldReferrals', expireOldReferrals), { timezone: TZ });

  // 7. Notification queue processor — every 5 minutes
  cron.schedule('*/5 * * * *', wrap('processNotificationQueue', processNotificationQueue));

  // 8. Refresh materialized view — 3:00 AM daily
  cron.schedule('0 3 * * *', wrap('refreshWellbeingSummary', refreshWellbeingSummary), { timezone: TZ });

  // 9. Daily Slack check-in — 9:00 AM Mon-Fri (sends to all enabled contractors)
  cron.schedule('0 9 * * 1-5', wrap('slackDailyCheckIn', async () => {
    const configs = await query(
      `SELECT contractor_id FROM slack_checkin_config WHERE enabled = true`
    );
    for (const config of configs.rows) {
      const result = await slackBotService.sendDailyCheckIn(config.contractor_id);
      logger.info(`[SLACK] Check-ins for contractor ${config.contractor_id}: sent=${result.sent}`);
    }
  }), { timezone: TZ });

  logger.info('[CRON] Wellbeing cron jobs initialized (9 jobs)');
}

function wrap(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (error) {
      logger.error(`[CRON ERROR] ${name}: ${error.message}`, { stack: error.stack });
    }
  };
}

module.exports = { initializeWellbeingCronJobs };
