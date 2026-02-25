/**
 * Projekt menedzsment migráció futtatása
 * Használat: node migrations/run_project_management.js [--seed]
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Projekt menedzsment migráció indítása...');

    // Run schema migration
    const schemaSql = fs.readFileSync(
      path.join(__dirname, 'project_management.sql'),
      'utf8'
    );
    await client.query(schemaSql);
    console.log('✅ Séma migráció kész');

    // Run seed if --seed flag is present
    if (process.argv.includes('--seed')) {
      const seedSql = fs.readFileSync(
        path.join(__dirname, 'seed_project_management.sql'),
        'utf8'
      );
      await client.query(seedSql);
      console.log('✅ Seed adatok betöltve');
    }

    console.log('🎉 Projekt menedzsment migráció sikeres!');
  } catch (error) {
    console.error('❌ Migráció hiba:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
