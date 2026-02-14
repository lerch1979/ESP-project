const pool = require('../database/connection');

// Összes státusz lekérése
const getStatuses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description, created_at
       FROM ticket_statuses
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: {
        statuses: result.rows,
      },
    });
  } catch (error) {
    console.error('Státuszok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a státuszok lekérdezése során',
      error: error.message,
    });
  }
};

module.exports = {
  getStatuses,
};