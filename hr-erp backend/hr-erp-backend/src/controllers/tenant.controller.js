const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

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
 * Bérlők listázása (szűrőkkel, lapozással)
 */
const getTenants = async (req, res) => {
  try {
    const { search, is_active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

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

    const countResult = await query(
      `SELECT COUNT(*) as total FROM tenants t ${whereClause}`,
      params
    );

    const tenantsQuery = `
      SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active = true) as user_count
      FROM tenants t
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const tenantsResult = await query(tenantsQuery, params);

    res.json({
      success: true,
      data: {
        tenants: tenantsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Bérlők lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bérlők lekérési hiba'
    });
  }
};

/**
 * Egy bérlő részletei
 */
const getTenantById = async (req, res) => {
  try {
    const { id } = req.params;

    const tenantQuery = `
      SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active = true) as user_count
      FROM tenants t
      WHERE t.id = $1
    `;

    const result = await query(tenantQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bérlő nem található'
      });
    }

    res.json({
      success: true,
      data: { tenant: result.rows[0] }
    });
  } catch (error) {
    logger.error('Bérlő lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bérlő lekérési hiba'
    });
  }
};

/**
 * Új bérlő létrehozása
 */
const createTenant = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;

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
      'SELECT id FROM tenants WHERE slug = $1',
      [slug]
    );

    let finalSlug = slug;
    if (existingSlug.rows.length > 0) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    const insertQuery = `
      INSERT INTO tenants (name, slug, email, phone, address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(insertQuery, [
      name.trim(),
      finalSlug,
      email || null,
      phone || null,
      address || null,
    ]);

    logger.info('Új bérlő létrehozva', { tenantId: result.rows[0].id, name });

    res.status(201).json({
      success: true,
      message: 'Bérlő sikeresen létrehozva',
      data: { tenant: result.rows[0] }
    });
  } catch (error) {
    logger.error('Bérlő létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bérlő létrehozási hiba'
    });
  }
};

/**
 * Bérlő frissítése
 */
const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, is_active } = req.body;

    // Check tenant exists
    const existing = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bérlő nem található'
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
        'SELECT id FROM tenants WHERE slug = $1 AND id != $2',
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

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs frissítendő mező'
      });
    }

    params.push(id);
    const updateQuery = `
      UPDATE tenants SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    logger.info('Bérlő frissítve', { tenantId: id });

    res.json({
      success: true,
      message: 'Bérlő sikeresen frissítve',
      data: { tenant: result.rows[0] }
    });
  } catch (error) {
    logger.error('Bérlő frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bérlő frissítési hiba'
    });
  }
};

/**
 * Bérlő törlése (soft delete)
 */
const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bérlő nem található'
      });
    }

    await query(
      'UPDATE tenants SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    logger.info('Bérlő deaktiválva', { tenantId: id });

    res.json({
      success: true,
      message: 'Bérlő sikeresen deaktiválva'
    });
  } catch (error) {
    logger.error('Bérlő törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bérlő törlési hiba'
    });
  }
};

/**
 * Tömeges bérlő importálás Excel/CSV fájlból
 */
const bulkImportTenants = async (req, res) => {
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
          'SELECT id FROM tenants WHERE slug = $1',
          [slug]
        );

        let finalSlug = slug;
        if (slugCheck.rows.length > 0) {
          finalSlug = `${slug}-${Date.now()}-${i}`;
        }

        try {
          const result = await client.query(
            `INSERT INTO tenants (name, slug, email, phone, address)
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

    logger.info('Tömeges bérlő import', {
      imported: imported.length,
      errors: errors.length
    });

    res.json({
      success: true,
      message: `${imported.length} bérlő sikeresen importálva`,
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

module.exports = {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  bulkImportTenants,
};
