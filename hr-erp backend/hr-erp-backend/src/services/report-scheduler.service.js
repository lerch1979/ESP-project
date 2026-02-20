const cron = require('node-cron');
const XLSX = require('xlsx');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { sendEmail } = require('../utils/emailService');
const { buildFilterWhere } = require('../utils/filterBuilder');

// ============================================================
// Data generators — one per report type
// ============================================================

const EMPLOYEE_FIELD_MAP = {
  status: 'est.name',
  workplace: 'e.workplace',
  gender: 'e.gender',
  marital_status: 'e.marital_status',
  position: 'e.position',
  country: 'e.permanent_address_country',
};

async function generateEmployeesData(filters = []) {
  const { sql: filterSQL, params } = buildFilterWhere(filters, EMPLOYEE_FIELD_MAP);

  const result = await query(`
    SELECT
      e.employee_number,
      COALESCE(e.last_name, u.last_name) as last_name,
      COALESCE(e.first_name, u.first_name) as first_name,
      COALESCE(u.email, '') as email,
      COALESCE(u.phone, '') as phone,
      e.position,
      e.gender, e.workplace,
      est.name as status_name,
      a.name as accommodation_name,
      e.room_number,
      e.arrival_date, e.visa_expiry, e.start_date, e.end_date
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.id
    LEFT JOIN employee_status_types est ON e.status_id = est.id
    LEFT JOIN accommodations a ON e.accommodation_id = a.id
    WHERE 1=1 ${filterSQL}
    ORDER BY e.last_name, e.first_name
  `, params);

  const genderLabels = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };

  const records = result.rows.map(row => ({
    'Törzsszám': row.employee_number || '',
    'Vezetéknév': row.last_name || '',
    'Keresztnév': row.first_name || '',
    'Nem': genderLabels[row.gender] || '',
    'Email': row.email || '',
    'Telefon': row.phone || '',
    'Munkakör': row.position || '',
    'Munkahely': row.workplace || '',
    'Státusz': row.status_name || '',
    'Szálláshely': row.accommodation_name || '',
    'Szobaszám': row.room_number || '',
    'Érkezés': row.arrival_date ? new Date(row.arrival_date).toLocaleDateString('hu-HU') : '',
    'Vízum lejárat': row.visa_expiry ? new Date(row.visa_expiry).toLocaleDateString('hu-HU') : '',
  }));

  return { records, sheetName: 'Munkavállalók' };
}

const ACCOMMODATION_FIELD_MAP = {
  status: 'a.status',
  type: 'a.type',
  contractor: 'a.current_contractor_id',
};

async function generateAccommodationsData(filters = []) {
  const { sql: filterSQL, params } = buildFilterWhere(filters, ACCOMMODATION_FIELD_MAP);

  const statusLabels = { available: 'Szabad', occupied: 'Foglalt', maintenance: 'Karbantartás' };
  const typeLabels = { studio: 'Stúdió', '1br': '1 szobás', '2br': '2 szobás', '3br': '3 szobás', dormitory: 'Munkásszálló' };

  const result = await query(`
    SELECT
      a.name,
      COALESCE(a.address, '-') as address,
      a.type,
      a.status,
      COALESCE(a.capacity, 0) as capacity,
      COALESCE(a.monthly_rent, 0) as monthly_rent,
      COALESCE(c.name, '-') as contractor_name
    FROM accommodations a
    LEFT JOIN contractors c ON a.current_contractor_id = c.id
    WHERE a.is_active = true ${filterSQL}
    ORDER BY a.name
  `, params);

  const records = result.rows.map(row => ({
    'Név': row.name || '',
    'Cím': row.address || '',
    'Típus': typeLabels[row.type] || row.type || '',
    'Kapacitás': row.capacity,
    'Státusz': statusLabels[row.status] || row.status || '',
    'Havi bérleti díj': row.monthly_rent,
    'Alvállalkozó': row.contractor_name || '',
  }));

  return { records, sheetName: 'Szálláshelyek' };
}

async function generateTicketsData(filters = []) {
  const TICKET_FIELD_MAP = {
    status: 'ts.slug',
    category: 'tc.name',
    priority: 'p.slug',
    contractor: 't.contractor_id',
  };
  const { sql: filterSQL, params } = buildFilterWhere(filters, TICKET_FIELD_MAP);

  const result = await query(`
    SELECT
      t.ticket_number,
      t.title,
      COALESCE(ts.name, '-') as status_name,
      COALESCE(tc.name, '-') as category_name,
      COALESCE(p.name, '-') as priority_name,
      COALESCE(CONCAT(creator.last_name, ' ', creator.first_name), '-') as created_by_name,
      COALESCE(CONCAT(assignee.last_name, ' ', assignee.first_name), '-') as assigned_to_name,
      t.created_at,
      t.due_date,
      t.resolved_at
    FROM tickets t
    LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
    LEFT JOIN ticket_categories tc ON t.category_id = tc.id
    LEFT JOIN priorities p ON t.priority_id = p.id
    LEFT JOIN users creator ON t.created_by = creator.id
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    WHERE 1=1 ${filterSQL}
    ORDER BY t.created_at DESC
  `, params);

  const fmtDate = (val) => val ? new Date(val).toLocaleDateString('hu-HU') : '';

  const records = result.rows.map(row => ({
    'Azonosító': row.ticket_number || '',
    'Cím': row.title || '',
    'Státusz': row.status_name,
    'Kategória': row.category_name,
    'Prioritás': row.priority_name,
    'Beküldő': row.created_by_name,
    'Felelős': row.assigned_to_name,
    'Létrehozva': fmtDate(row.created_at),
    'Határidő': fmtDate(row.due_date),
    'Megoldva': fmtDate(row.resolved_at),
  }));

  return { records, sheetName: 'Hibajegyek' };
}

async function generateContractorsData(filters = []) {
  const result = await query(`
    SELECT
      c.name,
      COALESCE(c.email, '-') as email,
      COALESCE(c.phone, '-') as phone,
      COALESCE(c.address, '-') as address,
      c.is_active,
      (SELECT COUNT(*) FROM users u WHERE u.contractor_id = c.id AND u.is_active = true) as user_count,
      (SELECT COUNT(*) FROM tickets t
       JOIN users u2 ON t.assigned_to = u2.id
       WHERE u2.contractor_id = c.id) as ticket_count
    FROM contractors c
    ORDER BY c.name
  `);

  const records = result.rows.map(row => ({
    'Név': row.name || '',
    'Email': row.email,
    'Telefon': row.phone,
    'Cím': row.address,
    'Aktív': row.is_active ? 'Igen' : 'Nem',
    'Felhasználók': parseInt(row.user_count) || 0,
    'Hibajegyek': parseInt(row.ticket_count) || 0,
  }));

  return { records, sheetName: 'Alvállalkozók' };
}

async function generateOccupancyData() {
  const date = new Date().toISOString().slice(0, 10);

  const result = await query(`
    SELECT
      a.name,
      COALESCE(a.address, '-') as address,
      a.type,
      COALESCE(a.capacity, 0) as total_beds,
      COUNT(e.id) as occupied_beds,
      COALESCE(a.capacity, 0) - COUNT(e.id) as free_beds,
      CASE WHEN COALESCE(a.capacity, 0) > 0
        THEN ROUND((COUNT(e.id)::numeric / a.capacity) * 100)
        ELSE 0
      END as occupancy_pct
    FROM accommodations a
    LEFT JOIN employees e
      ON e.accommodation_id = a.id
      AND e.arrival_date <= $1
      AND (e.end_date IS NULL OR e.end_date > $1)
    WHERE a.is_active = true
    GROUP BY a.id, a.name, a.address, a.type, a.capacity
    ORDER BY a.name
  `, [date]);

  const typeLabels = { studio: 'Stúdió', '1br': '1 szobás', '2br': '2 szobás', '3br': '3 szobás', dormitory: 'Munkásszálló' };

  const records = result.rows.map(row => ({
    'Szálláshely': row.name || '',
    'Cím': row.address,
    'Típus': typeLabels[row.type] || row.type || '',
    'Összes ágy': parseInt(row.total_beds),
    'Foglalt': parseInt(row.occupied_beds),
    'Szabad': parseInt(row.free_beds),
    'Kihasználtság %': parseInt(row.occupancy_pct),
  }));

  return { records, sheetName: 'Kihasználtság' };
}

const DATA_GENERATORS = {
  employees: generateEmployeesData,
  accommodations: generateAccommodationsData,
  tickets: generateTicketsData,
  contractors: generateContractorsData,
  occupancy: generateOccupancyData,
};

// ============================================================
// Excel buffer generator
// ============================================================

function generateExcelBuffer(records, sheetName) {
  const ws = XLSX.utils.json_to_sheet(records);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ============================================================
// Next run calculator
// ============================================================

function calculateNextRun(scheduleType, scheduleTime, dayOfWeek, dayOfMonth) {
  const [hours, minutes] = (scheduleTime || '08:00').split(':').map(Number);
  const now = new Date();

  if (scheduleType === 'daily') {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (scheduleType === 'weekly') {
    const dow = dayOfWeek != null ? dayOfWeek : 1; // default Monday
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    const currentDay = next.getDay();
    let daysUntil = dow - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  if (scheduleType === 'monthly') {
    const dom = dayOfMonth || 1;
    const next = new Date(now.getFullYear(), now.getMonth(), dom, hours, minutes, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  return null;
}

// ============================================================
// Execute a single report
// ============================================================

async function executeReport(report) {
  const runResult = await query(
    `INSERT INTO scheduled_report_runs (scheduled_report_id, status, started_at)
     VALUES ($1, 'running', NOW()) RETURNING id`,
    [report.id]
  );
  const runId = runResult.rows[0].id;

  try {
    const generator = DATA_GENERATORS[report.report_type];
    if (!generator) throw new Error(`Unknown report type: ${report.report_type}`);

    const filters = report.filters || [];
    const { records, sheetName } = await generator(filters);
    const buffer = generateExcelBuffer(records, sheetName);

    const recipients = report.recipients || [];
    const reportTypeLabels = {
      employees: 'Munkavállalók összesítő',
      accommodations: 'Szálláshelyek',
      tickets: 'Hibajegyek',
      contractors: 'Alvállalkozók',
      occupancy: 'Kihasználtság',
    };
    const typeName = reportTypeLabels[report.report_type] || report.report_type;
    const dateStr = new Date().toLocaleDateString('hu-HU');

    for (const email of recipients) {
      await sendEmail({
        to: email,
        subject: `${report.name} - ${typeName} riport (${dateStr})`,
        html: `
          <h2>${report.name}</h2>
          <p>Az ütemezett riport elkészült.</p>
          <ul>
            <li><strong>Típus:</strong> ${typeName}</li>
            <li><strong>Rekordok száma:</strong> ${records.length}</li>
            <li><strong>Generálva:</strong> ${dateStr}</li>
          </ul>
          <p>Az Excel fájl csatolva található.</p>
        `,
        attachments: [{
          filename: `${report.name.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _-]/g, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`,
          content: buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }],
      });
    }

    await query(
      `UPDATE scheduled_report_runs
       SET status = 'success', completed_at = NOW(), records_count = $1, file_size = $2, recipients_count = $3
       WHERE id = $4`,
      [records.length, buffer.length, recipients.length, runId]
    );

    // Update next_run_at
    const nextRun = calculateNextRun(report.schedule_type, report.schedule_time, report.day_of_week, report.day_of_month);
    if (nextRun) {
      await query(`UPDATE scheduled_reports SET next_run_at = $1 WHERE id = $2`, [nextRun, report.id]);
    }

    logger.info(`Scheduled report completed: ${report.name}`, { reportId: report.id, records: records.length });
  } catch (error) {
    logger.error(`Scheduled report failed: ${report.name}`, { reportId: report.id, error: error.message });
    await query(
      `UPDATE scheduled_report_runs SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
      [error.message, runId]
    );
  }
}

// ============================================================
// Process all due reports
// ============================================================

async function processDueReports() {
  try {
    const result = await query(
      `SELECT * FROM scheduled_reports WHERE is_active = true AND next_run_at <= NOW()`
    );

    for (const report of result.rows) {
      await executeReport(report);
    }
  } catch (error) {
    logger.error('Report scheduler error:', error);
  }
}

// ============================================================
// Start the scheduler (every minute)
// ============================================================

function startScheduler() {
  cron.schedule('* * * * *', processDueReports);
  logger.info('Report scheduler started (checking every minute)');
}

module.exports = {
  startScheduler,
  executeReport,
  calculateNextRun,
  generateExcelBuffer,
  DATA_GENERATORS,
};
