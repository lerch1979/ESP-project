#!/usr/bin/env node

/**
 * HR-ERP Adatbázis Seed Script
 *
 * Teljes adatbázis újratöltése tiszta tesztadatokkal.
 * FIGYELEM: Ez a script TÖRLI az összes meglévő adatot!
 *
 * Automatikusan detektálja, hogy a tenant→contractor átnevezés megtörtént-e,
 * és ha nem, alkalmazza a migrációt a seed előtt.
 *
 * Futtatás: node scripts/seed-database.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// ─── Database Connection ────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logStep(step, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${step}] ${msg}`);
}

// ─── Migration: Rename tenant_id → contractor_id if needed ──────────────────

async function ensureContractorColumns(client) {
  // Check if users table still has tenant_id (meaning rename migration hasn't been applied)
  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tenant_id'
  `);

  if (colCheck.rows.length === 0) {
    log('Oszlopok már contractor_id-t használnak, nincs szükség migrációra.');
    return;
  }

  log('tenant_id → contractor_id átnevezés szükséges, migráció alkalmazása...');

  // Step 1: If a separate 'contractors' table exists (without PK), drop it
  // The real table is 'tenants' which has the PK and all FK references
  const contractorsTableCheck = await client.query(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contractors' AND constraint_type = 'PRIMARY KEY'
  `);
  const separateContractorsExists = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'contractors' AND table_schema = 'public'
  `);

  if (separateContractorsExists.rows.length > 0 && contractorsTableCheck.rows.length === 0) {
    // A contractors table exists but has no PK - it's a duplicate, drop it
    await client.query('DROP TABLE IF EXISTS contractors CASCADE');
    log('  Duplikált contractors tábla törölve (PK nélkül).');
  }

  // Step 2: Rename tenants → contractors (preserves PK and all FK references)
  const tenantsExists = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tenants' AND table_schema = 'public'
  `);
  if (tenantsExists.rows.length > 0) {
    await client.query('ALTER TABLE tenants RENAME TO contractors');
    log('  tenants tábla átnevezve → contractors');
  }

  // Step 3: Rename columns across all tables that use tenant_id
  const renames = [
    ['users', 'tenant_id', 'contractor_id'],
    ['employees', 'tenant_id', 'contractor_id'],
    ['tickets', 'tenant_id', 'contractor_id'],
    ['user_roles', 'tenant_id', 'contractor_id'],
    ['organizational_units', 'tenant_id', 'contractor_id'],
    ['ticket_categories', 'tenant_id', 'contractor_id'],
    ['notifications', 'tenant_id', 'contractor_id'],
    ['email_logs', 'tenant_id', 'contractor_id'],
    ['cost_centers', 'tenant_id', 'contractor_id'],
    ['projects', 'tenant_id', 'contractor_id'],
    ['notification_templates', 'tenant_id', 'contractor_id'],
    ['accommodations', 'current_tenant_id', 'current_contractor_id'],
  ];

  for (const [table, oldCol, newCol] of renames) {
    const exists = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    `, [table, oldCol]);

    if (exists.rows.length > 0) {
      await client.query(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`);
      log(`  ${table}.${oldCol} → ${newCol}`);
    }
  }

  // Step 4: Rename accommodation_tenants table and its column if needed
  const atExists = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'accommodation_tenants' AND table_schema = 'public'
  `);
  if (atExists.rows.length > 0) {
    const atColCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'accommodation_tenants' AND column_name = 'tenant_id'
    `);
    if (atColCheck.rows.length > 0) {
      await client.query(`ALTER TABLE accommodation_tenants RENAME COLUMN tenant_id TO contractor_id`);
    }
    // Don't rename the table if accommodation_contractors already exists
    const acExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'accommodation_contractors' AND table_schema = 'public'
    `);
    if (acExists.rows.length === 0) {
      await client.query(`ALTER TABLE accommodation_tenants RENAME TO accommodation_contractors`);
      log('  accommodation_tenants → accommodation_contractors');
    }
  }

  log('Migráció kész.');
}

// ─── Detect which tables actually exist ─────────────────────────────────────

async function getExistingTables(client) {
  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(res.rows.map(r => r.table_name));
}

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    log('Adatbázis seed indítása...');

    // Ensure column renames are applied
    await ensureContractorColumns(client);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Truncate all tables (respecting FK order via CASCADE)
    // ════════════════════════════════════════════════════════════════════════
    logStep('1/10', 'Meglévő adatok törlése...');

    const existingTables = await getExistingTables(client);

    // All tables in the schema, ordered for truncation. We use CASCADE anyway,
    // but listing them explicitly documents the full schema scope.
    const allTables = [
      // Audit / logs
      'ticket_history', 'ticket_attachments', 'ticket_comments',
      'activity_logs', 'email_logs',
      // Tickets
      'tickets',
      // Employee related
      'employee_documents', 'employee_notes',
      'shifts', 'medical_appointments', 'personal_events',
      'google_calendar_sync_map', 'google_calendar_tokens',
      'employees',
      // Accommodations
      'accommodation_rooms',
      'accommodation_contractors', 'accommodation_tenants',
      'accommodations',
      // Documents, notifications
      'documents', 'notifications', 'notification_templates',
      // User preferences, videos, reports
      'user_preferences', 'video_views', 'videos',
      'scheduled_report_runs', 'scheduled_reports',
      // Users & roles
      'user_roles', 'users',
      // Ticket metadata
      'ticket_categories',
      // Organization
      'organizational_units', 'cost_centers', 'projects',
      // Multi-tenant
      'contractors', 'tenants',
      // Chatbot
      'chatbot_messages', 'chatbot_conversations',
      'chatbot_decision_nodes', 'chatbot_decision_trees',
      'chatbot_knowledge_base', 'chatbot_faq_categories', 'chatbot_config',
      // Lookups
      'role_permissions', 'permissions', 'roles',
      'employee_status_types', 'ticket_statuses', 'priorities',
    ];

    const tablesToTruncate = allTables.filter(t => existingTables.has(t));

    if (tablesToTruncate.length > 0) {
      await client.query(`TRUNCATE TABLE ${tablesToTruncate.join(', ')} CASCADE`);
    }

    logStep('1/10', `${tablesToTruncate.length} tábla kiürítve.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Roles (Szerepkörök)
    // ════════════════════════════════════════════════════════════════════════
    logStep('2/10', 'Szerepkörök létrehozása...');

    const roleIds = {};
    const roleDefs = [
      { name: 'Szuperadmin', slug: 'superadmin', description: 'Teljes rendszer hozzáférés' },
      { name: 'Megbízó (Adatkezelő)', slug: 'data_controller', description: 'Saját cég teljes adatkezelése' },
      { name: 'Általános Adminisztrátor', slug: 'admin', description: 'HR és ticket kezelés' },
      { name: 'Feladat-felelős', slug: 'task_owner', description: 'Ticketek kezelése' },
      { name: 'Külső Alvállalkozó', slug: 'contractor', description: 'Korlátozott ticket hozzáférés' },
      { name: 'Felhasználó', slug: 'user', description: 'Alapvető felhasználói jogok' },
      { name: 'Szállásolt Munkavállaló', slug: 'accommodated_employee', description: 'Szállásolt munkavállaló' },
    ];

    for (const r of roleDefs) {
      const res = await client.query(
        `INSERT INTO roles (name, slug, description, is_system)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [r.name, r.slug, r.description]
      );
      roleIds[r.slug] = res.rows[0].id;
    }

    logStep('2/10', `${roleDefs.length} szerepkör létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Employee Status Types (Munkavállalói státuszok)
    // ════════════════════════════════════════════════════════════════════════
    logStep('3/10', 'Munkavállalói státuszok létrehozása...');

    const statusTypeIds = {};
    const statusTypeDefs = [
      { name: 'Aktív', slug: 'active', description: 'Aktív munkaviszony', color: '#10b981' },
      { name: 'Felfüggesztett', slug: 'suspended', description: 'Felfüggesztett státusz', color: '#f97316' },
      { name: 'Kilépett', slug: 'left', description: 'Megszűnt munkaviszony', color: '#ef4444' },
      { name: 'Szabadságon', slug: 'paid_leave', description: 'Fizetett szabadságon', color: '#3b82f6' },
      { name: 'Várakozó', slug: 'waiting', description: 'Várakozó státusz', color: '#94a3b8' },
    ];

    for (const s of statusTypeDefs) {
      const res = await client.query(
        `INSERT INTO employee_status_types (name, slug, description, color)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [s.name, s.slug, s.description, s.color]
      );
      statusTypeIds[s.slug] = res.rows[0].id;
    }

    logStep('3/10', `${statusTypeDefs.length} munkavállalói státusz létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Ticket Statuses (Ticket státuszok)
    // ════════════════════════════════════════════════════════════════════════
    logStep('4/10', 'Ticket státuszok létrehozása...');

    const ticketStatusIds = {};
    const ticketStatusDefs = [
      { name: 'Új', slug: 'new', description: 'Új bejelentés, feldolgozásra vár', color: '#3b82f6', order_index: 1, is_final: false },
      { name: 'Folyamatban', slug: 'in_progress', description: 'Aktív feldolgozás alatt', color: '#f59e0b', order_index: 2, is_final: false },
      { name: 'Lezárva', slug: 'completed', description: 'Sikeresen lezárva', color: '#10b981', order_index: 3, is_final: true },
      { name: 'Elutasítva', slug: 'rejected', description: 'Elutasított kérés', color: '#ef4444', order_index: 4, is_final: true },
    ];

    for (const s of ticketStatusDefs) {
      const res = await client.query(
        `INSERT INTO ticket_statuses (name, slug, description, color, order_index, is_final)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [s.name, s.slug, s.description, s.color, s.order_index, s.is_final]
      );
      ticketStatusIds[s.slug] = res.rows[0].id;
    }

    logStep('4/10', `${ticketStatusDefs.length} ticket státusz létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: Priorities (Prioritások)
    // ════════════════════════════════════════════════════════════════════════
    logStep('5/10', 'Prioritások létrehozása...');

    const priorityIds = {};
    const priorityDefs = [
      { name: 'Kritikus', slug: 'critical', level: 4, color: '#ef4444' },
      { name: 'Sürgős', slug: 'urgent', level: 3, color: '#f59e0b' },
      { name: 'Normál', slug: 'normal', level: 2, color: '#64748b' },
      { name: 'Alacsony', slug: 'low', level: 1, color: '#10b981' },
    ];

    for (const p of priorityDefs) {
      const res = await client.query(
        `INSERT INTO priorities (name, slug, level, color)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [p.name, p.slug, p.level, p.color]
      );
      priorityIds[p.slug] = res.rows[0].id;
    }

    logStep('5/10', `${priorityDefs.length} prioritás létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 6: Contractor (Alvállalkozó)
    // ════════════════════════════════════════════════════════════════════════
    logStep('6/10', 'Alvállalkozó létrehozása...');

    const contractorRes = await client.query(
      `INSERT INTO contractors (name, slug, email, phone, address, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [
        'ABC Kereskedelmi Kft.',
        'abc-kft',
        'info@abc-kft.hu',
        '+36 1 234 5678',
        '1055 Budapest, Kossuth Lajos tér 1.',
      ]
    );
    const contractorId = contractorRes.rows[0].id;

    logStep('6/10', `Alvállalkozó létrehozva: ABC Kereskedelmi Kft.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 7: Accommodations + Rooms (Szálláshelyek + Szobák)
    // ════════════════════════════════════════════════════════════════════════
    logStep('7/10', 'Szálláshelyek és szobák létrehozása...');

    const accommodationIds = {};
    const roomIds = {};

    const accommodationDefs = [
      {
        name: 'A épület',
        address: '1138 Budapest, Váci út 15.',
        type: 'dormitory',
        capacity: 12,
        status: 'occupied',
        monthly_rent: 450000,
        rooms: [
          { number: '101', floor: 1, beds: 2 },
          { number: '102', floor: 1, beds: 2 },
          { number: '103', floor: 1, beds: 2 },
          { number: '201', floor: 2, beds: 2 },
          { number: '202', floor: 2, beds: 2 },
          { number: '203', floor: 2, beds: 2 },
        ],
      },
      {
        name: 'B épület',
        address: '1138 Budapest, Váci út 17.',
        type: 'dormitory',
        capacity: 8,
        status: 'occupied',
        monthly_rent: 350000,
        rooms: [
          { number: '101', floor: 1, beds: 2 },
          { number: '102', floor: 1, beds: 2 },
          { number: '201', floor: 2, beds: 2 },
          { number: '202', floor: 2, beds: 2 },
        ],
      },
      {
        name: 'C épület',
        address: '1139 Budapest, Frangepán utca 8.',
        type: 'dormitory',
        capacity: 6,
        status: 'available',
        monthly_rent: 280000,
        rooms: [
          { number: '101', floor: 1, beds: 2 },
          { number: '102', floor: 1, beds: 2 },
          { number: '201', floor: 2, beds: 2 },
        ],
      },
    ];

    // Detect accommodation_contractors vs accommodation_tenants
    const accContractorsExists = existingTables.has('accommodation_contractors');
    const accJunctionTable = accContractorsExists ? 'accommodation_contractors' : 'accommodation_tenants';
    const accJunctionCol = accContractorsExists ? 'contractor_id' : 'contractor_id'; // already renamed above

    for (const acc of accommodationDefs) {
      const accRes = await client.query(
        `INSERT INTO accommodations (name, address, type, capacity, current_contractor_id, status, monthly_rent, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id`,
        [acc.name, acc.address, acc.type, acc.capacity, contractorId, acc.status, acc.monthly_rent]
      );
      const accId = accRes.rows[0].id;
      accommodationIds[acc.name] = accId;
      roomIds[acc.name] = {};

      // Link contractor to accommodation
      await client.query(
        `INSERT INTO ${accJunctionTable} (accommodation_id, contractor_id, check_in, notes)
         VALUES ($1, $2, CURRENT_DATE, $3)`,
        [accId, contractorId, `${acc.name} bérlet`]
      );

      // Create rooms
      for (const room of acc.rooms) {
        const roomRes = await client.query(
          `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
           VALUES ($1, $2, $3, $4, 'standard', true)
           RETURNING id`,
          [accId, room.number, room.floor, room.beds]
        );
        roomIds[acc.name][room.number] = roomRes.rows[0].id;
      }
    }

    const totalRooms = accommodationDefs.reduce((sum, a) => sum + a.rooms.length, 0);
    logStep('7/10', `${accommodationDefs.length} szálláshely és ${totalRooms} szoba létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 8: Ticket Categories (Ticket kategóriák)
    // ════════════════════════════════════════════════════════════════════════
    logStep('8/10', 'Ticket kategóriák létrehozása...');

    const categoryIds = {};
    const categoryDefs = [
      { name: 'Technikai', slug: 'technical', color: '#5b21b6', icon: '🔧' },
      { name: 'HR', slug: 'hr', color: '#3730a3', icon: '👥' },
      { name: 'Általános', slug: 'general', color: '#64748b', icon: '📋' },
    ];

    for (const cat of categoryDefs) {
      const res = await client.query(
        `INSERT INTO ticket_categories (contractor_id, name, slug, color, icon, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        [contractorId, cat.name, cat.slug, cat.color, cat.icon]
      );
      categoryIds[cat.slug] = res.rows[0].id;
    }

    logStep('8/10', `${categoryDefs.length} ticket kategória létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 9: Admin User + Employees (Felhasználók + Munkavállalók)
    // ════════════════════════════════════════════════════════════════════════
    logStep('9/10', 'Felhasználók és munkavállalók létrehozása...');

    const passwordHash = await bcrypt.hash('password123', 10);

    // --- Admin user ---
    const adminRes = await client.query(
      `INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active, is_email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true, true)
       RETURNING id`,
      [contractorId, 'kiss.janos@abc-kft.hu', passwordHash, 'Kiss', 'János', '+36 30 111 2233']
    );
    const adminUserId = adminRes.rows[0].id;

    // Assign admin role
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
      [adminUserId, roleIds['admin'], contractorId]
    );

    log('  Admin felhasználó létrehozva: kiss.janos@abc-kft.hu');

    // --- Detect which employee columns exist ---
    const empCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'employees'
    `);
    const empColSet = new Set(empCols.rows.map(r => r.column_name));
    const hasExpandedFields = empColSet.has('first_name');
    const hasAccommodationId = empColSet.has('accommodation_id');
    const hasRoomId = empColSet.has('room_id');

    // --- 5 Employees ---
    const employeeDefs = [
      {
        email: 'horvath.gabor@employee.com',
        firstName: 'Horváth',
        lastName: 'Gábor',
        phone: '+36 30 123 4567',
        gender: 'male',
        birthDate: '1990-03-15',
        birthPlace: 'Budapest',
        mothersName: 'Nagy Mária',
        position: 'Gépkezelő',
        employeeNumber: 'EMP-0001',
        status: 'active',
        accommodation: 'A épület',
        room: '101',
        startDate: '2025-06-01',
        arrivalDate: '2025-05-28',
      },
      {
        email: 'molnar.zsuzsanna@employee.com',
        firstName: 'Molnár',
        lastName: 'Zsuzsanna',
        phone: '+36 30 234 5678',
        gender: 'female',
        birthDate: '1988-07-22',
        birthPlace: 'Debrecen',
        mothersName: 'Tóth Erzsébet',
        position: 'Adminisztrátor',
        employeeNumber: 'EMP-0002',
        status: 'active',
        accommodation: 'A épület',
        room: '102',
        startDate: '2025-07-15',
        arrivalDate: '2025-07-12',
      },
      {
        email: 'varga.istvan@employee.com',
        firstName: 'Varga',
        lastName: 'István',
        phone: '+36 30 345 6789',
        gender: 'male',
        birthDate: '1995-11-08',
        birthPlace: 'Szeged',
        mothersName: 'Kovács Anna',
        position: 'Raktáros',
        employeeNumber: 'EMP-0003',
        status: 'active',
        accommodation: 'B épület',
        room: '101',
        startDate: '2025-09-01',
        arrivalDate: '2025-08-29',
      },
      {
        email: 'farkas.katalin@employee.com',
        firstName: 'Farkas',
        lastName: 'Katalin',
        phone: '+36 30 456 7890',
        gender: 'female',
        birthDate: '1992-01-30',
        birthPlace: 'Pécs',
        mothersName: 'Szabó Ilona',
        position: 'Takarító',
        employeeNumber: 'EMP-0004',
        status: 'paid_leave',
        accommodation: 'A épület',
        room: '201',
        startDate: '2025-04-01',
        arrivalDate: '2025-03-28',
      },
      {
        email: 'nemeth.peter@employee.com',
        firstName: 'Németh',
        lastName: 'Péter',
        phone: '+36 30 567 8901',
        gender: 'male',
        birthDate: '1985-09-12',
        birthPlace: 'Győr',
        mothersName: 'Kiss Katalin',
        position: 'Karbantartó',
        employeeNumber: 'EMP-0005',
        status: 'active',
        accommodation: 'B épület',
        room: '102',
        startDate: '2025-10-15',
        arrivalDate: '2025-10-12',
      },
    ];

    const employeeUserIds = {};
    const employeeIds = {};

    for (const emp of employeeDefs) {
      // Create user account
      const userRes = await client.query(
        `INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true, true)
         RETURNING id`,
        [contractorId, emp.email, passwordHash, emp.firstName, emp.lastName, emp.phone]
      );
      const userId = userRes.rows[0].id;
      employeeUserIds[emp.email] = userId;

      // Assign accommodated_employee role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
        [userId, roleIds['accommodated_employee'], contractorId]
      );

      // Build employee INSERT dynamically based on available columns
      const accId = accommodationIds[emp.accommodation];
      const rmId = roomIds[emp.accommodation][emp.room];

      const cols = ['contractor_id', 'user_id', 'employee_number', 'status_id', 'position', 'start_date'];
      const vals = [contractorId, userId, emp.employeeNumber, statusTypeIds[emp.status], emp.position, emp.startDate];

      if (hasExpandedFields) {
        cols.push('first_name', 'last_name', 'gender', 'birth_date', 'birth_place', 'mothers_name',
                   'arrival_date', 'room_number', 'workplace', 'company_name');
        vals.push(emp.firstName, emp.lastName, emp.gender, emp.birthDate, emp.birthPlace, emp.mothersName,
                  emp.arrivalDate, emp.room, 'Budapest', 'ABC Kereskedelmi Kft.');
      }

      if (hasAccommodationId) {
        cols.push('accommodation_id');
        vals.push(accId);
      }

      if (hasRoomId) {
        cols.push('room_id');
        vals.push(rmId);
      }

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const empRes = await client.query(
        `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        vals
      );
      employeeIds[emp.email] = empRes.rows[0].id;

      log(`  Munkavállaló létrehozva: ${emp.lastName} ${emp.firstName} (${emp.employeeNumber})`);
    }

    logStep('9/10', `1 admin + ${employeeDefs.length} munkavállaló létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 10: Sample Tickets (Minta ticketek)
    // ════════════════════════════════════════════════════════════════════════
    logStep('10/10', 'Minta ticketek létrehozása...');

    const ticketDefs = [
      {
        number: '#1001',
        title: 'Csőtörés az A épület 1. emeleten',
        description: 'Az A épület 1. emeleti mosdóban a vízvezeték cső eltört. Víz szivárog a padlóra, azonnali beavatkozás szükséges. A 101-es szoba lakói jelezték a problémát.',
        category: 'technical',
        status: 'in_progress',
        priority: 'urgent',
        createdBy: employeeUserIds['horvath.gabor@employee.com'],
        assignedTo: adminUserId,
      },
      {
        number: '#1002',
        title: 'Szabadság kérelem - Molnár Zsuzsanna',
        description: 'Szeretnék 5 nap fizetett szabadságot kérni 2026. március 10-14. között családi okok miatt. Kérem a jóváhagyást.',
        category: 'hr',
        status: 'new',
        priority: 'normal',
        createdBy: employeeUserIds['molnar.zsuzsanna@employee.com'],
        assignedTo: null,
      },
    ];

    for (const t of ticketDefs) {
      const ticketRes = await client.query(
        `INSERT INTO tickets (
           contractor_id, ticket_number, title, description,
           category_id, status_id, priority_id,
           created_by, assigned_to
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          contractorId,
          t.number,
          t.title,
          t.description,
          categoryIds[t.category],
          ticketStatusIds[t.status],
          priorityIds[t.priority],
          t.createdBy,
          t.assignedTo,
        ]
      );
      const ticketId = ticketRes.rows[0].id;

      // Add creation history entry
      await client.query(
        `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
         VALUES ($1, $2, 'created', $3)`,
        [ticketId, t.createdBy, t.number]
      );

      log(`  Ticket létrehozva: ${t.number} - ${t.title}`);
    }

    // Add a comment on the first ticket
    const firstTicketRes = await client.query(
      `SELECT id FROM tickets WHERE ticket_number = '#1001'`
    );
    if (firstTicketRes.rows.length > 0) {
      await client.query(
        `INSERT INTO ticket_comments (ticket_id, user_id, comment)
         VALUES ($1, $2, $3)`,
        [
          firstTicketRes.rows[0].id,
          adminUserId,
          'Vízszerelőt értesítettem, holnap reggel 8-kor érkezik a helyszínre. Addig kérem a vízcsap elzárását.',
        ]
      );
    }

    logStep('10/10', `${ticketDefs.length} minta ticket létrehozva.`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 11: Chatbot seed data (if tables exist)
    // ════════════════════════════════════════════════════════════════════════
    const refreshedTables = await getExistingTables(client);
    if (refreshedTables.has('chatbot_faq_categories')) {
      logStep('11', 'Chatbot adatok létrehozása...');

      // Truncate chatbot tables
      const chatbotTables = [
        'chatbot_messages', 'chatbot_conversations', 'chatbot_decision_nodes',
        'chatbot_decision_trees', 'chatbot_knowledge_base', 'chatbot_faq_categories', 'chatbot_config',
      ].filter(t => refreshedTables.has(t));
      if (chatbotTables.length > 0) {
        await client.query(`TRUNCATE TABLE ${chatbotTables.join(', ')} CASCADE`);
      }

      // FAQ Categories
      const faqCategoryIds = {};
      const faqCategoryDefs = [
        { name: 'HR Kérdések', slug: 'hr', description: 'Munkaügyi és HR kérdések', icon: 'people', color: '#3b82f6', sort: 1 },
        { name: 'Szállás', slug: 'szallas', description: 'Szállással kapcsolatos kérdések', icon: 'home', color: '#10b981', sort: 2 },
        { name: 'Technikai', slug: 'technikai', description: 'Technikai és IT kérdések', icon: 'build', color: '#f59e0b', sort: 3 },
        { name: 'Általános', slug: 'altalanos', description: 'Általános információk', icon: 'info', color: '#8b5cf6', sort: 4 },
      ];

      for (const cat of faqCategoryDefs) {
        const res = await client.query(
          `INSERT INTO chatbot_faq_categories (contractor_id, name, slug, description, icon, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [contractorId, cat.name, cat.slug, cat.description, cat.icon, cat.color, cat.sort]
        );
        faqCategoryIds[cat.slug] = res.rows[0].id;
      }

      // Knowledge Base entries
      const kbDefs = [
        {
          category: 'hr',
          question: 'Hogyan kérhetek szabadságot?',
          answer: 'Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.',
          keywords: ['szabadsag', 'szabadnap', 'pihenonap', 'holiday', 'vacation'],
          priority: 5,
        },
        {
          category: 'hr',
          question: 'Mi a munkaidő beosztás?',
          answer: 'A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.',
          keywords: ['munkaid', 'muoszak', 'beosztas', 'ora', 'mikor', 'schedule'],
          priority: 4,
        },
        {
          category: 'szallas',
          question: 'Hogyan jelenthetem a szálláson keletkezett hibát?',
          answer: 'A szálláson észlelt hibákat a Hibajegyek menüben, Technikai kategóriában jelezheti. Kérjük, adjon részletes leírást és ha lehetséges, csatoljon fényképet.',
          keywords: ['hiba', 'meghibasodas', 'elromlott', 'nem mukodik', 'szallas', 'javitas'],
          priority: 5,
        },
        {
          category: 'szallas',
          question: 'Mik a szállás házirendjének főbb pontjai?',
          answer: 'A szálláson tilos a dohányzás, az éjszakai csendháborítás (22:00-6:00), és a szobákba külső személyeket bevinni. Részletes házirendet a Dokumentumok menüben talál.',
          keywords: ['hazirend', 'szabaly', 'dohany', 'csend', 'tilos', 'szallas'],
          priority: 3,
        },
        {
          category: 'technikai',
          question: 'Hogyan csatlakozom a WiFi hálózathoz?',
          answer: 'A WiFi hálózat neve: "HS-Guest". A jelszó a szálláson kihelyezett tájékoztatóban található, vagy kérdezze meg a szálláskezelőt.',
          keywords: ['wifi', 'internet', 'halozat', 'jelszo', 'net', 'network'],
          priority: 4,
        },
        {
          category: 'technikai',
          question: 'Nem tudok bejelentkezni az alkalmazásba',
          answer: 'Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.',
          keywords: ['bejelentkezes', 'login', 'jelszo', 'nem tudok', 'belep', 'hozzaferes'],
          priority: 5,
        },
        {
          category: 'altalanos',
          question: 'Hol találom a dokumentumaimat?',
          answer: 'Az összes személyes dokumentumát (szerződés, igazolások) a Dokumentumok menüben érheti el. Ha valamely dokumentum hiányzik, jelezze az adminisztrátornak.',
          keywords: ['dokumentum', 'irat', 'szerzodes', 'igazolas', 'papir'],
          priority: 3,
        },
        {
          category: 'altalanos',
          question: 'Kihez fordulhatok sürgős esetben?',
          answer: 'Sürgős esetben hívja az alábbi számokat: Szálláskezelő: +36 30 111 2233, Mentők: 104, Tűzoltók: 105, Rendőrség: 107.',
          keywords: ['surgos', 'segitseg', 'veszely', 'baj', 'telefon', 'hivas', 'emergency'],
          priority: 5,
        },
      ];

      for (const kb of kbDefs) {
        await client.query(
          `INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [contractorId, faqCategoryIds[kb.category], kb.question, kb.answer, kb.keywords, kb.priority]
        );
      }

      // Decision Tree: Szállási probléma bejelentés
      const treeRes = await client.query(
        `INSERT INTO chatbot_decision_trees (contractor_id, name, description, trigger_keywords)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [
          contractorId,
          'Szállási probléma bejelentés',
          'Szállással kapcsolatos problémák bejelentésének lépésről-lépésre vezetése',
          ['problema', 'bejelentes', 'hiba', 'szallas', 'panasz'],
        ]
      );
      const treeId = treeRes.rows[0].id;

      // Root node
      const rootRes = await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, NULL, 'root', 'Milyen jellegű problémát szeretne bejelenteni?', 0) RETURNING id`,
        [treeId]
      );
      const rootId = rootRes.rows[0].id;

      // Option nodes under root
      const opt1Res = await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'option', 'Vízszerelés (csapok, csövek, WC)', 1) RETURNING id`,
        [treeId, rootId]
      );
      const opt2Res = await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'option', 'Villanyszerelés (áram, lámpa, konnektor)', 2) RETURNING id`,
        [treeId, rootId]
      );
      const opt3Res = await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'option', 'Fűtés / Klíma probléma', 3) RETURNING id`,
        [treeId, rootId]
      );

      // Answer nodes under options
      await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'answer', 'Vízszerelési problémáját rögzítettük. Kérjük, zárja el a legközelebbi főcsapot, ha vízszivárgást észlel. Hibajegy automatikusan létrehozva, szervizünk 24 órán belül jelentkezik.', 0)`,
        [treeId, opt1Res.rows[0].id]
      );
      await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'answer', 'Villanyszerelési problémáját rögzítettük. Kérjük, ne nyúljon a hibás berendezéshez! Hibajegy automatikusan létrehozva, villanyszervizünk hamarosan jelentkezik.', 0)`,
        [treeId, opt2Res.rows[0].id]
      );
      await client.query(
        `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order)
         VALUES ($1, $2, 'answer', 'Fűtés/klíma problémáját rögzítettük. Kérjük, ellenőrizze a termosztát beállításait. Hibajegy automatikusan létrehozva, karbantartónk 48 órán belül orvossolja a problémát.', 0)`,
        [treeId, opt3Res.rows[0].id]
      );

      // Bot Config
      await client.query(
        `INSERT INTO chatbot_config (contractor_id, welcome_message, fallback_message, escalation_message, keyword_threshold, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [
          contractorId,
          'Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.',
          'Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?',
          'Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.',
          1,
        ]
      );

      logStep('11', `${faqCategoryDefs.length} FAQ kategória, ${kbDefs.length} tudásbázis bejegyzés, 1 döntési fa, 1 bot konfiguráció létrehozva.`);
    } else {
      logStep('11', 'Chatbot táblák nem léteznek, chatbot seed kihagyva. Futtassa először: migrations/add_chatbot.sql');
    }

    // ════════════════════════════════════════════════════════════════════════
    // COMMIT
    // ════════════════════════════════════════════════════════════════════════
    await client.query('COMMIT');

    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('  SEED SIKERESEN BEFEJEZVE!');
    console.log('════════════════════════════════════════════════════');
    console.log('');
    console.log('  Bejelentkezési adatok:');
    console.log('  ──────────────────────────────────────────────');
    console.log('  Admin:');
    console.log('    Email:  kiss.janos@abc-kft.hu');
    console.log('    Jelszó: password123');
    console.log('');
    console.log('  Munkavállalók (jelszó: password123):');
    for (const emp of employeeDefs) {
      console.log(`    - ${emp.lastName} ${emp.firstName}: ${emp.email}`);
    }
    console.log('');
    console.log('  Összefoglaló:');
    console.log(`    Alvállalkozó:        1  (ABC Kereskedelmi Kft.)`);
    console.log(`    Szálláshelyek:       ${accommodationDefs.length}  (${totalRooms} szobával)`);
    console.log(`    Felhasználók:        ${employeeDefs.length + 1}  (1 admin + ${employeeDefs.length} munkavállaló)`);
    console.log(`    Munkavállalók:       ${employeeDefs.length}`);
    console.log(`    Minta ticketek:      ${ticketDefs.length}`);
    console.log(`    Státusz típusok:     ${statusTypeDefs.length}`);
    console.log(`    Ticket státuszok:    ${ticketStatusDefs.length}`);
    console.log(`    Prioritások:         ${priorityDefs.length}`);
    console.log(`    Ticket kategóriák:   ${categoryDefs.length}`);
    console.log(`    Szerepkörök:         ${roleDefs.length}`);
    if (refreshedTables.has('chatbot_faq_categories')) {
      console.log(`    GYIK kategóriák:     4`);
      console.log(`    Tudásbázis:          8`);
      console.log(`    Döntési fák:         1`);
      console.log(`    Bot konfiguráció:    1`);
    }
    console.log('════════════════════════════════════════════════════');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('HIBA a seed futtatása közben:');
    console.error(error.message);
    if (error.detail) console.error('Részlet:', error.detail);
    if (error.hint) console.error('Tipp:', error.hint);
    if (error.where) console.error('Hol:', error.where);
    throw error;
  } finally {
    client.release();
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

seed()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
