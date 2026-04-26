const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Ticket category list. Defaults to active-only, ordered by curated
// sort_order. Returns hierarchy info: every row carries parent_id +
// parent_slug + parent_name; the response also exposes a `tree` array
// for clients that want a ready-made parents → children structure.
const getCategories = async (req, res) => {
  try {
    const includeInactive = req.query.active === 'false';
    const where = includeInactive ? '' : 'WHERE c.is_active = TRUE';
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.icon, c.color, c.description, c.sort_order,
              c.is_active, c.parent_id, c.default_specialization, c.created_at,
              p.slug AS parent_slug, p.name AS parent_name, p.icon AS parent_icon
         FROM ticket_categories c
         LEFT JOIN ticket_categories p ON c.parent_id = p.id
         ${where}
         ORDER BY c.sort_order ASC, c.name ASC`
    );

    // Build a 2-level tree: parents (parent_id IS NULL) carry their children.
    const byId = new Map();
    for (const row of result.rows) byId.set(row.id, { ...row, children: [] });
    const tree = [];
    for (const row of result.rows) {
      if (row.parent_id && byId.has(row.parent_id)) {
        byId.get(row.parent_id).children.push(byId.get(row.id));
      } else if (!row.parent_id) {
        tree.push(byId.get(row.id));
      }
    }

    res.json({
      success: true,
      data: {
        categories: result.rows, // flat list (back-compat)
        tree,                    // hierarchical list (new)
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