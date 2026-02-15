const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');
const { parseFiltersParam, buildFilterWhere } = require('../utils/filterBuilder');

const EMPLOYEE_FILTER_FIELD_MAP = {
  status: 'est.name',
  workplace: 'e.workplace',
  gender: 'e.gender',
  marital_status: 'e.marital_status',
  position: 'e.position',
  country: 'e.permanent_address_country',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Column header mapping (Hungarian -> DB field) for bulk import
const COLUMN_MAP = {
  'nev': 'first_name',
  'név': 'first_name',
  'name': 'first_name',
  'keresztnév': 'first_name',
  'keresztnev': 'first_name',
  'first_name': 'first_name',
  'vezetéknév': 'last_name',
  'vezeteknev': 'last_name',
  'last_name': 'last_name',
  'email': 'email',
  'e-mail': 'email',
  'telefon': 'phone',
  'phone': 'phone',
  'telefonszám': 'phone',
  'telefonszam': 'phone',
  'munkakör': 'position',
  'munkakor': 'position',
  'position': 'position',
  'pozíció': 'position',
  'pozicio': 'position',
  'törzsszám': 'employee_number',
  'torzsszam': 'employee_number',
  'employee_number': 'employee_number',
  'szálláshely': 'accommodation_name',
  'szallashely': 'accommodation_name',
  'accommodation': 'accommodation_name',
  // New fields
  'nem': 'gender',
  'gender': 'gender',
  'születési dátum': 'birth_date',
  'szuletesi datum': 'birth_date',
  'birth_date': 'birth_date',
  'születési hely': 'birth_place',
  'szuletesi hely': 'birth_place',
  'birth_place': 'birth_place',
  'anyja neve': 'mothers_name',
  'mothers_name': 'mothers_name',
  'adóazonosító': 'tax_id',
  'adoazonosito': 'tax_id',
  'tax_id': 'tax_id',
  'útlevélszám': 'passport_number',
  'utlevelszam': 'passport_number',
  'passport_number': 'passport_number',
  'taj szám': 'social_security_number',
  'taj szam': 'social_security_number',
  'social_security_number': 'social_security_number',
  'családi állapot': 'marital_status',
  'csaladi allapot': 'marital_status',
  'marital_status': 'marital_status',
  'érkezés dátuma': 'arrival_date',
  'erkezes datuma': 'arrival_date',
  'arrival_date': 'arrival_date',
  'vízum lejárat': 'visa_expiry',
  'vizum lejarat': 'visa_expiry',
  'visa_expiry': 'visa_expiry',
  'szobaszám': 'room_number',
  'szobaszam': 'room_number',
  'room_number': 'room_number',
  'bankszámlaszám': 'bank_account',
  'bankszamlaszam': 'bank_account',
  'bank_account': 'bank_account',
  'munkahely': 'workplace',
  'workplace': 'workplace',
  'irányítószám': 'permanent_address_zip',
  'iranyitoszam': 'permanent_address_zip',
  'permanent_address_zip': 'permanent_address_zip',
  'ország': 'permanent_address_country',
  'orszag': 'permanent_address_country',
  'permanent_address_country': 'permanent_address_country',
  'megye': 'permanent_address_county',
  'permanent_address_county': 'permanent_address_county',
  'város': 'permanent_address_city',
  'varos': 'permanent_address_city',
  'permanent_address_city': 'permanent_address_city',
  'utca': 'permanent_address_street',
  'permanent_address_street': 'permanent_address_street',
  'házszám': 'permanent_address_number',
  'hazszam': 'permanent_address_number',
  'permanent_address_number': 'permanent_address_number',
  'cégnév': 'company_name',
  'cegnev': 'company_name',
  'cég neve': 'company_name',
  'ceg neve': 'company_name',
  'company_name': 'company_name',
  'céges email': 'company_email',
  'ceges email': 'company_email',
  'company_email': 'company_email',
  'céges telefon': 'company_phone',
  'ceges telefon': 'company_phone',
  'company_phone': 'company_phone',
};

// All new employee-specific columns (stored directly on employees table)
const EMPLOYEE_DIRECT_FIELDS = [
  'first_name', 'last_name', 'gender', 'birth_date', 'birth_place',
  'mothers_name', 'tax_id', 'passport_number', 'social_security_number',
  'marital_status', 'arrival_date', 'visa_expiry', 'room_number',
  'bank_account', 'workplace', 'permanent_address_zip',
  'permanent_address_country', 'permanent_address_county',
  'permanent_address_city', 'permanent_address_street',
  'permanent_address_number', 'company_name', 'company_email',
  'company_phone',
];

/**
 * Munkavallaloi statuszok lekerdezese (dropdown-okhoz)
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
    logger.error('Munkavallaloi statuszok lekerdesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallaloi statuszok lekerdesi hiba'
    });
  }
};

/**
 * Munkavallalok listazasa (szurokkel, lapozassal)
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
        `(COALESCE(e.first_name, u.first_name, '') ILIKE $${paramIndex} OR COALESCE(e.last_name, u.last_name, '') ILIKE $${paramIndex} OR COALESCE(u.email, '') ILIKE $${paramIndex} OR COALESCE(e.employee_number, '') ILIKE $${paramIndex} OR CONCAT(COALESCE(e.last_name, u.last_name, ''), ' ', COALESCE(e.first_name, u.first_name, '')) ILIKE $${paramIndex} OR COALESCE(e.workplace, '') ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Dynamic multi-filter support
    const filters = parseFiltersParam(req.query.filters);
    if (filters.length > 0) {
      const fr = buildFilterWhere(filters, EMPLOYEE_FILTER_FIELD_MAP, { startParamIndex: paramIndex });
      if (fr.sql) {
        whereConditions.push(fr.sql.replace(/^ AND /, ''));
        params.push(...fr.params);
        paramIndex = fr.nextParamIndex;
      }
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM employees e
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN employee_status_types est ON e.status_id = est.id
       ${whereClause}`,
      params
    );

    const employeesQuery = `
      SELECT
        e.id, e.user_id, e.contractor_id, e.employee_number, e.status_id,
        e.position, e.start_date, e.end_date, e.accommodation_id, e.notes,
        e.gender, e.birth_date, e.birth_place, e.mothers_name,
        e.tax_id, e.passport_number, e.social_security_number, e.marital_status,
        e.arrival_date, e.visa_expiry, e.room_number, e.bank_account, e.workplace,
        e.permanent_address_zip, e.permanent_address_country,
        e.permanent_address_county, e.permanent_address_city,
        e.permanent_address_street, e.permanent_address_number,
        e.company_name, e.company_email, e.company_phone,
        e.created_at, e.updated_at,
        COALESCE(e.first_name, u.first_name) as first_name,
        COALESCE(e.last_name, u.last_name) as last_name,
        COALESCE(u.email, '') as email,
        COALESCE(u.phone, '') as phone,
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
    logger.error('Munkavallalok lekerdesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallalok lekerdesi hiba'
    });
  }
};

/**
 * Egy munkavallaló reszletei
 */
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employeeQuery = `
      SELECT
        e.id, e.user_id, e.contractor_id, e.employee_number, e.status_id,
        e.position, e.start_date, e.end_date, e.accommodation_id, e.notes,
        e.gender, e.birth_date, e.birth_place, e.mothers_name,
        e.tax_id, e.passport_number, e.social_security_number, e.marital_status,
        e.arrival_date, e.visa_expiry, e.room_number, e.bank_account, e.workplace,
        e.permanent_address_zip, e.permanent_address_country,
        e.permanent_address_county, e.permanent_address_city,
        e.permanent_address_street, e.permanent_address_number,
        e.company_name, e.company_email, e.company_phone,
        e.created_at, e.updated_at,
        COALESCE(e.first_name, u.first_name) as first_name,
        COALESCE(e.last_name, u.last_name) as last_name,
        COALESCE(u.email, '') as email,
        COALESCE(u.phone, '') as phone,
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
        message: 'Munkavallaló nem talalhato'
      });
    }

    res.json({
      success: true,
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    logger.error('Munkavallaló lekerdesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallaló lekerdesi hiba'
    });
  }
};

/**
 * Uj munkavallaló letrehozasa
 */
const createEmployee = async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone,
      employee_number, position, start_date,
      status_id, accommodation_id, contractor_id, notes,
      // New fields
      gender, birth_date, birth_place, mothers_name,
      tax_id, passport_number, social_security_number, marital_status,
      arrival_date, visa_expiry, room_number, bank_account, workplace,
      permanent_address_zip, permanent_address_country,
      permanent_address_county, permanent_address_city,
      permanent_address_street, permanent_address_number,
      company_name, company_email, company_phone,
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
      INSERT INTO employees (
        user_id, contractor_id, employee_number, status_id, position,
        start_date, accommodation_id, notes,
        first_name, last_name, gender, birth_date, birth_place, mothers_name,
        tax_id, passport_number, social_security_number, marital_status,
        arrival_date, visa_expiry, room_number, bank_account, workplace,
        permanent_address_zip, permanent_address_country,
        permanent_address_county, permanent_address_city,
        permanent_address_street, permanent_address_number,
        company_name, company_email, company_phone
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29,
        $30, $31, $32
      )
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
      first_name ? first_name.trim() : null,
      last_name ? last_name.trim() : null,
      gender || null,
      birth_date || null,
      birth_place || null,
      mothers_name || null,
      tax_id || null,
      passport_number || null,
      social_security_number || null,
      marital_status || null,
      arrival_date || null,
      visa_expiry || null,
      room_number || null,
      bank_account || null,
      workplace || null,
      permanent_address_zip || null,
      permanent_address_country || null,
      permanent_address_county || null,
      permanent_address_city || null,
      permanent_address_street || null,
      permanent_address_number || null,
      company_name || null,
      company_email || null,
      company_phone || null,
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

    logger.info('Uj munkavallaló letrehozva', { employeeId: result.rows[0].id });

    res.status(201).json({
      success: true,
      message: 'Munkavallaló sikeresen letrehozva',
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'unique_employee_number') {
      return res.status(400).json({
        success: false,
        message: 'Ez a törzsszám már létezik'
      });
    }
    logger.error('Munkavallaló letrehozasi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallaló letrehozasi hiba'
    });
  }
};

/**
 * Munkavallaló frissitese
 */
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavallaló nem talalhato'
      });
    }

    // Verify accommodation if provided
    if (body.accommodation_id !== undefined && body.accommodation_id !== null && body.accommodation_id !== '') {
      const accCheck = await query('SELECT id FROM accommodations WHERE id = $1', [body.accommodation_id]);
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

    // Original fields
    const originalFields = [
      'employee_number', 'position', 'start_date', 'end_date',
      'status_id', 'accommodation_id', 'notes', 'contractor_id',
    ];

    for (const field of originalFields) {
      if (body[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        params.push(body[field] || null);
        paramIndex++;
      }
    }

    // All new employee direct fields
    for (const field of EMPLOYEE_DIRECT_FIELDS) {
      if (body[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        params.push(body[field] || null);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs frissitendo mezo'
      });
    }

    params.push(id);
    const updateQuery = `
      UPDATE employees SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    logger.info('Munkavallaló frissitve', { employeeId: id });

    res.json({
      success: true,
      message: 'Munkavallaló sikeresen frissitve',
      data: { employee: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'unique_employee_number') {
      return res.status(400).json({
        success: false,
        message: 'Ez a törzsszám már létezik'
      });
    }
    logger.error('Munkavallaló frissitesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallaló frissitesi hiba'
    });
  }
};

/**
 * Munkavallaló torlese (soft delete: end_date beallitasa + szallashely eltavolitasa)
 */
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavallaló nem talalhato'
      });
    }

    // Get "Kilepett" status
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

    logger.info('Munkavallaló deaktivalva', { employeeId: id });

    res.json({
      success: true,
      message: 'Munkavallaló sikeresen deaktivalva'
    });
  } catch (error) {
    logger.error('Munkavallaló torlesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkavallaló torlesi hiba'
    });
  }
};

/**
 * Tömeges munkavallaló importalas Excel/CSV fajlbol
 */
const bulkImportEmployees = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Fajl feltoltese kotelezo'
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A fajl ures vagy nem tartalmaz adatokat'
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
          errors.push({ row: rowNum, message: 'Hianyzo nev' });
          continue;
        }

        if (row.email && !isValidEmail(row.email)) {
          errors.push({ row: rowNum, message: `Ervenytelen email: ${row.email}` });
          continue;
        }

        // Resolve accommodation name to id
        let accommodationId = null;
        if (row.accommodation_name) {
          accommodationId = accMap[row.accommodation_name.toLowerCase()] || null;
          if (!accommodationId) {
            errors.push({ row: rowNum, message: `Ismeretlen szallashely: ${row.accommodation_name}` });
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
            `INSERT INTO employees (
              user_id, employee_number, status_id, position, start_date, accommodation_id,
              first_name, last_name, gender, birth_date, birth_place, mothers_name,
              tax_id, passport_number, social_security_number, marital_status,
              arrival_date, visa_expiry, room_number, bank_account, workplace,
              permanent_address_zip, permanent_address_country,
              permanent_address_county, permanent_address_city,
              permanent_address_street, permanent_address_number,
              company_name, company_email, company_phone
            )
            VALUES (
              $1, $2, $3, $4, CURRENT_DATE, $5,
              $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15,
              $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26,
              $27, $28, $29
            )
            RETURNING id, employee_number`,
            [
              userId,
              empNumber,
              activeStatusId,
              row.position || null,
              accommodationId,
              row.first_name || null,
              row.last_name || null,
              row.gender || null,
              row.birth_date || null,
              row.birth_place || null,
              row.mothers_name || null,
              row.tax_id || null,
              row.passport_number || null,
              row.social_security_number || null,
              row.marital_status || null,
              row.arrival_date || null,
              row.visa_expiry || null,
              row.room_number || null,
              row.bank_account || null,
              row.workplace || null,
              row.permanent_address_zip || null,
              row.permanent_address_country || null,
              row.permanent_address_county || null,
              row.permanent_address_city || null,
              row.permanent_address_street || null,
              row.permanent_address_number || null,
              row.company_name || null,
              row.company_email || null,
              row.company_phone || null,
            ]
          );
          imported.push(result.rows[0]);
        } catch (err) {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    });

    logger.info('Tömeges munkavallaló import', {
      imported: imported.length,
      errors: errors.length
    });

    res.json({
      success: true,
      message: `${imported.length} munkavallaló sikeresen importalva`,
      data: {
        imported: imported.length,
        errors
      }
    });
  } catch (error) {
    logger.error('Tömeges munkavallaló import hiba:', error);
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
