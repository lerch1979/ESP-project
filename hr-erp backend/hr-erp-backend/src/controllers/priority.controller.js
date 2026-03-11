const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Összes prioritás lekérése
const getPriorities = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, color, created_at
       FROM priorities
       ORDER BY
         CASE slug
           WHEN 'critical' THEN 1
           WHEN 'urgent' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END`
    );

    res.json({
      success: true,
      data: {
        priorities: result.rows,
      },
    });
  } catch (error) {
    logger.error('Prioritások lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a prioritások lekérdezése során',
    });
  }
};

module.exports = {
  getPriorities,
};