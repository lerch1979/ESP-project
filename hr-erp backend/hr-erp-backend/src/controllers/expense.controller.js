const expenseService = require('../services/expense.service');
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
 * POST /api/v1/expenses
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

    const result = await expenseService.create(req.body, req.user.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'accommodation_expense',
      entityId: result.data.id,
      action: 'create',
      metadata: {
        accommodation_id: req.body.accommodation_id,
        billing_month: req.body.billing_month,
        category: req.body.category,
        amount: req.body.amount,
      },
    });

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

module.exports = { getAll, getById, create, update, remove };
