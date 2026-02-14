const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Column header mapping (Hungarian → DB field) for bulk import
const COLUMN_MAP = {
  'név': 'first_name',
  'name': 'first_name',
  'keresztnév': 'first_name',
  'first_name': 'first_name',
  'vezetéknév': 'last_name',
  'last_name': 'last_name',
  'email': 'email',
  'e-mail': 'email',
  'telefon': 'phone',
  'phone': 'phone',
  'telefonszám': 'phone',
  'munkakör': 'position',
  'position': 'position',
  'pozíció': 'position',
  'törzsszám': 'employee_number',
  'employee_number': 'employee_number',
  'szálláshely': 'accommodation_name',
  'accommodation': 'accommodation_name',
};

/**
 * Munkavállalói státuszok lekérdezése (dropdown-okhoz)
 */
const getEmployeeStatuses = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM employee_status_types ORDER BY name'
    );

    res.json({
      success: true,
      data: { statuses: result.rows }
    });
  } catch (error) {
    logger.error('Munkavállalói státuszok lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállalói státuszok lekérési hiba'
    });
  }
};

/**
 * Munkavállalók listázása (szűrőkkel, lapozással)
 */
const getEmployees = async (req, res) => {
  try {
    const { search, status_id, accommodation_id, has_accommodation, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['e.end_date IS NULL'];
    let params = [];
    let paramIndex = 1;

    if (status_id && status_id !== 'all') {
      whereConditions.push(`e.status_id = $${paramIndex}`);
      params.push(status_id);
      paramIndex++;
    }

    if (accommodation_id && accommodation_id !== 'all') {
      whereConditions.push(`e.accommodation_id = $${paramIndex}`);
      params.push(accommodation_id);
      paramIndex++;
    }

    if (has_accommodation === 'true') {
      whereConditions.push('e.accommodation_id IS NOT NULL');
    } else if (has_accommodation === 'false') {
      whereConditions.push('e.accommodation_id IS NULL');
    }

    if (search) {
      whereConditions.push(
        `(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR e.employee_number ILIKE $${paramIndex} OR CONCAT(u.last_name, ' ', u.first_name) ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM employees e
       LEFT JOIN users u ON e.user_id = u.id
       ${whereClause}`,
      params
    );

    const employeesQuery = `
      SELECT
        e.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        est.name as status_name,
        est.color as status_color,
        est.slug as status_slug,
        a.name as accommodation_name
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const result = await query(employeesQuery, params);

    res.json({
      success: true,
      data: {
        employees: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Munkavállalók lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállalók lekérési hiba'
    });
  }
};

/**
 * Egy munkavállaló részletei
 */
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employeeQuery = `
      SELECT
        e.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        est.name as status_name,
        est.color as status_color,
        est.slug as status_slug,
        a.name as accommodation_name,
        a.address as accommodation_address
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      WHERE e.id = $1
    `;

    const result = await query(employeeQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavállaló nem található'
      });
    }

    res.json({
      success: true,
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    logger.error('Munkavállaló lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállaló lekérési hiba'
    });
  }
};

/**
 * Új munkavállaló létrehozása
 */
const createEmployee = async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone,
      employee_number, position, start_date,
      status_id, accommodation_id, contractor_id, notes
    } = req.body;

    if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vezetéknév és keresztnév megadása kötelező'
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Érvénytelen email cím'
      });
    }

    // Auto-generate employee_number if not provided
    let finalEmployeeNumber = employee_number;
    if (!finalEmployeeNumber) {
      const countResult = await query('SELECT COUNT(*) as cnt FROM employees');
      const nextNum = parseInt(countResult.rows[0].cnt) + 1;
      finalEmployeeNumber = `EMP-${String(nextNum).padStart(4, '0')}`;
    }

    // Create or find user
    let userId = null;
    if (email) {
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      }
    }

    // Verify accommodation exists if provided
    if (accommodation_id) {
      const accCheck = await query('SELECT id FROM accommodations WHERE id = $1', [accommodation_id]);
      if (accCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott szálláshely nem található'
        });
      }
    }

    // Verify status exists if provided
    let finalStatusId = status_id;
    if (!finalStatusId) {
      const activeStatus = await query("SELECT id FROM employee_status_types WHERE slug = 'active'");
      if (activeStatus.rows.length > 0) {
        finalStatusId = activeStatus.rows[0].id;
      }
    }

    const insertQuery = `
      INSERT INTO employees (user_id, contractor_id, employee_number, status_id, position, start_date, accommodation_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(insertQuery, [
      userId,
      contractor_id || null,
      finalEmployeeNumber,
      finalStatusId || null,
      position || null,
      start_date || null,
      accommodation_id || null,
      notes || null,
    ]);

    // If no user exists but we have name/email, create one
    if (!userId && email) {
      const bcrypt = require('bcryptjs');
      const tempPassword = await bcrypt.hash('changeme123', 10);
      const userResult = await query(
        `INSERT INTO users (first_name, last_name, email, phone, password_hash, contractor_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [first_name.trim(), last_name.trim(), email, phone || null, tempPassword, contractor_id || null]
      );
      userId = userResult.rows[0].id;

      // Assign accommodated_employee role
      const roleResult = await query("SELECT id FROM roles WHERE slug = 'accommodated_employee'");
      if (roleResult.rows.length > 0) {
        await query(
          'INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userId, roleResult.rows[0].id, contractor_id || null]
        );
      }

      // Link user to employee
      await query('UPDATE employees SET user_id = $1 WHERE id = $2', [userId, result.rows[0].id]);
      result.rows[0].user_id = userId;
    }

    logger.info('Új munkavállaló létrehozva', { employeeId: result.rows[0].id });

    res.status(201).json({
      success: true,
      message: 'Munkavállaló sikeresen létrehozva',
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'unique_employee_number') {
      return res.status(400).json({
        success: false,
        message: 'Ez a törzsszám már létezik'
      });
    }
    logger.error('Munkavállaló létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállaló létrehozási hiba'
    });
  }
};

/**
 * Munkavállaló frissítése
 */
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      employee_number, position, start_date, end_date,
      status_id, accommodation_id, notes, contractor_id
    } = req.body;

    const existing = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavállaló nem található'
      });
    }

    // Verify accommodation if provided
    if (accommodation_id !== undefined && accommodation_id !== null && accommodation_id !== '') {
      const accCheck = await query('SELECT id FROM accommodations WHERE id = $1', [accommodation_id]);
      if (accCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott szálláshely nem található'
        });
      }
    }

    // Dynamic SET builder
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (employee_number !== undefined) {
      fields.push(`employee_number = $${paramIndex}`);
      params.push(employee_number || null);
      paramIndex++;
    }

    if (position !== undefined) {
      fields.push(`position = $${paramIndex}`);
      params.push(position || null);
      paramIndex++;
    }

    if (start_date !== undefined) {
      fields.push(`start_date = $${paramIndex}`);
      params.push(start_date || null);
      paramIndex++;
    }

    if (end_date !== undefined) {
      fields.push(`end_date = $${paramIndex}`);
      params.push(end_date || null);
      paramIndex++;
    }

    if (status_id !== undefined) {
      fields.push(`status_id = $${paramIndex}`);
      params.push(status_id || null);
      paramIndex++;
    }

    if (accommodation_id !== undefined) {
      fields.push(`accommodation_id = $${paramIndex}`);
      params.push(accommodation_id || null);
      paramIndex++;
    }

    if (notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      params.push(notes || null);
      paramIndex++;
    }

    if (contractor_id !== undefined) {
      fields.push(`contractor_id = $${paramIndex}`);
      params.push(contractor_id || null);
      paramIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs frissítendő mező'
      });
    }

    params.push(id);
    const updateQuery = `
      UPDATE employees SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    logger.info('Munkavállaló frissítve', { employeeId: id });

    res.json({
      success: true,
      message: 'Munkavállaló sikeresen frissítve',
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'unique_employee_number') {
      return res.status(400).json({
        success: false,
        message: 'Ez a törzsszám már létezik'
      });
    }
    logger.error('Munkavállaló frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállaló frissítési hiba'
    });
  }
};

/**
 * Munkavállaló törlése (soft delete: end_date beállítása + szálláshely eltávolítása)
 */
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavállaló nem található'
      });
    }

    // Get "Kilépett" status
    const leftStatus = await query("SELECT id FROM employee_status_types WHERE slug = 'left'");
    const leftStatusId = leftStatus.rows.length > 0 ? leftStatus.rows[0].id : null;

    await query(
      `UPDATE employees
       SET end_date = CURRENT_DATE,
           accommodation_id = NULL,
           status_id = COALESCE($2, status_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, leftStatusId]
    );

    logger.info('Munkavállaló deaktiválva', { employeeId: id });

    res.json({
      success: true,
      message: 'Munkavállaló sikeresen deaktiválva'
    });
  } catch (error) {
    logger.error('Munkavállaló törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavállaló törlési hiba'
    });
  }
};

/**
 * Tömeges munkavállaló importálás Excel/CSV fájlból
 */
const bulkImportEmployees = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Fájl feltöltése kötelező'
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A fájl üres vagy nem tartalmaz adatokat'
      });
    }

    // Map column headers
    const rows = rawRows.map(raw => {
      const mapped = {};
      for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = key.toLowerCase().trim();
        const dbField = COLUMN_MAP[normalizedKey];
        if (dbField) {
          mapped[dbField] = typeof value === 'string' ? value.trim() : String(value);
        }
      }
      return mapped;
    });

    // Get active status id
    const activeStatusResult = await query("SELECT id FROM employee_status_types WHERE slug = 'active'");
    const activeStatusId = activeStatusResult.rows.length > 0 ? activeStatusResult.rows[0].id : null;

    // Load accommodations for name lookup
    const accResult = await query('SELECT id, name FROM accommodations WHERE is_active = true');
    const accMap = {};
    accResult.rows.forEach(a => {
      accMap[a.name.toLowerCase()] = a.id;
    });

    const imported = [];
    const errors = [];

    await transaction(async (client) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        // Need at least a last_name
        if (!row.last_name && !row.first_name) {
          errors.push({ row: rowNum, message: 'Hiányzó név' });
          continue;
        }

        if (row.email && !isValidEmail(row.email)) {
          errors.push({ row: rowNum, message: `Érvénytelen email: ${row.email}` });
          continue;
        }

        // Resolve accommodation name to id
        let accommodationId = null;
        if (row.accommodation_name) {
          accommodationId = accMap[row.accommodation_name.toLowerCase()] || null;
          if (!accommodationId) {
            errors.push({ row: rowNum, message: `Ismeretlen szálláshely: ${row.accommodation_name}` });
            continue;
          }
        }

        // Auto-generate employee number
        let empNumber = row.employee_number;
        if (!empNumber) {
          const countResult = await client.query('SELECT COUNT(*) as cnt FROM employees');
          const nextNum = parseInt(countResult.rows[0].cnt) + imported.length + 1;
          empNumber = `EMP-${String(nextNum).padStart(4, '0')}`;
        }

        // Check if user exists by email
        let userId = null;
        if (row.email) {
          const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [row.email]);
          if (userCheck.rows.length > 0) {
            userId = userCheck.rows[0].id;
          }
        }

        try {
          const result = await client.query(
            `INSERT INTO employees (user_id, employee_number, status_id, position, start_date, accommodation_id)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)
             RETURNING id, employee_number`,
            [
              userId,
              empNumber,
              activeStatusId,
              row.position || null,
              accommodationId,
            ]
          );
          imported.push(result.rows[0]);
        } catch (err) {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    });

    logger.info('Tömeges munkavállaló import', {
      imported: imported.length,
      errors: errors.length
    });

    res.json({
      success: true,
      message: `${imported.length} munkavállaló sikeresen importálva`,
      data: {
        imported: imported.length,
        errors
      }
    });
  } catch (error) {
    logger.error('Tömeges munkavállaló import hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tömeges import hiba'
    });
  }
};

module.exports = {
  getEmployeeStatuses,
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  bulkImportEmployees,
};
