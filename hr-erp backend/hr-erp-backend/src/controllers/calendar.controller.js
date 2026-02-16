const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Naptár események lekérése
 * GET /api/v1/calendar/events
 * Query params: event_type, month, year, date_from, date_to
 */
const getCalendarEvents = async (req, res) => {
  try {
    const { event_type, month, year, date_from, date_to } = req.query;

    // 1. Compute date range
    let dateFrom, dateTo;
    if (date_from && date_to) {
      dateFrom = date_from;
      dateTo = date_to;
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    } else {
      const now = new Date();
      dateFrom = now.toISOString().split('T')[0];
      const future = new Date(now);
      future.setMonth(future.getMonth() + 3);
      dateTo = future.toISOString().split('T')[0];
    }

    // 2. Parse event types
    const allTypes = ['checkin', 'checkout', 'visa_expiry', 'contract_expiry', 'ticket_deadline'];
    const selectedTypes = event_type
      ? event_type.split(',').filter(t => allTypes.includes(t.trim()))
      : allTypes;

    if (selectedTypes.length === 0) {
      return res.json({
        success: true,
        data: { events: [], summary: {}, dateRange: { from: dateFrom, to: dateTo } },
      });
    }

    // 3. Build UNION ALL SQL
    const subQueries = [];

    if (selectedTypes.includes('checkin')) {
      subQueries.push(`
        SELECT
          e.arrival_date AS event_date,
          'checkin' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Érkezés / Check-in' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.arrival_date BETWEEN $1 AND $2
      `);
    }

    if (selectedTypes.includes('checkout')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'checkout' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Távozás / Check-out' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.end_date BETWEEN $1 AND $2
          AND e.end_date < CURRENT_DATE
      `);
    }

    if (selectedTypes.includes('visa_expiry')) {
      subQueries.push(`
        SELECT
          e.visa_expiry AS event_date,
          'visa_expiry' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Vízum lejárat' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.visa_expiry BETWEEN $1 AND $2
          AND e.end_date IS NULL
      `);
    }

    if (selectedTypes.includes('contract_expiry')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'contract_expiry' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Szerződés lejárat' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.end_date BETWEEN $1 AND $2
          AND e.end_date >= CURRENT_DATE
      `);
    }

    if (selectedTypes.includes('ticket_deadline')) {
      subQueries.push(`
        SELECT
          t.due_date AS event_date,
          'ticket_deadline' AS type,
          t.title AS title,
          'Hibajegy határidő (#' || t.ticket_number || ')' AS description,
          t.id AS related_entity_id,
          'ticket' AS related_entity_type
        FROM tickets t
        WHERE t.due_date BETWEEN $1 AND $2
          AND t.closed_at IS NULL
      `);
    }

    if (subQueries.length === 0) {
      return res.json({
        success: true,
        data: { events: [], summary: {}, dateRange: { from: dateFrom, to: dateTo } },
      });
    }

    const sql = subQueries.join('\nUNION ALL\n') + '\nORDER BY event_date ASC';
    const result = await query(sql, [dateFrom, dateTo]);

    // 4. Post-process: urgency + days_until
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events = result.rows.map(row => {
      const eventDate = new Date(row.event_date);
      eventDate.setHours(0, 0, 0, 0);
      const diffMs = eventDate.getTime() - now.getTime();
      const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

      let urgency;
      if (daysUntil < 0) {
        urgency = 'past';
      } else if (daysUntil < 7) {
        urgency = 'critical';
      } else if (daysUntil < 30) {
        urgency = 'warning';
      } else {
        urgency = 'normal';
      }

      return {
        ...row,
        event_date: row.event_date ? new Date(row.event_date).toISOString().split('T')[0] : null,
        days_until: daysUntil,
        urgency,
      };
    });

    // 5. Summary counts
    const summary = {
      checkin: 0,
      checkout: 0,
      visa_expiry: 0,
      contract_expiry: 0,
      ticket_deadline: 0,
      critical: 0,
      warning: 0,
      total: events.length,
    };

    events.forEach(ev => {
      if (summary[ev.type] !== undefined) {
        summary[ev.type]++;
      }
      if (ev.urgency === 'critical') summary.critical++;
      if (ev.urgency === 'warning') summary.warning++;
    });

    res.json({
      success: true,
      data: {
        events,
        summary,
        dateRange: { from: dateFrom, to: dateTo },
      },
    });
  } catch (error) {
    logger.error('Naptár események lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Naptár események lekérési hiba',
    });
  }
};

module.exports = {
  getCalendarEvents,
};
