const { query, transaction, pool } = require('../database/connection');
const { logger } = require('../utils/logger');
const XLSX = require('xlsx');
const { parseFiltersParam, buildFilterWhere } = require('../utils/filterBuilder');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { logActivity, diffObjects } = require('../utils/activityLogger');
const { scopeOf, contractorPredicate, ownsRow } = require('../utils/tenantScope');
const { encrypt, decrypt, decryptPiiFields, decryptPiiRows } = require('../services/encryption.service');
const statusHistory = require('../services/entityStatusHistory.service');
// Housing changes MUST reach employee_accommodation_history — it is the only input the
// daily occupancy snapshot (and therefore the billing engine) reads.
const accHistory = require('../services/accommodationHistory.service');
const { findDuplicate, FIELD_LABEL, MATCH_THRESHOLD } = require('../utils/employeeIdentity');

const EMPLOYEE_FILTER_FIELD_MAP = {
  status: 'est.name',
  workplace: 'e.workplace',
  gender: 'e.gender',
  marital_status: 'e.marital_status',
  position: 'e.position',
  country: 'e.permanent_address_country',
  accommodation: 'a.name',
  room_number: 'e.room_number',
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
  'email': 'personal_email',
  'e-mail': 'personal_email',
  'személyes email': 'personal_email',
  'szemelyes email': 'personal_email',
  'personal_email': 'personal_email',
  'telefon': 'personal_phone',
  'phone': 'personal_phone',
  'telefonszám': 'personal_phone',
  'telefonszam': 'personal_phone',
  'személyes telefon': 'personal_phone',
  'szemelyes telefon': 'personal_phone',
  'personal_phone': 'personal_phone',
  'műszak': 'shift_schedule',
  'muszak': 'shift_schedule',
  'shift': 'shift_schedule',
  'beosztás': 'shift_schedule',
  'beosztas': 'shift_schedule',
  'shift_schedule': 'shift_schedule',
  'munkakezdés dátuma': 'start_date',
  'munkakezdés': 'start_date',
  'munkakezdes datuma': 'start_date',
  'munkakezdes': 'start_date',
  'start_date': 'start_date',
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
  'szerződés lejárat': 'end_date',
  'szerzodes lejarat': 'end_date',
  'contract_expiry': 'end_date',
  'end_date': 'end_date',
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
  // Additional Hungarian header variants for resident bulk import
  'e-mail cím': 'personal_email',
  'e-mail cim': 'personal_email',
  'email cím': 'personal_email',
  'email cim': 'personal_email',
  'nemzetiség': 'nationality',
  'nemzetiseg': 'nationality',
  'nationality': 'nationality',
  'személyi igazolvány szám': 'passport_number',
  'szemelyi igazolvany szam': 'passport_number',
  'személyi igazolvány': 'passport_number',
  'szemelyi igazolvany': 'passport_number',
  'személyi szám': 'passport_number',
  'szemelyi szam': 'passport_number',
  'id_number': 'passport_number',
  'nyelv': 'preferred_language',
  'language': 'preferred_language',
  'preferred_language': 'preferred_language',
  'megbízó': 'billing_client_name',
  'megbizo': 'billing_client_name',
  'billing_client': 'billing_client_name',
  'vállalat': 'company_name',
  'vallalat': 'company_name',
  'company': 'company_name',
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
  'company_phone', 'room_id', 'nationality', 'end_date',
  // Personal contact — editable so HR can provision resident login invites.
  'personal_email', 'personal_phone',
  // Shift pattern — room-consolidation-engine input (only same-shift may share a room).
  'shift_schedule',
];

// Normalize a shift value (hu/en variants) to a stored slug, else null.
// THREE-shift model (mig 137): delelott | delutan | ejszaka | valtott. Legacy
// values day/night/rotating/flexible are intentionally NOT mapped here — "night"→
// ejszaka and "rotating"→valtott are handled once in the migration; "day"/"flexible"
// have no clean three-shift target, so any such input normalizes to null (flagged).
const SHIFT_ALIASES = {
  delelott: 'delelott', delelotti: 'delelott', delelottos: 'delelott',
  'délelőtt': 'delelott', 'délelőtti': 'delelott', 'délelőttös': 'delelott', morning: 'delelott',
  delutan: 'delutan', delutani: 'delutan', delutanos: 'delutan',
  'délután': 'delutan', 'délutáni': 'delutan', 'délutános': 'delutan', afternoon: 'delutan',
  ejszaka: 'ejszaka', ejszakai: 'ejszaka', ejszakas: 'ejszaka',
  'éjszaka': 'ejszaka', 'éjszakai': 'ejszaka', 'éjszakás': 'ejszaka', night: 'ejszaka',
  valtott: 'valtott', valto: 'valtott', valtos: 'valtott',
  'váltott': 'valtott', 'váltó': 'valtott', 'váltós': 'valtott',
  forgo: 'valtott', 'forgó': 'valtott', rotating: 'valtott',
};
const normalizeShift = (v) => {
  if (v === undefined || v === null || v === '') return null;
  return SHIFT_ALIASES[String(v).toLowerCase().trim()] || null;
};

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

    // DEEP_AUDIT finding 6 (read side). This list had no contractor filter at all,
    // so any employees.view holder read every tenant's employee PII (tax id,
    // passport, SSN, bank account). The write side was closed 2026-08-07; this is
    // the matching read scope. Superadmin still sees everything.
    {
      const s = contractorPredicate(scopeOf(req), 'e.contractor_id', paramIndex);
      whereConditions.push(s.sql);
      params.push(...s.params);
      paramIndex = s.nextIndex;
    }

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
        `(COALESCE(e.first_name, u.first_name, '') ILIKE $${paramIndex} OR COALESCE(e.last_name, u.last_name, '') ILIKE $${paramIndex} OR COALESCE(e.personal_email, u.email, '') ILIKE $${paramIndex} OR COALESCE(e.employee_number, '') ILIKE $${paramIndex} OR CONCAT(COALESCE(e.last_name, u.last_name, ''), ' ', COALESCE(e.first_name, u.first_name, '')) ILIKE $${paramIndex} OR COALESCE(e.workplace, '') ILIKE $${paramIndex} OR COALESCE(e.personal_phone, '') ILIKE $${paramIndex})`
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
       LEFT JOIN accommodations a ON e.accommodation_id = a.id
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
        e.personal_email, e.personal_phone,
        e.profile_photo_url, e.room_id,
        e.nationality, e.data_consent_at, e.data_consent_recorded_by, e.anonymized_at,
        e.created_at, e.updated_at,
        COALESCE(e.first_name, u.first_name) as first_name,
        COALESCE(e.last_name, u.last_name) as last_name,
        COALESCE(e.personal_email, u.email, '') as email,
        COALESCE(e.personal_phone, u.phone, '') as phone,
        est.name as status_name,
        est.color as status_color,
        est.slug as status_slug,
        a.name as accommodation_name,
        ar.room_number as assigned_room_number,
        ar.beds as room_beds
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      LEFT JOIN accommodation_rooms ar ON e.room_id = ar.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));
    const result = await query(employeesQuery, params);

    res.json({
      success: true,
      data: {
        employees: decryptPiiRows(result.rows),
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
        e.personal_email, e.personal_phone,
        e.profile_photo_url, e.room_id,
        e.nationality, e.data_consent_at, e.data_consent_recorded_by, e.anonymized_at,
        e.created_at, e.updated_at,
        COALESCE(e.first_name, u.first_name) as first_name,
        COALESCE(e.last_name, u.last_name) as last_name,
        COALESCE(e.personal_email, u.email, '') as email,
        COALESCE(e.personal_phone, u.phone, '') as phone,
        est.name as status_name,
        est.color as status_color,
        est.slug as status_slug,
        a.name as accommodation_name,
        a.address as accommodation_address,
        ar.room_number as assigned_room_number,
        ar.beds as room_beds
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      LEFT JOIN accommodation_rooms ar ON e.room_id = ar.id
      WHERE e.id = $1
    `;

    const result = await query(employeeQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavallaló nem talalhato'
      });
    }

    // DEEP_AUDIT finding 6 (read side) — detail scope. Out of scope answers the
    // same 404 as "no such employee", so the response never confirms that an
    // employee with this id exists in another tenant.
    if (!ownsRow(scopeOf(req), result.rows[0].contractor_id)) {
      return res.status(404).json({
        success: false,
        message: 'Munkavallaló nem talalhato'
      });
    }

    res.json({
      success: true,
      data: { employee: decryptPiiFields(result.rows[0]) }
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
      room_id,
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

    // Verify room belongs to accommodation if provided
    if (room_id) {
      const roomCheck = await query(
        'SELECT id FROM accommodation_rooms WHERE id = $1 AND accommodation_id = $2 AND is_active = true',
        [room_id, accommodation_id]
      );
      if (roomCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'A megadott szoba nem tartozik ehhez a szálláshelyhez'
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
        company_name, company_email, company_phone,
        room_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29,
        $30, $31, $32,
        $33
      )
      RETURNING *
    `;

    // Encrypt PII fields before storing
    const encryptedTaxId = tax_id ? encrypt(tax_id) : null;
    const encryptedPassport = passport_number ? encrypt(passport_number) : null;
    const encryptedSsn = social_security_number ? encrypt(social_security_number) : null;
    const encryptedBank = bank_account ? encrypt(bank_account) : null;

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
      encryptedTaxId,
      encryptedPassport,
      encryptedSsn,
      marital_status || null,
      arrival_date || null,
      visa_expiry || null,
      room_number || null,
      encryptedBank,
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
      room_id || null,
    ]);

    // HIRE → open the occupancy history row, so the new joiner appears in tomorrow's
    // snapshot (and therefore in billing) instead of being invisible until someone
    // re-runs a backfill.
    if (result.rows[0].accommodation_id) {
      await accHistory.syncAssignmentSafe({
        employeeId: result.rows[0].id,
        accommodationId: result.rows[0].accommodation_id,
        roomId: result.rows[0].room_id,
        reason: 'hire',
        changedBy: req.user?.id || null,
      });
    }

    // Log activity
    logActivity({
      userId: req.user?.id,
      entityType: 'employee',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { name: `${last_name} ${first_name}`, employee_number: finalEmployeeNumber },
      ipAddress: req.ip,
    });

    // Seed the initial status row (from=null → to=initial). Best-effort, never throws.
    statusHistory.recordStatusChangeById({
      entityType: 'employee',
      entityId: result.rows[0].id,
      fromStatusId: null,
      toStatusId: result.rows[0].status_id,
      changedBy: req.user?.id,
      source: 'create',
    });

    // ── login provisioning is NOT a side effect of creating an employee ──────────
    // This used to mint a users row with a hardcoded shared password ('changeme123') and
    // the accommodated_employee role whenever an email happened to be present. Two
    // problems, both decided against in the Phase 4 role model:
    //   • every resident issued the same password is one leaked string away from being
    //     everyone's account;
    //   • accounts are PROVISIONED by superadmin/admin, never created implicitly — that
    //     is the whole point of restricting users.* to those two roles.
    // Creating an employee now records a person. Giving that person a login is a separate,
    // deliberate act through the users flow.
    if (!userId && email) {
      logger.info('Munkavállaló létrehozva belépés nélkül — a felhasználót külön kell provisionálni', {
        employeeId: result.rows[0].id, email,
      });
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

    // TENANT SCOPE (DEEP_AUDIT #6, write side — FUNCTEST PERM-13). The controller had no
    // contractor filter anywhere, so an operator of tenant A could MUTATE tenant B's
    // employee row by id. Superadmin keeps the cross-tenant view; everyone else may only
    // write their own contractor's rows. Rows with a NULL contractor_id are deliberately
    // still writable — they are unowned/global in this single-operator deployment, and
    // hard-failing them would break legitimate edits (see the "strict contractor_id
    // hides GLOBAL content" anti-pattern in PROJECT_STATE).
    if (!req.user?.roles?.includes('superadmin')) {
      const owner = existing.rows[0].contractor_id;
      if (owner && owner !== req.user?.contractorId) {
        logger.warn('Cross-tenant employee write blocked', { employeeId: id, owner, caller: req.user?.contractorId });
        return res.status(403).json({
          success: false,
          message: 'Nincs jogosultsága ehhez a munkavállalóhoz'
        });
      }
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

    // If accommodation changes, clear room_id unless a new valid room_id is provided
    const oldAccId = existing.rows[0].accommodation_id;
    const newAccId = body.accommodation_id !== undefined ? (body.accommodation_id || null) : oldAccId;
    if (body.accommodation_id !== undefined && newAccId !== oldAccId) {
      if (body.room_id === undefined) {
        body.room_id = null;
      }
    }

    // Verify room belongs to accommodation if room_id is provided
    if (body.room_id !== undefined && body.room_id !== null && body.room_id !== '') {
      const effectiveAccId = newAccId;
      if (effectiveAccId) {
        const roomCheck = await query(
          'SELECT id FROM accommodation_rooms WHERE id = $1 AND accommodation_id = $2 AND is_active = true',
          [body.room_id, effectiveAccId]
        );
        if (roomCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'A megadott szoba nem tartozik ehhez a szálláshelyhez'
          });
        }
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

    // All new employee direct fields (encrypt PII before storing)
    const PII_ENCRYPT_FIELDS = ['social_security_number', 'passport_number', 'bank_account', 'tax_id'];
    for (const field of EMPLOYEE_DIRECT_FIELDS) {
      if (body[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        let value = body[field] || null;
        if (field === 'shift_schedule') value = normalizeShift(value); // slug or null — never trips the CHECK
        params.push(PII_ENCRYPT_FIELDS.includes(field) && value ? encrypt(value) : value);
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

    // The employees row and its occupancy history must move together: a committed room
    // change with no history row is exactly the bug that froze the billing roster. One
    // transaction, so they can never disagree.
    const housingTouched = body.accommodation_id !== undefined || body.room_id !== undefined || body.end_date !== undefined;
    const result = await transaction(async (client) => {
      const r = await client.query(updateQuery, params);
      if (housingTouched) {
        const row = r.rows[0];
        // A set end_date means they have left — close the stay rather than move it.
        if (row.end_date) {
          await accHistory.closeAssignment(client, {
            employeeId: id, effectiveDate: accHistory.localDateStr(new Date(row.end_date)),
            reason: 'termination', changedBy: req.user?.id || null,
          });
        } else {
          await accHistory.syncAssignment(client, {
            employeeId: id, accommodationId: row.accommodation_id, roomId: row.room_id,
            reason: 'employee update', changedBy: req.user?.id || null,
          });
        }
      }
      return r;
    });

    // Log activity with diff
    const trackFields = [
      'first_name', 'last_name', 'employee_number', 'position', 'status_id',
      'accommodation_id', 'workplace', 'room_id', 'start_date', 'end_date',
      'gender', 'birth_date', 'visa_expiry', 'marital_status',
    ];
    const changes = diffObjects(existing.rows[0], result.rows[0], trackFields);
    logActivity({
      userId: req.user?.id,
      entityType: 'employee',
      entityId: id,
      action: 'update',
      changes,
      metadata: { name: `${result.rows[0].last_name || ''} ${result.rows[0].first_name || ''}` },
      ipAddress: req.ip,
    });

    // Record the status transition if status_id changed. Best-effort, never throws
    // (the recorder no-ops when old === new, so unconditional call is safe).
    statusHistory.recordStatusChangeById({
      entityType: 'employee',
      entityId: id,
      fromStatusId: existing.rows[0].status_id,
      toStatusId: result.rows[0].status_id,
      changedBy: req.user?.id,
      source: 'update',
    });

    logger.info('Munkavallaló frissitve', { employeeId: id });

    res.json({
      success: true,
      message: 'Munkavallaló sikeresen frissitve',
      data: { employee: decryptPiiFields(result.rows[0]) }
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

    const existing = await query('SELECT id, first_name, last_name, employee_number FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Munkavallaló nem talalhato'
      });
    }

    // Get "Kilepett" status
    const leftStatus = await query("SELECT id FROM employee_status_types WHERE slug = 'left'");
    const leftStatusId = leftStatus.rows.length > 0 ? leftStatus.rows[0].id : null;

    // TERMINATION → close the open stay the same day the accommodation is cleared.
    // check_out_date is "the first day they are no longer here", so today stops counting
    // for them and the room frees up in tonight's snapshot.
    await transaction(async (client) => {
      await client.query(
        `UPDATE employees
         SET end_date = CURRENT_DATE,
             accommodation_id = NULL,
             room_id = NULL,
             status_id = COALESCE($2, status_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, leftStatusId]
      );
      await accHistory.closeAssignment(client, {
        employeeId: id, reason: 'termination', changedBy: req.user?.id || null,
      });
    });

    const emp = existing.rows[0];
    logActivity({
      userId: req.user?.id,
      entityType: 'employee',
      entityId: id,
      action: 'delete',
      metadata: { name: `${emp.last_name || ''} ${emp.first_name || ''}`, employee_number: emp.employee_number },
      ipAddress: req.ip,
    });

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
  // Encrypt if ENCRYPTION_KEY is available, otherwise store plaintext
  const safeEncrypt = (value) => {
    try {
      return encrypt(value);
    } catch {
      return value;
    }
  };

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

    // Convert date values (Excel serial numbers + Hungarian date strings)
    const parseDate = (val) => {
      if (val == null || val === '') return null;
      // Excel serial number (e.g. 32580 → 1989-03-10)
      if (typeof val === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + val * 86400000);
        return date.toISOString().split('T')[0];
      }
      const s = String(val).trim();
      // Hungarian format: 2025.05.30. or 2025.05.30
      const huMatch = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/);
      if (huMatch) return `${huMatch[1]}-${huMatch[2].padStart(2,'0')}-${huMatch[3].padStart(2,'0')}`;
      // DD/MM/YYYY or DD.MM.YYYY
      const euMatch = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
      if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2,'0')}-${euMatch[1].padStart(2,'0')}`;
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      return s;
    };

    const DATE_FIELDS = ['birth_date', 'arrival_date', 'visa_expiry', 'start_date', 'end_date'];

    // Map column headers
    const rows = rawRows.map(raw => {
      const mapped = {};
      for (const [key, value] of Object.entries(raw)) {
        // Strip a trailing parenthetical before mapping: the Hiányzó adatok workbook
        // ships headers like "Vezetéknév (NE MÓDOSÍTSD)" and "Szálláshely (tájékoztató)",
        // and a site manager may well annotate a column of their own. Without this the
        // exported file is not re-uploadable — the identity columns fail to map, the row
        // matches nobody, and the fill-in round trip silently creates new people.
        const normalizedKey = key.toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
        const dbField = COLUMN_MAP[normalizedKey];
        if (dbField) {
          if (DATE_FIELDS.includes(dbField)) {
            mapped[dbField] = parseDate(value);
          } else if (dbField === 'shift_schedule') {
            mapped[dbField] = normalizeShift(value); // hu/en variant → slug or null (never violates the CHECK)
          } else {
            mapped[dbField] = typeof value === 'string' ? value.trim() : String(value);
          }
        }
      }
      // Handle full name splitting (Hungarian: LastName FirstName)
      // If "Név" column was used, it maps to first_name but contains full name
      if (mapped.first_name && !mapped.last_name) {
        const nameParts = mapped.first_name.split(/\s+/);
        if (nameParts.length >= 2) {
          mapped.last_name = nameParts[0]; // Hungarian: last name first
          mapped.first_name = nameParts.slice(1).join(' ');
        }
      }
      // Map Hungarian gender values to English
      if (mapped.gender) {
        const g = mapped.gender.toLowerCase();
        if (g === 'férfi' || g === 'ferfi') mapped.gender = 'male';
        else if (g === 'nő' || g === 'no') mapped.gender = 'female';
        else if (g !== 'male' && g !== 'female') mapped.gender = 'other';
      }
      // Map marital_status to allowed DB values
      if (mapped.marital_status) {
        const m = mapped.marital_status.toLowerCase();
        if (m === 'nős' || m === 'nos' || m === 'férjezett' || m === 'ferjezett' || m === 'married') mapped.marital_status = 'married';
        else if (m === 'hajadon' || m === 'egyedülálló' || m === 'egyedulallo' || m === 'single') mapped.marital_status = 'single';
        else if (m === 'elvált' || m === 'elvalt' || m === 'divorced') mapped.marital_status = 'divorced';
        else if (m === 'özvegy' || m === 'ozvegy' || m === 'widowed') mapped.marital_status = 'widowed';
        else mapped.marital_status = null;
      }
      // Nationality: store a 2-letter UPPER-CASE code (the expiry monitor matches
      // its per-nationality rules case-sensitively). Blank stays blank (optional).
      if (mapped.nationality) {
        mapped.nationality = String(mapped.nationality).trim().toUpperCase().slice(0, 2);
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

    // Megbízó by name → contractor id. Same shape as accMap: resolved once, not per row.
    const clientRes = await query(
      `SELECT c.id, c.name FROM contractors c
        WHERE c.is_active AND EXISTS (
          SELECT 1 FROM contractor_roles cr WHERE cr.contractor_id = c.id AND cr.role = 'megbizo')`);
    const clientMap = {};
    clientRes.rows.forEach((c) => { clientMap[c.name.toLowerCase().trim()] = c.id; });

    // Pre-validate: check all accommodation names before processing any rows
    const uniqueAccNames = [...new Set(
      rows.filter(r => r.accommodation_name).map(r => r.accommodation_name.toLowerCase())
    )];
    const missingAccommodations = uniqueAccNames.filter(name => !accMap[name]);
    if (missingAccommodations.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A következő szálláshelyek nem léteznek a rendszerben: ${missingAccommodations.join(', ')}. Kérjük először hozza létre őket a Szálláshelyek menüben!`,
        data: { missing_accommodations: missingAccommodations }
      });
    }

    const imported = [];
    const updated = [];
    const errors = [];
    const warnings = [];

    // Site managers write "ukrán" or "UA", not an ISO code.
    const LANG = {
      hu: 'hu', magyar: 'hu', hungarian: 'hu',
      en: 'en', angol: 'en', english: 'en',
      uk: 'uk', ua: 'uk', ukran: 'uk', 'ukrán': 'uk', ukrainian: 'uk',
      tl: 'tl', filippino: 'tl', filipino: 'tl', tagalog: 'tl',
      de: 'de', 'német': 'de', nemet: 'de', german: 'de',
    };
    const normLang = (v) => (v ? LANG[String(v).trim().toLowerCase()] || null : null);

    // ── duplicate-detection candidates ────────────────────────────────────────
    // Loaded ONCE, and deliberately including soft-deleted people: a delete+reimport is
    // the same person coming back, and treating them as new is exactly what produced 279
    // duplicate employees on 2026-09-03. The encrypted identifiers use a random IV, so
    // ciphertext comparison is meaningless — they are decrypted here rather than per row.
    const candRes = await query(
      `SELECT id, employee_number, first_name, last_name, birth_date, mothers_name,
              passport_number, social_security_number, tax_id, end_date, personal_email
         FROM employees`);
    const safeDecrypt = (v) => { try { return v ? decrypt(v) : null; } catch { return v; } };
    const candidates = candRes.rows.map((c) => ({
      ...c,
      passport_number: safeDecrypt(c.passport_number),
      social_security_number: safeDecrypt(c.social_security_number),
      tax_id: safeDecrypt(c.tax_id),
    }));

    // UPSERT is the default. The old behaviour — refuse a duplicate, create nothing —
    // made "re-import the same roster" impossible, so the only way to refresh people was
    // bulk-delete then import, and that cycle is what destroyed 279 room links on
    // 2026-09-03. Pass mode:'insert_only' for the old refuse-on-duplicate behaviour.
    const insertOnly = req.body?.mode === 'insert_only';

    // Columns the file may legitimately overwrite. Anything NOT listed here — room_id,
    // shift_schedule, billing_client_id, contractor_id — is assignment state that lives
    // in the app, not in the HR spreadsheet, and a re-import must never clear it.
    const UPDATABLE = [
      'position', 'start_date', 'first_name', 'last_name', 'gender', 'birth_date',
      'birth_place', 'mothers_name', 'marital_status', 'arrival_date', 'visa_expiry',
      'room_number', 'workplace', 'permanent_address_zip', 'permanent_address_country',
      'permanent_address_county', 'permanent_address_city', 'permanent_address_street',
      'permanent_address_number', 'company_name', 'company_email', 'company_phone',
      'personal_email', 'personal_phone', 'nationality', 'end_date',
    ];
    const ENCRYPTED = ['tax_id', 'passport_number', 'social_security_number', 'bank_account'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      // Need at least a last_name
      if (!row.last_name && !row.first_name) {
        errors.push({ row: rowNum, message: 'Hiányzó név' });
        continue;
      }

      if (row.personal_email && !isValidEmail(row.personal_email)) {
        errors.push({ row: rowNum, message: `Érvénytelen email: ${row.personal_email}` });
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

      // ── assignment fields: SET when the file supplies one, NEVER cleared ─────
      // These four are app-owned state, not spreadsheet data, so a partial file must not
      // blank them (that rule is why the 2026-09-03 re-import lost 279 room links). But a
      // fill-in workbook that explicitly names a value must be able to set it — which is
      // the whole point of the Hiányzó adatok round trip. Hence: settable, not clearable.
      const assign = {};
      if (row.preferred_language) {
        const lang = normLang(row.preferred_language);
        if (!lang) {
          errors.push({ row: rowNum, message: `Ismeretlen nyelv: ${row.preferred_language} (hu/en/uk/tl/de)` });
          continue;
        }
        assign.preferred_language = lang;
      }
      if (row.billing_client_name) {
        const cid = clientMap[String(row.billing_client_name).toLowerCase().trim()];
        if (!cid) {
          errors.push({ row: rowNum, message: `Ismeretlen megbízó: ${row.billing_client_name}` });
          continue;
        }
        assign.billing_client_id = cid;
      }

      // Get individual client for each row insert
      const client = await pool.connect();
      try {
        // ── identity match: field scoring, threshold 3 ────────────────────────
        // See utils/employeeIdentity. The check ALWAYS runs — a missing column lowers
        // confidence, it never disables detection.
        const verdict = findDuplicate(row, candidates);
        let match = null;

        if (verdict.status === 'insufficient_fields') {
          warnings.push({
            row: rowNum,
            code: 'duplicate_check_impossible',
            message: 'Nem ellenőrizhető duplikáció — hiányzó azonosító mezők '
                   + `(${verdict.available} azonosító mező van, legalább ${MATCH_THRESHOLD} kell). `
                   + 'A sor importálva lett, de lehet, hogy már létező személy.',
          });
        } else if (verdict.status === 'ambiguous') {
          errors.push({
            row: rowNum,
            message: `Nem egyértelmű azonosítás: ${verdict.rivals} munkavállalóra illik `
                   + `ugyanaz a ${verdict.score} mező (${verdict.fields.map((f) => FIELD_LABEL[f] || f).join(', ')}). `
                   + 'Adj meg több azonosítót a fájlban.',
          });
          continue;
        } else if (verdict.status === 'match') {
          match = verdict.candidate;
        }

        if (match && insertOnly) {
          errors.push({
            row: rowNum,
            code: 'probable_duplicate',
            message: `Valószínű duplikáció: ${match.last_name} ${match.first_name}`
                   + `${match.end_date ? ' (kiléptetett)' : ''} — `
                   + `${verdict.score} egyező azonosító: `
                   + `${verdict.fields.map((f) => FIELD_LABEL[f] || f).join(', ')}. `
                   + 'Ellenőrizd és döntsd el, hogy ugyanaz a személy-e.',
          });
          continue;
        }

        if (match) {
          // UPDATE IN PLACE. Only columns the file actually supplies are written, so a
          // partial spreadsheet cannot blank out fields it does not know about, and the
          // assignment columns (room_id, shift_schedule, billing_client_id,
          // contractor_id) are never in the list at all.
          const sets = [];
          const vals = [];
          let n = 1;
          for (const col of UPDATABLE) {
            if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
              sets.push(`${col} = $${n++}`); vals.push(row[col]);
            }
          }
          for (const col of ENCRYPTED) {
            if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
              sets.push(`${col} = $${n++}`); vals.push(safeEncrypt(row[col]));
            }
          }
          // A row that appears in the file is on the roster again: clear a previous
          // termination and restore active status, so delete → re-import round-trips.
          if (!row.end_date) {
            sets.push('end_date = NULL');
            if (activeStatusId) { sets.push(`status_id = $${n++}`); vals.push(activeStatusId); }
          }
          // Only move them if the file names an accommodation.
          if (accommodationId) { sets.push(`accommodation_id = $${n++}`); vals.push(accommodationId); }
          for (const [col, val] of Object.entries(assign)) { sets.push(`${col} = $${n++}`); vals.push(val); }
          sets.push('updated_at = CURRENT_TIMESTAMP');
          vals.push(match.id);

          const upd = await client.query(
            `UPDATE employees SET ${sets.join(', ')} WHERE id = $${n} RETURNING id, employee_number, room_id, accommodation_id`,
            vals);
          const row2 = upd.rows[0];

          // Link the room when the file names one. Until now the import only ever wrote
          // the room NUMBER as text and left room_id null, so occupancy billing saw
          // nobody in a room — the gap the 2026-09-03 re-link had to repair by hand.
          if (row.room_number && row2.accommodation_id) {
            const rm = await client.query(
              `SELECT id FROM accommodation_rooms
                WHERE accommodation_id = $1 AND lower(btrim(room_number)) = lower(btrim($2))
                  AND is_active`, [row2.accommodation_id, row.room_number]);
            if (rm.rows.length > 0) {
              await client.query('UPDATE employees SET room_id = $1 WHERE id = $2', [rm.rows[0].id, row2.id]);
              row2.room_id = rm.rows[0].id;
            } else {
              warnings.push({
                row: rowNum, code: 'room_not_found',
                message: `A(z) "${row.room_number}" szobaszám nem található ezen a szálláshelyen — `
                       + 'a szobaszám szövegként rögzült, de a lakó nincs szobához kötve.',
              });
            }
          }

          if (row2.accommodation_id && !row.end_date) {
            await accHistory.syncAssignment(client, {
              employeeId: row2.id,
              accommodationId: row2.accommodation_id,
              roomId: row2.room_id,   // preserved, not cleared
              reason: 'bulk import (frissítés)',
              changedBy: req.user?.id || null,
            });
          }
          updated.push({ id: row2.id, employee_number: row2.employee_number });
          continue;
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
        if (row.personal_email) {
          const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [row.personal_email]);
          if (userCheck.rows.length > 0) {
            userId = userCheck.rows[0].id;
          }
        }

        const result = await client.query(
          `INSERT INTO employees (
            user_id, employee_number, status_id, position, start_date, accommodation_id,
            first_name, last_name, gender, birth_date, birth_place, mothers_name,
            tax_id, passport_number, social_security_number, marital_status,
            arrival_date, visa_expiry, room_number, bank_account, workplace,
            permanent_address_zip, permanent_address_country,
            permanent_address_county, permanent_address_city,
            permanent_address_street, permanent_address_number,
            company_name, company_email, company_phone,
            personal_email, personal_phone,
            nationality, end_date
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27,
            $28, $29, $30,
            $31, $32,
            $33, $34
          )
          RETURNING id, employee_number`,
          [
            userId,
            empNumber,
            activeStatusId,
            row.position || null,
            row.start_date || null,
            accommodationId,
            row.first_name || null,
            row.last_name || null,
            row.gender || null,
            row.birth_date || null,
            row.birth_place || null,
            row.mothers_name || null,
            row.tax_id ? safeEncrypt(row.tax_id) : null,
            row.passport_number ? safeEncrypt(row.passport_number) : null,
            row.social_security_number ? safeEncrypt(row.social_security_number) : null,
            row.marital_status || null,
            row.arrival_date || null,
            row.visa_expiry || null,
            row.room_number || null,
            row.bank_account ? safeEncrypt(row.bank_account) : null,
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
            row.personal_email || null,
            row.personal_phone || null,
            row.nationality || null,
            row.end_date || null,
          ]
        );
        // New arrivals get the same assignment resolution as updates — otherwise a
        // fill-in workbook could set a language for existing people but not for new ones.
        const newId = result.rows[0].id;
        if (Object.keys(assign).length > 0) {
          const cols = Object.keys(assign).map((c, i) => `${c} = $${i + 1}`).join(', ');
          await client.query(`UPDATE employees SET ${cols} WHERE id = $${Object.keys(assign).length + 1}`,
            [...Object.values(assign), newId]);
        }
        let newRoomId = null;
        if (row.room_number && accommodationId) {
          const rm = await client.query(
            `SELECT id FROM accommodation_rooms
              WHERE accommodation_id = $1 AND lower(btrim(room_number)) = lower(btrim($2))
                AND is_active`, [accommodationId, row.room_number]);
          if (rm.rows.length > 0) {
            newRoomId = rm.rows[0].id;
            await client.query('UPDATE employees SET room_id = $1 WHERE id = $2', [newRoomId, newId]);
          } else {
            warnings.push({
              row: rowNum, code: 'room_not_found',
              message: `A(z) "${row.room_number}" szobaszám nem található ezen a szálláshelyen — `
                     + 'a szobaszám szövegként rögzült, de a lakó nincs szobához kötve.',
            });
          }
        }

        // Bulk HIRE → open the occupancy history row on the same connection, so an
        // imported worker is billable from day one instead of invisible to snapshots.
        if (accommodationId && !row.end_date) {
          await accHistory.syncAssignment(client, {
            employeeId: newId,
            accommodationId,
            roomId: newRoomId,
            reason: 'bulk import',
            changedBy: req.user?.id || null,
          });
        }
        // A file that lists the same person twice must not create them twice.
        candidates.push({
          id: result.rows[0].id,
          employee_number: result.rows[0].employee_number,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          birth_date: row.birth_date || null,
          mothers_name: row.mothers_name || null,
          passport_number: row.passport_number || null,
          social_security_number: row.social_security_number || null,
          tax_id: row.tax_id || null,
          end_date: row.end_date || null,
        });
        imported.push(result.rows[0]);
      } catch (err) {
        errors.push({ row: rowNum, message: err.message });
      } finally {
        client.release();
      }
    }

    logger.info('Tömeges munkavallaló import', {
      imported: imported.length,
      updated: updated.length,
      warnings: warnings.length,
      errors: errors.length,
      mode: insertOnly ? 'insert_only' : 'upsert',
    });

    // A 300-row round trip has to be verifiable at a glance: every input row must land
    // in exactly one bucket, and the buckets must add up to the file's row count. If they
    // ever don't, rows were dropped silently — which is the thing this report exists to
    // make impossible to miss.
    const reasons = {};
    for (const e of errors) reasons[e.code || 'egyéb'] = (reasons[e.code || 'egyéb'] || 0) + 1;
    const warnReasons = {};
    for (const w of warnings) warnReasons[w.code || 'egyéb'] = (warnReasons[w.code || 'egyéb'] || 0) + 1;

    const summary = {
      rows_in_file: rows.length,
      updated: updated.length,
      created: imported.length,
      failed: errors.length,
      accounted_for: updated.length + imported.length + errors.length,
      balanced: updated.length + imported.length + errors.length === rows.length,
      warnings: warnings.length,
      error_reasons: reasons,
      warning_reasons: warnReasons,
    };

    res.json({
      success: true,
      message: `${rows.length} sor feldolgozva — `
             + `${updated.length} frissítve, ${imported.length} új, ${errors.length} hibás`
             + (warnings.length ? `, ${warnings.length} figyelmeztetés` : ''),
      data: {
        summary,
        imported: imported.length,
        updated: updated.length,
        mode: insertOnly ? 'insert_only' : 'upsert',
        warnings,
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

// ============================================================
// Timeline
// ============================================================

const getEmployeeTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const { types } = req.query;

    // Verify employee exists
    const empCheck = await query('SELECT id FROM employees WHERE id = $1', [id]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    }

    const allTypes = [
      'checkin', 'checkout', 'contract_start', 'contract_end', 'visa_expiry',
      'ticket', 'email', 'shift', 'medical_appointment', 'personal_event', 'note',
      'task',
    ];
    const selectedTypes = types
      ? types.split(',').filter(t => allTypes.includes(t.trim()))
      : allTypes;

    const subQueries = [];

    // Check-in
    if (selectedTypes.includes('checkin')) {
      subQueries.push(`
        SELECT
          e.arrival_date AS event_date,
          'checkin' AS type,
          'Érkezés / Check-in' AS title,
          'Megérkezett a szálláshelyre' AS description,
          NULL AS status,
          NULL AS metadata
        FROM employees e
        WHERE e.id = $1 AND e.arrival_date IS NOT NULL
      `);
    }

    // Check-out
    if (selectedTypes.includes('checkout')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'checkout' AS type,
          'Távozás / Check-out' AS title,
          'Elhagyta a szálláshelyet' AS description,
          NULL AS status,
          NULL AS metadata
        FROM employees e
        WHERE e.id = $1 AND e.end_date IS NOT NULL AND e.end_date < CURRENT_DATE
      `);
    }

    // Contract start
    if (selectedTypes.includes('contract_start')) {
      subQueries.push(`
        SELECT
          e.start_date AS event_date,
          'contract_start' AS type,
          'Szerződés kezdete' AS title,
          'Munkaszerződés érvénybe lépett' AS description,
          'active' AS status,
          NULL AS metadata
        FROM employees e
        WHERE e.id = $1 AND e.start_date IS NOT NULL
      `);
    }

    // Contract end
    if (selectedTypes.includes('contract_end')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'contract_end' AS type,
          'Szerződés lejárata' AS title,
          'Munkaszerződés lejárt' AS description,
          'expired' AS status,
          NULL AS metadata
        FROM employees e
        WHERE e.id = $1 AND e.end_date IS NOT NULL AND e.end_date >= CURRENT_DATE
      `);
    }

    // Visa expiry
    if (selectedTypes.includes('visa_expiry')) {
      subQueries.push(`
        SELECT
          e.visa_expiry AS event_date,
          'visa_expiry' AS type,
          'Vízum lejárat' AS title,
          'Vízum érvényessége lejár' AS description,
          CASE WHEN e.visa_expiry < CURRENT_DATE THEN 'expired' ELSE 'warning' END AS status,
          NULL AS metadata
        FROM employees e
        WHERE e.id = $1 AND e.visa_expiry IS NOT NULL
      `);
    }

    // Tickets — linked via linked_employee_id, or via the employee's user_id
    // when they're the creator/assignee of a ticket.
    if (selectedTypes.includes('ticket')) {
      subQueries.push(`
        SELECT
          t.created_at::date AS event_date,
          'ticket' AS type,
          'Hibajegy: ' || t.title AS title,
          'Hibajegy #' || t.ticket_number || ' - ' || COALESCE(ts.name, '') AS description,
          ts.slug AS status,
          json_build_object('ticket_id', t.id, 'ticket_number', t.ticket_number)::text AS metadata
        FROM tickets t
        LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE t.linked_employee_id = $1
           OR t.created_by  = (SELECT user_id FROM employees WHERE id = $1)
           OR t.assigned_to = (SELECT user_id FROM employees WHERE id = $1)
      `);
    }

    // Emails
    if (selectedTypes.includes('email')) {
      subQueries.push(`
        SELECT
          el.sent_at::date AS event_date,
          'email' AS type,
          'Email: ' || el.subject AS title,
          'Címzett: ' || el.to_email AS description,
          el.status AS status,
          NULL AS metadata
        FROM email_logs el
        WHERE el.to_email = (
          SELECT COALESCE(emp.company_email, u.email)
          FROM employees emp
          LEFT JOIN users u ON emp.user_id = u.id
          WHERE emp.id = $1
        )
      `);
    }

    // Shifts
    if (selectedTypes.includes('shift')) {
      subQueries.push(`
        SELECT
          s.shift_date AS event_date,
          'shift' AS type,
          'Műszak: ' || s.shift_type AS title,
          COALESCE(s.location, '') || ' (' || s.shift_start_time::text || ' - ' || s.shift_end_time::text || ')' AS description,
          NULL AS status,
          NULL AS metadata
        FROM shifts s
        WHERE s.employee_id = $1
      `);
    }

    // Medical appointments
    if (selectedTypes.includes('medical_appointment')) {
      subQueries.push(`
        SELECT
          ma.appointment_date AS event_date,
          'medical_appointment' AS type,
          'Orvosi vizsgálat: ' || ma.appointment_type AS title,
          COALESCE(ma.doctor_name, '') || COALESCE(' - ' || ma.clinic_location, '') AS description,
          NULL AS status,
          NULL AS metadata
        FROM medical_appointments ma
        WHERE ma.employee_id = $1
      `);
    }

    // Personal events
    if (selectedTypes.includes('personal_event')) {
      subQueries.push(`
        SELECT
          pe.event_date AS event_date,
          'personal_event' AS type,
          pe.title AS title,
          COALESCE(pe.description, pe.event_type) AS description,
          NULL AS status,
          NULL AS metadata
        FROM personal_events pe
        WHERE pe.employee_id = $1
      `);
    }

    // Tasks (those created with related_employee_id — i.e. from this employee's timeline)
    if (selectedTypes.includes('task')) {
      subQueries.push(`
        SELECT
          COALESCE(t.due_date, t.created_at::date) AS event_date,
          'task' AS type,
          t.title AS title,
          t.description AS description,
          t.status AS status,
          json_build_object(
            'task_id', t.id,
            'priority', t.priority,
            'due_date', t.due_date,
            'assignee_name', COALESCE(ua.last_name || ' ' || ua.first_name, NULL),
            'creator_name', COALESCE(uc.last_name || ' ' || uc.first_name, 'Rendszer'),
            'created_at', t.created_at
          )::text AS metadata
        FROM tasks t
        LEFT JOIN users ua ON t.assigned_to = ua.id
        LEFT JOIN users uc ON t.created_by  = uc.id
        WHERE t.related_employee_id = $1
      `);
    }

    // Notes
    if (selectedTypes.includes('note')) {
      subQueries.push(`
        SELECT
          en.created_at::date AS event_date,
          'note' AS type,
          en.title AS title,
          en.content AS description,
          en.note_type AS status,
          json_build_object(
            'note_id', en.id,
            'note_type', en.note_type,
            'created_by_name', COALESCE(u.last_name || ' ' || u.first_name, 'Rendszer'),
            'created_at', en.created_at,
            'updated_at', en.updated_at,
            'edited', (en.updated_by IS NOT NULL),
            'edited_by_name', COALESCE(eu.last_name || ' ' || eu.first_name, NULL)
          )::text AS metadata
        FROM employee_notes en
        LEFT JOIN users u  ON en.created_by = u.id
        LEFT JOIN users eu ON en.updated_by = eu.id
        WHERE en.employee_id = $1
      `);
    }

    if (subQueries.length === 0) {
      return res.json({ success: true, data: { timeline: [] } });
    }

    const sql = subQueries.join('\nUNION ALL\n') + '\nORDER BY event_date DESC NULLS LAST';
    const result = await query(sql, [id]);

    const timeline = result.rows.map(row => ({
      ...row,
      event_date: row.event_date ? new Date(row.event_date).toISOString().split('T')[0] : null,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    }));

    res.json({ success: true, data: { timeline } });
  } catch (error) {
    logger.error('Idővonal lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Idővonal lekérési hiba' });
  }
};

// ============================================================
// Employee Notes CRUD
// ============================================================

const createEmployeeNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note_type, title, content } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Cím megadása kötelező' });
    }

    const result = await query(
      `INSERT INTO employee_notes (employee_id, created_by, note_type, title, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, req.user.id, note_type || 'general', title, content || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Jegyzet létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Jegyzet létrehozási hiba' });
  }
};

const updateEmployeeNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const { title, content, note_type } = req.body;

    if (title !== undefined && !title.trim()) {
      return res.status(400).json({ success: false, message: 'A cím nem lehet üres' });
    }

    const fields = [];
    const values = [];
    let i = 1;
    if (title !== undefined)     { fields.push(`title = $${i++}`);     values.push(title.trim()); }
    if (content !== undefined)   { fields.push(`content = $${i++}`);   values.push(content || null); }
    if (note_type !== undefined) { fields.push(`note_type = $${i++}`); values.push(note_type); }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs módosítandó mező' });
    }
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    fields.push(`updated_by = $${i++}`); values.push(req.user.id);

    values.push(noteId); values.push(id);
    const result = await query(
      `UPDATE employee_notes
         SET ${fields.join(', ')}
       WHERE id = $${i++} AND employee_id = $${i}
       RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Jegyzet nem található' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Jegyzet frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Jegyzet frissítési hiba' });
  }
};

const deleteEmployeeNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const result = await query(
      'DELETE FROM employee_notes WHERE id = $1 AND employee_id = $2 RETURNING id',
      [noteId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jegyzet nem található' });
    }
    res.json({ success: true, message: 'Jegyzet törölve' });
  } catch (error) {
    logger.error('Jegyzet törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Jegyzet törlési hiba' });
  }
};

// ============================================================
// Profile Photo Upload / Delete
// ============================================================

const uploadPhoto = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Kép feltöltése kötelező' });
    }

    const existing = await query('SELECT id, profile_photo_url FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      // Clean up uploaded file
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    }

    const oldPhotoUrl = existing.rows[0].profile_photo_url;
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'employees');
    const timestamp = Date.now();

    // Create thumbnail (300x300 cover)
    const thumbFilename = `thumb_${timestamp}.jpg`;
    const thumbPath = path.join(uploadDir, thumbFilename);
    await sharp(req.file.path)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    // Create resized original (max 800x800)
    const origFilename = `orig_${timestamp}.jpg`;
    const origPath = path.join(uploadDir, origFilename);
    await sharp(req.file.path)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(origPath);

    // Remove the raw uploaded file
    fs.unlink(req.file.path, () => {});

    // Delete old photo files if replacing
    if (oldPhotoUrl) {
      const oldThumbPath = path.join(__dirname, '..', '..', oldPhotoUrl);
      const oldOrigPath = oldThumbPath.replace('thumb_', 'orig_');
      fs.unlink(oldThumbPath, () => {});
      fs.unlink(oldOrigPath, () => {});
    }

    const profilePhotoUrl = `/uploads/employees/${thumbFilename}`;
    await query(
      'UPDATE employees SET profile_photo_url = $1, updated_at = NOW() WHERE id = $2',
      [profilePhotoUrl, id]
    );

    logger.info('Profilkép feltöltve', { employeeId: id });

    res.json({
      success: true,
      data: { profile_photo_url: profilePhotoUrl }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error('Profilkép feltöltési hiba:', error);
    res.status(500).json({ success: false, message: 'Profilkép feltöltési hiba' });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, profile_photo_url FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    }

    const photoUrl = existing.rows[0].profile_photo_url;
    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'Nincs profilkép' });
    }

    // Delete files from disk
    const thumbPath = path.join(__dirname, '..', '..', photoUrl);
    const origPath = thumbPath.replace('thumb_', 'orig_');
    fs.unlink(thumbPath, () => {});
    fs.unlink(origPath, () => {});

    await query(
      'UPDATE employees SET profile_photo_url = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info('Profilkép törölve', { employeeId: id });

    res.json({ success: true, message: 'Profilkép törölve' });
  } catch (error) {
    logger.error('Profilkép törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Profilkép törlési hiba' });
  }
};

// ============================================================
// Bulk Actions
// ============================================================

/**
 * Tomeges statusz frissites
 */
const bulkUpdateStatus = async (req, res) => {
  try {
    const { employee_ids, status_id } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Legalabb egy munkavallaló kiválasztása kötelező'
      });
    }

    if (!status_id) {
      return res.status(400).json({
        success: false,
        message: 'Státusz megadása kötelező'
      });
    }

    // Capture each employee's current status BEFORE the update so the history
    // recorder can log the real from→to (the UPDATE overwrites it).
    const prior = await query(
      `SELECT id, status_id FROM employees WHERE id = ANY($1) AND end_date IS NULL`,
      [employee_ids]
    );
    const priorStatusById = new Map(prior.rows.map((r) => [r.id, r.status_id]));

    const result = await query(
      `UPDATE employees
       SET status_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2) AND end_date IS NULL
       RETURNING id`,
      [status_id, employee_ids]
    );

    // Log one entry per employee
    for (const row of result.rows) {
      logActivity({
        userId: req.user?.id,
        entityType: 'employee',
        entityId: row.id,
        action: 'update',
        changes: { status_id: { old: null, new: status_id } },
        metadata: { bulk_action: 'status_update' },
        ipAddress: req.ip,
      });

      // Status-history transition (best-effort, never throws; no-ops if unchanged).
      statusHistory.recordStatusChangeById({
        entityType: 'employee',
        entityId: row.id,
        fromStatusId: priorStatusById.get(row.id) ?? null,
        toStatusId: status_id,
        changedBy: req.user?.id,
        source: 'bulk',
      });
    }

    logger.info('Tomeges statusz frissites', { count: result.rowCount });

    res.json({
      success: true,
      message: `${result.rowCount} munkavállaló státusza frissítve`,
      data: { updated_count: result.rowCount }
    });
  } catch (error) {
    logger.error('Tomeges statusz frissitesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tomeges statusz frissitesi hiba'
    });
  }
};

/**
 * Tomeges torles (soft delete)
 */
const bulkDelete = async (req, res) => {
  try {
    const { employee_ids } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Legalabb egy munkavállaló kiválasztása kötelező'
      });
    }

    // Get "Kilepett" status
    const leftStatus = await query("SELECT id FROM employee_status_types WHERE slug = 'left'");
    const leftStatusId = leftStatus.rows.length > 0 ? leftStatus.rows[0].id : null;

    // How many of these people are actually housed? Ending someone's employment is
    // routine; un-housing 279 people is not, and on 2026-09-03 this endpoint did exactly
    // that in three clicks with no warning and no history entry.
    const housed = await query(
      `SELECT id, CONCAT(last_name, ' ', first_name) AS name, employee_number
         FROM employees
        WHERE id = ANY($1) AND end_date IS NULL AND accommodation_id IS NOT NULL
        ORDER BY last_name, first_name`,
      [employee_ids]
    );
    const confirmed = req.query.confirm === 'true' || req.body?.confirm === true;
    if (housed.rows.length > 0 && !confirmed) {
      return res.status(409).json({
        success: false,
        requires_confirmation: true,
        message: `A kijelöltek közül ${housed.rows.length} fő jelenleg szálláson van. `
               + 'Kiléptetésükkel a szállás- és szobabeosztásuk lezárul. Biztosan folytatod?',
        data: { housed_count: housed.rows.length, housed: housed.rows.slice(0, 50) },
      });
    }

    // accommodation_id and room_id are deliberately KEPT. The end date and the closed
    // history row are what say "no longer housed"; blanking the columns destroyed the
    // room link the July linker had established and made a delete+reimport cycle lossy.
    // Occupancy reads filter on end_date, and the history row below is the record.
    const result = await query(
      `UPDATE employees
       SET end_date = CURRENT_DATE,
           status_id = COALESCE($1, status_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2) AND end_date IS NULL
       RETURNING id`,
      [leftStatusId, employee_ids]
    );

    // Close the occupancy history. Without this the row stays OPEN forever: the roster
    // says the person left while history still says they are housed — 566 such rows had
    // accumulated by 2026-09-03.
    for (const row of result.rows) {
      await accHistory.syncAssignmentSafe({
        employeeId: row.id, accommodationId: null, roomId: null,
        reason: 'bulk delete', changedBy: req.user?.id || null,
      });
    }

    // Log one entry per employee
    for (const row of result.rows) {
      logActivity({
        userId: req.user?.id,
        entityType: 'employee',
        entityId: row.id,
        action: 'delete',
        metadata: { bulk_action: 'bulk_delete' },
        ipAddress: req.ip,
      });
    }

    logger.info('Tomeges torles', { count: result.rowCount });

    res.json({
      success: true,
      message: `${result.rowCount} munkavállaló deaktiválva`,
      data: { deleted_count: result.rowCount }
    });
  } catch (error) {
    logger.error('Tomeges torlesi hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tomeges torlesi hiba'
    });
  }
};

/**
 * Tomeges export (kivalasztott munkavallalok)
 */
const bulkExport = async (req, res) => {
  try {
    const { employee_ids } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Legalabb egy munkavállaló kiválasztása kötelező'
      });
    }

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
      WHERE e.id = ANY($1)
      ORDER BY e.created_at DESC`,
      [employee_ids]
    );

    const GENDER_LABELS = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };
    const MARITAL_LABELS = { single: 'Egyedülálló', married: 'Házas', divorced: 'Elvált', widowed: 'Özvegy' };

    function fmtDate(val) {
      if (!val) return '';
      return new Date(val).toLocaleDateString('hu-HU');
    }

    // Decrypt PII fields before export
    const decryptedRows = decryptPiiRows(result.rows);

    const data = decryptedRows.map(row => ({
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

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=munkavallalok_kivalasztott.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.error('Tomeges export hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Tomeges export hiba'
    });
  }
};

// Hungarian shift labels for the round-trip template (slug → label / label → slug via normalizeShift).
const SHIFT_LABELS = { delelott: 'Délelőttös', delutan: 'Délutános', ejszaka: 'Éjszakás', valtott: 'Váltott' };

/**
 * GET /api/v1/employees/room-template
 * Pre-filled Excel of ALL active employees for room assignment: identity columns
 * (for in-place matching on re-upload), accommodation, current room (to edit),
 * current shift. The user fills the "Szoba" column and re-uploads via
 * /room-assignments — matched by identity, never creating duplicates.
 */
const exportRoomTemplate = async (req, res) => {
  try {
    const result = await query(
      `SELECT e.employee_number, e.last_name, e.first_name, e.mothers_name, e.birth_date,
              a.name AS accommodation_name, ar.room_number AS current_room, e.shift_schedule
         FROM employees e
         LEFT JOIN accommodations a ON a.id = e.accommodation_id
         LEFT JOIN accommodation_rooms ar ON ar.id = e.room_id
        WHERE e.end_date IS NULL
        ORDER BY a.name NULLS LAST, e.last_name, e.first_name`
    );
    const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('hu-HU') : '');
    const data = result.rows.map(r => ({
      'Törzsszám': r.employee_number || '',
      'Vezetéknév': r.last_name || '',
      'Keresztnév': r.first_name || '',
      'Anyja neve': r.mothers_name || '',
      'Születési dátum': fmtDate(r.birth_date),
      'Szálláshely': r.accommodation_name || '',
      'Szoba': r.current_room || '',            // ← fill this (room number in the accommodation)
      'Műszak': SHIFT_LABELS[r.shift_schedule] || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{
      'Törzsszám': '', 'Vezetéknév': '', 'Keresztnév': '', 'Anyja neve': '',
      'Születési dátum': '', 'Szálláshely': '', 'Szoba': '', 'Műszak': '',
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Szoba-kiosztás');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=szoba_kiosztas_sablon.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.error('Szoba-sablon export hiba:', error);
    res.status(500).json({ success: false, message: 'Szoba-sablon export hiba' });
  }
};

// Header resolver for the room-assignment upload (tolerant to hu/en variants).
const roomTemplateHeader = (key) => {
  const k = String(key).toLowerCase().trim();
  if (['vezetéknév', 'vezeteknev', 'last_name'].includes(k)) return 'last_name';
  if (['keresztnév', 'keresztnev', 'first_name'].includes(k)) return 'first_name';
  if (['anyja neve', 'mothers_name'].includes(k)) return 'mothers_name';
  if (['szálláshely', 'szallashely', 'accommodation'].includes(k)) return 'accommodation_name';
  if (['szoba', 'szobaszám', 'szobaszam', 'room', 'room_number'].includes(k)) return 'room';
  if (['műszak', 'muszak', 'shift', 'shift_schedule'].includes(k)) return 'shift';
  return null;
};

/**
 * POST /api/v1/employees/room-assignments  (multipart file)
 * Upload the filled room template. For each row: match the employee by identity
 * (last_name + first_name + mothers_name), resolve the room by number WITHIN the
 * employee's accommodation, validate it belongs there AND respects bed capacity,
 * then UPDATE room_id (+ shift if given). Never creates; reports per-row outcome.
 */
const bulkAssignRooms = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Nincs feltöltött fájl' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    const rows = raw.map(r => {
      const m = {};
      for (const [key, val] of Object.entries(r)) {
        const f = roomTemplateHeader(key);
        if (f) m[f] = typeof val === 'string' ? val.trim() : String(val);
      }
      return m;
    });

    const updated = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];
      if (!row.last_name && !row.first_name) continue; // skip blank lines
      if (!row.room && !row.shift) { continue; } // nothing to assign on this row

      // 1) Match employee by identity (name + mother's name).
      const match = await query(
        `SELECT e.id, e.accommodation_id, e.room_id
           FROM employees e
          WHERE e.end_date IS NULL
            AND LOWER(e.last_name) = LOWER($1)
            AND LOWER(COALESCE(e.first_name,'')) = LOWER($2)
            AND LOWER(COALESCE(e.mothers_name,'')) = LOWER($3)`,
        [row.last_name || '', row.first_name || '', row.mothers_name || '']
      );
      if (match.rows.length === 0) { errors.push({ row: rowNum, message: `Nem található munkavállaló: ${row.last_name} ${row.first_name} (${row.mothers_name || 'nincs anyja neve'})` }); continue; }
      if (match.rows.length > 1) { errors.push({ row: rowNum, message: `Több egyező munkavállaló (${row.last_name} ${row.first_name}) — anyja neve/születési dátum szükséges az egyértelműsítéshez` }); continue; }
      const emp = match.rows[0];

      const sets = [];
      const params = [];
      let p = 0;

      // 2) Shift (optional) — normalize hu/en → slug.
      if (row.shift) {
        const slug = normalizeShift(row.shift);
        if (slug) { sets.push(`shift_schedule = $${++p}`); params.push(slug); }
      }

      // 3) Room (optional) — resolve within the accommodation, validate membership + capacity.
      if (row.room) {
        // Target accommodation: the row's if given, else the employee's current.
        let accId = emp.accommodation_id;
        if (row.accommodation_name) {
          const a = await query('SELECT id FROM accommodations WHERE LOWER(name) = LOWER($1) AND is_active = true', [row.accommodation_name]);
          if (a.rows.length === 0) { errors.push({ row: rowNum, message: `Ismeretlen szálláshely: ${row.accommodation_name}` }); continue; }
          accId = a.rows[0].id;
        }
        if (!accId) { errors.push({ row: rowNum, message: `A munkavállalónak nincs szálláshelye — a szoba nem rendelhető` }); continue; }

        const roomRes = await query(
          'SELECT id, beds FROM accommodation_rooms WHERE accommodation_id = $1 AND LOWER(room_number) = LOWER($2) AND is_active = true',
          [accId, String(row.room)]
        );
        if (roomRes.rows.length === 0) { errors.push({ row: rowNum, message: `A(z) "${row.room}" szoba nem tartozik ehhez a szálláshelyhez` }); continue; }
        const room = roomRes.rows[0];

        // Capacity: occupants (excluding this employee) + 1 must fit the beds.
        // Each row commits immediately, so this COUNT already reflects prior
        // in-batch assignments to the same room — no separate batch counter needed.
        const occ = await query('SELECT COUNT(*)::int c FROM employees WHERE room_id = $1 AND id <> $2 AND end_date IS NULL', [room.id, emp.id]);
        const wouldBe = occ.rows[0].c + 1;
        if (wouldBe > room.beds) { errors.push({ row: rowNum, message: `A(z) "${row.room}" szoba tele van (${room.beds} ágy, ${wouldBe} fő lenne)` }); continue; }

        if (accId !== emp.accommodation_id) { sets.push(`accommodation_id = $${++p}`); params.push(accId); }
        sets.push(`room_id = $${++p}`); params.push(room.id);
        sets.push(`room_number = $${++p}`); params.push(String(row.room));
      }

      if (sets.length === 0) continue;
      params.push(emp.id);
      // Excel room round-trip is a housing change like any other → history must follow it,
      // in the same transaction as the row it describes.
      await transaction(async (client) => {
        const r = await client.query(
          `UPDATE employees SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${++p} RETURNING accommodation_id, room_id, end_date`, params);
        const emp2 = r.rows[0];
        if (emp2 && !emp2.end_date) {
          await accHistory.syncAssignment(client, {
            employeeId: emp.id, accommodationId: emp2.accommodation_id, roomId: emp2.room_id,
            reason: 'excel room assignment', changedBy: req.user?.id || null,
          });
        }
      });
      updated.push({ row: rowNum, employee: `${row.last_name} ${row.first_name}`, room: row.room || null, shift: row.shift ? normalizeShift(row.shift) : null });
    }

    res.json({
      success: errors.length === 0,
      message: `${updated.length} munkavállaló frissítve${errors.length ? `, ${errors.length} hiba` : ''}`,
      data: { updated_count: updated.length, error_count: errors.length, updated, errors },
    });
  } catch (error) {
    logger.error('Szoba-kiosztás import hiba:', error);
    res.status(500).json({ success: false, message: 'Szoba-kiosztás import hiba' });
  }
};

/**
 * Hiányzó adatok — overview, drill-down and the fill-in workbook.
 * The service owns the field registry so the three stay in step.
 */
const dataCompleteness = require('../services/dataCompleteness.service');

const getCompleteness = async (req, res) => {
  try {
    res.json({ success: true, data: await dataCompleteness.summary() });
  } catch (error) {
    logger.error('Hiányzó adatok lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiányzó adatok lekérési hiba' });
  }
};

const getCompletenessField = async (req, res) => {
  try {
    const out = await dataCompleteness.listMissing(req.params.field, { limit: parseInt(req.query.limit, 10) || 500 });
    if (!out) return res.status(404).json({ success: false, message: 'Ismeretlen mező' });
    res.json({ success: true, data: out });
  } catch (error) {
    logger.error('Hiányzó adatok részletezési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiányzó adatok részletezési hiba' });
  }
};

const exportCompleteness = async (req, res) => {
  try {
    const keys = String(req.query.fields || '').split(',').map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: 'Legalább egy mező megadása kötelező (?fields=...)' });
    }
    const wb = await dataCompleteness.buildWorkbook(keys);
    if (!wb) {
      return res.status(400).json({ success: false, message: 'Egyik megadott mező sem tölthető ki Excelből' });
    }
    logger.info('Hiányzó adatok export', { fields: keys, rows: wb.rows, user: req.user?.id });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=hianyzo-adatok-${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(wb.buffer);
  } catch (error) {
    logger.error('Hiányzó adatok export hiba:', error);
    res.status(500).json({ success: false, message: 'Hiányzó adatok export hiba' });
  }
};

module.exports = {
  getCompleteness, getCompletenessField, exportCompleteness,
  getEmployeeStatuses,
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  bulkImportEmployees,
  getEmployeeTimeline,
  createEmployeeNote,
  updateEmployeeNote,
  deleteEmployeeNote,
  uploadPhoto,
  deletePhoto,
  bulkUpdateStatus,
  bulkDelete,
  bulkExport,
  exportRoomTemplate,
  bulkAssignRooms,
};
