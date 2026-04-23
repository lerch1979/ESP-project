const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Ticket category list. Defaults to active-only + ordered by curated
// sort_order (falling back to name when sort_order is 0).
const getCategories = async (req, res) => {
  try {
    const includeInactive = req.query.active === 'false';
    const where = includeInactive ? '' : 'WHERE is_active = TRUE';
    const result = await pool.query(
      `SELECT id, name, slug, icon, color, description, sort_order, is_active, created_at
         FROM ticket_categories
         ${where}
         ORDER BY sort_order ASC, name ASC`
    );

    res.json({
      success: true,
      data: {
        categories: result.rows,
      },
    });
  } catch (error) {
    logger.error('Kategóriák lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a kategóriák lekérdezése során',
    });
  }
};

module.exports = {
  getCategories,
};