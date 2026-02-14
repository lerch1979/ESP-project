require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const sqlFile = path.join(__dirname, process.argv[2] || 'add_employees.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    console.log('Connected. Running migration...');
    await client.query(sql);
    client.release();
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
