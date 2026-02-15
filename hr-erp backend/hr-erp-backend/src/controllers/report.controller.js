const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Munkavállalók riport összesítés
 * GET /api/v1/reports/employees-summary
 */
const getEmployeesSummary = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const params = [];
    if (from_date) {
      params.push(from_date);
      dateFilter += ` AND e.start_date >= $${params.length}`;
    }
    if (to_date) {
      params.push(to_date);
      dateFilter += ` AND e.start_date <= $${params.length}`;
    }

    const [
      totalsResult,
      byWorkplaceResult,
      visaExpiringResult,
      newThisMonthResult,
      genderResult,
      byStatusResult,
    ] = await Promise.all([
      // Total, active, inactive
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE e.end_date IS NULL) as active,
          COUNT(*) FILTER (WHERE e.end_date IS NOT NULL) as inactive
        FROM employees e
        WHERE 1=1 ${dateFilter}
      `, params),

      // By workplace
      query(`
        SELECT
          COALESCE(e.workplace, 'Nincs megadva') as workplace,
          COUNT(*) as count
        FROM employees e
        WHERE 1=1 ${dateFilter}
        GROUP BY e.workplace
        ORDER BY count DESC
      `, params),

      // Visa expiring within 30 days
      query(`
        SELECT COUNT(*) as count
        FROM employees e
        WHERE e.visa_expiry BETWEEN NOW() AND NOW() + INTERVAL '30 days'
          AND e.end_date IS NULL
      `),

      // New this month
      query(`
        SELECT COUNT(*) as count
        FROM employees e
        WHERE e.start_date >= date_trunc('month', CURRENT_DATE)
      `),

      // Gender distribution
      query(`
        SELECT
          COALESCE(e.gender, 'unknown') as gender,
          COUNT(*) as count
        FROM employees e
        WHERE 1=1 ${dateFilter}
        GROUP BY e.gender
        ORDER BY count DESC
      `, params),

      // By status
      query(`
        SELECT
          COALESCE(est.name, 'Nincs státusz') as status_name,
          est.color,
          COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE 1=1 ${dateFilter}
        GROUP BY est.name, est.color
        ORDER BY count DESC
      `, params),
    ]);

    const genderLabels = { male: 'Férfi', female: 'Nő', other: 'Egyéb', unknown: 'Nincs megadva' };

    res.json({
      success: true,
      data: {
        total: parseInt(totalsResult.rows[0].total),
        active: parseInt(totalsResult.rows[0].active),
        inactive: parseInt(totalsResult.rows[0].inactive),
        visaExpiring30d: parseInt(visaExpiringResult.rows[0].count),
        newThisMonth: parseInt(newThisMonthResult.rows[0].count),
        byWorkplace: byWorkplaceResult.rows.map(r => ({
          workplace: r.workplace,
          count: parseInt(r.count),
        })),
        byGender: genderResult.rows.map(r => ({
          gender: genderLabels[r.gender] || r.gender,
          count: parseInt(r.count),
        })),
        byStatus: byStatusResult.rows.map(r => ({
          status: r.status_name,
          color: r.color,
          count: parseInt(r.count),
        })),
      },
    });
  } catch (error) {
    logger.error('Munkavállalók riport hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállalók riport lekérési hiba',
    });
  }
};

/**
 * Szálláshelyek riport összesítés
 * GET /api/v1/reports/accommodations-summary
 */
const getAccommodationsSummary = async (req, res) => {
  try {
    const [
      totalsResult,
      byStatusResult,
      byTypeResult,
      capacityResult,
    ] = await Promise.all([
      // Total accommodations
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'available') as available,
          COUNT(*) FILTER (WHERE status = 'occupied') as occupied,
          COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance
        FROM accommodations
        WHERE is_active = true
      `),

      // By status for chart
      query(`
        SELECT status, COUNT(*) as count
        FROM accommodations
        WHERE is_active = true
        GROUP BY status
        ORDER BY count DESC
      `),

      // By type
      query(`
        SELECT type, COUNT(*) as count
        FROM accommodations
        WHERE is_active = true
        GROUP BY type
        ORDER BY count DESC
      `),

      // Total capacity vs current occupancy (count of employees assigned)
      query(`
        SELECT
          COALESCE(SUM(a.capacity), 0) as total_capacity,
          COUNT(DISTINCT e.id) as current_occupants
        FROM accommodations a
        LEFT JOIN employees e ON e.accommodation_id = a.id AND e.end_date IS NULL
        WHERE a.is_active = true
      `),
    ]);

    const total = parseInt(totalsResult.rows[0].total);
    const occupied = parseInt(totalsResult.rows[0].occupied);
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const statusLabels = { available: 'Szabad', occupied: 'Foglalt', maintenance: 'Karbantartás' };
    const typeLabels = { studio: 'Stúdió', '1br': '1 szobás', '2br': '2 szobás', '3br': '3 szobás', dormitory: 'Kollégium' };

    res.json({
      success: true,
      data: {
        total,
        available: parseInt(totalsResult.rows[0].available),
        occupied,
        maintenance: parseInt(totalsResult.rows[0].maintenance),
        occupancyRate,
        totalCapacity: parseInt(capacityResult.rows[0].total_capacity),
        currentOccupants: parseInt(capacityResult.rows[0].current_occupants),
        byStatus: byStatusResult.rows.map(r => ({
          status: statusLabels[r.status] || r.status,
          count: parseInt(r.count),
        })),
        byType: byTypeResult.rows.map(r => ({
          type: typeLabels[r.type] || r.type,
          count: parseInt(r.count),
        })),
      },
    });
  } catch (error) {
    logger.error('Szálláshelyek riport hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshelyek riport lekérési hiba',
    });
  }
};

/**
 * Hibajegyek riport összesítés
 * GET /api/v1/reports/tickets-summary
 */
const getTicketsSummary = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const params = [];
    if (from_date) {
      params.push(from_date);
      dateFilter += ` AND t.created_at >= $${params.length}`;
    }
    if (to_date) {
      params.push(to_date);
      dateFilter += ` AND t.created_at <= $${params.length}::date + INTERVAL '1 day'`;
    }

    const [
      totalResult,
      byStatusResult,
      byCategoryResult,
      byPriorityResult,
      avgResolutionResult,
      monthlyTrendResult,
    ] = await Promise.all([
      // Total
      query(`
        SELECT COUNT(*) as total
        FROM tickets t
        WHERE 1=1 ${dateFilter}
      `, params),

      // By status
      query(`
        SELECT
          ts.name as status_name,
          ts.slug,
          ts.color,
          COUNT(t.id) as count
        FROM ticket_statuses ts
        LEFT JOIN tickets t ON t.status_id = ts.id ${dateFilter ? 'AND' + dateFilter.replace(/AND/i, '') : ''}
        GROUP BY ts.id, ts.name, ts.slug, ts.color, ts.order_index
        ORDER BY ts.order_index
      `, params),

      // By category
      query(`
        SELECT
          COALESCE(tc.name, 'Nincs kategória') as category_name,
          COUNT(*) as count
        FROM tickets t
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        WHERE 1=1 ${dateFilter}
        GROUP BY tc.name
        ORDER BY count DESC
      `, params),

      // By priority
      query(`
        SELECT
          p.name as priority_name,
          p.slug,
          p.color,
          p.level,
          COUNT(t.id) as count
        FROM priorities p
        LEFT JOIN tickets t ON t.priority_id = p.id ${dateFilter ? 'AND' + dateFilter.replace(/AND/i, '') : ''}
        GROUP BY p.id, p.name, p.slug, p.color, p.level
        ORDER BY p.level
      `, params),

      // Average resolution time (hours)
      query(`
        SELECT
          COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1),
            0
          ) as avg_hours
        FROM tickets t
        WHERE t.resolved_at IS NOT NULL ${dateFilter}
      `, params),

      // Monthly trend (last 6 months)
      query(`
        SELECT
          to_char(date_trunc('month', t.created_at), 'YYYY-MM') as month,
          to_char(date_trunc('month', t.created_at), 'TMMonth') as month_name,
          COUNT(*) as count
        FROM tickets t
        WHERE t.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY date_trunc('month', t.created_at)
        ORDER BY date_trunc('month', t.created_at)
      `),
    ]);

    res.json({
      success: true,
      data: {
        total: parseInt(totalResult.rows[0].total),
        byStatus: byStatusResult.rows.map(r => ({
          name: r.status_name,
          slug: r.slug,
          color: r.color,
          count: parseInt(r.count),
        })),
        byCategory: byCategoryResult.rows.map(r => ({
          category: r.category_name,
          count: parseInt(r.count),
        })),
        byPriority: byPriorityResult.rows.map(r => ({
          name: r.priority_name,
          slug: r.slug,
          color: r.color,
          level: r.level,
          count: parseInt(r.count),
        })),
        avgResolutionHours: parseFloat(avgResolutionResult.rows[0].avg_hours),
        monthlyTrend: monthlyTrendResult.rows.map(r => ({
          month: r.month,
          monthName: r.month_name,
          count: parseInt(r.count),
        })),
      },
    });
  } catch (error) {
    logger.error('Hibajegyek riport hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hibajegyek riport lekérési hiba',
    });
  }
};

/**
 * Alvállalkozók riport összesítés
 * GET /api/v1/reports/contractors-summary
 */
const getContractorsSummary = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const params = [];
    if (from_date) {
      params.push(from_date);
      dateFilter += ` AND t.created_at >= $${params.length}`;
    }
    if (to_date) {
      params.push(to_date);
      dateFilter += ` AND t.created_at <= $${params.length}::date + INTERVAL '1 day'`;
    }

    const [
      totalsResult,
      ticketsPerContractorResult,
      avgCompletionResult,
    ] = await Promise.all([
      // Total, active, inactive
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive
        FROM contractors
      `),

      // Tickets per contractor (top 10)
      query(`
        SELECT
          c.name as contractor_name,
          COUNT(t.id) as total_tickets,
          COUNT(t.id) FILTER (WHERE ts.is_final = true) as completed_tickets
        FROM contractors c
        LEFT JOIN users u ON u.contractor_id = c.id
        LEFT JOIN tickets t ON t.assigned_to = u.id ${dateFilter ? 'AND' + dateFilter.replace(/AND/i, '') : ''}
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE c.is_active = true
        GROUP BY c.id, c.name
        ORDER BY total_tickets DESC
        LIMIT 10
      `, params),

      // Average completion time per contractor
      query(`
        SELECT
          c.name as contractor_name,
          COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1),
            0
          ) as avg_hours
        FROM contractors c
        LEFT JOIN users u ON u.contractor_id = c.id
        LEFT JOIN tickets t ON t.assigned_to = u.id AND t.resolved_at IS NOT NULL ${dateFilter ? 'AND' + dateFilter.replace(/AND/i, '') : ''}
        WHERE c.is_active = true
        GROUP BY c.id, c.name
        HAVING COUNT(t.id) > 0
        ORDER BY avg_hours ASC
        LIMIT 10
      `, params),
    ]);

    res.json({
      success: true,
      data: {
        total: parseInt(totalsResult.rows[0].total),
        active: parseInt(totalsResult.rows[0].active),
        inactive: parseInt(totalsResult.rows[0].inactive),
        ticketsPerContractor: ticketsPerContractorResult.rows.map(r => ({
          name: r.contractor_name,
          totalTickets: parseInt(r.total_tickets),
          completedTickets: parseInt(r.completed_tickets),
        })),
        avgCompletionTime: avgCompletionResult.rows.map(r => ({
          name: r.contractor_name,
          avgHours: parseFloat(r.avg_hours),
        })),
      },
    });
  } catch (error) {
    logger.error('Alvállalkozók riport hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozók riport lekérési hiba',
    });
  }
};

module.exports = {
  getEmployeesSummary,
  getAccommodationsSummary,
  getTicketsSummary,
  getContractorsSummary,
};
