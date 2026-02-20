const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * GET /activity-log — List activity logs with pagination and filters
 */
const getLogs = async (req, res) => {
  try {
    const { entity_type, user_id, action, date_from, date_to, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (entity_type) {
      whereConditions.push(`al.entity_type = $${paramIndex}`);
      params.push(entity_type);
      paramIndex++;
    }

    if (user_id) {
      whereConditions.push(`al.user_id = $${paramIndex}`);
      params.push(user_id);
      paramIndex++;
    }

    if (action) {
      whereConditions.push(`al.action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`al.created_at >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`al.created_at <= ($${paramIndex}::date + INTERVAL '1 day')`);
      params.push(date_to);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`al.metadata::text ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) as total FROM activity_logs al ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const logsQuery = `
      SELECT
        al.id, al.entity_type, al.entity_id, al.action, al.changes, al.metadata,
        al.ip_address, al.created_at,
        COALESCE(u.last_name || ' ' || u.first_name, 'Rendszer') as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(logsQuery, params);

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Activity log lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Tevékenységnapló lekérési hiba' });
  }
};

/**
 * GET /activity-log/:id — Single log detail
 */
const getLogDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        al.*,
        COALESCE(u.last_name || ' ' || u.first_name, 'Rendszer') as user_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Napló bejegyzés nem található' });
    }

    res.json({ success: true, data: { log: result.rows[0] } });
  } catch (error) {
    logger.error('Activity log detail hiba:', error);
    res.status(500).json({ success: false, message: 'Napló bejegyzés lekérési hiba' });
  }
};

module.exports = { getLogs, getLogDetail };
