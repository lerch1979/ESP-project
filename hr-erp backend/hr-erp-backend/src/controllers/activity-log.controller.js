const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

const ACTION_LABELS = { create: 'Létrehozott', update: 'Módosított', delete: 'Törölt' };
const ENTITY_LABELS = { employee: 'Munkavállaló', accommodation: 'Szálláshely', contractor: 'Alvállalkozó', ticket: 'Hibajegy' };

/**
 * Build WHERE clause + params from query filters (shared by list and export)
 */
function buildFilterWhere({ entity_type, user_id, action, date_from, date_to, search }) {
  const whereConditions = [];
  const params = [];
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

  return { whereClause, params, paramIndex };
}

/**
 * GET /activity-log — List activity logs with pagination and filters
 */
const getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const { whereClause, params, paramIndex } = buildFilterWhere(req.query);

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
    const paginatedParams = [...params, parseInt(limit), parseInt(offset)];

    const result = await query(logsQuery, paginatedParams);

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

/**
 * GET /activity-log/export — Export activity logs as Excel
 */
const exportLogs = async (req, res) => {
  try {
    const { whereClause, params } = buildFilterWhere(req.query);

    const logsQuery = `
      SELECT
        al.action, al.entity_type, al.changes, al.metadata,
        al.ip_address, al.created_at,
        COALESCE(u.last_name || ' ' || u.first_name, 'Rendszer') as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
    `;

    const result = await query(logsQuery, params);

    const data = result.rows.map((row) => {
      const metadata = row.metadata || {};
      const changes = row.changes || {};

      // Build human-readable changes summary
      let changesSummary = '';
      if (row.action === 'update' && Object.keys(changes).length > 0) {
        changesSummary = Object.entries(changes)
          .map(([field, vals]) => {
            const oldVal = vals.old !== null && vals.old !== undefined ? String(vals.old) : '-';
            const newVal = vals.new !== null && vals.new !== undefined ? String(vals.new) : '-';
            return `${field}: ${oldVal} → ${newVal}`;
          })
          .join('; ');
      } else if (row.action === 'create' || row.action === 'delete') {
        changesSummary = Object.entries(metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }

      return {
        'Időpont': new Date(row.created_at).toLocaleString('hu-HU'),
        'Felhasználó': row.user_name,
        'Művelet': ACTION_LABELS[row.action] || row.action,
        'Típus': ENTITY_LABELS[row.entity_type] || row.entity_type,
        'Entitás': metadata.name || metadata.employee_number || '-',
        'Változások': changesSummary,
        'IP cím': row.ip_address || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tevékenységnapló');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=tevekenyseggnaplo_${dateStr}.xlsx`);
    res.send(buffer);
  } catch (error) {
    logger.error('Activity log export hiba:', error);
    res.status(500).json({ success: false, message: 'Tevékenységnapló export hiba' });
  }
};

module.exports = { getLogs, getLogDetail, exportLogs };
