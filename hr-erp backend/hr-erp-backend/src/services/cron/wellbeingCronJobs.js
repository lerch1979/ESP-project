const { query } = require('../../database/connection');
const { logger } = require('../../utils/logger');
const { renderTemplate } = require('../../config/notificationTemplates');

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getCurrentQuarter() {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

function getQuarterEndDate() {
  const now = new Date();
  const qMonth = Math.ceil((now.getMonth() + 1) / 3) * 3;
  return new Date(now.getFullYear(), qMonth, 0); // last day of quarter month
}

function daysUntil(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

async function insertNotification(userId, contractorId, type, channel, title, message, opts = {}) {
  await query(
    `INSERT INTO wellbeing_notifications
       (user_id, contractor_id, notification_type, notification_channel,
        title, message, action_url, priority, scheduled_for, source_module)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
    [userId, contractorId, type, channel, title, message,
     opts.action_url || null, opts.priority || 'normal', opts.source_module || 'wellmind']
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 1: Daily Pulse Reminder (9:00 AM Mon-Fri)
// ═══════════════════════════════════════════════════════════════════════════

async function dailyPulseReminder() {
  logger.info('[CRON] dailyPulseReminder — starting');

  const employees = await query(
    `SELECT u.id, u.contractor_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = true AND r.slug = 'employee'
       AND NOT EXISTS (
         SELECT 1 FROM wellmind_pulse_surveys
         WHERE user_id = u.id AND survey_date = CURRENT_DATE
       )`
  );

  const tpl = renderTemplate('daily_pulse_reminder');
  let sent = 0;

  for (const emp of employees.rows) {
    try {
      for (const ch of tpl.channels) {
        await insertNotification(emp.id, emp.contractor_id,
          'daily_pulse_reminder', ch, tpl.title, tpl.message,
          { action_url: tpl.action_url, priority: tpl.priority });
      }
      sent++;
    } catch (err) {
      logger.error('[CRON] pulse reminder failed', { userId: emp.id, error: err.message });
    }
  }

  logger.info(`[CRON] dailyPulseReminder — sent to ${sent}/${employees.rows.length} employees`);
  return sent;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 2: Quarterly Assessment Reminders (10:00 AM daily check)
// ═══════════════════════════════════════════════════════════════════════════

async function quarterlyAssessmentReminders() {
  logger.info('[CRON] quarterlyAssessmentReminders — starting');

  const days = daysUntil(getQuarterEndDate());
  let templateName = null;

  if (days === 7) templateName = 'assessment_reminder_7d';
  else if (days === 3) templateName = 'assessment_reminder_3d';
  else if (days === 0) templateName = 'assessment_reminder_today';
  else {
    logger.info(`[CRON] quarterlyAssessmentReminders — not a reminder day (${days} days to end)`);
    return 0;
  }

  const quarter = getCurrentQuarter();

  const employees = await query(
    `SELECT u.id, u.contractor_id
     FROM users u
     WHERE u.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM wellmind_assessments
         WHERE user_id = u.id AND quarter = $1
       )`,
    [quarter]
  );

  const tpl = renderTemplate(templateName, { quarter });
  let sent = 0;

  for (const emp of employees.rows) {
    try {
      for (const ch of tpl.channels) {
        await insertNotification(emp.id, emp.contractor_id,
          templateName, ch, tpl.title, tpl.message,
          { action_url: tpl.action_url, priority: tpl.priority });
      }
      sent++;
    } catch (err) {
      logger.error('[CRON] assessment reminder failed', { userId: emp.id, error: err.message });
    }
  }

  logger.info(`[CRON] quarterlyAssessmentReminders (${templateName}) — sent to ${sent} employees`);
  return sent;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 3: CarePath Appointment Reminders (3:00 PM daily)
// ═══════════════════════════════════════════════════════════════════════════

async function carepathAppointmentReminders() {
  logger.info('[CRON] carepathAppointmentReminders — starting');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const bookings = await query(
    `SELECT b.id, b.user_id, b.appointment_datetime, b.booking_type, b.duration_minutes,
            p.full_name AS provider_name, p.address_city,
            c.contractor_id
     FROM carepath_provider_bookings b
     JOIN carepath_providers p ON p.id = b.provider_id
     JOIN carepath_cases c ON c.id = b.case_id
     WHERE b.status IN ('scheduled', 'confirmed')
       AND b.appointment_datetime >= $1 AND b.appointment_datetime < $2
       AND b.reminder_24h_sent = false`,
    [tomorrow.toISOString(), dayAfter.toISOString()]
  );

  let sent = 0;

  for (const bk of bookings.rows) {
    try {
      const apptTime = new Date(bk.appointment_datetime)
        .toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
      const locationInfo = bk.booking_type === 'in_person'
        ? `Helyszín: ${bk.address_city || 'Lásd a foglalás részleteit'}`
        : 'Videóhívás — link a foglalásban';

      const tpl = renderTemplate('carepath_appointment_reminder', {
        time: apptTime,
        provider_name: bk.provider_name,
        location_info: locationInfo,
        booking_id: bk.id,
      });

      for (const ch of tpl.channels) {
        await insertNotification(bk.user_id, bk.contractor_id,
          'carepath_appointment_reminder', ch, tpl.title, tpl.message,
          { action_url: tpl.action_url, priority: 'high', source_module: 'carepath' });
      }

      await query(
        'UPDATE carepath_provider_bookings SET reminder_24h_sent = true, reminder_sent_at = NOW() WHERE id = $1',
        [bk.id]
      );
      sent++;
    } catch (err) {
      logger.error('[CRON] appointment reminder failed', { bookingId: bk.id, error: err.message });
    }
  }

  logger.info(`[CRON] carepathAppointmentReminders — sent for ${sent}/${bookings.rows.length} bookings`);
  return sent;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 4: Weekly High Risk Alert to HR (Monday 8:00 AM)
// ═══════════════════════════════════════════════════════════════════════════

async function weeklyHighRiskAlert() {
  logger.info('[CRON] weeklyHighRiskAlert — starting');

  // Per contractor: count distinct red-risk employees this week
  const results = await query(
    `SELECT a.contractor_id, COUNT(DISTINCT a.user_id) AS red_count
     FROM wellmind_assessments a
     WHERE a.risk_level = 'red' AND a.assessment_date >= CURRENT_DATE - 7
     GROUP BY a.contractor_id
     HAVING COUNT(DISTINCT a.user_id) >= 3`  // Privacy: min 3 employees
  );

  let alerted = 0;

  for (const row of results.rows) {
    const admins = await query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.contractor_id = $1 AND r.slug IN ('admin', 'data_controller') AND u.is_active = true`,
      [row.contractor_id]
    );

    const tpl = renderTemplate('hr_high_risk_alert', { count: row.red_count });

    for (const admin of admins.rows) {
      await insertNotification(admin.id, row.contractor_id,
        'hr_high_risk_alert', 'email', tpl.title, tpl.message,
        { action_url: tpl.action_url, priority: 'high' });
    }
    alerted++;
  }

  logger.info(`[CRON] weeklyHighRiskAlert — alerted ${alerted} contractor(s)`);
  return alerted;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 5: Weekly Manager Summary (Sunday 6:00 PM)
// ═══════════════════════════════════════════════════════════════════════════

async function weeklyManagerSummary() {
  logger.info('[CRON] weeklyManagerSummary — starting');

  // Managers = users with task_owner role
  const managers = await query(
    `SELECT DISTINCT u.id, u.contractor_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.slug = 'task_owner' AND u.is_active = true`
  );

  let sent = 0;

  for (const mgr of managers.rows) {
    try {
      // Get team pulse this week (aggregated, min 5)
      const metrics = await query(
        `SELECT COUNT(DISTINCT user_id) AS emp_count,
                ROUND(AVG(mood_score)::numeric, 1) AS avg_mood,
                ROUND(AVG(stress_level)::numeric, 1) AS avg_stress
         FROM wellmind_pulse_surveys
         WHERE contractor_id = $1 AND survey_date >= CURRENT_DATE - 7`,
        [mgr.contractor_id]
      );

      const m = metrics.rows[0];
      if (parseInt(m.emp_count) < 5) continue; // Privacy

      const mood = parseFloat(m.avg_mood) || 3;
      const stress = parseFloat(m.avg_stress) || 5;
      const index = Math.round((mood * 20 + (10 - stress) * 10) / 2);

      // Previous week for trend
      const prev = await query(
        `SELECT ROUND(AVG(mood_score)::numeric, 1) AS avg_mood,
                ROUND(AVG(stress_level)::numeric, 1) AS avg_stress
         FROM wellmind_pulse_surveys
         WHERE contractor_id = $1
           AND survey_date BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 8`,
        [mgr.contractor_id]
      );

      let trend = 'Stabil';
      if (prev.rows[0]?.avg_mood) {
        const prevMood = parseFloat(prev.rows[0].avg_mood);
        const prevStress = parseFloat(prev.rows[0].avg_stress);
        const prevIndex = Math.round((prevMood * 20 + (10 - prevStress) * 10) / 2);
        if (index > prevIndex + 3) trend = 'Javuló ↗️';
        else if (index < prevIndex - 3) trend = 'Romló ↘️';
      }

      const tpl = renderTemplate('manager_weekly_summary', { wellbeing_index: index, trend });

      await insertNotification(mgr.id, mgr.contractor_id,
        'manager_weekly_summary', 'email', tpl.title, tpl.message,
        { action_url: tpl.action_url });
      sent++;
    } catch (err) {
      logger.error('[CRON] manager summary failed', { managerId: mgr.id, error: err.message });
    }
  }

  logger.info(`[CRON] weeklyManagerSummary — sent to ${sent} managers`);
  return sent;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 6: Expire Old Referrals (Daily 2:00 AM)
// ═══════════════════════════════════════════════════════════════════════════

async function expireOldReferrals() {
  logger.info('[CRON] expireOldReferrals — starting');

  const result = await query(
    `UPDATE wellbeing_referrals
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id`
  );

  const count = result.rows.length;
  if (count > 0) logger.info(`[CRON] expireOldReferrals — expired ${count} referrals`);
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 7: Process Pending Notification Queue (Every 5 min)
// ═══════════════════════════════════════════════════════════════════════════

async function processNotificationQueue() {
  const pending = await query(
    `SELECT id, user_id, notification_channel, title, message, retry_count, max_retries
     FROM wellbeing_notifications
     WHERE status = 'pending' AND scheduled_for <= NOW() AND retry_count < max_retries
     ORDER BY
       CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
       scheduled_for ASC
     LIMIT 100`
  );

  if (pending.rows.length === 0) return 0;

  let processed = 0;
  for (const notif of pending.rows) {
    try {
      // In-app: just mark delivered. Push/email/sms: mark sent (actual delivery is async).
      const newStatus = notif.notification_channel === 'in_app' ? 'delivered' : 'sent';
      await query(
        'UPDATE wellbeing_notifications SET status = $1, sent_at = NOW() WHERE id = $2',
        [newStatus, notif.id]
      );
      processed++;
    } catch (err) {
      await query(
        `UPDATE wellbeing_notifications
         SET retry_count = retry_count + 1,
             status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
             failed_reason = $2
         WHERE id = $1`,
        [notif.id, err.message]
      );
    }
  }

  if (processed > 0) logger.info(`[CRON] processNotificationQueue — processed ${processed}/${pending.rows.length}`);
  return processed;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB 8: Refresh Materialized View (Daily 3:00 AM)
// ═══════════════════════════════════════════════════════════════════════════

async function refreshWellbeingSummary() {
  logger.info('[CRON] refreshWellbeingSummary — starting');
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_wellbeing_summary');
  logger.info('[CRON] refreshWellbeingSummary — done');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  dailyPulseReminder,
  quarterlyAssessmentReminders,
  carepathAppointmentReminders,
  weeklyHighRiskAlert,
  weeklyManagerSummary,
  expireOldReferrals,
  processNotificationQueue,
  refreshWellbeingSummary,
  // Helpers (exported for testing)
  getCurrentQuarter,
  getQuarterEndDate,
  daysUntil,
};
