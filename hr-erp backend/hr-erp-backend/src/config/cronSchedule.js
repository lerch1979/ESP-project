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
const videoSequences = require('../services/videoSequence.service');
const videoAnnounce = require('../services/videoAnnounce.service');

const TZ = 'Europe/Budapest';

/**
 * Resident video communication (mig 143) — ONE daily job drives every sequence type:
 * move-in drips, employment-start drips and annually-recurring calendar series. Runs at
 * 09:30 local so a push lands in waking hours rather than overnight.
 *
 * Both halves are internally idempotent (unique (sequence_id, step_id, user_id) and a
 * renag_sent_at stamp), so a restart or a manual re-run cannot double-send.
 */
function initializeVideoCommunicationJobs() {
  cron.schedule('30 9 * * *', wrap('videoSequences', async () => {
    const r = await videoSequences.runDaily({});
    logger.info(`[cron:videoSequences] ${JSON.stringify(r)}`);
  }), { timezone: TZ });

  // Mandatory-notice reminder: one nudge, once, if still unwatched after N days.
  cron.schedule('0 17 * * *', wrap('videoMandatoryRenag', async () => {
    const r = await videoAnnounce.runRenags({});
    logger.info(`[cron:videoMandatoryRenag] ${JSON.stringify(r)}`);
  }), { timezone: TZ });

  logger.info('🎬 Video communication crons scheduled (sequences 09:30, mandatory re-nag 17:00)');
}

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

module.exports = { initializeWellbeingCronJobs, initializeVideoCommunicationJobs };
