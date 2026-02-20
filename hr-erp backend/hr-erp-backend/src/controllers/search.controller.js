const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Globalis kereses munkavallalok, hibajegyek, szallashelyek, alvallalkozok kozott
 */
const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        data: { employees: [], tickets: [], accommodations: [], contractors: [] }
      });
    }

    const searchTerm = `%${q.trim()}%`;

    const [employeesResult, ticketsResult, accommodationsResult, contractorsResult] = await Promise.all([
      query(
        `SELECT e.id,
                COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS name,
                e.employee_number
         FROM employees e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.end_date IS NULL
           AND (COALESCE(e.first_name, '') ILIKE $1
                OR COALESCE(e.last_name, '') ILIKE $1
                OR COALESCE(u.email, '') ILIKE $1
                OR COALESCE(e.employee_number, '') ILIKE $1)
         ORDER BY e.created_at DESC
         LIMIT 5`,
        [searchTerm]
      ),
      query(
        `SELECT t.id, t.title, t.ticket_number
         FROM tickets t
         WHERE t.title ILIKE $1
            OR t.description ILIKE $1
            OR t.ticket_number ILIKE $1
         ORDER BY t.created_at DESC
         LIMIT 5`,
        [searchTerm]
      ),
      query(
        `SELECT a.id, a.name
         FROM accommodations a
         WHERE a.is_active = true
           AND (a.name ILIKE $1 OR a.address ILIKE $1)
         ORDER BY a.created_at DESC
         LIMIT 5`,
        [searchTerm]
      ),
      query(
        `SELECT c.id, c.name
         FROM contractors c
         WHERE c.name ILIKE $1 OR c.email ILIKE $1
         ORDER BY c.created_at DESC
         LIMIT 5`,
        [searchTerm]
      ),
    ]);

    res.json({
      success: true,
      data: {
        employees: employeesResult.rows,
        tickets: ticketsResult.rows,
        accommodations: accommodationsResult.rows,
        contractors: contractorsResult.rows,
      }
    });
  } catch (error) {
    logger.error('Globalis keresesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Keresesi hiba tortent'
    });
  }
};

module.exports = {
  globalSearch,
};
