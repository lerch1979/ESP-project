/**
 * Room Consolidation Suggestion Engine — HTTP layer.
 * The engine only PROPOSES; applying requires an explicit human approval action.
 */
const { logger } = require('../utils/logger');
const engine = require('../services/consolidationEngine.service');
const { query } = require('../database/connection');

// POST /consolidation/run — generate a fresh set of suggestions (read-only; moves nobody).
const runEngine = async (req, res) => {
  try {
    const result = await engine.generateRun(req.user?.id || null);
    if (result.skipped) return res.status(409).json({ success: false, message: 'A konszolidációs motor ki van kapcsolva.' });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Consolidation run error:', error);
    res.status(500).json({ success: false, message: 'A konszolidációs futtatás sikertelen.' });
  }
};

// GET /consolidation/runs — recent runs (summaries).
const listRuns = async (req, res) => {
  try {
    res.json({ success: true, data: await engine.listRuns(20) });
  } catch (error) {
    logger.error('Consolidation listRuns error:', error);
    res.status(500).json({ success: false, message: 'Futtatások lekérési hiba' });
  }
};

// GET /consolidation/runs/:id — run summary + its suggestions.
const getRun = async (req, res) => {
  try {
    const run = await engine.getRun(req.params.id);
    if (!run) return res.status(404).json({ success: false, message: 'Futtatás nem található' });
    const suggestions = await engine.getSuggestions(req.params.id);
    res.json({ success: true, data: { run, suggestions } });
  } catch (error) {
    logger.error('Consolidation getRun error:', error);
    res.status(500).json({ success: false, message: 'Futtatás lekérési hiba' });
  }
};

// POST /consolidation/runs/:id/apply — approve + APPLY the moves atomically.
// body.accommodation_id (optional) → apply only that site's plan; else the whole run.
const apply = async (req, res) => {
  try {
    const result = await engine.applyGroup(req.params.id, req.body?.accommodation_id || null, req.user?.id || null);
    if (!result.ok) {
      const code = result.error === 'nothing_pending' ? 409 : 422;
      return res.status(code).json({ success: false, message: result.reason || 'Nincs alkalmazható javaslat.', error: result.error });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Consolidation apply error:', error);
    res.status(500).json({ success: false, message: 'Alkalmazási hiba' });
  }
};

// POST /consolidation/suggestions/:id/reject — archive one move with a reason.
const reject = async (req, res) => {
  try {
    const result = await engine.rejectSuggestion(req.params.id, req.user?.id || null, req.body?.reason || null);
    if (!result.ok) return res.status(409).json({ success: false, message: 'A javaslat már nem függőben van.' });
    res.json({ success: true });
  } catch (error) {
    logger.error('Consolidation reject error:', error);
    res.status(500).json({ success: false, message: 'Elutasítási hiba' });
  }
};

// GET /consolidation/config — weights + shift matrix (for the tuning UI).
const getConfig = async (req, res) => {
  try {
    res.json({ success: true, data: await engine.getConfig() });
  } catch (error) {
    logger.error('Consolidation getConfig error:', error);
    res.status(500).json({ success: false, message: 'Konfiguráció lekérési hiba' });
  }
};

// PUT /consolidation/config — tune weights / enable flag (read fresh on the next run).
const updateConfig = async (req, res) => {
  try {
    const { weight_freed_rooms, weight_min_moves, weight_underutilized, is_enabled, shift_compatibility } = req.body || {};
    const r = await query(
      `UPDATE consolidation_config SET
         weight_freed_rooms   = COALESCE($1, weight_freed_rooms),
         weight_min_moves     = COALESCE($2, weight_min_moves),
         weight_underutilized = COALESCE($3, weight_underutilized),
         is_enabled           = COALESCE($4, is_enabled),
         shift_compatibility  = COALESCE($5, shift_compatibility),
         updated_by = $6, updated_at = NOW()
       WHERE id = (SELECT id FROM consolidation_config ORDER BY created_at ASC LIMIT 1)
       RETURNING *`,
      [weight_freed_rooms ?? null, weight_min_moves ?? null, weight_underutilized ?? null,
       is_enabled ?? null, shift_compatibility ? JSON.stringify(shift_compatibility) : null, req.user?.id || null]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (error) {
    logger.error('Consolidation updateConfig error:', error);
    res.status(500).json({ success: false, message: 'Konfiguráció mentési hiba' });
  }
};

module.exports = { runEngine, listRuns, getRun, apply, reject, getConfig, updateConfig };
