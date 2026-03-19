const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Report Number Generation ───────────────────────────────────────

async function generateReportNumber() {
  const result = await query("SELECT nextval('damage_report_seq') AS seq");
  const seq = result.rows[0].seq;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `KJ-${year}-${month}-${String(seq).padStart(4, '0')}`;
}

// ─── Create from Ticket ─────────────────────────────────────────────

async function createFromTicket(ticketId, createdBy, contractorId) {
  const ticketResult = await query(
    `SELECT t.*, u.first_name, u.last_name, u.id AS emp_id
     FROM tickets t
     LEFT JOIN users u ON t.created_by = u.id
     WHERE t.id = $1`,
    [ticketId]
  );
  if (ticketResult.rows.length === 0) throw new Error('Ticket not found');

  const ticket = ticketResult.rows[0];
  const reportNumber = await generateReportNumber();

  const result = await query(
    `INSERT INTO damage_reports
      (report_number, ticket_id, employee_id, contractor_id, incident_date,
       description, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
     RETURNING *`,
    [reportNumber, ticketId, ticket.emp_id || createdBy, contractorId,
     ticket.created_at || new Date(), ticket.description || ticket.title, createdBy]
  );
  return result.rows[0];
}

// ─── Create Manual ──────────────────────────────────────────────────

async function createManual(data, createdBy) {
  const reportNumber = await generateReportNumber();
  const result = await query(
    `INSERT INTO damage_reports
      (report_number, employee_id, contractor_id, accommodation_id, room_id,
       incident_date, discovery_date, description, damage_items,
       liability_type, fault_percentage, total_cost, employee_salary,
       photo_urls, notes, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft')
     RETURNING *`,
    [reportNumber, data.employee_id, data.contractor_id,
     data.accommodation_id || null, data.room_id || null,
     data.incident_date, data.discovery_date || new Date(),
     data.description, JSON.stringify(data.damage_items || []),
     data.liability_type || 'negligence', data.fault_percentage || 100,
     data.total_cost || 0, data.employee_salary || null,
     data.photo_urls || [], data.notes || null, createdBy]
  );
  return result.rows[0];
}

// ─── Payment Plan Calculator (Mt. 177.§) ────────────────────────────

function calculatePaymentPlan(totalCost, monthlySalary, faultPercentage = 100) {
  const adjustedCost = totalCost * (faultPercentage / 100);
  if (adjustedCost <= 0 || !monthlySalary || monthlySalary <= 0) return [];

  // Mt. 177.§: max 50% of monthly salary can be deducted
  const maxMonthlyDeduction = Math.floor(monthlySalary * 0.50);
  const months = Math.ceil(adjustedCost / maxMonthlyDeduction);
  const plan = [];
  let remaining = adjustedCost;

  for (let i = 1; i <= months; i++) {
    const amount = Math.min(maxMonthlyDeduction, remaining);
    remaining -= amount;
    plan.push({
      month: i,
      amount: Math.round(amount),
      remaining: Math.max(0, Math.round(remaining)),
    });
  }
  return plan;
}

// ─── CRUD Operations ────────────────────────────────────────────────

async function getById(id) {
  const result = await query(
    `SELECT dr.*,
            u.first_name AS employee_first_name, u.last_name AS employee_last_name, u.email AS employee_email,
            c.name AS contractor_name,
            creator.first_name AS creator_first_name, creator.last_name AS creator_last_name
     FROM damage_reports dr
     JOIN users u ON dr.employee_id = u.id
     JOIN contractors c ON dr.contractor_id = c.id
     LEFT JOIN users creator ON dr.created_by = creator.id
     WHERE dr.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function listReports(contractorId, filters = {}) {
  let sql = `
    SELECT dr.*, u.first_name AS employee_first_name, u.last_name AS employee_last_name
    FROM damage_reports dr
    JOIN users u ON dr.employee_id = u.id
    WHERE dr.contractor_id = $1`;
  const params = [contractorId];
  let idx = 2;

  if (filters.status) {
    sql += ` AND dr.status = $${idx}`;
    params.push(filters.status);
    idx++;
  }
  if (filters.employee_id) {
    sql += ` AND dr.employee_id = $${idx}`;
    params.push(filters.employee_id);
    idx++;
  }
  if (filters.startDate) {
    sql += ` AND dr.incident_date >= $${idx}`;
    params.push(filters.startDate);
    idx++;
  }
  if (filters.endDate) {
    sql += ` AND dr.incident_date <= $${idx}`;
    params.push(filters.endDate);
    idx++;
  }
  if (filters.search) {
    sql += ` AND (dr.report_number ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`;
    params.push(`%${filters.search}%`);
    idx++;
  }

  sql += ' ORDER BY dr.created_at DESC';

  if (filters.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(filters.limit);
    idx++;
  }
  if (filters.offset) {
    sql += ` OFFSET $${idx}`;
    params.push(filters.offset);
  }

  const result = await query(sql, params);
  return result.rows;
}

async function updateReport(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = [
    'accommodation_id', 'room_id', 'incident_date', 'discovery_date',
    'description', 'damage_items', 'liability_type', 'fault_percentage',
    'total_cost', 'employee_salary', 'payment_plan', 'photo_urls',
    'notes', 'status', 'witness_name',
  ];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${idx}`);
      values.push(key === 'damage_items' || key === 'payment_plan' ? JSON.stringify(value) : value);
      idx++;
    }
  }
  if (fields.length === 0) return null;

  values.push(id);
  const result = await query(
    `UPDATE damage_reports SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function deleteReport(id) {
  const result = await query('DELETE FROM damage_reports WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// ─── Damage Items ───────────────────────────────────────────────────

async function addDamageItem(reportId, item) {
  const report = await query('SELECT damage_items, total_cost FROM damage_reports WHERE id = $1', [reportId]);
  if (report.rows.length === 0) throw new Error('Report not found');

  const items = report.rows[0].damage_items || [];
  const newItem = {
    id: require('crypto').randomUUID(),
    name: item.name,
    description: item.description || '',
    cost: parseFloat(item.cost) || 0,
    added_at: new Date().toISOString(),
  };
  items.push(newItem);

  const totalCost = items.reduce((sum, i) => sum + (parseFloat(i.cost) || 0), 0);

  await query(
    'UPDATE damage_reports SET damage_items = $2, total_cost = $3 WHERE id = $1',
    [reportId, JSON.stringify(items), totalCost]
  );
  return { items, totalCost, newItem };
}

async function removeDamageItem(reportId, itemId) {
  const report = await query('SELECT damage_items FROM damage_reports WHERE id = $1', [reportId]);
  if (report.rows.length === 0) throw new Error('Report not found');

  const items = (report.rows[0].damage_items || []).filter(i => i.id !== itemId);
  const totalCost = items.reduce((sum, i) => sum + (parseFloat(i.cost) || 0), 0);

  await query(
    'UPDATE damage_reports SET damage_items = $2, total_cost = $3 WHERE id = $1',
    [reportId, JSON.stringify(items), totalCost]
  );
  return { items, totalCost };
}

// ─── Acknowledgment ─────────────────────────────────────────────────

async function acknowledgeReport(reportId, signatureData) {
  const report = await getById(reportId);
  if (!report) throw new Error('Report not found');

  // Calculate payment plan if salary is known
  let paymentPlan = [];
  if (report.employee_salary && report.total_cost > 0) {
    paymentPlan = calculatePaymentPlan(
      parseFloat(report.total_cost),
      parseFloat(report.employee_salary),
      report.fault_percentage
    );
  }

  const result = await query(
    `UPDATE damage_reports SET
      employee_acknowledged = true,
      employee_signature_date = NOW(),
      employee_signature_data = $2,
      payment_plan = $3,
      status = CASE WHEN $4 > 0 THEN 'in_payment' ELSE 'acknowledged' END
     WHERE id = $1 RETURNING *`,
    [reportId, signatureData, JSON.stringify(paymentPlan), paymentPlan.length]
  );
  return result.rows[0];
}

// ─── Payment Status ─────────────────────────────────────────────────

async function getPaymentStatus(reportId) {
  const report = await query(
    'SELECT total_cost, fault_percentage, payment_plan, status FROM damage_reports WHERE id = $1',
    [reportId]
  );
  if (report.rows.length === 0) throw new Error('Report not found');

  const r = report.rows[0];
  const adjustedCost = parseFloat(r.total_cost) * (r.fault_percentage / 100);
  const plan = r.payment_plan || [];
  const paidMonths = plan.filter(p => p.paid).length;
  const totalPaid = plan.filter(p => p.paid).reduce((sum, p) => sum + p.amount, 0);

  return {
    totalCost: parseFloat(r.total_cost),
    adjustedCost,
    faultPercentage: r.fault_percentage,
    totalPaid,
    remaining: adjustedCost - totalPaid,
    totalMonths: plan.length,
    paidMonths,
    plan,
    status: r.status,
  };
}

module.exports = {
  generateReportNumber, createFromTicket, createManual,
  calculatePaymentPlan, getById, listReports, updateReport, deleteReport,
  addDamageItem, removeDamageItem, acknowledgeReport, getPaymentStatus,
};
