/**
 * Analytics Service - Data aggregation for reports
 *
 * Provides structured metrics for dashboard PDF/Excel reports.
 * All queries use PostgreSQL parameterized queries ($1, $2...).
 */

const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const formatDate = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

class AnalyticsService {
  // ──────────────────────────────────────────────
  // EMPLOYEE METRICS
  // ──────────────────────────────────────────────

  async getEmployeeMetrics() {
    const today = formatDate(new Date());
    const thirtyDaysFromNow = formatDate(new Date(Date.now() + 30 * 86400000));

    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE est.name NOT IN ('Inactive', 'Inaktív', 'Terminated', 'Megszűnt'))
          AS active_employees,
        COUNT(*) AS total_employees,
        COUNT(*) FILTER (WHERE e.start_date >= (CURRENT_DATE - INTERVAL '30 days'))
          AS new_hires_30d,
        COUNT(*) FILTER (WHERE e.end_date IS NOT NULL AND e.end_date < CURRENT_DATE)
          AS terminated,
        COUNT(*) FILTER (WHERE e.visa_expiry IS NOT NULL AND e.visa_expiry <= $1)
          AS visa_expiring_30d,
        COUNT(*) FILTER (WHERE e.end_date IS NOT NULL AND e.end_date <= $1 AND e.end_date >= CURRENT_DATE)
          AS contracts_ending_30d,
        COUNT(DISTINCT e.workplace) FILTER (WHERE e.workplace IS NOT NULL AND e.workplace != '')
          AS unique_workplaces
      FROM employees e
      LEFT JOIN employee_status_types est ON e.status_id = est.id
    `, [thirtyDaysFromNow]);

    const byWorkplace = await query(`
      SELECT
        COALESCE(e.workplace, 'Nincs megadva') AS workplace,
        COUNT(*) AS count
      FROM employees e
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      WHERE est.name NOT IN ('Inactive', 'Inaktív', 'Terminated', 'Megszűnt')
      GROUP BY e.workplace
      ORDER BY count DESC
      LIMIT 10
    `);

    const byGender = await query(`
      SELECT
        COALESCE(e.gender, 'unknown') AS gender,
        COUNT(*) AS count
      FROM employees e
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      WHERE est.name NOT IN ('Inactive', 'Inaktív', 'Terminated', 'Megszűnt')
      GROUP BY e.gender
    `);

    return {
      ...result.rows[0],
      byWorkplace: byWorkplace.rows,
      byGender: byGender.rows,
    };
  }

  // ──────────────────────────────────────────────
  // FINANCIAL METRICS (Invoices)
  // ──────────────────────────────────────────────

  async getFinancialMetrics() {
    const summary = await query(`
      SELECT
        COUNT(*) AS total_invoices,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END), 0) AS pending_amount,
        COALESCE(SUM(CASE WHEN payment_status = 'overdue' THEN total_amount ELSE 0 END), 0) AS overdue_amount,
        COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_count,
        COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE payment_status = 'overdue') AS overdue_count
      FROM invoices
      WHERE deleted_at IS NULL
    `);

    const monthlyTrend = await query(`
      SELECT
        TO_CHAR(invoice_date, 'YYYY-MM') AS month,
        COALESCE(SUM(total_amount), 0) AS total,
        COUNT(*) AS count
      FROM invoices
      WHERE deleted_at IS NULL
        AND invoice_date >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
      ORDER BY month
    `);

    const byCategory = await query(`
      SELECT
        COALESCE(ic.name, 'Nincs kategória') AS category,
        COUNT(*) AS count,
        COALESCE(SUM(i.total_amount), 0) AS total
      FROM invoices i
      LEFT JOIN invoice_categories ic ON i.category_id = ic.id
      WHERE i.deleted_at IS NULL
      GROUP BY ic.name
      ORDER BY total DESC
      LIMIT 10
    `);

    return {
      ...summary.rows[0],
      monthlyTrend: monthlyTrend.rows,
      byCategory: byCategory.rows,
    };
  }

  // ──────────────────────────────────────────────
  // TICKET METRICS
  // ──────────────────────────────────────────────

  async getTicketMetrics() {
    const summary = await query(`
      SELECT
        COUNT(*) AS total_tickets,
        COUNT(*) FILTER (WHERE ts.is_final = false OR ts.is_final IS NULL) AS open_tickets,
        COUNT(*) FILTER (WHERE ts.is_final = true) AS closed_tickets,
        COUNT(*) FILTER (WHERE t.created_at >= (CURRENT_DATE - INTERVAL '7 days'))
          AS created_last_7d,
        COUNT(*) FILTER (WHERE t.resolved_at >= (CURRENT_DATE - INTERVAL '7 days'))
          AS resolved_last_7d,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)
          FILTER (WHERE t.resolved_at IS NOT NULL), 1)
          AS avg_resolution_hours
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
    `);

    const byStatus = await query(`
      SELECT
        COALESCE(ts.name, 'Ismeretlen') AS status,
        COALESCE(ts.color, '#999') AS color,
        COUNT(*) AS count
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      GROUP BY ts.name, ts.color, ts.order_index
      ORDER BY ts.order_index
    `);

    const byPriority = await query(`
      SELECT
        COALESCE(p.name, 'Nincs') AS priority,
        COUNT(*) AS count
      FROM tickets t
      LEFT JOIN priorities p ON t.priority_id = p.id
      GROUP BY p.name, p.level
      ORDER BY p.level
    `);

    const monthlyTrend = await query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        COUNT(*) AS created,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
      FROM tickets
      WHERE created_at >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

    return {
      ...summary.rows[0],
      byStatus: byStatus.rows,
      byPriority: byPriority.rows,
      monthlyTrend: monthlyTrend.rows,
    };
  }

  // ──────────────────────────────────────────────
  // ACCOMMODATION METRICS
  // ──────────────────────────────────────────────

  async getAccommodationMetrics() {
    const today = formatDate(new Date());

    const summary = await query(`
      SELECT
        COUNT(*) AS total_accommodations,
        COUNT(*) FILTER (WHERE a.status = 'available') AS available,
        COUNT(*) FILTER (WHERE a.status = 'occupied') AS occupied,
        COUNT(*) FILTER (WHERE a.status = 'maintenance') AS maintenance,
        COALESCE(SUM(a.capacity), 0) AS total_capacity,
        COALESCE(SUM(a.monthly_rent), 0) AS total_monthly_rent
      FROM accommodations a
      WHERE a.is_active = true
    `);

    const occupancy = await query(`
      SELECT
        a.name,
        COALESCE(a.capacity, 0) AS capacity,
        COUNT(e.id) AS occupants,
        CASE WHEN COALESCE(a.capacity, 0) > 0
          THEN ROUND((COUNT(e.id)::numeric / a.capacity) * 100)
          ELSE 0
        END AS occupancy_pct
      FROM accommodations a
      LEFT JOIN employees e
        ON e.accommodation_id = a.id
        AND e.arrival_date <= $1
        AND (e.end_date IS NULL OR e.end_date > $1)
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.capacity
      ORDER BY occupancy_pct DESC
    `, [today]);

    const totalOccupants = occupancy.rows.reduce((s, r) => s + parseInt(r.occupants), 0);
    const totalCap = parseInt(summary.rows[0].total_capacity) || 1;

    return {
      ...summary.rows[0],
      overall_occupancy_pct: Math.round((totalOccupants / totalCap) * 100),
      total_occupants: totalOccupants,
      byAccommodation: occupancy.rows,
    };
  }

  // ──────────────────────────────────────────────
  // PROJECT METRICS
  // ──────────────────────────────────────────────

  async getProjectMetrics() {
    const summary = await query(`
      SELECT
        COUNT(*) AS total_projects,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COALESCE(SUM(budget), 0) AS total_budget
      FROM projects
    `);

    const taskSummary = await query(`
      SELECT
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'done') AS done,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'todo') AS todo,
        COUNT(*) FILTER (WHERE status = 'blocked') AS blocked,
        ROUND(AVG(progress) FILTER (WHERE progress IS NOT NULL), 1) AS avg_progress
      FROM tasks
    `);

    return {
      ...summary.rows[0],
      tasks: taskSummary.rows[0],
    };
  }

  // ──────────────────────────────────────────────
  // ACTIVITY / AUDIT METRICS
  // ──────────────────────────────────────────────

  async getActivityMetrics(days = 7) {
    const result = await query(`
      SELECT
        COUNT(*) AS total_actions,
        COUNT(*) FILTER (WHERE action = 'create') AS creates,
        COUNT(*) FILTER (WHERE action = 'update') AS updates,
        COUNT(*) FILTER (WHERE action = 'delete') AS deletes
      FROM activity_logs
      WHERE created_at >= (CURRENT_DATE - $1 * INTERVAL '1 day')
    `, [days]);

    const byResource = await query(`
      SELECT
        entity_type,
        COUNT(*) AS count
      FROM activity_logs
      WHERE created_at >= (CURRENT_DATE - $1 * INTERVAL '1 day')
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 10
    `, [days]);

    const dailyActivity = await query(`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) AS count
      FROM activity_logs
      WHERE created_at >= (CURRENT_DATE - $1 * INTERVAL '1 day')
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [days]);

    return {
      ...result.rows[0],
      byResource: byResource.rows,
      dailyActivity: dailyActivity.rows,
    };
  }

  // ──────────────────────────────────────────────
  // FULL DASHBOARD (all metrics combined)
  // ──────────────────────────────────────────────

  async getDashboardMetrics() {
    const [employees, financial, tickets, accommodations, projects, activity] =
      await Promise.all([
        this.getEmployeeMetrics().catch(e => { logger.error('Employee metrics failed:', e); return null; }),
        this.getFinancialMetrics().catch(e => { logger.error('Financial metrics failed:', e); return null; }),
        this.getTicketMetrics().catch(e => { logger.error('Ticket metrics failed:', e); return null; }),
        this.getAccommodationMetrics().catch(e => { logger.error('Accommodation metrics failed:', e); return null; }),
        this.getProjectMetrics().catch(e => { logger.error('Project metrics failed:', e); return null; }),
        this.getActivityMetrics(7).catch(e => { logger.error('Activity metrics failed:', e); return null; }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      employees,
      financial,
      tickets,
      accommodations,
      projects,
      activity,
    };
  }

  // ──────────────────────────────────────────────
  // INSIGHTS / BI OVERVIEW (read-only, AGGREGATE/PROCESS metrics only)
  // No per-employee scoring, no assignee-performance ranking — tickets are
  // measured by status/age/throughput (the PROCESS), never by individual.
  // Cached for 60s (one call powers the whole Insights page).
  // ──────────────────────────────────────────────
  async getOperationalInsights() {
    const now = Date.now();
    if (this._insightsCache && now - this._insightsCache.at < 60_000) {
      return this._insightsCache.data;
    }

    const [
      kpiRes, occBedsRes, occupiedRes, expiryRes, ageRes,
      createdRes, closedRes, nationalityRes, byAccRes, utilRes,
    ] = await Promise.all([
      // KPIs: active employees + expiries (≤30d). 'active' mirrors the existing
      // definition used elsewhere (exclude inactive/terminated statuses).
      query(`
        SELECT
          COUNT(*) FILTER (WHERE est.name NOT IN ('Inactive','Inaktív','Terminated','Megszűnt','Kilépett'))
            AS active_employees,
          COUNT(*) FILTER (WHERE e.visa_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS visa_30,
          COUNT(*) FILTER (WHERE e.end_date  BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS contract_30
        FROM employees e LEFT JOIN employee_status_types est ON e.status_id = est.id
      `),
      query(`SELECT COALESCE(SUM(capacity), 0) AS total_beds FROM accommodations`),
      query(`SELECT COUNT(*) AS occupied FROM employees WHERE accommodation_id IS NOT NULL`),
      // Expiry horizon — non-overlapping buckets 0–30 / 31–60 / 61–90 days.
      query(`
        SELECT
          COUNT(*) FILTER (WHERE visa_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)        AS visa_a,
          COUNT(*) FILTER (WHERE visa_expiry BETWEEN CURRENT_DATE + 31 AND CURRENT_DATE + 60)   AS visa_b,
          COUNT(*) FILTER (WHERE visa_expiry BETWEEN CURRENT_DATE + 61 AND CURRENT_DATE + 90)   AS visa_c,
          COUNT(*) FILTER (WHERE end_date    BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)        AS contract_a,
          COUNT(*) FILTER (WHERE end_date    BETWEEN CURRENT_DATE + 31 AND CURRENT_DATE + 60)   AS contract_b,
          COUNT(*) FILTER (WHERE end_date    BETWEEN CURRENT_DATE + 61 AND CURRENT_DATE + 90)   AS contract_c
        FROM employees
      `),
      // Open tickets by age (since created) + SLA breach = open & past due_date.
      query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - 2) AS age_0_2,
          COUNT(*) FILTER (WHERE created_at <  CURRENT_DATE - 2  AND created_at >= CURRENT_DATE - 7)  AS age_3_7,
          COUNT(*) FILTER (WHERE created_at <  CURRENT_DATE - 7  AND created_at >= CURRENT_DATE - 14) AS age_8_14,
          COUNT(*) FILTER (WHERE created_at <  CURRENT_DATE - 14) AS age_15p,
          COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE) AS sla_breached,
          COUNT(*) AS open_total
        FROM tickets WHERE closed_at IS NULL
      `),
      // Throughput — created vs closed per ISO week, last ~10 weeks.
      query(`
        SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, COUNT(*) AS n
        FROM tickets WHERE created_at >= CURRENT_DATE - INTERVAL '70 days'
        GROUP BY 1 ORDER BY 1
      `),
      query(`
        SELECT to_char(date_trunc('week', closed_at), 'YYYY-MM-DD') AS week, COUNT(*) AS n
        FROM tickets WHERE closed_at >= CURRENT_DATE - INTERVAL '70 days'
        GROUP BY 1 ORDER BY 1
      `),
      // Workforce composition — by nationality (top 8) and by accommodation.
      query(`
        SELECT COALESCE(NULLIF(nationality, ''), '—') AS name, COUNT(*) AS count
        FROM employees GROUP BY 1 ORDER BY count DESC LIMIT 8
      `),
      query(`
        SELECT a.name AS name, COUNT(e.id) AS count
        FROM employees e JOIN accommodations a ON a.id = e.accommodation_id
        GROUP BY a.name ORDER BY count DESC LIMIT 10
      `),
      // Accommodation utilization — occupied/capacity per accommodation.
      query(`
        SELECT a.name AS name, a.capacity AS capacity, COUNT(e.id) AS occupied,
               CASE WHEN a.capacity > 0 THEN ROUND(COUNT(e.id)::numeric * 100 / a.capacity) ELSE 0 END AS pct
        FROM accommodations a
        LEFT JOIN employees e ON e.accommodation_id = a.id
        GROUP BY a.id, a.name, a.capacity
        ORDER BY pct DESC
      `),
    ]);

    const n = (v) => parseInt(v, 10) || 0;
    const totalBeds = n(occBedsRes.rows[0]?.total_beds);
    const occupied = n(occupiedRes.rows[0]?.occupied);
    const k = kpiRes.rows[0] || {};
    const ex = expiryRes.rows[0] || {};
    const ag = ageRes.rows[0] || {};

    // Merge created/closed weeks into one series.
    const weeks = {};
    for (const r of createdRes.rows) weeks[r.week] = { week: r.week, created: n(r.n), closed: 0 };
    for (const r of closedRes.rows) (weeks[r.week] = weeks[r.week] || { week: r.week, created: 0, closed: 0 }).closed = n(r.n);
    const throughput = Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week));

    const data = {
      generatedAt: new Date().toISOString(),
      kpis: {
        activeEmployees: n(k.active_employees),
        occupancyPct: totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0,
        totalBeds,
        occupiedBeds: occupied,
        openTickets: n(ag.open_total),
        expiring30d: n(k.visa_30) + n(k.contract_30),
      },
      expiryHorizon: [
        { horizon: '0–30', visa: n(ex.visa_a), contract: n(ex.contract_a) },
        { horizon: '31–60', visa: n(ex.visa_b), contract: n(ex.contract_b) },
        { horizon: '61–90', visa: n(ex.visa_c), contract: n(ex.contract_c) },
      ],
      ticketAge: {
        buckets: [
          { label: '0–2 nap', count: n(ag.age_0_2) },
          { label: '3–7 nap', count: n(ag.age_3_7) },
          { label: '8–14 nap', count: n(ag.age_8_14) },
          { label: '15+ nap', count: n(ag.age_15p) },
        ],
        slaBreached: n(ag.sla_breached),
      },
      throughput,
      workforce: {
        byNationality: nationalityRes.rows.map((r) => ({ name: r.name, count: n(r.count) })),
        byAccommodation: byAccRes.rows.map((r) => ({ name: r.name, count: n(r.count) })),
      },
      utilization: utilRes.rows.map((r) => ({
        name: r.name, capacity: n(r.capacity), occupied: n(r.occupied), pct: n(r.pct),
      })),
    };

    this._insightsCache = { at: now, data };
    return data;
  }
}

module.exports = new AnalyticsService();
