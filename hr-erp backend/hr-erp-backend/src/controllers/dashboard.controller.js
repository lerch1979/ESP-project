const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Dashboard összesített statisztikák
 */
const getDashboardStats = async (req, res) => {
  try {
    // Run all queries in parallel for performance
    const [
      ticketsByStatusResult,
      totalTicketsResult,
      urgentTicketsResult,
      contractorsResult,
      accommodationsByStatusResult,
      recentTicketsResult,
    ] = await Promise.all([
      // Tickets by status
      query(`
        SELECT
          ts.name as status_name,
          ts.slug as status_slug,
          ts.color as status_color,
          COUNT(t.id) as count
        FROM ticket_statuses ts
        LEFT JOIN tickets t ON t.status_id = ts.id
        GROUP BY ts.id, ts.name, ts.slug, ts.color, ts.order_index
        ORDER BY ts.order_index
      `),

      // Total tickets
      query('SELECT COUNT(*) as total FROM tickets'),

      // Urgent tickets (priority level >= 3)
      query(`
        SELECT COUNT(*) as count
        FROM tickets t
        JOIN priorities p ON t.priority_id = p.id
        WHERE p.level >= 3
          AND t.closed_at IS NULL
      `),

      // Contractors stats
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive
        FROM contractors
      `),

      // Accommodations by status
      query(`
        SELECT
          status,
          COUNT(*) as count
        FROM accommodations
        WHERE is_active = true
        GROUP BY status
      `),

      // Recent tickets (last 5)
      query(`
        SELECT
          t.id,
          t.ticket_number,
          t.title,
          t.created_at,
          ts.name as status_name,
          ts.slug as status_slug,
          ts.color as status_color,
          p.name as priority_name,
          p.slug as priority_slug,
          p.level as priority_level,
          p.color as priority_color,
          tc.name as category_name,
          creator.first_name || ' ' || creator.last_name as created_by_name,
          assignee.first_name || ' ' || assignee.last_name as assigned_to_name
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        LEFT JOIN users creator ON t.created_by = creator.id
        LEFT JOIN users assignee ON t.assigned_to = assignee.id
        ORDER BY t.created_at DESC
        LIMIT 5
      `),
    ]);

    // Calculate accommodation totals
    const accommodationStats = {};
    let totalAccommodations = 0;
    accommodationsByStatusResult.rows.forEach(row => {
      accommodationStats[row.status] = parseInt(row.count);
      totalAccommodations += parseInt(row.count);
    });

    const occupiedCount = accommodationStats.occupied || 0;
    const occupancyRate = totalAccommodations > 0
      ? Math.round((occupiedCount / totalAccommodations) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        tickets: {
          total: parseInt(totalTicketsResult.rows[0].total),
          urgent: parseInt(urgentTicketsResult.rows[0].count),
          byStatus: ticketsByStatusResult.rows.map(r => ({
            name: r.status_name,
            slug: r.status_slug,
            color: r.status_color,
            count: parseInt(r.count),
          })),
        },
        contractors: {
          total: parseInt(contractorsResult.rows[0].total),
          active: parseInt(contractorsResult.rows[0].active),
          inactive: parseInt(contractorsResult.rows[0].inactive),
        },
        accommodations: {
          total: totalAccommodations,
          available: accommodationStats.available || 0,
          occupied: occupiedCount,
          maintenance: accommodationStats.maintenance || 0,
          occupancyRate,
        },
        recentTickets: recentTicketsResult.rows,
      }
    });
  } catch (error) {
    logger.error('Dashboard statisztika hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Dashboard statisztika lekérési hiba'
    });
  }
};

module.exports = {
  getDashboardStats,
};
