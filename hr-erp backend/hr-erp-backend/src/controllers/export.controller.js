const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

const TYPE_LABELS = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

const STATUS_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
};

const GENDER_LABELS = {
  male: 'Férfi',
  female: 'Nő',
  other: 'Egyéb',
};

const MARITAL_LABELS = {
  single: 'Egyedülálló',
  married: 'Házas',
  divorced: 'Elvált',
  widowed: 'Özvegy',
};

function sendExcel(res, data, filename) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
}

function sendMultiSheetExcel(res, sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
}

const PROJECT_STATUS_LABELS = {
  planning: 'Tervezés',
  active: 'Aktív',
  on_hold: 'Szünetel',
  completed: 'Befejezett',
  cancelled: 'Törölve',
};

const TASK_STATUS_LABELS = {
  todo: 'Teendő',
  in_progress: 'Folyamatban',
  review: 'Ellenőrzés',
  done: 'Kész',
  blocked: 'Blokkolva',
};

const PRIORITY_LABELS = {
  low: 'Alacsony',
  medium: 'Közepes',
  high: 'Magas',
  critical: 'Kritikus',
};

function fmtDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString('hu-HU');
}

/**
 * Munkavállalók exportálása
 */
const exportEmployees = async (req, res) => {
  try {
    const { search, status_id, has_accommodation } = req.query;

    let whereConditions = ['e.end_date IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (status_id && status_id !== 'all') {
      whereConditions.push(`e.status_id = $${paramIndex}`);
      params.push(status_id);
      paramIndex++;
    }

    if (has_accommodation === 'true') {
      whereConditions.push('e.accommodation_id IS NOT NULL');
    } else if (has_accommodation === 'false') {
      whereConditions.push('e.accommodation_id IS NULL');
    }

    if (search) {
      whereConditions.push(
        `(COALESCE(e.first_name, u.first_name, '') ILIKE $${paramIndex} OR COALESCE(e.last_name, u.last_name, '') ILIKE $${paramIndex} OR COALESCE(u.email, '') ILIKE $${paramIndex} OR COALESCE(e.employee_number, '') ILIKE $${paramIndex} OR CONCAT(COALESCE(e.last_name, u.last_name, ''), ' ', COALESCE(e.first_name, u.first_name, '')) ILIKE $${paramIndex} OR COALESCE(e.workplace, '') ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT
        e.employee_number,
        COALESCE(e.last_name, u.last_name) as last_name,
        COALESCE(e.first_name, u.first_name) as first_name,
        COALESCE(u.email, '') as email,
        COALESCE(u.phone, '') as phone,
        e.position,
        e.gender, e.birth_date, e.birth_place, e.mothers_name,
        e.tax_id, e.passport_number, e.social_security_number, e.marital_status,
        e.arrival_date, e.visa_expiry, e.room_number, e.bank_account, e.workplace,
        e.permanent_address_zip, e.permanent_address_country,
        e.permanent_address_county, e.permanent_address_city,
        e.permanent_address_street, e.permanent_address_number,
        e.company_name, e.company_email, e.company_phone,
        est.name as status_name,
        a.name as accommodation_name
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      ${whereClause}
      ORDER BY e.created_at DESC`,
      params
    );

    const data = result.rows.map(row => ({
      'Törzsszám': row.employee_number || '',
      'Vezetéknév': row.last_name || '',
      'Keresztnév': row.first_name || '',
      'Nem': GENDER_LABELS[row.gender] || '',
      'Születési dátum': fmtDate(row.birth_date),
      'Születési hely': row.birth_place || '',
      'Anyja neve': row.mothers_name || '',
      'Családi állapot': MARITAL_LABELS[row.marital_status] || '',
      'Adóazonosító': row.tax_id || '',
      'Útlevélszám': row.passport_number || '',
      'TAJ szám': row.social_security_number || '',
      'Email': row.email || '',
      'Telefon': row.phone || '',
      'Munkakör': row.position || '',
      'Munkahely': row.workplace || '',
      'Érkezés dátuma': fmtDate(row.arrival_date),
      'Vízum lejárat': fmtDate(row.visa_expiry),
      'Státusz': row.status_name || '',
      'Szálláshely': row.accommodation_name || '',
      'Szobaszám': row.room_number || '',
      'Bankszámlaszám': row.bank_account || '',
      'Irányítószám': row.permanent_address_zip || '',
      'Ország': row.permanent_address_country || '',
      'Megye': row.permanent_address_county || '',
      'Város': row.permanent_address_city || '',
      'Utca': row.permanent_address_street || '',
      'Házszám': row.permanent_address_number || '',
      'Cégnév': row.company_name || '',
      'Céges email': row.company_email || '',
      'Céges telefon': row.company_phone || '',
    }));

    sendExcel(res, data, 'munkavallalok.xlsx');
  } catch (error) {
    logger.error('Munkavállalók export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

/**
 * Alvállalkozók exportálása
 */
const exportContractors = async (req, res) => {
  try {
    const { search, is_active } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (is_active !== undefined && is_active !== 'all') {
      whereConditions.push(`t.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    if (search) {
      whereConditions.push(
        `(t.name ILIKE $${paramIndex} OR t.email ILIKE $${paramIndex} OR t.phone ILIKE $${paramIndex} OR t.address ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.contractor_id = t.id AND u.is_active = true) as user_count
      FROM contractors t
      ${whereClause}
      ORDER BY t.created_at DESC`,
      params
    );

    const data = result.rows.map(row => ({
      'Név': row.name || '',
      'Email': row.email || '',
      'Telefon': row.phone || '',
      'Cím': row.address || '',
      'Aktív': row.is_active ? 'Igen' : 'Nem',
      'Felhasználók száma': parseInt(row.user_count) || 0,
    }));

    sendExcel(res, data, 'alvallalkozok.xlsx');
  } catch (error) {
    logger.error('Alvállalkozók export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

/**
 * Szálláshelyek exportálása
 */
const exportAccommodations = async (req, res) => {
  try {
    const { search, status, type } = req.query;

    let whereConditions = ['a.is_active = true'];
    let params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      whereConditions.push(`a.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (type && type !== 'all') {
      whereConditions.push(`a.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(
        `(a.name ILIKE $${paramIndex} OR a.address ILIKE $${paramIndex} OR a.notes ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT
        a.*,
        t.name as contractor_name
      FROM accommodations a
      LEFT JOIN contractors t ON a.current_contractor_id = t.id
      ${whereClause}
      ORDER BY a.created_at DESC`,
      params
    );

    const data = result.rows.map(row => ({
      'Név': row.name || '',
      'Cím': row.address || '',
      'Típus': TYPE_LABELS[row.type] || row.type || '',
      'Kapacitás': row.capacity || 0,
      'Státusz': STATUS_LABELS[row.status] || row.status || '',
      'Havi bérleti díj': row.monthly_rent || '',
      'Megjegyzés': row.notes || '',
      'Alvállalkozó': row.contractor_name || '',
    }));

    sendExcel(res, data, 'szallashelyek.xlsx');
  } catch (error) {
    logger.error('Szálláshelyek export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

/**
 * Hibajegyek exportálása
 */
const exportTickets = async (req, res) => {
  try {
    const { status, category, priority, search } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Contractor access control
    if (!req.user.roles.includes('superadmin')) {
      whereConditions.push(`t.contractor_id = $${paramIndex}`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    if (req.user.roles.includes('contractor')) {
      whereConditions.push(`t.assigned_to = $${paramIndex}`);
      params.push(req.user.id);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`ts.slug = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`tc.slug = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (priority) {
      whereConditions.push(`p.slug = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT
        t.ticket_number,
        t.title,
        ts.name as status_name,
        tc.name as category_name,
        p.name as priority_name,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        assignee.first_name || ' ' || assignee.last_name as assigned_to_name,
        t.created_at,
        t.due_date
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN priorities p ON t.priority_id = p.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      ${whereClause}
      ORDER BY t.created_at DESC`,
      params
    );

    const data = result.rows.map(row => ({
      'Azonosító': row.ticket_number || '',
      'Cím': row.title || '',
      'Státusz': row.status_name || '',
      'Kategória': row.category_name || '',
      'Prioritás': row.priority_name || '',
      'Beküldő': row.created_by_name || '',
      'Felelős': row.assigned_to_name || '',
      'Létrehozva': row.created_at ? new Date(row.created_at).toLocaleDateString('hu-HU') : '',
      'Határidő': row.due_date ? new Date(row.due_date).toLocaleDateString('hu-HU') : '',
    }));

    sendExcel(res, data, 'hibajegyek.xlsx');
  } catch (error) {
    logger.error('Hibajegyek export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

/**
 * Projekt exportálása Excel fájlba (3 munkalap: Projekt, Feladatok, Csapattagok)
 */
const exportProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Project data
    const projectResult = await query(
      `SELECT p.*,
        pm.last_name as pm_last_name, pm.first_name as pm_first_name,
        cc.name as cost_center_name
      FROM projects p
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN cost_centers cc ON p.cost_center_id = cc.id
      WHERE p.id = $1`,
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Projekt nem található' });
    }

    const project = projectResult.rows[0];

    // Tasks
    const tasksResult = await query(
      `SELECT t.*,
        u.last_name as assigned_last_name, u.first_name as assigned_first_name
      FROM project_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.project_id = $1
      ORDER BY t.created_at DESC`,
      [id]
    );

    // Team members
    const teamResult = await query(
      `SELECT ptm.role, ptm.assigned_at,
        u.last_name, u.first_name, u.email
      FROM project_team_members ptm
      JOIN users u ON ptm.user_id = u.id
      WHERE ptm.project_id = $1
      ORDER BY ptm.assigned_at`,
      [id]
    );

    const TEAM_ROLE_LABELS = {
      project_manager: 'Projektvezető',
      member: 'Tag',
      developer: 'Fejlesztő',
      designer: 'Tervező',
      tester: 'Tesztelő',
    };

    const sheets = [
      {
        name: 'Projekt',
        data: [{
          'Név': project.name || '',
          'Kód': project.code || '',
          'Státusz': PROJECT_STATUS_LABELS[project.status] || project.status || '',
          'Prioritás': PRIORITY_LABELS[project.priority] || project.priority || '',
          'Projektvezető': project.pm_last_name ? `${project.pm_last_name} ${project.pm_first_name}` : '',
          'Költségközpont': project.cost_center_name || '',
          'Költségvetés': project.budget || 0,
          'Tényleges költség': project.actual_cost || 0,
          'Kezdés': fmtDate(project.start_date),
          'Befejezés': fmtDate(project.end_date),
          'Leírás': project.description || '',
        }],
      },
      {
        name: 'Feladatok',
        data: tasksResult.rows.map(t => ({
          'Cím': t.title || '',
          'Státusz': TASK_STATUS_LABELS[t.status] || t.status || '',
          'Prioritás': PRIORITY_LABELS[t.priority] || t.priority || '',
          'Felelős': t.assigned_last_name ? `${t.assigned_last_name} ${t.assigned_first_name}` : '',
          'Kezdés': fmtDate(t.start_date),
          'Határidő': fmtDate(t.due_date),
          'Becsült órák': t.estimated_hours || '',
          'Tényleges órák': t.actual_hours || 0,
          'Haladás': `${t.progress || 0}%`,
          'Leírás': t.description || '',
        })),
      },
      {
        name: 'Csapattagok',
        data: teamResult.rows.map(m => ({
          'Név': `${m.last_name} ${m.first_name}`,
          'Email': m.email || '',
          'Szerepkör': TEAM_ROLE_LABELS[m.role] || m.role || '',
          'Hozzáadva': fmtDate(m.assigned_at),
        })),
      },
    ];

    sendMultiSheetExcel(res, sheets, `projekt_${project.code || project.id}.xlsx`);
  } catch (error) {
    logger.error('Projekt export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

/**
 * Projekt feladatainak exportálása CSV fájlba
 */
const exportProjectTasksCsv = async (req, res) => {
  try {
    const { id } = req.params;

    const tasksResult = await query(
      `SELECT t.*,
        u.last_name as assigned_last_name, u.first_name as assigned_first_name
      FROM project_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.project_id = $1
      ORDER BY t.created_at DESC`,
      [id]
    );

    const headers = ['Cím', 'Státusz', 'Prioritás', 'Felelős', 'Kezdés', 'Határidő', 'Becsült órák', 'Tényleges órák', 'Haladás', 'Leírás'];
    const rows = tasksResult.rows.map(t => [
      t.title || '',
      TASK_STATUS_LABELS[t.status] || t.status || '',
      PRIORITY_LABELS[t.priority] || t.priority || '',
      t.assigned_last_name ? `${t.assigned_last_name} ${t.assigned_first_name}` : '',
      fmtDate(t.start_date),
      fmtDate(t.due_date),
      t.estimated_hours || '',
      t.actual_hours || 0,
      `${t.progress || 0}%`,
      (t.description || '').replace(/"/g, '""'),
    ]);

    const escapeCsv = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(',')),
    ].join('\n');

    // UTF-8 BOM for Hungarian characters
    const bom = '\uFEFF';
    const buffer = Buffer.from(bom + csvContent, 'utf-8');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=projekt_feladatok_${id}.csv`);
    res.send(buffer);
  } catch (error) {
    logger.error('Projekt feladatok CSV export hiba:', error);
    res.status(500).json({ success: false, message: 'Export hiba' });
  }
};

module.exports = {
  exportEmployees,
  exportContractors,
  exportAccommodations,
  exportTickets,
  exportProject,
  exportProjectTasksCsv,
};
