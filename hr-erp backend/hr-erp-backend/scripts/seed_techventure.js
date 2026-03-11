#!/usr/bin/env node

/**
 * TechVenture Kft. - Seed Script
 *
 * Creates fictional test data for a software development company.
 * This script is ADDITIVE - it does NOT truncate existing data.
 * Uses ON CONFLICT DO NOTHING for idempotency where possible.
 *
 * Run: docker exec hr-erp-backend node scripts/seed_techventure.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

const summary = {};

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    log('TechVenture Kft. seed indítása...');

    // ════════════════════════════════════════════════════════════════════════
    // Hash password once
    // ════════════════════════════════════════════════════════════════════════
    const passwordHash = await bcrypt.hash('password123', 10);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Contractor
    // ════════════════════════════════════════════════════════════════════════
    log('1/10 - Contractor létrehozása...');

    const contractorRes = await client.query(`
      INSERT INTO contractors (name, slug, email, phone, is_active)
      VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, ['TechVenture Kft.', 'techventure-kft', 'info@techventure.hu', '+36 1 555 0100']);

    let contractorId;
    if (contractorRes.rows.length > 0) {
      contractorId = contractorRes.rows[0].id;
    } else {
      const existing = await client.query(`SELECT id FROM contractors WHERE slug = $1::varchar`, ['techventure-kft']);
      contractorId = existing.rows[0].id;
    }
    log(`  Contractor ID: ${contractorId}`);
    summary.contractor = 'TechVenture Kft.';

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Get existing role IDs
    // ════════════════════════════════════════════════════════════════════════
    log('2/10 - Szerepkörök lekérdezése...');

    const roleRes = await client.query(`SELECT id, slug FROM roles WHERE slug IN ('admin', 'task_owner', 'user')`);
    const roleIds = {};
    for (const r of roleRes.rows) {
      roleIds[r.slug] = r.id;
    }
    log(`  Szerepkörök: ${Object.keys(roleIds).join(', ')}`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Get active employee status
    // ════════════════════════════════════════════════════════════════════════
    const statusRes = await client.query(`SELECT id FROM employee_status_types WHERE slug = 'active'`);
    const activeStatusId = statusRes.rows[0].id;

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Organizational Units (Departments)
    // ════════════════════════════════════════════════════════════════════════
    log('3/10 - Szervezeti egységek létrehozása...');

    const deptDefs = [
      { name: 'Vezetőség', description: 'Management - Cégvezetés és stratégia' },
      { name: 'Fejlesztés', description: 'Development - Szoftverfejlesztési csapat' },
      { name: 'Értékesítés', description: 'Sales - Üzletfejlesztés és értékesítés' },
      { name: 'HR', description: 'Human Resources - Emberi erőforrás' },
    ];

    const deptIds = {};
    for (const dept of deptDefs) {
      const res = await client.query(`
        INSERT INTO organizational_units (contractor_id, name, description, is_active)
        VALUES ($1::uuid, $2::varchar, $3::text, true)
        RETURNING id
      `, [contractorId, dept.name, dept.description]);
      deptIds[dept.name] = res.rows[0].id;
    }
    summary.departments = deptDefs.length;
    log(`  ${deptDefs.length} szervezeti egység létrehozva`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: Users + Employees
    // ════════════════════════════════════════════════════════════════════════
    log('4/10 - Felhasználók és munkavállalók létrehozása...');

    const userDefs = [
      { firstName: 'Nagy', lastName: 'Péter', email: 'nagy.peter@techventure.hu', phone: '+36 30 100 0001', role: 'admin', position: 'CEO', dept: 'Vezetőség', empNum: 'TV-0001', startDate: '2024-01-01' },
      { firstName: 'Kovács', lastName: 'Anna', email: 'kovacs.anna@techventure.hu', phone: '+36 30 100 0002', role: 'admin', position: 'CTO', dept: 'Vezetőség', empNum: 'TV-0002', startDate: '2024-01-15' },
      { firstName: 'Szabó', lastName: 'Márton', email: 'szabo.marton@techventure.hu', phone: '+36 30 100 0003', role: 'task_owner', position: 'Senior Developer', dept: 'Fejlesztés', empNum: 'TV-0003', startDate: '2024-03-01' },
      { firstName: 'Tóth', lastName: 'Eszter', email: 'toth.eszter@techventure.hu', phone: '+36 30 100 0004', role: 'user', position: 'Junior Developer', dept: 'Fejlesztés', empNum: 'TV-0004', startDate: '2025-06-01' },
      { firstName: 'Horváth', lastName: 'Zsolt', email: 'horvath.zsolt@techventure.hu', phone: '+36 30 100 0005', role: 'task_owner', position: 'Senior Developer', dept: 'Fejlesztés', empNum: 'TV-0005', startDate: '2024-04-01' },
      { firstName: 'Takács', lastName: 'Réka', email: 'takacs.reka@techventure.hu', phone: '+36 30 100 0006', role: 'user', position: 'Frontend Developer', dept: 'Fejlesztés', empNum: 'TV-0006', startDate: '2025-01-15' },
      { firstName: 'Farkas', lastName: 'Dávid', email: 'farkas.david@techventure.hu', phone: '+36 30 100 0007', role: 'user', position: 'Backend Developer', dept: 'Fejlesztés', empNum: 'TV-0007', startDate: '2025-02-01' },
      { firstName: 'Kiss', lastName: 'Gábor', email: 'kiss.gabor@techventure.hu', phone: '+36 30 100 0008', role: 'task_owner', position: 'Sales Manager', dept: 'Értékesítés', empNum: 'TV-0008', startDate: '2024-06-01' },
      { firstName: 'Molnár', lastName: 'Rita', email: 'molnar.rita@techventure.hu', phone: '+36 30 100 0009', role: 'user', position: 'Account Manager', dept: 'Értékesítés', empNum: 'TV-0009', startDate: '2024-09-01' },
      { firstName: 'Balogh', lastName: 'Péter', email: 'balogh.peter@techventure.hu', phone: '+36 30 100 0010', role: 'user', position: 'Sales Representative', dept: 'Értékesítés', empNum: 'TV-0010', startDate: '2025-03-01' },
      { firstName: 'Varga', lastName: 'Katalin', email: 'varga.katalin@techventure.hu', phone: '+36 30 100 0011', role: 'task_owner', position: 'HR Manager', dept: 'HR', empNum: 'TV-0011', startDate: '2024-02-01' },
    ];

    const userIds = {};
    const employeeIds = {};

    // Detect which employee columns exist
    const empCols = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'employees'
    `);
    const empColSet = new Set(empCols.rows.map(r => r.column_name));
    const hasOrgUnit = empColSet.has('organizational_unit_id');

    for (const u of userDefs) {
      // Create user
      const userRes = await client.query(`
        INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active, is_email_verified)
        VALUES ($1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, true, true)
        RETURNING id
      `, [contractorId, u.email, passwordHash, u.firstName, u.lastName, u.phone]);
      const userId = userRes.rows[0].id;
      userIds[u.email] = userId;

      // Assign role
      await client.query(`
        INSERT INTO user_roles (user_id, role_id, contractor_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid)
      `, [userId, roleIds[u.role], contractorId]);

      // Create employee record
      const empCols2 = ['contractor_id', 'user_id', 'employee_number', 'status_id', 'position', 'start_date'];
      const empVals = [contractorId, userId, u.empNum, activeStatusId, u.position, u.startDate];

      if (hasOrgUnit) {
        empCols2.push('organizational_unit_id');
        empVals.push(deptIds[u.dept]);
      }

      const placeholders = empCols2.map((_, i) => `$${i + 1}`).join(', ');
      const empRes = await client.query(
        `INSERT INTO employees (${empCols2.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        empVals
      );
      employeeIds[u.email] = empRes.rows[0].id;

      log(`  ${u.lastName} ${u.firstName} (${u.email}) - ${u.position}`);
    }
    summary.users = userDefs.length;
    summary.employees = userDefs.length;

    // ════════════════════════════════════════════════════════════════════════
    // STEP 6: Cost Centers
    // ════════════════════════════════════════════════════════════════════════
    log('5/10 - Költséghelyek létrehozása...');

    const ccDefs = [
      { code: 'TV-DEV', name: 'Fejlesztési költségek', description: 'Development costs - szoftverfejlesztési projektek', budget: 20000000 },
      { code: 'TV-SALES', name: 'Marketing és értékesítés', description: 'Marketing & Sales - üzletfejlesztés', budget: 8000000 },
      { code: 'TV-ADMIN', name: 'Iroda és adminisztráció', description: 'Office & Admin - irodai költségek', budget: 5000000 },
      { code: 'TV-LIC', name: 'Szoftverlicencek', description: 'Software licenses - licencdíjak', budget: 3000000 },
    ];

    const ccIds = {};
    for (const cc of ccDefs) {
      const res = await client.query(`
        INSERT INTO cost_centers (contractor_id, code, name, description, budget, is_active, created_by)
        VALUES ($1::uuid, $2::varchar, $3::varchar, $4::text, $5::decimal, true, $6::uuid)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id
      `, [contractorId, cc.code, cc.name, cc.description, cc.budget, userIds['nagy.peter@techventure.hu']]);
      ccIds[cc.code] = res.rows[0].id;
    }
    summary.costCenters = ccDefs.length;
    log(`  ${ccDefs.length} költséghely létrehozva`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 7: Projects + Team Members
    // ════════════════════════════════════════════════════════════════════════
    log('6/10 - Projektek létrehozása...');

    const projectDefs = [
      {
        code: 'TV-BANK', name: 'BankApp Mobilalkalmazás',
        description: 'OTP Bank mobilalkalmazás fejlesztése - iOS és Android',
        status: 'active', priority: 'high', budget: 8000000, completion: 30,
        costCenter: 'TV-DEV', pm: 'kovacs.anna@techventure.hu',
        startDate: '2026-01-15', endDate: '2026-04-15',
        team: [
          { email: 'szabo.marton@techventure.hu', role: 'Lead Developer' },
          { email: 'takacs.reka@techventure.hu', role: 'Frontend Developer' },
          { email: 'farkas.david@techventure.hu', role: 'Backend Developer' },
        ]
      },
      {
        code: 'TV-ECOM', name: 'E-commerce Platform Redesign',
        description: 'MediaMarkt Hungary webshop platform újratervezése',
        status: 'active', priority: 'medium', budget: 5500000, completion: 40,
        costCenter: 'TV-DEV', pm: 'kovacs.anna@techventure.hu',
        startDate: '2026-02-01', endDate: '2026-03-31',
        team: [
          { email: 'horvath.zsolt@techventure.hu', role: 'Lead Developer' },
          { email: 'toth.eszter@techventure.hu', role: 'Developer' },
        ]
      },
      {
        code: 'TV-HRDASH', name: 'Internal HR Dashboard',
        description: 'Belső HR irányítópult fejlesztése',
        status: 'active', priority: 'low', budget: 1200000, completion: 60,
        costCenter: 'TV-DEV', pm: 'nagy.peter@techventure.hu',
        startDate: '2026-02-15', endDate: '2026-03-15',
        team: [
          { email: 'toth.eszter@techventure.hu', role: 'Developer' },
        ]
      },
    ];

    const projectIds = {};
    for (const p of projectDefs) {
      const pmId = userIds[p.pm];
      const res = await client.query(`
        INSERT INTO projects (code, name, description, status, priority, budget, actual_cost, completion_percentage, cost_center_id, project_manager_id, contractor_id, created_by, start_date, end_date)
        VALUES ($1::varchar, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::decimal, 0, $7::integer, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::date, $13::date)
        RETURNING id
      `, [p.code, p.name, p.description, p.status, p.priority, p.budget, p.completion, ccIds[p.costCenter], pmId, contractorId, pmId, p.startDate, p.endDate]);
      projectIds[p.code] = res.rows[0].id;

      // Add team members
      for (const tm of p.team) {
        await client.query(`
          INSERT INTO project_team_members (project_id, user_id, role)
          VALUES ($1::uuid, $2::uuid, $3::varchar)
          ON CONFLICT (project_id, user_id) DO NOTHING
        `, [projectIds[p.code], userIds[tm.email], tm.role]);
      }

      log(`  Projekt: ${p.code} - ${p.name} (${p.team.length} csapattag)`);
    }
    summary.projects = projectDefs.length;

    // ════════════════════════════════════════════════════════════════════════
    // STEP 8: Tasks + Comments
    // ════════════════════════════════════════════════════════════════════════
    log('7/10 - Feladatok létrehozása...');

    const creatorId = userIds['kovacs.anna@techventure.hu'];

    const taskDefs = [
      // BankApp (TV-BANK)
      { project: 'TV-BANK', title: 'UI/UX Design wireframes', description: 'Mobilalkalmazás UI/UX wireframe-ek elkészítése', status: 'done', priority: 'high', assigned: 'takacs.reka@techventure.hu', startDate: '2026-01-15', dueDate: '2026-02-01', estHours: 40, actHours: 38, progress: 100 },
      { project: 'TV-BANK', title: 'API integration design', description: 'Backend API integrációs terv és dokumentáció', status: 'in_progress', priority: 'high', assigned: 'farkas.david@techventure.hu', startDate: '2026-02-01', dueDate: '2026-02-20', estHours: 24, actHours: 12, progress: 50 },
      { project: 'TV-BANK', title: 'Login module development', description: 'Bejelentkezési modul fejlesztése biometrikus támogatással', status: 'todo', priority: 'high', assigned: 'farkas.david@techventure.hu', startDate: '2026-02-20', dueDate: '2026-03-10', estHours: 32, actHours: 0, progress: 0 },
      { project: 'TV-BANK', title: 'Payment gateway integration', description: 'Fizetési kapu integráció (OTP SimplePay)', status: 'todo', priority: 'medium', assigned: 'szabo.marton@techventure.hu', startDate: '2026-03-01', dueDate: '2026-03-25', estHours: 48, actHours: 0, progress: 0 },
      { project: 'TV-BANK', title: 'Security audit', description: 'Biztonsági audit és penetrációs teszt', status: 'todo', priority: 'high', assigned: 'szabo.marton@techventure.hu', startDate: '2026-03-25', dueDate: '2026-04-05', estHours: 16, actHours: 0, progress: 0 },

      // E-commerce (TV-ECOM)
      { project: 'TV-ECOM', title: 'Current site analysis', description: 'Jelenlegi webshop elemzése és audit', status: 'done', priority: 'medium', assigned: 'horvath.zsolt@techventure.hu', startDate: '2026-02-01', dueDate: '2026-02-10', estHours: 16, actHours: 14, progress: 100 },
      { project: 'TV-ECOM', title: 'New design mockups', description: 'Új design mockup-ok készítése Figma-ban', status: 'in_progress', priority: 'medium', assigned: 'toth.eszter@techventure.hu', startDate: '2026-02-10', dueDate: '2026-02-28', estHours: 32, actHours: 20, progress: 60 },
      { project: 'TV-ECOM', title: 'Product catalog migration', description: 'Termékkatalógus migrálása az új rendszerbe', status: 'todo', priority: 'medium', assigned: 'horvath.zsolt@techventure.hu', startDate: '2026-03-01', dueDate: '2026-03-15', estHours: 40, actHours: 0, progress: 0 },
      { project: 'TV-ECOM', title: 'Checkout flow redesign', description: 'Fizetési folyamat újratervezése és optimalizálás', status: 'todo', priority: 'low', assigned: 'toth.eszter@techventure.hu', startDate: '2026-03-10', dueDate: '2026-03-25', estHours: 24, actHours: 0, progress: 0 },

      // HR Dashboard (TV-HRDASH)
      { project: 'TV-HRDASH', title: 'Requirements gathering', description: 'Követelmények összegyűjtése a HR csapattól', status: 'done', priority: 'medium', assigned: 'toth.eszter@techventure.hu', startDate: '2026-02-15', dueDate: '2026-02-20', estHours: 8, actHours: 8, progress: 100 },
      { project: 'TV-HRDASH', title: 'Database schema design', description: 'Adatbázis séma tervezése és dokumentálása', status: 'done', priority: 'medium', assigned: 'toth.eszter@techventure.hu', startDate: '2026-02-20', dueDate: '2026-02-25', estHours: 12, actHours: 10, progress: 100 },
      { project: 'TV-HRDASH', title: 'Frontend components', description: 'React frontend komponensek fejlesztése', status: 'in_progress', priority: 'medium', assigned: 'toth.eszter@techventure.hu', startDate: '2026-02-25', dueDate: '2026-03-10', estHours: 24, actHours: 14, progress: 60 },
      { project: 'TV-HRDASH', title: 'Backend API', description: 'Backend REST API endpointok fejlesztése', status: 'todo', priority: 'medium', assigned: 'toth.eszter@techventure.hu', startDate: '2026-03-05', dueDate: '2026-03-15', estHours: 20, actHours: 0, progress: 0 },
    ];

    const taskIds = {};
    let taskCount = 0;
    for (const t of taskDefs) {
      const res = await client.query(`
        INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, contractor_id, created_by)
        VALUES ($1::uuid, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::uuid, $7::date, $8::date, $9::decimal, $10::decimal, $11::integer, $12::uuid, $13::uuid)
        RETURNING id
      `, [projectIds[t.project], t.title, t.description, t.status, t.priority, userIds[t.assigned], t.startDate, t.dueDate, t.estHours, t.actHours, t.progress, contractorId, creatorId]);
      taskIds[t.title] = res.rows[0].id;
      taskCount++;
    }

    // Task comments on in-progress tasks
    const commentDefs = [
      { task: 'API integration design', user: 'farkas.david@techventure.hu', comment: 'Az OTP API dokumentációt átnéztem, a v3 endpointokat fogjuk használni. REST + WebSocket kombináció lesz a real-time tranzakciókhoz.' },
      { task: 'API integration design', user: 'kovacs.anna@techventure.hu', comment: 'Kérlek készíts egy Swagger dokumentációt is az API-hoz, hogy a frontend csapat előre tudjon dolgozni.' },
      { task: 'New design mockups', user: 'toth.eszter@techventure.hu', comment: 'A terméklista és a kosár oldal mockup-jai elkészültek, a checkout flow-t még dolgozom.' },
      { task: 'Frontend components', user: 'toth.eszter@techventure.hu', comment: 'A Dashboard és az Employee List komponensek készen vannak. A Charts részt a Recharts library-vel csinálom.' },
      { task: 'Frontend components', user: 'nagy.peter@techventure.hu', comment: 'Szuper haladás! Kérlek add hozzá a fizetési statisztikák widgetet is a dashboardhoz.' },
    ];

    let commentCount = 0;
    for (const c of commentDefs) {
      await client.query(`
        INSERT INTO task_comments (task_id, user_id, comment)
        VALUES ($1::uuid, $2::uuid, $3::text)
      `, [taskIds[c.task], userIds[c.user], c.comment]);
      commentCount++;
    }

    summary.tasks = taskCount;
    summary.taskComments = commentCount;
    log(`  ${taskCount} feladat és ${commentCount} komment létrehozva`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 9: Invoice Categories + Invoices
    // ════════════════════════════════════════════════════════════════════════
    log('8/10 - Számlák létrehozása...');

    // Get a "Szolgáltatás" category or create one
    let serviceCatId;
    const catRes = await client.query(`SELECT id FROM invoice_categories WHERE name = 'Szolgáltatás' AND is_active = true LIMIT 1`);
    if (catRes.rows.length > 0) {
      serviceCatId = catRes.rows[0].id;
    } else {
      const newCat = await client.query(`
        INSERT INTO invoice_categories (name, icon, color, is_active)
        VALUES ('Szolgáltatás', '🛠️', '#8b5cf6', true)
        RETURNING id
      `);
      serviceCatId = newCat.rows[0].id;
    }

    const invoiceDefs = [
      {
        number: 'INV-TV-2026-001', vendor: 'TechVenture Kft.', amount: 2500000, vat: 675000, total: 3175000,
        status: 'paid', invoiceDate: '2026-01-25', dueDate: '2026-02-25',
        costCenter: 'TV-DEV', client: 'OTP Bank Nyrt.',
        description: 'BankApp Mobilalkalmazás - Phase 1 (Design & Planning)'
      },
      {
        number: 'INV-TV-2026-002', vendor: 'TechVenture Kft.', amount: 1800000, vat: 486000, total: 2286000,
        status: 'sent', invoiceDate: '2026-02-15', dueDate: '2026-03-15',
        costCenter: 'TV-DEV', client: 'MediaMarkt Hungary Kft.',
        description: 'E-commerce Platform Redesign - Phase 1 (Analysis & Design)'
      },
      {
        number: 'INV-TV-2026-003', vendor: 'TechVenture Kft.', amount: 450000, vat: 121500, total: 571500,
        status: 'paid', invoiceDate: '2026-02-28', dueDate: '2026-03-15',
        costCenter: 'TV-DEV', client: 'MediaMarkt Hungary Kft.',
        description: 'E-commerce Monthly Retainer - February 2026'
      },
      {
        number: 'INV-TV-2026-004', vendor: 'TechVenture Kft.', amount: 3200000, vat: 864000, total: 4064000,
        status: 'draft', invoiceDate: '2026-03-10', dueDate: '2026-04-10',
        costCenter: 'TV-DEV', client: 'OTP Bank Nyrt.',
        description: 'BankApp Mobilalkalmazás - Phase 2 (Development)'
      },
    ];

    for (const inv of invoiceDefs) {
      await client.query(`
        INSERT INTO invoices (invoice_number, vendor_name, amount, vat_amount, total_amount, category_id, cost_center_id, payment_status, invoice_date, due_date, contractor_id, created_by, client_name, description)
        VALUES ($1::varchar, $2::varchar, $3::decimal, $4::decimal, $5::decimal, $6::uuid, $7::uuid, $8::varchar, $9::date, $10::date, $11::uuid, $12::uuid, $13::varchar, $14::text)
      `, [inv.number, inv.vendor, inv.amount, inv.vat, inv.total, serviceCatId, ccIds[inv.costCenter], inv.status, inv.invoiceDate, inv.dueDate, contractorId, userIds['nagy.peter@techventure.hu'], inv.client, inv.description]);
    }
    summary.invoices = invoiceDefs.length;
    log(`  ${invoiceDefs.length} számla létrehozva`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 10: Salary Bands
    // ════════════════════════════════════════════════════════════════════════
    log('9/10 - Bérsávok létrehozása...');

    // Check if salary_bands table exists
    const salaryTableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'salary_bands' AND table_schema = 'public'
    `);

    const salaryBandDefs = [
      { position: 'CEO', dept: 'Vezetőség', level: 'director', min: 1500000, max: 2000000, med: 1750000 },
      { position: 'CTO', dept: 'Vezetőség', level: 'director', min: 1200000, max: 1600000, med: 1400000 },
      { position: 'Senior Developer', dept: 'Fejlesztés', level: 'senior', min: 800000, max: 1200000, med: 1000000 },
      { position: 'Junior Developer', dept: 'Fejlesztés', level: 'junior', min: 400000, max: 600000, med: 500000 },
      { position: 'Frontend Developer', dept: 'Fejlesztés', level: 'medior', min: 600000, max: 900000, med: 750000 },
      { position: 'Backend Developer', dept: 'Fejlesztés', level: 'medior', min: 650000, max: 950000, med: 800000 },
      { position: 'Sales Manager', dept: 'Értékesítés', level: 'manager', min: 600000, max: 900000, med: 750000 },
      { position: 'Account Manager', dept: 'Értékesítés', level: 'medior', min: 500000, max: 700000, med: 600000 },
      { position: 'Sales Representative', dept: 'Értékesítés', level: 'junior', min: 350000, max: 500000, med: 420000 },
      { position: 'HR Manager', dept: 'HR', level: 'manager', min: 550000, max: 750000, med: 650000 },
    ];

    const bandIds = {};

    if (salaryTableCheck.rows.length > 0) {
      for (const sb of salaryBandDefs) {
        const res = await client.query(`
          INSERT INTO salary_bands (position_name, department, level, min_salary, max_salary, median_salary, currency, is_active, created_by)
          VALUES ($1::varchar, $2::varchar, $3::varchar, $4::numeric, $5::numeric, $6::numeric, 'HUF', true, $7::uuid)
          RETURNING id
        `, [sb.position, sb.dept, sb.level, sb.min, sb.max, sb.med, userIds['nagy.peter@techventure.hu']]);
        bandIds[sb.position] = res.rows[0].id;
      }
      summary.salaryBands = salaryBandDefs.length;
      log(`  ${salaryBandDefs.length} bérsáv létrehozva`);
    } else {
      log('  salary_bands tábla nem létezik, kihagyva. Futtassa: migrations/salary_transparency.sql');
      summary.salaryBands = 0;
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 11: Employee Salaries
    // ════════════════════════════════════════════════════════════════════════
    log('10/10 - Munkavállalói bérek létrehozása...');

    const salaryTableCheck2 = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_salaries' AND table_schema = 'public'
    `);

    const salaryDefs = [
      { email: 'nagy.peter@techventure.hu', salary: 1800000, band: 'CEO' },
      { email: 'kovacs.anna@techventure.hu', salary: 1450000, band: 'CTO' },
      { email: 'szabo.marton@techventure.hu', salary: 1050000, band: 'Senior Developer' },
      { email: 'toth.eszter@techventure.hu', salary: 480000, band: 'Junior Developer' },
      { email: 'horvath.zsolt@techventure.hu', salary: 1100000, band: 'Senior Developer' },
      { email: 'takacs.reka@techventure.hu', salary: 780000, band: 'Frontend Developer' },
      { email: 'farkas.david@techventure.hu', salary: 820000, band: 'Backend Developer' },
      { email: 'kiss.gabor@techventure.hu', salary: 800000, band: 'Sales Manager' },
      { email: 'molnar.rita@techventure.hu', salary: 620000, band: 'Account Manager' },
      { email: 'balogh.peter@techventure.hu', salary: 420000, band: 'Sales Representative' },
      { email: 'varga.katalin@techventure.hu', salary: 680000, band: 'HR Manager' },
    ];

    if (salaryTableCheck2.rows.length > 0 && Object.keys(bandIds).length > 0) {
      for (const s of salaryDefs) {
        await client.query(`
          INSERT INTO employee_salaries (employee_id, gross_salary, currency, salary_band_id, effective_date, change_reason, change_type, created_by)
          VALUES ($1::uuid, $2::numeric, 'HUF', $3::uuid, $4::date, $5::varchar, 'initial', $6::uuid)
        `, [
          employeeIds[s.email],
          s.salary,
          bandIds[s.band],
          userDefs.find(u => u.email === s.email).startDate,
          'Belépéskori bér megállapítás',
          userIds['nagy.peter@techventure.hu']
        ]);
      }
      summary.employeeSalaries = salaryDefs.length;
      log(`  ${salaryDefs.length} munkavállalói bér létrehozva`);
    } else {
      log('  employee_salaries tábla nem létezik vagy bérsávok nincsenek, kihagyva.');
      summary.employeeSalaries = 0;
    }

    // ════════════════════════════════════════════════════════════════════════
    // COMMIT
    // ════════════════════════════════════════════════════════════════════════
    await client.query('COMMIT');

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  TECHVENTURE KFT. SEED SIKERESEN BEFEJEZVE!');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Bejelentkezési adatok (jelszó mindegyikhez: password123):');
    console.log('  ─────────────────────────────────────────────────────────');
    for (const u of userDefs) {
      console.log(`    ${u.lastName} ${u.firstName.padEnd(10)} ${u.email.padEnd(35)} [${u.role}] - ${u.position}`);
    }
    console.log('');
    console.log('  Összefoglaló:');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`    Contractor:           1  (${summary.contractor})`);
    console.log(`    Szervezeti egységek:  ${summary.departments}`);
    console.log(`    Felhasználók:         ${summary.users}`);
    console.log(`    Munkavállalók:        ${summary.employees}`);
    console.log(`    Költséghelyek:        ${summary.costCenters}`);
    console.log(`    Projektek:            ${summary.projects}`);
    console.log(`    Feladatok:            ${summary.tasks}`);
    console.log(`    Feladat kommentek:    ${summary.taskComments}`);
    console.log(`    Számlák:              ${summary.invoices}`);
    console.log(`    Bérsávok:             ${summary.salaryBands}`);
    console.log(`    Munkavállalói bérek:  ${summary.employeeSalaries}`);
    console.log('════════════════════════════════════════════════════════════');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('HIBA a seed futtatása közben:');
    console.error(error.message);
    if (error.detail) console.error('Részlet:', error.detail);
    if (error.hint) console.error('Tipp:', error.hint);
    if (error.where) console.error('Hol:', error.where);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

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
