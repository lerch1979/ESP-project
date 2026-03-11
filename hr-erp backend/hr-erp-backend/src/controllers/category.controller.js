const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Összes kategória lekérése
const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, icon, description, created_at
       FROM ticket_categories
       ORDER BY name ASC`
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