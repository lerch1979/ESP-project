const expenseService = require('../services/expense.service');
const dedupService = require('../services/expenseDeduplication.service');
const { validateCreate, validateUpdate } = require('../models/expense.model');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

/**
 * GET /api/v1/expenses
 */
const getAll = async (req, res) => {
  try {
    const result = await expenseService.getAll(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Költségek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Költségek lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/expenses/:id
 */
const getById = async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Költség nem található' });
    }
    res.json({ success: true, data: { expense } });
  } catch (error) {
    logger.error('Költség lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség lekérdezési hiba' });
  }
};

/**
 * POST /api/v1/expenses[?force=true]
 *
 * Default flow: runs the deduplication check first. If isDuplicate=true
 * (exact fingerprint match OR fuzzy ≥ 90% similarity within ±1 HUF / ±3
 * days), returns 409 with the match data so the UI can warn the user.
 *
 * Override flow: `?force=true` skips the dedup gate. The override is
 * audited via activityLogger with the IDs that were ignored and the
 * optional `override_note` from the request body.
 */
const create = async (req, res) => {
  try {
    const validation = validateCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const force = req.query.force === 'true' || req.query.force === '1';

    // Dedup gate (unless forced)
    let dupCheck = null;
    if (!force) {
      dupCheck = await dedupService.checkDuplicates({
        vendor_name:      req.body.vendor_name,
        amount:           req.body.amount,
        performance_date: req.body.performance_date,
      });
      if (dupCheck.isDuplicate) {
        return res.status(409).json({
          success: false,
          message: 'Lehetséges duplikátum észlelve. A rögzítéshez force=true szükséges.',
          duplicate_check: dupCheck,
        });
      }
    }

    const result = await expenseService.create(req.body, req.user.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    // Audit normal create
    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: result.data.id,
      action: 'create',
      metadata: {
        accommodation_id: req.body.accommodation_id,
        billing_month: result.data.billing_month,
        category: req.body.category,
        amount: req.body.amount,
        source: result.data.source,
      },
    });

    // Audit dedup override separately so the decision is queryable
    if (force) {
      const overrideCheck = await dedupService.checkDuplicates(
        {
          vendor_name:      req.body.vendor_name,
          amount:           req.body.amount,
          performance_date: req.body.performance_date,
        },
        result.data.id, // exclude the row we just created
      );
      if (overrideCheck.exactMatches.length > 0 || overrideCheck.fuzzyMatches.length > 0) {
        await logActivity({
          userId: req.user.id,
          entityType: 'accommodation_expense',
          entityId: result.data.id,
          action: 'dedup_override',
          metadata: {
            exact_match_ids: overrideCheck.exactMatches.map((m) => m.id),
            fuzzy_match_ids: overrideCheck.fuzzyMatches.map((m) => ({
              id: m.id, similarity_pct: m.similarity_pct,
            })),
            override_note: req.body.override_note || null,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Költség rögzítve',
      data: { expense: result.data },
    });
  } catch (error) {
    logger.error('Költség rögzítési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség rögzítési hiba' });
  }
};

/**
 * POST /api/v1/expenses/check-duplicates
 *
 * Standalone preview — UI can call this before submitting to surface
 * warnings proactively. No side effects, no persistence.
 *
 * Body: { vendor_name, amount, performance_date, exclude_id? }
 */
const checkDuplicates = async (req, res) => {
  try {
    const result = await dedupService.checkDuplicates(
      {
        vendor_name:      req.body.vendor_name,
        amount:           req.body.amount,
        performance_date: req.body.performance_date,
      },
      req.body.exclude_id || null,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Duplikátum ellenőrzési hiba:', error);
    res.status(500).json({ success: false, message: 'Duplikátum ellenőrzési hiba' });
  }
};

/**
 * PUT /api/v1/expenses/:id
 */
const update = async (req, res) => {
  try {
    const validation = validateUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const result = await expenseService.update(req.params.id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: req.params.id,
      action: 'update',
      metadata: {
        accommodation_id: result.data.accommodation_id,
        billing_month: result.data.billing_month,
      },
    });

    res.json({
      success: true,
      message: 'Költség frissítve',
      data: { expense: result.data },
    });
  } catch (error) {
    logger.error('Költség frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség frissítési hiba' });
  }
};

/**
 * DELETE /api/v1/expenses/:id
 */
const remove = async (req, res) => {
  try {
    const result = await expenseService.delete(req.params.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: req.params.id,
      action: 'delete',
      metadata: {
        accommodation_id: result.data.accommodation_id,
        billing_month: result.data.billing_month,
        amount: result.data.amount,
      },
    });

    res.json({ success: true, message: 'Költség törölve' });
  } catch (error) {
    logger.error('Költség törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Költség törlési hiba' });
  }
};

module.exports = { getAll, getById, create, update, remove, checkDuplicates };
