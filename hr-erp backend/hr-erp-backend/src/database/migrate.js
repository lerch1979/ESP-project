#!/usr/bin/env node
/**
 * Migration Runner — Ordered, idempotent, tracked migrations.
 *
 * Usage:
 *   npm run db:migrate          — run all pending migrations
 *   npm run db:migrate status   — show which migrations have been applied
 *   npm run db:migrate rollback — rollback last applied migration (if rollback SQL exists)
 *
 * Each migration is tracked in the `schema_migrations` table.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ─── Ordered migration manifest ───────────────────────────────────────
// Files are relative to the project root (hr-erp-backend/)
const MIGRATIONS = [
  { id: '001', name: 'initial_schema',              file: 'database_schema.sql' },
  { id: '002', name: 'rename_tenants_to_contractors', file: 'migrations/rename_tenants_to_contractors.sql' },
  { id: '003', name: 'add_role_to_users',            file: 'migrations/add_role_to_users.sql' },
  { id: '004', name: 'add_employees',                file: 'migrations/add_employees.sql' },
  { id: '005', name: 'expand_employees',             file: 'migrations/expand_employees.sql' },
  { id: '006', name: 'add_employee_photo',           file: 'migrations/add_employee_photo.sql' },
  { id: '007', name: 'add_employee_documents',       file: 'migrations/add_employee_documents.sql' },
  { id: '008', name: 'add_employee_notes',           file: 'migrations/add_employee_notes.sql' },
  { id: '009', name: 'add_accommodations',           file: 'migrations/add_accommodations.sql' },
  { id: '010', name: 'add_accommodation_rooms',      file: 'migrations/add_accommodation_rooms.sql' },
  { id: '011', name: 'fix_room_overcapacity',        file: 'migrations/fix_room_overcapacity.sql' },
  { id: '012', name: 'add_documents',                file: 'migrations/add_documents.sql' },
  { id: '013', name: 'add_scanned_file_path',        file: 'migrations/add_scanned_file_path.sql' },
  { id: '014', name: 'add_videos',                   file: 'migrations/add_videos.sql' },
  { id: '015', name: 'add_activity_log',             file: 'migrations/add_activity_log.sql' },
  { id: '016', name: 'add_calendar_tables',          file: 'migrations/add_calendar_tables.sql' },
  { id: '017', name: 'add_google_calendar',          file: 'migrations/add_google_calendar.sql' },
  { id: '018', name: 'add_notification_center',      file: 'migrations/add_notification_center.sql' },
  { id: '019', name: 'add_scheduled_reports',        file: 'migrations/add_scheduled_reports.sql' },
  { id: '020', name: 'add_template_manager',         file: 'migrations/add_template_manager.sql' },
  { id: '021', name: 'email_templates',              file: 'migrations/email_templates.sql' },
  { id: '022', name: 'add_chatbot',                  file: 'migrations/add_chatbot.sql' },
  { id: '023', name: 'chatbot_improvements',         file: 'migrations/chatbot_improvements.sql' },
  { id: '024', name: 'permissions_system',           file: 'migrations/permissions_system.sql' },
  { id: '025', name: 'fix_superadmin_permissions',   file: 'migrations/fix_superadmin_permissions.sql' },
  { id: '026', name: 'add_email_inbox',              file: 'migrations/add_email_inbox.sql' },
  { id: '027', name: 'add_email_inbox_message_id',   file: 'migrations/add_email_inbox_message_id.sql' },
  { id: '028', name: 'invoice_cost_centers',         file: 'migrations/invoice_cost_centers.sql' },
  { id: '029', name: 'cost_centers_summary_fields',  file: 'migrations/cost_centers_summary_fields.sql' },
  { id: '030', name: 'project_management',           file: 'migrations/project_management.sql' },
  { id: '031', name: 'auto_assign_system',           file: 'migrations/auto_assign_system.sql' },
  { id: '032', name: 'sla_policies',                 file: 'migrations/sla_policies.sql' },
  { id: '033', name: 'sla_ticket_deadlines',         file: 'migrations/sla_ticket_deadlines.sql' },
  { id: '034', name: 'add_invoice_drafts',           file: 'migrations/add_invoice_drafts.sql' },
  { id: '035', name: 'add_invoices_api',             file: 'migrations/add_invoices_api.sql' },
  { id: '036', name: 'add_payments',                 file: 'migrations/add_payments.sql' },
  { id: '037', name: 'salary_transparency',          file: 'migrations/salary_transparency.sql' },
  { id: '040', name: 'encrypt_pii_data',             file: 'migrations/encrypt_pii_data.sql' },
  { id: '041', name: 'audit_triggers',               file: 'migrations/audit_triggers.sql' },
  { id: '050', name: 'chatbot_system_enhancements',  file: 'migrations/050_chatbot_system.sql' },
  { id: '052', name: 'chatbot_quality_faqs',         file: 'migrations/052_chatbot_quality_faqs.sql' },
  { id: '053', name: 'chatbot_ai_context',           file: 'migrations/053_chatbot_ai_context.sql' },
  { id: '054', name: 'complete_pii_encryption',     file: 'migrations/054_complete_pii_encryption.sql' },
  { id: '055', name: 'complete_audit_triggers',      file: 'migrations/055_complete_audit_triggers.sql' },
  { id: '056', name: 'password_policies',            file: 'migrations/056_password_policies.sql' },
];

// Seed data (run after all migrations with `npm run db:migrate seed`)
const SEEDS = [
  { id: 'S001', name: 'seed_notification_templates', file: 'migrations/seed_notification_templates.sql' },
  { id: 'S002', name: 'seed_rooms',                  file: 'migrations/seed_rooms.sql' },
  { id: 'S003', name: 'seed_project_management',     file: 'migrations/seed_project_management.sql' },
  { id: 'S004', name: 'seed_chatbot_faqs',            file: 'migrations/seed_chatbot_faqs.sql' },
];

// ─── Helpers ──────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');

function getPool() {
  const sslConfig = process.env.DB_SSL === 'true'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.DB_SSL_CA || undefined,
      }
    : false;

  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'hr_erp_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: sslConfig,
  });
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(10) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getApplied(client) {
  const res = await client.query('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(res.rows.map(r => r.id));
}

// ─── Commands ─────────────────────────────────────────────────────────

async function runMigrations(includeSeed) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    const list = includeSeed ? [...MIGRATIONS, ...SEEDS] : MIGRATIONS;
    let count = 0;

    for (const m of list) {
      if (applied.has(m.id)) {
        continue;
      }

      const filePath = path.join(ROOT, m.file);
      if (!fs.existsSync(filePath)) {
        console.error(`  ✗ [${m.id}] File not found: ${m.file}`);
        process.exit(1);
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`  ▶ [${m.id}] ${m.name}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (id, name) VALUES ($1, $2)',
          [m.id, m.name]
        );
        await client.query('COMMIT');
        console.log(`  ✓ [${m.id}] ${m.name} — applied`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ [${m.id}] ${m.name} — FAILED: ${err.message}`);
        process.exit(1);
      }
    }

    if (count === 0) {
      console.log('\n  All migrations already applied. Nothing to do.');
    } else {
      console.log(`\n  ✅ ${count} migration(s) applied successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function showStatus() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    console.log('\n  Migration Status:');
    console.log('  ' + '─'.repeat(60));

    for (const m of [...MIGRATIONS, ...SEEDS]) {
      const status = applied.has(m.id) ? '✓' : '○';
      console.log(`  ${status} [${m.id}] ${m.name}`);
    }
    console.log('  ' + '─'.repeat(60));
    console.log(`  Applied: ${applied.size} / ${MIGRATIONS.length + SEEDS.length}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function rollbackLast() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const res = await client.query('SELECT id, name FROM schema_migrations ORDER BY id DESC LIMIT 1');

    if (res.rows.length === 0) {
      console.log('  No migrations to rollback.');
      return;
    }

    const last = res.rows[0];
    console.log(`  Rolling back [${last.id}] ${last.name}...`);

    // Check for a rollback file
    const allMigrations = [...MIGRATIONS, ...SEEDS];
    const migration = allMigrations.find(m => m.id === last.id);
    if (!migration) {
      console.error(`  ✗ Migration ${last.id} not found in manifest.`);
      process.exit(1);
    }

    const rollbackFile = path.join(ROOT, migration.file.replace('.sql', '.rollback.sql'));
    if (fs.existsSync(rollbackFile)) {
      const sql = fs.readFileSync(rollbackFile, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('DELETE FROM schema_migrations WHERE id = $1', [last.id]);
        await client.query('COMMIT');
        console.log(`  ✓ [${last.id}] ${last.name} — rolled back`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Rollback failed: ${err.message}`);
        process.exit(1);
      }
    } else {
      // No rollback SQL — just remove tracking entry
      await client.query('DELETE FROM schema_migrations WHERE id = $1', [last.id]);
      console.log(`  ✓ [${last.id}] ${last.name} — removed from tracking (no rollback SQL found)`);
      console.log(`  ⚠ Database state was NOT reverted. Create ${migration.file.replace('.sql', '.rollback.sql')} for actual rollback.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function baseline() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    let count = 0;

    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      await client.query(
        'INSERT INTO schema_migrations (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [m.id, m.name]
      );
      console.log(`  ✓ [${m.id}] ${m.name} — marked as applied`);
      count++;
    }

    if (count === 0) {
      console.log('  All migrations already baselined.');
    } else {
      console.log(`\n  ✅ ${count} migration(s) baselined (marked as applied without executing).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────

const command = process.argv[2] || 'run';

console.log('\n🔄 HR-ERP Migration Runner\n');

switch (command) {
  case 'run':
    runMigrations(false).catch(err => { console.error(err); process.exit(1); });
    break;
  case 'seed':
    runMigrations(true).catch(err => { console.error(err); process.exit(1); });
    break;
  case 'status':
    showStatus().catch(err => { console.error(err); process.exit(1); });
    break;
  case 'rollback':
    rollbackLast().catch(err => { console.error(err); process.exit(1); });
    break;
  case 'baseline':
    baseline().catch(err => { console.error(err); process.exit(1); });
    break;
  default:
    console.log('Usage: node migrate.js [run|seed|status|rollback|baseline]');
    process.exit(1);
}
