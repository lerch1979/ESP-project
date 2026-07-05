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

// GET /consolidation/runs/:id — run summary + its suggestions + plan lifecycle rows.
const getRun = async (req, res) => {
  try {
    const run = await engine.getRun(req.params.id);
    if (!run) return res.status(404).json({ success: false, message: 'Futtatás nem található' });
    const [suggestions, plans] = await Promise.all([
      engine.getSuggestions(req.params.id),
      engine.getPlans(req.params.id),
    ]);
    res.json({ success: true, data: { run, suggestions, plans } });
  } catch (error) {
    logger.error('Consolidation getRun error:', error);
    res.status(500).json({ success: false, message: 'Futtatás lekérési hiba' });
  }
};

// POST /consolidation/runs/:id/approve — approve a plan → create a move TICKET,
// no room changes. body: { plan_key, assignee_user_id, due_date }.
const approve = async (req, res) => {
  try {
    const { plan_key, assignee_user_id, due_date } = req.body || {};
    if (!plan_key) return res.status(400).json({ success: false, message: 'plan_key kötelező.' });
    const result = await engine.approvePlan(req.params.id, plan_key, {
      assigneeUserId: assignee_user_id || null,
      dueDate: due_date || null,
      reviewedBy: req.user?.id || null,
      contractorId: req.user?.contractorId || null,
    });
    if (!result.ok) {
      const code = result.error === 'nothing_pending' ? 409 : result.error === 'already_approved' ? 409 : 422;
      return res.status(code).json({ success: false, error: result.error, message: result.reason || 'A terv nem hagyható jóvá.' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Consolidation approve error:', error);
    res.status(500).json({ success: false, message: 'Jóváhagyási hiba' });
  }
};

// POST /consolidation/runs/:id/confirm — confirm the physical move → apply the
// checked moves atomically. body: { plan_key, decisions:[{suggestion_id,done,reason}] }.
const confirm = async (req, res) => {
  try {
    const { plan_key, decisions } = req.body || {};
    if (!plan_key) return res.status(400).json({ success: false, message: 'plan_key kötelező.' });
    const result = await engine.confirmMove(req.params.id, plan_key, {
      decisions: Array.isArray(decisions) ? decisions : [],
      reviewedBy: req.user?.id || null,
    });
    if (!result.ok) {
      const code = result.error === 'conflict' ? 409 : result.error === 'invalid' ? 422 : 400;
      return res.status(code).json({ success: false, error: result.error, conflicts: result.conflicts, message: result.reason || 'A költözés nem erősíthető meg.' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Consolidation confirm error:', error);
    res.status(500).json({ success: false, message: 'Megerősítési hiba' });
  }
};

// POST /consolidation/runs/:id/cancel — cancel an approved-pending plan (close
// ticket, no changes). body: { plan_key }.
const cancel = async (req, res) => {
  try {
    const { plan_key } = req.body || {};
    if (!plan_key) return res.status(400).json({ success: false, message: 'plan_key kötelező.' });
    const result = await engine.cancelPlan(req.params.id, plan_key, req.user?.id || null);
    if (!result.ok) return res.status(409).json({ success: false, error: result.error, message: 'A terv nem vonható vissza.' });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Consolidation cancel error:', error);
    res.status(500).json({ success: false, message: 'Visszavonási hiba' });
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

// GET /consolidation/workplaces — distinct employee workplaces (for the
// accommodation workplace-binding editor).
const listWorkplaces = async (req, res) => {
  try {
    res.json({ success: true, data: await engine.listWorkplaces() });
  } catch (error) {
    logger.error('Consolidation listWorkplaces error:', error);
    res.status(500).json({ success: false, message: 'Munkahelyek lekérési hiba' });
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

module.exports = { runEngine, listRuns, getRun, approve, confirm, cancel, reject, getConfig, updateConfig, listWorkplaces };
