/**
 * Video sequence engine — drives BOTH automated modes from one daily job (mig 143).
 *
 *   move_in           A1: steps at day offsets from employees.arrival_date
 *   employment_start  A1: same, anchored on employees.start_date
 *   calendar          A2: steps on a month-day, recurring every year
 *
 * Sequences are DATA: staff create as many as they like in the admin ("Lakhatási alapok"
 * move-in anchored, "Munkahelyi ügyintézés" employment anchored, a Christmas series) and
 * add more later without a code change. Steps sit on an ARBITRARY day index — 1, 2, 3, 7,
 * 14, 30 — dense in the first week, sparse after.
 *
 * ── LATE JOINS (the rule that matters) ──────────────────────────────────────────
 * Someone already housed when a sequence goes live gets ONLY day 1 — the essential
 * intro — and then continues on their own day-index from there. They never receive a
 * backlog of thirty videos in one morning. Everything they missed stays in the library,
 * searchable, so nothing is lost; it is simply not pushed at them.
 * Implemented as: on a resident's FIRST encounter with a sequence (no send rows yet),
 * only the lowest step is eligible however high their day-index already is.
 *
 * ── PER-DAY CAP ─────────────────────────────────────────────────────────────────
 * A resident may be enrolled in several sequences at once. video_delivery_config
 * .max_videos_per_day (default 1) caps how many videos ANY one person receives per day
 * across ALL sequences; the rest simply become due again tomorrow. Nothing is dropped —
 * an unsent step has no row in video_sequence_sends, so it stays eligible.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────
 * video_sequence_sends carries UNIQUE (sequence_id, step_id, user_id) and is written with
 * ON CONFLICT DO NOTHING (the expiry_alert_log pattern). Re-running the job on the same
 * day changes nothing.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const announce = require('./videoAnnounce.service');
const audienceSvc = require('./videoAudience.service');

const ANCHOR_COLUMN = { move_in: 'arrival_date', employment_start: 'start_date' };

/** Local YYYY-MM-DD — pg hands DATE back as local midnight; never toISOString(). */
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getConfig() {
  const r = await query(`SELECT * FROM video_delivery_config ORDER BY created_at LIMIT 1`);
  return r.rows[0] || { enabled: true, max_videos_per_day: 1, renag_after_days: 3, renag_enabled: true };
}

/**
 * Everything a sequence could send today, before the per-day cap is applied.
 * @returns {Promise<Array>} [{ sequence, step, recipient, day_index }]
 */
async function collectDue(today) {
  const seqs = (await query(
    `SELECT s.*, COALESCE(json_agg(json_build_object(
              'id', st.id, 'video_id', st.video_id, 'day_offset', st.day_offset,
              'month_day', st.month_day, 'is_mandatory', st.is_mandatory)
              ORDER BY COALESCE(st.day_offset, 0), st.sort_order) FILTER (WHERE st.id IS NOT NULL), '[]') AS steps
       FROM video_sequences s
       LEFT JOIN video_sequence_steps st ON st.sequence_id = s.id
      WHERE s.is_active = TRUE
      GROUP BY s.id`)).rows;

  const due = [];
  for (const seq of seqs) {
    const steps = seq.steps || [];
    if (!steps.length) continue;

    const { recipients } = await audienceSvc.resolve(seq.audience || {});
    if (!recipients.length) continue;

    // Who has already had which step of this sequence.
    const sent = (await query(
      `SELECT user_id, step_id FROM video_sequence_sends WHERE sequence_id = $1`, [seq.id])).rows;
    const sentByUser = new Map();
    for (const s of sent) {
      if (!sentByUser.has(s.user_id)) sentByUser.set(s.user_id, new Set());
      sentByUser.get(s.user_id).add(s.step_id);
    }

    if (seq.anchor_type === 'calendar') {
      // A2 — fires for everyone in the audience on the step's month-day, every year.
      const md = today.slice(5); // 'MM-DD'
      for (const step of steps.filter((st) => st.month_day === md)) {
        for (const r of recipients) {
          if (sentByUser.get(r.user_id)?.has(step.id)) continue;   // already had it (this year or before)
          due.push({ sequence: seq, step, recipient: r, day_index: null });
        }
      }
      continue;
    }

    // A1 — day index from each resident's OWN anchor date.
    const col = ANCHOR_COLUMN[seq.anchor_type];
    if (!col) { logger.warn(`[videoSequence] unknown anchor_type ${seq.anchor_type} on ${seq.id}`); continue; }
    const anchors = new Map((await query(
      `SELECT user_id, ${col} AS anchor FROM employees
        WHERE user_id = ANY($1::uuid[]) AND ${col} IS NOT NULL`,
      [recipients.map((r) => r.user_id)])).rows.map((r) => [r.user_id, r.anchor]));

    const sortedSteps = [...steps].sort((a, b) => (a.day_offset || 0) - (b.day_offset || 0));
    const firstStep = sortedSteps[0];

    for (const r of recipients) {
      const anchor = anchors.get(r.user_id);
      if (!anchor) continue;                       // no anchor date → cannot place them on a day index
      const dayIndex = Math.floor((new Date(today) - new Date(localDateStr(new Date(anchor)))) / 86400000) + 1;
      if (dayIndex < 1) continue;                  // anchor is in the future

      const already = sentByUser.get(r.user_id);
      if (!already || already.size === 0) {
        // FIRST encounter: day 1 only, however long they have been here. No backlog.
        due.push({ sequence: seq, step: firstStep, recipient: r, day_index: dayIndex, late_join: dayIndex > (firstStep.day_offset || 1) });
        continue;
      }
      // Already started: every step whose day has arrived and that they have not had.
      for (const step of sortedSteps) {
        if (already.has(step.id)) continue;
        if ((step.day_offset || 1) <= dayIndex) due.push({ sequence: seq, step, recipient: r, day_index: dayIndex });
      }
    }
  }
  return due;
}

/**
 * The daily job. Applies the per-person cap, sends, and records the idempotency row.
 * @param {{ today?: string, dryRun?: boolean }} opts
 */
async function runDaily({ today = null, dryRun = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.enabled) { logger.info('[videoSequence] disabled — skipping'); return { skipped: true, reason: 'disabled' }; }

  const day = today || localDateStr();
  const due = await collectDue(day);

  // Per-person cap across ALL sequences. Already-sent-today counts toward it, so a
  // re-run mid-day cannot double someone's allowance.
  const cap = Math.max(0, Number(cfg.max_videos_per_day) || 1);
  const sentToday = new Map((await query(
    `SELECT user_id, COUNT(*)::int c FROM video_sequence_sends WHERE sent_on = $1::date GROUP BY user_id`,
    [day])).rows.map((r) => [r.user_id, r.c]));

  // Lowest day_offset first so an earlier step never loses its slot to a later one.
  due.sort((a, b) => (a.step.day_offset || 0) - (b.step.day_offset || 0));

  const toSend = [];
  const deferred = [];
  for (const d of due) {
    const used = sentToday.get(d.recipient.user_id) || 0;
    if (used >= cap) { deferred.push(d); continue; }   // becomes due again tomorrow
    sentToday.set(d.recipient.user_id, used + 1);
    toSend.push(d);
  }

  if (dryRun) {
    return { dry_run: true, date: day, due: due.length, would_send: toSend.length, deferred: deferred.length, cap };
  }

  // Group by (sequence, step) so one announcement covers everyone getting that step today.
  const byStep = new Map();
  for (const d of toSend) {
    const key = `${d.sequence.id}|${d.step.id}`;
    if (!byStep.has(key)) byStep.set(key, { sequence: d.sequence, step: d.step, recipients: [], indexes: [] });
    byStep.get(key).recipients.push(d.recipient);
    byStep.get(key).indexes.push(d.day_index);
  }

  let sent = 0;
  let announcements = 0;
  for (const grp of byStep.values()) {
    try {
      const res = await announce.send(grp.step.video_id, grp.sequence.audience || {}, {
        source: 'sequence',
        sequenceId: grp.sequence.id,
        stepId: grp.step.id,
        isMandatory: !!grp.step.is_mandatory,
        recipients: grp.recipients,          // the capped slice, already resolved
      });
      announcements++;
      for (let i = 0; i < grp.recipients.length; i++) {
        // ON CONFLICT DO NOTHING: the unique key is what makes re-runs and late joins safe.
        await query(
          `INSERT INTO video_sequence_sends (sequence_id, step_id, user_id, announcement_id, day_index, sent_on)
           VALUES ($1,$2,$3,$4,$5,$6::date)
           ON CONFLICT (sequence_id, step_id, user_id) DO NOTHING`,
          [grp.sequence.id, grp.step.id, grp.recipients[i].user_id, res.announcement_id, grp.indexes[i], day]);
        sent++;
      }
    } catch (e) {
      logger.error(`[videoSequence] step ${grp.step.id} failed: ${e.message}`);
    }
  }

  const summary = { date: day, due: due.length, sent, deferred: deferred.length, announcements, cap };
  logger.info(`[videoSequence] ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = { runDaily, collectDue, getConfig, localDateStr, ANCHOR_COLUMN };
