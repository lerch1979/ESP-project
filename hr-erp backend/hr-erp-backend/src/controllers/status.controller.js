const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Összes státusz lekérése
const getStatuses = async (req, res) => {
  try {
    // color + is_final are needed by the admin status dropdown so each
    // option renders as a colored chip and the closed-state set can be
    // derived from the row itself (instead of a hard-coded slug list).
    // Sort by order_index so the dropdown follows the operator workflow
    // (new → in_progress → … → resolved → completed → …) rather than
    // alphabetical noise.
    const result = await pool.query(
      `SELECT id, name, slug, description, color, order_index, is_final, created_at
       FROM ticket_statuses
       ORDER BY order_index ASC, name ASC`
    );

    res.json({
      success: true,
      data: {
        statuses: result.rows,
      },
    });
  } catch (error) {
    logger.error('Státuszok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a státuszok lekérdezése során',
    });
  }
};

module.exports = {
  getStatuses,
};