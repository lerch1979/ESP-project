const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');
const { parseFiltersParam } = require('../utils/filterBuilder');
const { logActivity, diffObjects } = require('../utils/activityLogger');

// Hungarian diacritic mapping for slug generation
const HUNGARIAN_CHAR_MAP = {
  'á': 'a', 'Á': 'a',
  'é': 'e', 'É': 'e',
  'í': 'i', 'Í': 'i',
  'ó': 'o', 'Ó': 'o',
  'ö': 'o', 'Ö': 'o',
  'ő': 'o', 'Ő': 'o',
  'ú': 'u', 'Ú': 'u',
  'ü': 'u', 'Ü': 'u',
  'ű': 'u', 'Ű': 'u',
};

function generateSlug(name) {
  return name
    .toLowerCase()
    .split('')
    .map(ch => HUNGARIAN_CHAR_MAP[ch] || ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// contractor_roles (mig 140): multi-role tags. Authoritative for billing.
const VALID_ROLES = ['megbizo', 'szallasado', 'alvallalkozo'];
// Business rule: megbízó (revenue side) and szállásadó (cost side) are MUTUALLY
// EXCLUSIVE — one legal entity can't be both a client we invoice and a landlord we
// pay. Alvállalkozó is a separate axis and may combine with either.
const ROLE_CONFLICT_MSG = 'Egy partner nem lehet egyszerre megbízó és szállásadó — a kettő kizárja egymást (bevételi vs. költség oldal).';
const hasRoleConflict = (roles) => roles.includes('megbizo') && roles.includes('szallasado');
// SELECT sub-expression: contractor's roles as a text[] (empty array when none).
const ROLES_AGG = `COALESCE((SELECT array_agg(cr.role ORDER BY cr.role) FROM contractor_roles cr WHERE cr.contractor_id = t.id), ARRAY[]::varchar[]) AS roles`;

// Column header mapping (Hungarian → DB field)
const COLUMN_MAP = {
  'név': 'name',
  'name': 'name',
  'email': 'email',
  'e-mail': 'email',
  'telefon': 'phone',
  'phone': 'phone',
  'telefonszám': 'phone',
  'cím': 'address',
  'address': 'address',
  'lakcím': 'address',
};

/**
 * Alvállalkozók listázása (szűrőkkel, lapozással)
 */
const getContractors = async (req, res) => {
  try {
    const { search, is_active, type, role, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (type) {
      whereConditions.push(`t.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    // Role filter (contractor_roles multi-tag) — used by the szállásadó / megbízó pickers.
    if (role && VALID_ROLES.includes(role)) {
      whereConditions.push(`EXISTS (SELECT 1 FROM contractor_roles cr WHERE cr.contractor_id = t.id AND cr.role = $${paramIndex})`);
      params.push(role);
      paramIndex++;
    }

    if (is_active !== undefined && is_active !== 'all') {
      whereConditions.push(`t.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    // Dynamic multi-filter support
    const filters = parseFiltersParam(req.query.filters);
    for (const filter of filters) {
      if (filter.field === 'is_active' && filter.value) {
        whereConditions.push(`t.is_active = $${paramIndex}`);
        params.push(filter.value === 'active');
        paramIndex++;
      }
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

    const countResult = await query(
      `SELECT COUNT(*) as total FROM contractors t ${whereClause}`,
      params
    );

    const contractorsQuery = `
      SELECT
        t.*,
        ${ROLES_AGG},
        (SELECT COUNT(*) FROM users u WHERE u.contractor_id = t.id AND u.is_active = true) as user_count
      FROM contractors t
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const contractorsResult = await query(contractorsQuery, params);

    res.json({
      success: true,
      data: {
        contractors: contractorsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Alvállalkozók lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozók lekérési hiba'
    });
  }
};

/**
 * Egy alvállalkozó részletei
 */
const getContractorById = async (req, res) => {
  try {
    const { id } = req.params;

    const contractorQuery = `
      SELECT
        t.*,
        ${ROLES_AGG},
        (SELECT COUNT(*) FROM users u WHERE u.contractor_id = t.id AND u.is_active = true) as user_count
      FROM contractors t
      WHERE t.id = $1
    `;

    const result = await query(contractorQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alvállalkozó nem található'
      });
    }

    res.json({
      success: true,
      data: { contractor: result.rows[0] }
    });
  } catch (error) {
    logger.error('Alvállalkozó lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozó lekérési hiba'
    });
  }
};

/**
 * Új alvállalkozó létrehozása
 */
const createContractor = async (req, res) => {
  try {
    const { name, email, phone, address, type, roles } = req.body;
    const initialRoles = Array.isArray(roles) ? [...new Set(roles)].filter(r => VALID_ROLES.includes(r)) : [];
    if (hasRoleConflict(initialRoles)) {
      return res.status(400).json({ success: false, message: ROLE_CONFLICT_MSG });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Név megadása kötelező'
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Érvénytelen email cím'
      });
    }

    const slug = generateSlug(name.trim());

    // Check slug uniqueness
    const existingSlug = await query(
      'SELECT id FROM contractors WHERE slug = $1',
      [slug]
    );

    let finalSlug = slug;
    if (existingSlug.rows.length > 0) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    const insertQuery = `
      INSERT INTO contractors (name, slug, email, phone, address, type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await query(insertQuery, [
      name.trim(),
      finalSlug,
      email || null,
      phone || null,
      address || null,
      type || 'service_provider',
    ]);

    // Seed roles if the caller supplied any (e.g. inline "new szállásadó" from the
    // accommodation modal passes roles:['szallasado']).
    if (initialRoles.length) {
      await query(
        `INSERT INTO contractor_roles (contractor_id, role, created_by)
         SELECT $1, r, $2 FROM unnest($3::varchar[]) r
         ON CONFLICT (contractor_id, role) DO NOTHING`,
        [result.rows[0].id, req.user?.id || null, initialRoles]
      );
      result.rows[0].roles = initialRoles.slice().sort();
    } else {
      result.rows[0].roles = [];
    }

    logActivity({
      userId: req.user?.id,
      entityType: 'contractor',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { name: name.trim() },
      ipAddress: req.ip,
    });

    logger.info('Új alvállalkozó létrehozva', { contractorId: result.rows[0].id, name });

    res.status(201).json({
      success: true,
      message: 'Alvállalkozó sikeresen létrehozva',
      data: { contractor: result.rows[0] }
    });
  } catch (error) {
    logger.error('Alvállalkozó létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozó létrehozási hiba'
    });
  }
};

/**
 * Alvállalkozó frissítése
 */
const updateContractor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, is_active, type } = req.body;

    // Check contractor exists
    const existing = await query('SELECT * FROM contractors WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alvállalkozó nem található'
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Érvénytelen email cím'
      });
    }

    // Dynamic SET builder
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      params.push(name.trim());
      paramIndex++;

      // Regenerate slug if name changes
      const newSlug = generateSlug(name.trim());
      const slugCheck = await query(
        'SELECT id FROM contractors WHERE slug = $1 AND id != $2',
        [newSlug, id]
      );
      const finalSlug = slugCheck.rows.length > 0 ? `${newSlug}-${Date.now()}` : newSlug;
      fields.push(`slug = $${paramIndex}`);
      params.push(finalSlug);
      paramIndex++;
    }

    if (email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      params.push(email || null);
      paramIndex++;
    }

    if (phone !== undefined) {
      fields.push(`phone = $${paramIndex}`);
      params.push(phone || null);
      paramIndex++;
    }

    if (address !== undefined) {
      fields.push(`address = $${paramIndex}`);
      params.push(address || null);
      paramIndex++;
    }

    if (is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    if (type !== undefined) {
      fields.push(`type = $${paramIndex}`);
      params.push(type);
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
      UPDATE contractors SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    const trackFields = ['name', 'email', 'phone', 'address', 'is_active'];
    const changes = diffObjects(existing.rows[0], result.rows[0], trackFields);
    logActivity({
      userId: req.user?.id,
      entityType: 'contractor',
      entityId: id,
      action: 'update',
      changes,
      metadata: { name: result.rows[0].name },
      ipAddress: req.ip,
    });

    logger.info('Alvállalkozó frissítve', { contractorId: id });

    res.json({
      success: true,
      message: 'Alvállalkozó sikeresen frissítve',
      data: { contractor: result.rows[0] }
    });
  } catch (error) {
    logger.error('Alvállalkozó frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozó frissítési hiba'
    });
  }
};

/**
 * Alvállalkozó törlése (soft delete)
 */
const deleteContractor = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, name FROM contractors WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alvállalkozó nem található'
      });
    }

    await query(
      'UPDATE contractors SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    logActivity({
      userId: req.user?.id,
      entityType: 'contractor',
      entityId: id,
      action: 'delete',
      metadata: { name: existing.rows[0].name },
      ipAddress: req.ip,
    });

    logger.info('Alvállalkozó deaktiválva', { contractorId: id });

    res.json({
      success: true,
      message: 'Alvállalkozó sikeresen deaktiválva'
    });
  } catch (error) {
    logger.error('Alvállalkozó törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alvállalkozó törlési hiba'
    });
  }
};

/**
 * Tömeges alvállalkozó importálás Excel/CSV fájlból
 */
const bulkImportContractors = async (req, res) => {
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

    const imported = [];
    const errors = [];

    await transaction(async (client) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2

        if (!row.name || !row.name.trim()) {
          errors.push({ row: rowNum, message: 'Hiányzó név' });
          continue;
        }

        if (row.email && !isValidEmail(row.email)) {
          errors.push({ row: rowNum, message: `Érvénytelen email: ${row.email}` });
          continue;
        }

        const slug = generateSlug(row.name.trim());
        const slugCheck = await client.query(
          'SELECT id FROM contractors WHERE slug = $1',
          [slug]
        );

        let finalSlug = slug;
        if (slugCheck.rows.length > 0) {
          finalSlug = `${slug}-${Date.now()}-${i}`;
        }

        try {
          const result = await client.query(
            `INSERT INTO contractors (name, slug, email, phone, address)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name`,
            [
              row.name.trim(),
              finalSlug,
              row.email || null,
              row.phone || null,
              row.address || null,
            ]
          );
          imported.push(result.rows[0]);
        } catch (err) {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    });

    logger.info('Tömeges alvállalkozó import', {
      imported: imported.length,
      errors: errors.length
    });

    res.json({
      success: true,
      message: `${imported.length} alvállalkozó sikeresen importálva`,
      data: {
        imported: imported.length,
        errors
      }
    });
  } catch (error) {
    logger.error('Tömeges import hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tömeges import hiba'
    });
  }
};

/**
 * Set a contractor's role tags (replace the whole set).
 * PUT /api/v1/contractors/:id/roles  body: { roles: ['megbizo','szallasado',...] }
 */
const setContractorRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const { roles } = req.body || {};
    if (!Array.isArray(roles)) {
      return res.status(400).json({ success: false, message: 'roles tömb kötelező' });
    }
    const clean = [...new Set(roles)].filter(r => VALID_ROLES.includes(r));
    if (clean.length !== new Set(roles).size) {
      return res.status(400).json({ success: false, message: `Érvénytelen szerepkör (engedélyezett: ${VALID_ROLES.join(', ')})` });
    }
    if (hasRoleConflict(clean)) {
      return res.status(400).json({ success: false, message: ROLE_CONFLICT_MSG });
    }

    const existing = await query('SELECT id, name FROM contractors WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Alvállalkozó nem található' });
    }

    await transaction(async (client) => {
      const prev = (await client.query('SELECT role FROM contractor_roles WHERE contractor_id = $1', [id])).rows.map(r => r.role);
      const toAdd = clean.filter(r => !prev.includes(r));
      const toRemove = prev.filter(r => !clean.includes(r));
      if (toRemove.length) {
        await client.query('DELETE FROM contractor_roles WHERE contractor_id = $1 AND role = ANY($2::varchar[])', [id, toRemove]);
      }
      if (toAdd.length) {
        await client.query(
          `INSERT INTO contractor_roles (contractor_id, role, created_by)
           SELECT $1, r, $2 FROM unnest($3::varchar[]) r
           ON CONFLICT (contractor_id, role) DO NOTHING`,
          [id, req.user?.id || null, toAdd]
        );
      }
    });

    logActivity({
      userId: req.user?.id,
      entityType: 'contractor',
      entityId: id,
      action: 'update',
      metadata: { name: existing.rows[0].name, roles: clean.slice().sort() },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: { roles: clean.slice().sort() } });
  } catch (error) {
    logger.error('Szerepkör beállítási hiba:', error);
    res.status(500).json({ success: false, message: 'Szerepkör beállítási hiba' });
  }
};

module.exports = {
  getContractors,
  getContractorById,
  createContractor,
  updateContractor,
  deleteContractor,
  bulkImportContractors,
  setContractorRoles,
};
