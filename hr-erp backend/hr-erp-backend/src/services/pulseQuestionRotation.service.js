/**
 * Pulse Question Rotation Service
 * Smart selection: core questions always + rotating questions from pool.
 * 7-day no-repeat rule, category diversity, priority-weighted selection.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const LANG_FIELDS = { hu: 'question_hu', en: 'question_en', tl: 'question_tl', uk: 'question_uk', de: 'question_de' };

async function getDailyQuestions(userId, language = 'hu') {
  try {
    // 1. Core questions (always shown)
    const coreResult = await query(
      `SELECT * FROM pulse_question_library WHERE is_core = TRUE AND is_active = TRUE ORDER BY priority`
    );

    // 2. Get IDs shown in last 7 days (exclude from rotation)
    const historyResult = await query(
      `SELECT DISTINCT question_id FROM pulse_question_history
       WHERE user_id = $1 AND shown_at >= NOW() - INTERVAL '7 days'`,
      [userId]
    );
    const recentIds = historyResult.rows.map(r => r.question_id);

    // 3. Get rotation candidates (not core, not recently shown)
    let candidateSQL = `SELECT * FROM pulse_question_library WHERE is_core = FALSE AND is_active = TRUE`;
    const params = [];
    if (recentIds.length > 0) {
      candidateSQL += ` AND id NOT IN (${recentIds.map((_, i) => `$${i + 1}`).join(',')})`;
      params.push(...recentIds);
    }
    candidateSQL += ` ORDER BY priority ASC`;
    const candidateResult = await query(candidateSQL, params);

    // 4. Select 2 rotating questions (different categories)
    const rotating = selectWeightedRandom(candidateResult.rows, 2);

    // 5. Combine
    const allQuestions = [...coreResult.rows, ...rotating];

    // 6. Record shown
    for (const q of allQuestions) {
      await query(
        `INSERT INTO pulse_question_history (user_id, question_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, q.id]
      ).catch(() => {});
    }

    // 7. Format for response
    return allQuestions.map(q => formatQuestion(q, language));

  } catch (error) {
    logger.error('Error getting daily questions:', error.message);
    // Fallback: return just core questions
    try {
      const core = await query(`SELECT * FROM pulse_question_library WHERE is_core = TRUE AND is_active = TRUE`);
      return core.rows.map(q => formatQuestion(q, language));
    } catch { return []; }
  }
}

function selectWeightedRandom(candidates, maxCount) {
  if (candidates.length === 0) return [];
  const selected = [];
  const usedCategories = new Set();
  const remaining = [...candidates];

  for (let i = 0; i < maxCount && remaining.length > 0; i++) {
    // Filter for category diversity
    const available = remaining.filter(q => !usedCategories.has(q.category));
    if (available.length === 0) break;

    // Weighted random (lower priority number = higher weight)
    const totalWeight = available.reduce((sum, q) => sum + (101 - q.priority), 0);
    let rand = Math.random() * totalWeight;
    let pick = available[0];

    for (const q of available) {
      rand -= (101 - q.priority);
      if (rand <= 0) { pick = q; break; }
    }

    selected.push(pick);
    usedCategories.add(pick.category);
    const idx = remaining.findIndex(q => q.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  return selected;
}

function formatQuestion(q, language) {
  const field = LANG_FIELDS[language] || LANG_FIELDS.hu;
  return {
    id: q.id,
    code: q.question_code,
    category: q.category,
    question: q[field] || q.question_hu,
    scale_type: q.scale_type,
    scale_min: q.scale_min,
    scale_max: q.scale_max,
    scale_labels: q[`scale_labels_${language}`] || q.scale_labels_hu,
    requires_text: q.requires_text,
    is_core: q.is_core,
  };
}

async function markAnswered(userId, questionIds) {
  if (!questionIds || questionIds.length === 0) return;
  const placeholders = questionIds.map((_, i) => `$${i + 2}`).join(',');
  await query(
    `UPDATE pulse_question_history SET answered = TRUE
     WHERE user_id = $1 AND question_id IN (${placeholders})
       AND shown_at >= CURRENT_DATE`,
    [userId, ...questionIds]
  ).catch(err => logger.warn('Mark answered error:', err.message));
}

module.exports = { getDailyQuestions, markAnswered, formatQuestion };
