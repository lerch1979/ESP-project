/**
 * Video announcement sender — the ONE send path behind all three modes (mig 143).
 *
 * Ad-hoc (Mode B), drip step (A1) and calendar step (A2) all end here, so translation,
 * push, delivery logging and watch-evidence behave identically however a video was
 * triggered.
 *
 * Per recipient:
 *   1. language  = users.preferred_language (fallback hu)
 *   2. copy      = translation.translateText(title/description, video.base_language → theirs)
 *                  — cache-backed, exactly as tickets and the FAQ already do it
 *   3. in-app    = notifications row (so it survives a missed/disabled push)
 *   4. push      = Expo, type 'video_announcement', carrying data.video_id for the deep link
 *   5. logged    = video_announcement_recipients (language, push_ok) — the delivery record
 *
 * Watch evidence is NOT recorded here: it rides on video_views, written when the resident
 * actually plays the video. "Sent" and "watched" stay separate on purpose — that gap is
 * the whole point of the compliance view for mandatory notices.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const audienceSvc = require('./videoAudience.service');
const translation = require('./translation.service');
const inApp = require('./inAppNotification.service');

const DEFAULT_LANG = 'hu';

/** Translate once per LANGUAGE, not once per recipient — 200 residents share ~5 languages. */
async function buildCopyByLang(video, languages) {
  const src = video.base_language || DEFAULT_LANG;
  const out = {};
  for (const lang of languages) {
    if (lang === src) { out[lang] = { title: video.title, body: video.description || '' }; continue; }
    try {
      const [title, body] = await Promise.all([
        translation.translateText(video.title || '', src, lang),
        video.description ? translation.translateText(video.description, src, lang) : Promise.resolve(''),
      ]);
      out[lang] = { title: title || video.title, body: body || '' };
    } catch (e) {
      // A translation outage must not stop the send — deliver in the source language.
      logger.warn(`[videoAnnounce] translation ${src}→${lang} failed: ${e.message}`);
      out[lang] = { title: video.title, body: video.description || '' };
    }
  }
  return out;
}

/**
 * Send one video to one audience.
 *
 * @param {string} videoId
 * @param {object} audience              see videoAudience.service
 * @param {object} opts
 *   { isMandatory, createdBy, source='adhoc', sequenceId, stepId, recipients }
 *   `recipients` — pre-resolved list (the sequence job passes the capped slice it owns);
 *                  omit for ad-hoc and the audience is resolved here.
 * @returns {Promise<{announcement_id, recipient_count, pushed, failed, languages, warnings}>}
 */
async function send(videoId, audience = {}, opts = {}) {
  const video = (await query(
    `SELECT id, title, description, base_language, is_active FROM videos WHERE id = $1`, [videoId])).rows[0];
  if (!video) throw new Error(`videoAnnounce: video ${videoId} not found`);
  if (video.is_active === false) throw new Error(`videoAnnounce: video ${videoId} is inactive`);

  let recipients = opts.recipients;
  let warnings = [];
  if (!recipients) {
    const res = await audienceSvc.resolve(audience);
    recipients = res.recipients;
    warnings = res.warnings;
  }
  if (recipients.length === 0) {
    return { announcement_id: null, recipient_count: 0, pushed: 0, failed: 0, languages: [], warnings, skipped: 'no_recipients' };
  }

  const languages = [...new Set(recipients.map((r) => r.language || DEFAULT_LANG))];
  const copy = await buildCopyByLang(video, languages);

  // The announcement + its recipient rows are written together: a delivery record that
  // half-exists would corrupt the compliance denominator.
  const announcementId = await transaction(async (client) => {
    const a = await client.query(
      `INSERT INTO video_announcements (video_id, source, sequence_id, step_id, audience, is_mandatory, recipient_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [videoId, opts.source || 'adhoc', opts.sequenceId || null, opts.stepId || null,
       JSON.stringify(audience || {}), !!opts.isMandatory, recipients.length, opts.createdBy || null]);
    const id = a.rows[0].id;
    for (const r of recipients) {
      await client.query(
        `INSERT INTO video_announcement_recipients (announcement_id, user_id, employee_id, language)
         VALUES ($1,$2,$3,$4) ON CONFLICT (announcement_id, user_id) DO NOTHING`,
        [id, r.user_id, r.employee_id || null, r.language || DEFAULT_LANG]);
    }
    return id;
  });

  // Notify + push AFTER the commit: a slow Expo call must not hold a write transaction,
  // and a push failure must not roll back a delivery record that is otherwise correct.
  let pushed = 0;
  let failed = 0;
  for (const r of recipients) {
    const lang = r.language || DEFAULT_LANG;
    const c = copy[lang] || copy[video.base_language] || { title: video.title, body: video.description || '' };
    try {
      await inApp.notify({
        userId: r.user_id,
        type: 'video_announcement',
        title: c.title,
        message: c.body,
        link: `/videos/${videoId}`,
        data: { type: 'video_announcement', video_id: videoId, announcement_id: announcementId, mandatory: !!opts.isMandatory },
        push: { type: 'video_announcement', vars: { title: c.title, body: c.body },
                fallbackTitle: c.title, fallbackBody: c.body,
                data: { type: 'video_announcement', video_id: videoId, announcement_id: announcementId } },
      });
      await query(`UPDATE video_announcement_recipients SET push_ok = TRUE WHERE announcement_id=$1 AND user_id=$2`,
        [announcementId, r.user_id]);
      pushed++;
    } catch (e) {
      failed++;
      await query(`UPDATE video_announcement_recipients SET push_ok = FALSE, push_error=$3 WHERE announcement_id=$1 AND user_id=$2`,
        [announcementId, r.user_id, String(e.message).slice(0, 300)]).catch(() => {});
      logger.warn(`[videoAnnounce] delivery to ${r.user_id} failed: ${e.message}`);
    }
  }

  logger.info(`[videoAnnounce] video=${videoId} source=${opts.source || 'adhoc'} recipients=${recipients.length} pushed=${pushed} failed=${failed} langs=${languages.join(',')}`);
  return { announcement_id: announcementId, recipient_count: recipients.length, pushed, failed, languages, warnings };
}

/**
 * MANDATORY RE-NAG — one reminder, once, for a mandatory announcement still unwatched
 * after `renag_after_days`. "Unwatched" = no video_views row for that (user, video), which
 * is the same evidence the compliance view reports.
 */
async function runRenags({ now = null } = {}) {
  const cfg = (await query(`SELECT * FROM video_delivery_config ORDER BY created_at LIMIT 1`)).rows[0]
    || { enabled: true, renag_after_days: 3, renag_enabled: true };
  if (!cfg.enabled || !cfg.renag_enabled) return { skipped: true, reason: 'disabled' };

  const due = (await query(
    `SELECT r.id, r.announcement_id, r.user_id, r.language, a.video_id,
            v.title, v.description, v.base_language
       FROM video_announcement_recipients r
       JOIN video_announcements a ON a.id = r.announcement_id
       JOIN videos v ON v.id = a.video_id
      WHERE a.is_mandatory = TRUE
        AND r.renag_sent_at IS NULL
        AND a.sent_at <= COALESCE($1::timestamptz, NOW()) - ($2 || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM video_views vv WHERE vv.user_id = r.user_id AND vv.video_id = a.video_id)`,
    [now, String(cfg.renag_after_days)])).rows;

  let sent = 0;
  for (const d of due) {
    const lang = d.language || DEFAULT_LANG;
    const src = d.base_language || DEFAULT_LANG;
    let title = d.title;
    try { if (lang !== src) title = await translation.translateText(d.title || '', src, lang) || d.title; } catch { /* source language */ }
    const prefix = { hu: 'Emlékeztető', en: 'Reminder', uk: 'Нагадування', tl: 'Paalala', de: 'Erinnerung' }[lang] || 'Emlékeztető';
    try {
      await inApp.notify({
        userId: d.user_id,
        type: 'video_announcement',
        title: `${prefix}: ${title}`,
        message: title,
        link: `/videos/${d.video_id}`,
        data: { type: 'video_announcement', video_id: d.video_id, announcement_id: d.announcement_id, renag: true },
        push: { type: 'video_announcement', vars: { title: `${prefix}: ${title}`, body: title },
                fallbackTitle: `${prefix}: ${title}`, fallbackBody: title,
                data: { type: 'video_announcement', video_id: d.video_id, announcement_id: d.announcement_id } },
      });
      sent++;
    } catch (e) {
      logger.warn(`[videoAnnounce.renag] ${d.user_id}: ${e.message}`);
    }
    // Stamped whether or not the push landed — one reminder means one, not one per run.
    await query(`UPDATE video_announcement_recipients SET renag_sent_at = NOW() WHERE id = $1`, [d.id]);
  }
  logger.info(`[videoAnnounce.renag] due=${due.length} sent=${sent} after=${cfg.renag_after_days}d`);
  return { skipped: false, due: due.length, sent, after_days: cfg.renag_after_days };
}

module.exports = { send, runRenags, buildCopyByLang };
