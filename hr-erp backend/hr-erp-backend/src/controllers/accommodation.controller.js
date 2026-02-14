const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');

// Valid accommodation types
const VALID_TYPES = ['studio', '1br', '2br', '3br', 'dormitory'];
const VALID_STATUSES = ['available', 'occupied', 'maintenance'];

// Column header mapping (Hungarian → DB field) for bulk import
const COLUMN_MAP = {
  'név': 'name',
  'name': 'name',
  'megnevezés': 'name',
  'cím': 'address',
  'address': 'address',
  'lakcím': 'address',
  'típus': 'type',
  'type': 'type',
  'kapacitás': 'capacity',
  'capacity': 'capacity',
  'férőhely': 'capacity',
  'ágyak': 'capacity',
  'státusz': 'status',
  'status': 'status',
  'állapot': 'status',
  'havi bérleti díj': 'monthly_rent',
  'bérleti díj': 'monthly_rent',
  'monthly_rent': 'monthly_rent',
  'rent': 'monthly_rent',
  'megjegyzés': 'notes',
  'notes': 'notes',
  'megjegyzések': 'notes',
};

// Type display mapping for validation
const TYPE_MAP = {
  'studio': 'studio',
  'stúdió': 'studio',
  'garzon': 'studio',
  '1br': '1br',
  '1 szobás': '1br',
  '1 hálószobás': '1br',
  '2br': '2br',
  '2 szobás': '2br',
  '2 hálószobás': '2br',
  '3br': '3br',
  '3 szobás': '3br',
  '3 hálószobás': '3br',
  'dormitory': 'dormitory',
  'munkásszálló': 'dormitory',
  'kollégium': 'dormitory',
};

const STATUS_MAP = {
  'available': 'available',
  'szabad': 'available',
  'elérhető': 'available',
  'occupied': 'occupied',
  'foglalt': 'occupied',
  'maintenance': 'maintenance',
  'karbantartás': 'maintenance',
  'felújítás': 'maintenance',
};

/**
 * Szálláshelyek listázása (szűrőkkel, lapozással)
 */
const getAccommodations = async (req, res) => {
  try {
    const { search, status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

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

    const countResult = await query(
      `SELECT COUNT(*) as total FROM accommodations a ${whereClause}`,
      params
    );

    const accommodationsQuery = `
      SELECT
        a.*,
        t.name as current_tenant_name
      FROM accommodations a
      LEFT JOIN tenants t ON a.current_tenant_id = t.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const result = await query(accommodationsQuery, params);

    res.json({
      success: true,
      data: {
        accommodations: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Szálláshelyek lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshelyek lekérési hiba'
    });
  }
};

/**
 * Egy szálláshely részletei (jelenlegi bérlő adataival)
 */
const getAccommodationById = async (req, res) => {
  try {
    const { id } = req.params;

    const accommodationQuery = `
      SELECT
        a.*,
        t.name as current_tenant_name,
        t.email as current_tenant_email,
        t.phone as current_tenant_phone
      FROM accommodations a
      LEFT JOIN tenants t ON a.current_tenant_id = t.id
      WHERE a.id = $1
    `;

    const result = await query(accommodationQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    res.json({
      success: true,
      data: { accommodation: result.rows[0] }
    });
  } catch (error) {
    logger.error('Szálláshely lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshely lekérési hiba'
    });
  }
};

/**
 * Új szálláshely létrehozása
 */
const createAccommodation = async (req, res) => {
  try {
    const { name, address, type, capacity, current_tenant_id, status, monthly_rent, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Név megadása kötelező'
      });
    }

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen típus. Engedélyezett értékek: ${VALID_TYPES.join(', ')}`
      });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen státusz. Engedélyezett értékek: ${VALID_STATUSES.join(', ')}`
      });
    }

    if (capacity !== undefined && (isNaN(capacity) || capacity < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Kapacitás legalább 1 kell legyen'
      });
    }

    // If tenant is assigned, verify it exists
    if (current_tenant_id) {
      const tenantCheck = await query('SELECT id FROM tenants WHERE id = $1', [current_tenant_id]);
      if (tenantCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott bérlő nem található'
        });
      }
    }

    const insertQuery = `
      INSERT INTO accommodations (name, address, type, capacity, current_tenant_id, status, monthly_rent, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const finalStatus = current_tenant_id ? 'occupied' : (status || 'available');

    const result = await query(insertQuery, [
      name.trim(),
      address || null,
      type || 'studio',
      capacity || 1,
      current_tenant_id || null,
      finalStatus,
      monthly_rent || null,
      notes || null,
    ]);

    // If tenant assigned, create history record
    if (current_tenant_id) {
      await query(
        `INSERT INTO accommodation_tenants (accommodation_id, tenant_id, check_in)
         VALUES ($1, $2, CURRENT_DATE)`,
        [result.rows[0].id, current_tenant_id]
      );
    }

    logger.info('Új szálláshely létrehozva', { accommodationId: result.rows[0].id, name });

    res.status(201).json({
      success: true,
      message: 'Szálláshely sikeresen létrehozva',
      data: { accommodation: result.rows[0] }
    });
  } catch (error) {
    logger.error('Szálláshely létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshely létrehozási hiba'
    });
  }
};

/**
 * Szálláshely frissítése
 */
const updateAccommodation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, type, capacity, current_tenant_id, status, monthly_rent, notes } = req.body;

    // Check exists
    const existing = await query('SELECT * FROM accommodations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    const oldAccommodation = existing.rows[0];

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen típus. Engedélyezett értékek: ${VALID_TYPES.join(', ')}`
      });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen státusz. Engedélyezett értékek: ${VALID_STATUSES.join(', ')}`
      });
    }

    if (capacity !== undefined && (isNaN(capacity) || capacity < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Kapacitás legalább 1 kell legyen'
      });
    }

    // If changing tenant, verify new tenant exists
    if (current_tenant_id !== undefined && current_tenant_id !== null) {
      const tenantCheck = await query('SELECT id FROM tenants WHERE id = $1', [current_tenant_id]);
      if (tenantCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott bérlő nem található'
        });
      }
    }

    // Dynamic SET builder
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      params.push(name.trim());
      paramIndex++;
    }

    if (address !== undefined) {
      fields.push(`address = $${paramIndex}`);
      params.push(address || null);
      paramIndex++;
    }

    if (type !== undefined) {
      fields.push(`type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (capacity !== undefined) {
      fields.push(`capacity = $${paramIndex}`);
      params.push(parseInt(capacity));
      paramIndex++;
    }

    if (current_tenant_id !== undefined) {
      fields.push(`current_tenant_id = $${paramIndex}`);
      params.push(current_tenant_id || null);
      paramIndex++;

      // Auto-update status based on tenant assignment
      if (current_tenant_id) {
        fields.push(`status = $${paramIndex}`);
        params.push('occupied');
        paramIndex++;
      } else if (!status) {
        // If tenant removed and no explicit status, set to available
        fields.push(`status = $${paramIndex}`);
        params.push('available');
        paramIndex++;
      }
    }

    if (status !== undefined && !fields.some(f => f.startsWith('status'))) {
      fields.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (monthly_rent !== undefined) {
      fields.push(`monthly_rent = $${paramIndex}`);
      params.push(monthly_rent || null);
      paramIndex++;
    }

    if (notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      params.push(notes || null);
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
      UPDATE accommodations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, params);

    // Handle tenant history updates
    const newTenantId = current_tenant_id !== undefined ? current_tenant_id : oldAccommodation.current_tenant_id;
    const oldTenantId = oldAccommodation.current_tenant_id;

    if (current_tenant_id !== undefined && oldTenantId !== newTenantId) {
      // Close old tenant's record
      if (oldTenantId) {
        await query(
          `UPDATE accommodation_tenants
           SET check_out = CURRENT_DATE
           WHERE accommodation_id = $1 AND tenant_id = $2 AND check_out IS NULL`,
          [id, oldTenantId]
        );
      }

      // Open new tenant's record
      if (newTenantId) {
        await query(
          `INSERT INTO accommodation_tenants (accommodation_id, tenant_id, check_in)
           VALUES ($1, $2, CURRENT_DATE)`,
          [id, newTenantId]
        );
      }
    }

    logger.info('Szálláshely frissítve', { accommodationId: id });

    res.json({
      success: true,
      message: 'Szálláshely sikeresen frissítve',
      data: { accommodation: result.rows[0] }
    });
  } catch (error) {
    logger.error('Szálláshely frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshely frissítési hiba'
    });
  }
};

/**
 * Szálláshely törlése (soft delete)
 */
const deleteAccommodation = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM accommodations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    await query(
      'UPDATE accommodations SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    logger.info('Szálláshely deaktiválva', { accommodationId: id });

    res.json({
      success: true,
      message: 'Szálláshely sikeresen deaktiválva'
    });
  } catch (error) {
    logger.error('Szálláshely törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshely törlési hiba'
    });
  }
};

/**
 * Szálláshely bérlő történet
 */
const getAccommodationTenants = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify accommodation exists
    const existing = await query('SELECT id FROM accommodations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    const historyQuery = `
      SELECT
        at.*,
        t.name as tenant_name,
        t.email as tenant_email,
        t.phone as tenant_phone
      FROM accommodation_tenants at
      JOIN tenants t ON at.tenant_id = t.id
      WHERE at.accommodation_id = $1
      ORDER BY at.check_in DESC
    `;

    const result = await query(historyQuery, [id]);

    res.json({
      success: true,
      data: { tenants: result.rows }
    });
  } catch (error) {
    logger.error('Szálláshely bérlő történet hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szálláshely bérlő történet lekérési hiba'
    });
  }
};

/**
 * Tömeges szálláshely importálás Excel/CSV fájlból
 */
const bulkImportAccommodations = async (req, res) => {
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
        const rowNum = i + 2; // +2 because row 1 is header

        if (!row.name || !row.name.trim()) {
          errors.push({ row: rowNum, message: 'Hiányzó név' });
          continue;
        }

        // Map Hungarian type names to DB values
        let resolvedType = 'studio';
        if (row.type) {
          const normalizedType = row.type.toLowerCase().trim();
          resolvedType = TYPE_MAP[normalizedType];
          if (!resolvedType) {
            errors.push({ row: rowNum, message: `Ismeretlen típus: ${row.type}` });
            continue;
          }
        }

        // Map Hungarian status names to DB values
        let resolvedStatus = 'available';
        if (row.status) {
          const normalizedStatus = row.status.toLowerCase().trim();
          resolvedStatus = STATUS_MAP[normalizedStatus];
          if (!resolvedStatus) {
            errors.push({ row: rowNum, message: `Ismeretlen státusz: ${row.status}` });
            continue;
          }
        }

        // Parse capacity
        let capacity = 1;
        if (row.capacity) {
          capacity = parseInt(row.capacity);
          if (isNaN(capacity) || capacity < 1) {
            errors.push({ row: rowNum, message: `Érvénytelen kapacitás: ${row.capacity}` });
            continue;
          }
        }

        // Parse monthly rent
        let monthlyRent = null;
        if (row.monthly_rent) {
          // Remove currency symbols and spaces
          const cleanRent = row.monthly_rent.replace(/[^\d.,]/g, '').replace(',', '.');
          monthlyRent = parseFloat(cleanRent);
          if (isNaN(monthlyRent)) {
            errors.push({ row: rowNum, message: `Érvénytelen bérleti díj: ${row.monthly_rent}` });
            continue;
          }
        }

        try {
          const result = await client.query(
            `INSERT INTO accommodations (name, address, type, capacity, status, monthly_rent, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name`,
            [
              row.name.trim(),
              row.address || null,
              resolvedType,
              capacity,
              resolvedStatus,
              monthlyRent,
              row.notes || null,
            ]
          );
          imported.push(result.rows[0]);
        } catch (err) {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    });

    logger.info('Tömeges szálláshely import', {
      imported: imported.length,
      errors: errors.length
    });

    res.json({
      success: true,
      message: `${imported.length} szálláshely sikeresen importálva`,
      data: {
        imported: imported.length,
        errors
      }
    });
  } catch (error) {
    logger.error('Tömeges szálláshely import hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tömeges import hiba'
    });
  }
};

module.exports = {
  getAccommodations,
  getAccommodationById,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  getAccommodationTenants,
  bulkImportAccommodations,
};
