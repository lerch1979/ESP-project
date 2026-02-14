const pool = require('../database/connection');

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
    console.error('Kategóriák lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a kategóriák lekérdezése során',
      error: error.message,
    });
  }
};

module.exports = {
  getCategories,
};