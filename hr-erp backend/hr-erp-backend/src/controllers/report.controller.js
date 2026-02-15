const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { buildFilterWhere, buildDateRangeClause } = require('../utils/filterBuilder');


// ============================================================
// GET /filter-options — dropdown values for all report types
// ============================================================

const getReportFilterOptions = async (req, res) => {
  try {
    const [
      empStatuses,
      empWorkplaces,
      empPositions,
      empCountries,
      ticketStatuses,
      ticketCategories,
      ticketPriorities,
      contractors,
    ] = await Promise.all([
      query(`SELECT id, name FROM employee_status_types ORDER BY name`),
      query(`SELECT DISTINCT workplace FROM employees WHERE workplace IS NOT NULL AND workplace != '' ORDER BY workplace`),
      query(`SELECT DISTINCT position FROM employees WHERE position IS NOT NULL AND position != '' ORDER BY position`),
      query(`SELECT DISTINCT permanent_address_country FROM employees WHERE permanent_address_country IS NOT NULL AND permanent_address_country != '' ORDER BY permanent_address_country`),
      query(`SELECT id, name, slug FROM ticket_statuses ORDER BY order_index`),
      query(`SELECT id, name FROM ticket_categories ORDER BY name`),
      query(`SELECT id, name, slug FROM priorities ORDER BY level`),
      query(`SELECT id, name FROM contractors WHERE is_active = true ORDER BY name`),
    ]);

    res.json({
      success: true,
      data: {
        employees: {
          statuses: empStatuses.rows,
          workplaces: empWorkplaces.rows.map(r => r.workplace),
          positions: empPositions.rows.map(r => r.position),
          countries: empCountries.rows.map(r => r.permanent_address_country),
        },
        tickets: {
          statuses: ticketStatuses.rows,
          categories: ticketCategories.rows,
          priorities: ticketPriorities.rows,
          contractors: contractors.rows,
        },
        accommodations: {
          contractors: contractors.rows,
        },
      },
    });
  } catch (error) {
    logger.error('Report filter options error:', error);
    res.status(500).json({ success: false, message: 'Szűrő opciók lekérési hiba' });
  }
};


// ============================================================
// POST /employees-summary
// ============================================================

const EMPLOYEE_FIELD_MAP = {
  status: 'est.name',
  workplace: 'e.workplace',
  gender: 'e.gender',
  marital_status: 'e.marital_status',
  position: 'e.position',
  country: 'e.permanent_address_country',
};

const getEmployeesSummary = async (req, res) => {
  try {
    const filters = req.body.filters || [];
    const { sql: filterSQL, params } = buildFilterWhere(filters, EMPLOYEE_FIELD_MAP);

    const [
      totalsResult,
      byWorkplaceResult,
      visaExpiringResult,
      newThisMonthResult,
      genderResult,
      byStatusResult,
      recordsResult,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE e.end_date IS NULL) as active,
          COUNT(*) FILTER (WHERE e.end_date IS NOT NULL) as inactive
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE 1=1 ${filterSQL}
      `, params),

      query(`
        SELECT
          COALESCE(e.workplace, 'Nincs megadva') as workplace,
          COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE 1=1 ${filterSQL}
        GROUP BY e.workplace
        ORDER BY count DESC
      `, params),

      query(`
        SELECT COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE e.visa_expiry BETWEEN NOW() AND NOW() + INTERVAL '30 days'
          AND e.end_date IS NULL
          ${filterSQL}
      `, params),

      query(`
        SELECT COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE e.start_date >= date_trunc('month', CURRENT_DATE)
          ${filterSQL}
      `, params),

      query(`
        SELECT
          COALESCE(e.gender, 'unknown') as gender,
          COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE 1=1 ${filterSQL}
        GROUP BY e.gender
        ORDER BY count DESC
      `, params),

      query(`
        SELECT
          COALESCE(est.name, 'Nincs státusz') as status_name,
          est.color,
          COUNT(*) as count
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        WHERE 1=1 ${filterSQL}
        GROUP BY est.name, est.color
        ORDER BY count DESC
      `, params),

      // Records
      query(`
        SELECT
          e.id,
          COALESCE(NULLIF(CONCAT(e.last_name, ' ', e.first_name), ' '), 'N/A') as name,
          COALESCE(est.name, 'Nincs státusz') as status,
          COALESCE(e.workplace, '-') as workplace,
          COALESCE(e.gender, '-') as gender,
          COALESCE(e.position, '-') as position,
          e.visa_expiry,
          e.start_date,
          e.end_date,
          COALESCE(a.name, '-') as accommodation
        FROM employees e
        LEFT JOIN employee_status_types est ON e.status_id = est.id
        LEFT JOIN accommodations a ON e.accommodation_id = a.id
        WHERE 1=1 ${filterSQL}
        ORDER BY e.last_name, e.first_name
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
        records: recordsResult.rows,
        totalRecords: recordsResult.rows.length,
      },
    });
  } catch (error) {
    logger.error('Munkavállalók riport hiba:', error);
    res.status(500).json({ success: false, message: 'Munkavállalók riport lekérési hiba' });
  }
};


// ============================================================
// POST /accommodations-summary
// ============================================================

const ACCOMMODATION_FIELD_MAP = {
  status: 'a.status',
  type: 'a.type',
  contractor: 'a.current_contractor_id',
};

const getAccommodationsSummary = async (req, res) => {
  try {
    const filters = req.body.filters || [];
    const { sql: filterSQL, params } = buildFilterWhere(filters, ACCOMMODATION_FIELD_MAP);

    const [
      totalsResult,
      byStatusResult,
      byTypeResult,
      capacityResult,
      recordsResult,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE a.status = 'available') as available,
          COUNT(*) FILTER (WHERE a.status = 'occupied') as occupied,
          COUNT(*) FILTER (WHERE a.status = 'maintenance') as maintenance
        FROM accommodations a
        WHERE a.is_active = true ${filterSQL}
      `, params),

      query(`
        SELECT a.status, COUNT(*) as count
        FROM accommodations a
        WHERE a.is_active = true ${filterSQL}
        GROUP BY a.status
        ORDER BY count DESC
      `, params),

      query(`
        SELECT a.type, COUNT(*) as count
        FROM accommodations a
        WHERE a.is_active = true ${filterSQL}
        GROUP BY a.type
        ORDER BY count DESC
      `, params),

      query(`
        SELECT
          COALESCE(SUM(a.capacity), 0) as total_capacity,
          COUNT(DISTINCT e.id) as current_occupants
        FROM accommodations a
        LEFT JOIN employees e ON e.accommodation_id = a.id AND e.end_date IS NULL
        WHERE a.is_active = true ${filterSQL}
      `, params),

      // Records
      query(`
        SELECT
          a.id,
          a.name,
          COALESCE(a.address, '-') as address,
          COALESCE(a.type, '-') as type,
          COALESCE(a.status, '-') as status,
          COALESCE(a.capacity, 0) as capacity,
          COALESCE(a.monthly_rent, 0) as monthly_rent,
          COALESCE(c.name, '-') as contractor_name
        FROM accommodations a
        LEFT JOIN contractors c ON a.current_contractor_id = c.id
        WHERE a.is_active = true ${filterSQL}
        ORDER BY a.name
      `, params),
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
        records: recordsResult.rows,
        totalRecords: recordsResult.rows.length,
      },
    });
  } catch (error) {
    logger.error('Szálláshelyek riport hiba:', error);
    res.status(500).json({ success: false, message: 'Szálláshelyek riport lekérési hiba' });
  }
};


// ============================================================
// POST /tickets-summary
// ============================================================

const TICKET_FIELD_MAP = {
  status: 'ts.slug',
  category: 'tc.name',
  priority: 'p.slug',
  contractor: 't.contractor_id',
};

const getTicketsSummary = async (req, res) => {
  try {
    const filters = req.body.filters || [];
    const { sql: filterSQL, params, dateRangeInfo } = buildFilterWhere(filters, TICKET_FIELD_MAP);

    // Build date filter for tickets
    let dateFilter = '';
    const dateParams = [];
    let nextIdx = params.length + 1;
    if (dateRangeInfo) {
      dateFilter = ` AND t.created_at >= $${nextIdx} AND t.created_at <= $${nextIdx + 1}::date + INTERVAL '1 day'`;
      dateParams.push(dateRangeInfo.from, dateRangeInfo.to);
    }

    const allParams = [...params, ...dateParams];

    const [
      totalResult,
      byStatusResult,
      byCategoryResult,
      byPriorityResult,
      avgResolutionResult,
      monthlyTrendResult,
      recordsResult,
    ] = await Promise.all([
      query(`
        SELECT COUNT(*) as total
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE 1=1 ${filterSQL} ${dateFilter}
      `, allParams),

      query(`
        SELECT
          ts.name as status_name,
          ts.slug,
          ts.color,
          COUNT(t.id) as count
        FROM ticket_statuses ts
        LEFT JOIN tickets t ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE 1=1 ${filterSQL} ${dateFilter}
        GROUP BY ts.id, ts.name, ts.slug, ts.color, ts.order_index
        ORDER BY ts.order_index
      `, allParams),

      query(`
        SELECT
          COALESCE(tc.name, 'Nincs kategória') as category_name,
          COUNT(*) as count
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE 1=1 ${filterSQL} ${dateFilter}
        GROUP BY tc.name
        ORDER BY count DESC
      `, allParams),

      query(`
        SELECT
          p.name as priority_name,
          p.slug,
          p.color,
          p.level,
          COUNT(t.id) as count
        FROM priorities p
        LEFT JOIN tickets t ON t.priority_id = p.id
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        WHERE 1=1 ${filterSQL} ${dateFilter}
        GROUP BY p.id, p.name, p.slug, p.color, p.level
        ORDER BY p.level
      `, allParams),

      query(`
        SELECT
          COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1),
            0
          ) as avg_hours
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE t.resolved_at IS NOT NULL ${filterSQL} ${dateFilter}
      `, allParams),

      query(`
        SELECT
          to_char(date_trunc('month', t.created_at), 'YYYY-MM') as month,
          to_char(date_trunc('month', t.created_at), 'TMMonth') as month_name,
          COUNT(*) as count
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE t.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
          ${filterSQL} ${dateFilter}
        GROUP BY date_trunc('month', t.created_at)
        ORDER BY date_trunc('month', t.created_at)
      `, allParams),

      // Records
      query(`
        SELECT
          t.id,
          t.ticket_number,
          t.title,
          COALESCE(ts.name, '-') as status,
          COALESCE(p.name, '-') as priority,
          COALESCE(tc.name, '-') as category,
          t.created_at,
          t.resolved_at,
          COALESCE(
            CONCAT(au.last_name, ' ', au.first_name),
            '-'
          ) as assigned_to_name,
          COALESCE(con.name, '-') as contractor_name
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        LEFT JOIN users au ON t.assigned_to = au.id
        LEFT JOIN contractors con ON t.contractor_id = con.id
        WHERE 1=1 ${filterSQL} ${dateFilter}
        ORDER BY t.created_at DESC
      `, allParams),
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
        records: recordsResult.rows,
        totalRecords: recordsResult.rows.length,
      },
    });
  } catch (error) {
    logger.error('Hibajegyek riport hiba:', error);
    res.status(500).json({ success: false, message: 'Hibajegyek riport lekérési hiba' });
  }
};


// ============================================================
// POST /contractors-summary
// ============================================================

const getContractorsSummary = async (req, res) => {
  try {
    const filters = req.body.filters || [];

    // Separate is_active filter from date_range
    let isActiveFilter = '';
    const isActiveParams = [];
    let dateRangeInfo = null;
    let paramIdx = 1;

    for (const filter of filters) {
      if (filter.field === 'is_active' && filter.value) {
        const val = filter.value === 'active' ? true : false;
        isActiveFilter = ` AND c.is_active = $${paramIdx}`;
        isActiveParams.push(val);
        paramIdx += 1;
      }
      if (filter.field === 'date_range' && filter.value) {
        dateRangeInfo = buildDateRangeClause(filter.value, paramIdx);
      }
    }

    // date_range goes into ticket JOIN ON condition (not WHERE) to preserve LEFT JOIN semantics
    let ticketDateJoin = '';
    const ticketDateParams = [];
    if (dateRangeInfo) {
      ticketDateJoin = ` AND t.created_at >= $${paramIdx} AND t.created_at <= $${paramIdx + 1}::date + INTERVAL '1 day'`;
      ticketDateParams.push(dateRangeInfo.from, dateRangeInfo.to);
    }

    const allParams = [...isActiveParams, ...ticketDateParams];

    const [
      totalsResult,
      ticketsPerContractorResult,
      avgCompletionResult,
      recordsResult,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE c.is_active = true) as active,
          COUNT(*) FILTER (WHERE c.is_active = false) as inactive
        FROM contractors c
        WHERE 1=1 ${isActiveFilter}
      `, isActiveParams),

      query(`
        SELECT
          c.name as contractor_name,
          COUNT(t.id) as total_tickets,
          COUNT(t.id) FILTER (WHERE ts.is_final = true) as completed_tickets
        FROM contractors c
        LEFT JOIN users u ON u.contractor_id = c.id
        LEFT JOIN tickets t ON t.assigned_to = u.id ${ticketDateJoin}
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE c.is_active = true ${isActiveFilter}
        GROUP BY c.id, c.name
        ORDER BY total_tickets DESC
        LIMIT 10
      `, allParams),

      query(`
        SELECT
          c.name as contractor_name,
          COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1),
            0
          ) as avg_hours
        FROM contractors c
        LEFT JOIN users u ON u.contractor_id = c.id
        LEFT JOIN tickets t ON t.assigned_to = u.id AND t.resolved_at IS NOT NULL ${ticketDateJoin}
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE c.is_active = true ${isActiveFilter}
        GROUP BY c.id, c.name
        HAVING COUNT(t.id) > 0
        ORDER BY avg_hours ASC
        LIMIT 10
      `, allParams),

      // Records
      query(`
        SELECT
          c.id,
          c.name,
          COALESCE(c.email, '-') as email,
          COALESCE(c.phone, '-') as phone,
          c.is_active,
          COUNT(t.id) as total_tickets,
          COUNT(t.id) FILTER (WHERE ts.is_final = true) as completed_tickets
        FROM contractors c
        LEFT JOIN users u ON u.contractor_id = c.id
        LEFT JOIN tickets t ON t.assigned_to = u.id ${ticketDateJoin}
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE 1=1 ${isActiveFilter}
        GROUP BY c.id, c.name, c.email, c.phone, c.is_active
        ORDER BY c.name
      `, allParams),
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
        records: recordsResult.rows,
        totalRecords: recordsResult.rows.length,
      },
    });
  } catch (error) {
    logger.error('Alvállalkozók riport hiba:', error);
    res.status(500).json({ success: false, message: 'Alvállalkozók riport lekérési hiba' });
  }
};


module.exports = {
  getReportFilterOptions,
  getEmployeesSummary,
  getAccommodationsSummary,
  getTicketsSummary,
  getContractorsSummary,
};
