const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity, diffObjects } = require('../utils/activityLogger');
const { isValidUUID, sanitizeString, validateAmount, parsePagination, parseSortOrder } = require('../utils/validation');

const VALID_LEVELS = ['junior', 'medior', 'senior', 'lead', 'manager', 'director'];
const VALID_CHANGE_TYPES = ['initial', 'raise', 'promotion', 'adjustment', 'demotion', 'annual_review'];
const VALID_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'];

// ============================================
// SALARY BANDS
// ============================================

/**
 * GET /api/v1/salary/bands
 * Bérsávok listája
 */
const getBands = async (req, res) => {
  try {
    const { department, level, position, is_active, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['sb.deleted_at IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (department) {
      whereConditions.push(`sb.department ILIKE $${paramIndex}`);
      params.push(`%${department}%`);
      paramIndex++;
    }

    if (level) {
      whereConditions.push(`sb.level = $${paramIndex}`);
      params.push(level);
      paramIndex++;
    }

    if (position) {
      whereConditions.push(`sb.position_name ILIKE $${paramIndex}`);
      params.push(`%${position}%`);
      paramIndex++;
    }

    if (is_active !== undefined && is_active !== '') {
      whereConditions.push(`sb.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM salary_bands sb ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT sb.*,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name,
        (SELECT COUNT(*) FROM employee_salaries es WHERE es.salary_band_id = sb.id AND es.deleted_at IS NULL AND es.end_date IS NULL) as employee_count
       FROM salary_bands sb
       LEFT JOIN users u ON sb.created_by = u.id
       ${whereClause}
       ORDER BY sb.department, sb.position_name, sb.level
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        salary_bands: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Bérsávok lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérsávok lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/salary/bands/:id
 */
const getBandById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const result = await query(
      `SELECT sb.*,
        u.first_name as created_by_first_name, u.last_name as created_by_last_name
       FROM salary_bands sb
       LEFT JOIN users u ON sb.created_by = u.id
       WHERE sb.id = $1 AND sb.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérsáv nem található' });
    }

    res.json({ success: true, data: { salary_band: result.rows[0] } });
  } catch (error) {
    logger.error('Bérsáv lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérsáv lekérdezési hiba' });
  }
};

/**
 * POST /api/v1/salary/bands
 */
const createBand = async (req, res) => {
  try {
    const { level, employment_type, currency } = req.body;

    // Sanitize string inputs (trim + length limit)
    const position_name = sanitizeString(req.body.position_name, 255);
    const department = sanitizeString(req.body.department, 255);
    const location = sanitizeString(req.body.location, 255);
    const notes = sanitizeString(req.body.notes, 2000);

    if (!position_name || req.body.min_salary === undefined || req.body.max_salary === undefined) {
      return res.status(400).json({ success: false, message: 'Pozíció, minimum és maximum bér megadása kötelező' });
    }

    // Validate amounts — must be positive and within range
    const minVal = validateAmount(req.body.min_salary);
    if (!minVal.valid) {
      return res.status(400).json({ success: false, message: `Minimum bér: ${minVal.error}` });
    }
    const maxVal = validateAmount(req.body.max_salary);
    if (!maxVal.valid) {
      return res.status(400).json({ success: false, message: `Maximum bér: ${maxVal.error}` });
    }

    if (minVal.value > maxVal.value) {
      return res.status(400).json({ success: false, message: 'A minimum bér nem lehet nagyobb a maximum bérnél' });
    }

    let medianVal = null;
    if (req.body.median_salary !== undefined && req.body.median_salary !== null) {
      const mv = validateAmount(req.body.median_salary);
      if (!mv.valid) {
        return res.status(400).json({ success: false, message: `Medián bér: ${mv.error}` });
      }
      medianVal = mv.value;
    }

    if (level && !VALID_LEVELS.includes(level)) {
      return res.status(400).json({ success: false, message: `Érvénytelen szint. Lehetséges: ${VALID_LEVELS.join(', ')}` });
    }

    if (employment_type && !VALID_EMPLOYMENT_TYPES.includes(employment_type)) {
      return res.status(400).json({ success: false, message: `Érvénytelen foglalkoztatási típus` });
    }

    const result = await query(
      `INSERT INTO salary_bands (position_name, department, level, min_salary, max_salary, median_salary, currency, employment_type, location, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [position_name, department, level || null, minVal.value, maxVal.value,
       medianVal, currency || 'HUF', employment_type || 'full_time',
       location, notes, req.user.id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'salary_band',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { position_name, department, level }
    });

    res.status(201).json({
      success: true,
      message: 'Bérsáv létrehozva',
      data: { salary_band: result.rows[0] }
    });
  } catch (error) {
    logger.error('Bérsáv létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Bérsáv létrehozási hiba' });
  }
};

/**
 * PUT /api/v1/salary/bands/:id
 */
const updateBand = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const { position_name, department, level, min_salary, max_salary, median_salary, currency, employment_type, location, is_active, notes } = req.body;

    const current = await query('SELECT * FROM salary_bands WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérsáv nem található' });
    }

    if (level && !VALID_LEVELS.includes(level)) {
      return res.status(400).json({ success: false, message: `Érvénytelen szint` });
    }

    const newMin = min_salary !== undefined ? parseFloat(min_salary) : parseFloat(current.rows[0].min_salary);
    const newMax = max_salary !== undefined ? parseFloat(max_salary) : parseFloat(current.rows[0].max_salary);
    if (newMin > newMax) {
      return res.status(400).json({ success: false, message: 'A minimum bér nem lehet nagyobb a maximum bérnél' });
    }

    const result = await query(
      `UPDATE salary_bands SET
        position_name = COALESCE($1, position_name),
        department = COALESCE($2, department),
        level = COALESCE($3, level),
        min_salary = COALESCE($4, min_salary),
        max_salary = COALESCE($5, max_salary),
        median_salary = COALESCE($6, median_salary),
        currency = COALESCE($7, currency),
        employment_type = COALESCE($8, employment_type),
        location = COALESCE($9, location),
        is_active = COALESCE($10, is_active),
        notes = COALESCE($11, notes),
        updated_at = NOW()
       WHERE id = $12 AND deleted_at IS NULL
       RETURNING *`,
      [position_name, department, level, min_salary, max_salary, median_salary, currency, employment_type, location, is_active, notes, id]
    );

    const changes = diffObjects(current.rows[0], result.rows[0], ['position_name', 'min_salary', 'max_salary', 'level']);
    if (changes) {
      await logActivity({ userId: req.user.id, entityType: 'salary_band', entityId: id, action: 'update', changes });
    }

    res.json({ success: true, message: 'Bérsáv frissítve', data: { salary_band: result.rows[0] } });
  } catch (error) {
    logger.error('Bérsáv frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérsáv frissítési hiba' });
  }
};

/**
 * DELETE /api/v1/salary/bands/:id
 */
const deleteBand = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const current = await query('SELECT * FROM salary_bands WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérsáv nem található' });
    }

    await query('UPDATE salary_bands SET deleted_at = NOW() WHERE id = $1', [id]);

    await logActivity({
      userId: req.user.id, entityType: 'salary_band', entityId: id, action: 'delete',
      metadata: { position_name: current.rows[0].position_name }
    });

    res.json({ success: true, message: 'Bérsáv törölve' });
  } catch (error) {
    logger.error('Bérsáv törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérsáv törlési hiba' });
  }
};

// ============================================
// EMPLOYEE SALARIES
// ============================================

/**
 * GET /api/v1/salary/employees
 * Munkavállalói bérek listája
 */
const getEmployeeSalaries = async (req, res) => {
  try {
    const { employee_id, department, salary_band_id, current_only, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['es.deleted_at IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (employee_id) {
      whereConditions.push(`es.employee_id = $${paramIndex}`);
      params.push(employee_id);
      paramIndex++;
    }

    if (department) {
      whereConditions.push(`ou.name ILIKE $${paramIndex}`);
      params.push(`%${department}%`);
      paramIndex++;
    }

    if (salary_band_id) {
      whereConditions.push(`es.salary_band_id = $${paramIndex}`);
      params.push(salary_band_id);
      paramIndex++;
    }

    if (current_only === 'true') {
      whereConditions.push('es.end_date IS NULL');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT es.*,
        e.first_name as employee_first_name, e.last_name as employee_last_name,
        ou.name as employee_department, e.position as employee_position,
        sb.position_name as band_position, sb.min_salary as band_min, sb.max_salary as band_max, sb.level as band_level
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       LEFT JOIN salary_bands sb ON es.salary_band_id = sb.id
       ${whereClause}
       ORDER BY es.effective_date DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        employee_salaries: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Munkavállalói bérek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Munkavállalói bérek lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/salary/employees/:id
 */
const getEmployeeSalaryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const result = await query(
      `SELECT es.*,
        e.first_name as employee_first_name, e.last_name as employee_last_name,
        ou.name as employee_department, e.position as employee_position,
        sb.position_name as band_position, sb.min_salary as band_min, sb.max_salary as band_max
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       LEFT JOIN salary_bands sb ON es.salary_band_id = sb.id
       WHERE es.id = $1 AND es.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérrekord nem található' });
    }

    res.json({ success: true, data: { employee_salary: result.rows[0] } });
  } catch (error) {
    logger.error('Bérrekord lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérrekord lekérdezési hiba' });
  }
};

/**
 * POST /api/v1/salary/employees
 * Új bérrekord (bérmegállapítás/emelés)
 */
const createEmployeeSalary = async (req, res) => {
  try {
    const { employee_id, net_salary, currency, salary_band_id, effective_date, change_reason, change_type, notes } = req.body;

    if (!employee_id || req.body.gross_salary === undefined || !effective_date) {
      return res.status(400).json({ success: false, message: 'Munkavállaló, bruttó bér és hatályos dátum megadása kötelező' });
    }

    if (!isValidUUID(employee_id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen munkavállaló azonosító' });
    }

    if (salary_band_id && !isValidUUID(salary_band_id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen bérsáv azonosító' });
    }

    const grossVal = validateAmount(req.body.gross_salary);
    if (!grossVal.valid) {
      return res.status(400).json({ success: false, message: `Bruttó bér: ${grossVal.error}` });
    }
    const gross_salary = grossVal.value;

    if (change_type && !VALID_CHANGE_TYPES.includes(change_type)) {
      return res.status(400).json({ success: false, message: `Érvénytelen változás típus. Lehetséges: ${VALID_CHANGE_TYPES.join(', ')}` });
    }

    // Check employee exists
    const empCheck = await query('SELECT id, first_name, last_name FROM employees WHERE id = $1', [employee_id]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    }

    // Close previous active salary record
    await query(
      `UPDATE employee_salaries SET end_date = $1, updated_at = NOW()
       WHERE employee_id = $2 AND end_date IS NULL AND deleted_at IS NULL`,
      [effective_date, employee_id]
    );

    const result = await query(
      `INSERT INTO employee_salaries (employee_id, gross_salary, net_salary, currency, salary_band_id, effective_date, change_reason, change_type, notes, approved_by, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [employee_id, gross_salary, net_salary || null, currency || 'HUF', salary_band_id || null,
       effective_date, change_reason || null, change_type || 'initial', notes || null, req.user.id, req.user.id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'employee_salary',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { employee_id, gross_salary, change_type, employee_name: `${empCheck.rows[0].first_name} ${empCheck.rows[0].last_name}` }
    });

    res.status(201).json({
      success: true,
      message: 'Bérrekord létrehozva',
      data: { employee_salary: result.rows[0] }
    });
  } catch (error) {
    logger.error('Bérrekord létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Bérrekord létrehozási hiba' });
  }
};

/**
 * PUT /api/v1/salary/employees/:id
 */
const updateEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const { gross_salary, net_salary, currency, salary_band_id, effective_date, end_date, change_reason, change_type, notes } = req.body;

    const current = await query('SELECT * FROM employee_salaries WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérrekord nem található' });
    }

    if (change_type && !VALID_CHANGE_TYPES.includes(change_type)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen változás típus' });
    }

    const result = await query(
      `UPDATE employee_salaries SET
        gross_salary = COALESCE($1, gross_salary),
        net_salary = COALESCE($2, net_salary),
        currency = COALESCE($3, currency),
        salary_band_id = COALESCE($4, salary_band_id),
        effective_date = COALESCE($5, effective_date),
        end_date = COALESCE($6, end_date),
        change_reason = COALESCE($7, change_reason),
        change_type = COALESCE($8, change_type),
        notes = COALESCE($9, notes),
        updated_at = NOW()
       WHERE id = $10 AND deleted_at IS NULL
       RETURNING *`,
      [gross_salary, net_salary, currency, salary_band_id, effective_date, end_date, change_reason, change_type, notes, id]
    );

    const changes = diffObjects(current.rows[0], result.rows[0], ['gross_salary', 'effective_date', 'change_type']);
    if (changes) {
      await logActivity({ userId: req.user.id, entityType: 'employee_salary', entityId: id, action: 'update', changes });
    }

    res.json({ success: true, message: 'Bérrekord frissítve', data: { employee_salary: result.rows[0] } });
  } catch (error) {
    logger.error('Bérrekord frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérrekord frissítési hiba' });
  }
};

/**
 * DELETE /api/v1/salary/employees/:id
 */
const deleteEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const current = await query('SELECT * FROM employee_salaries WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bérrekord nem található' });
    }

    await query('UPDATE employee_salaries SET deleted_at = NOW() WHERE id = $1', [id]);

    await logActivity({
      userId: req.user.id, entityType: 'employee_salary', entityId: id, action: 'delete',
      metadata: { employee_id: current.rows[0].employee_id }
    });

    res.json({ success: true, message: 'Bérrekord törölve' });
  } catch (error) {
    logger.error('Bérrekord törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Bérrekord törlési hiba' });
  }
};

// ============================================
// STATISTICS & ANALYTICS
// ============================================

/**
 * GET /api/v1/salary/stats
 * Bér statisztikák és összesítés
 */
const getStats = async (req, res) => {
  try {
    const { department } = req.query;

    let deptFilter = '';
    let params = [];
    if (department) {
      deptFilter = 'AND ou.name ILIKE $1';
      params = [`%${department}%`];
    }

    // Overall salary stats
    const overallStats = await query(
      `SELECT
        COUNT(*) as total_employees,
        ROUND(AVG(es.gross_salary), 0) as avg_salary,
        ROUND(MIN(es.gross_salary), 0) as min_salary,
        ROUND(MAX(es.gross_salary), 0) as max_salary,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY es.gross_salary)::numeric, 0) as median_salary
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE es.deleted_at IS NULL AND es.end_date IS NULL ${deptFilter}`,
      params
    );

    // Stats by department
    const deptStats = await query(
      `SELECT
        ou.name as department,
        COUNT(*) as employee_count,
        ROUND(AVG(es.gross_salary), 0) as avg_salary,
        ROUND(MIN(es.gross_salary), 0) as min_salary,
        ROUND(MAX(es.gross_salary), 0) as max_salary,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY es.gross_salary)::numeric, 0) as median_salary
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE es.deleted_at IS NULL AND es.end_date IS NULL AND ou.name IS NOT NULL ${deptFilter}
       GROUP BY ou.name
       ORDER BY avg_salary DESC`,
      params
    );

    // Stats by level (from salary bands)
    const levelStats = await query(
      `SELECT
        sb.level,
        COUNT(*) as employee_count,
        ROUND(AVG(es.gross_salary), 0) as avg_salary,
        ROUND(MIN(es.gross_salary), 0) as min_salary,
        ROUND(MAX(es.gross_salary), 0) as max_salary
       FROM employee_salaries es
       LEFT JOIN salary_bands sb ON es.salary_band_id = sb.id
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE es.deleted_at IS NULL AND es.end_date IS NULL AND sb.level IS NOT NULL ${deptFilter}
       GROUP BY sb.level
       ORDER BY avg_salary DESC`,
      params
    );

    // Gender pay gap (if gender data available)
    const genderStats = await query(
      `SELECT
        e.gender,
        COUNT(*) as employee_count,
        ROUND(AVG(es.gross_salary), 0) as avg_salary,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY es.gross_salary)::numeric, 0) as median_salary
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE es.deleted_at IS NULL AND es.end_date IS NULL AND e.gender IS NOT NULL ${deptFilter}
       GROUP BY e.gender
       ORDER BY e.gender`,
      params
    );

    // Salary bands count
    const bandsCount = await query(
      'SELECT COUNT(*) as total FROM salary_bands WHERE deleted_at IS NULL AND is_active = true'
    );

    // Recent changes
    const recentChanges = await query(
      `SELECT es.*, e.first_name, e.last_name, ou.name as department
       FROM employee_salaries es
       LEFT JOIN employees e ON es.employee_id = e.id
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE es.deleted_at IS NULL ${deptFilter}
       ORDER BY es.created_at DESC
       LIMIT 10`,
      params
    );

    res.json({
      success: true,
      data: {
        overall: overallStats.rows[0] || {},
        by_department: deptStats.rows,
        by_level: levelStats.rows,
        gender_gap: genderStats.rows,
        active_bands: parseInt(bandsCount.rows[0].total),
        recent_changes: recentChanges.rows
      }
    });
  } catch (error) {
    logger.error('Bér statisztikák hiba:', error);
    res.status(500).json({ success: false, message: 'Bér statisztikák lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/salary/employees/:employeeId/history
 * Egy munkavállaló bértörténete
 */
const getEmployeeSalaryHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!isValidUUID(employeeId)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen munkavállaló azonosító' });
    }

    const result = await query(
      `SELECT es.*,
        sb.position_name as band_position, sb.min_salary as band_min, sb.max_salary as band_max, sb.level as band_level,
        u.first_name as approved_by_first_name, u.last_name as approved_by_last_name
       FROM employee_salaries es
       LEFT JOIN salary_bands sb ON es.salary_band_id = sb.id
       LEFT JOIN users u ON es.approved_by = u.id
       WHERE es.employee_id = $1 AND es.deleted_at IS NULL
       ORDER BY es.effective_date DESC`,
      [employeeId]
    );

    res.json({
      success: true,
      data: { salary_history: result.rows }
    });
  } catch (error) {
    logger.error('Bértörténet lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Bértörténet lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/salary/departments
 * Elérhető részlegek listája (for filters)
 */
const getDepartments = async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ou.name as department FROM employees e
       LEFT JOIN organizational_units ou ON e.organizational_unit_id = ou.id
       WHERE ou.name IS NOT NULL ORDER BY ou.name`
    );
    res.json({ success: true, data: { departments: result.rows.map(r => r.department) } });
  } catch (error) {
    logger.error('Részlegek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Részlegek lekérdezési hiba' });
  }
};

module.exports = {
  getBands,
  getBandById,
  createBand,
  updateBand,
  deleteBand,
  getEmployeeSalaries,
  getEmployeeSalaryById,
  createEmployeeSalary,
  updateEmployeeSalary,
  deleteEmployeeSalary,
  getStats,
  getEmployeeSalaryHistory,
  getDepartments,
};
