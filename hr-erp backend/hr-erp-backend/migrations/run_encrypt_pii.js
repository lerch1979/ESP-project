#!/usr/bin/env node
/**
 * PII Data Encryption Migration Script
 *
 * Encrypts existing plaintext PII data in the employees table.
 * Run after migration 040 (encrypt_pii_data.sql) has been applied.
 *
 * Usage:
 *   node migrations/run_encrypt_pii.js          — encrypt all unencrypted rows
 *   node migrations/run_encrypt_pii.js --dry-run — preview without changes
 */

require('dotenv').config();
const { Pool } = require('pg');
const { encrypt } = require('../src/services/encryption.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'hr_erp_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const client = await pool.connect();

  try {
    // Get all employees where PII is not yet encrypted
    const res = await client.query(`
      SELECT id, social_security_number, passport_number, bank_account, tax_id
      FROM employees
      WHERE pii_encrypted = false OR pii_encrypted IS NULL
    `);

    console.log(`\n📋 Found ${res.rows.length} employees with unencrypted PII data.\n`);

    if (DRY_RUN) {
      console.log('🔍 DRY RUN — no changes will be made.\n');
      for (const row of res.rows) {
        const fields = [];
        if (row.social_security_number) fields.push('SSN');
        if (row.passport_number) fields.push('Passport');
        if (row.bank_account) fields.push('Bank Account');
        if (row.tax_id) fields.push('Tax ID');
        console.log(`  Employee ${row.id}: ${fields.length > 0 ? fields.join(', ') : 'no PII data'}`);
      }
      console.log('\n✅ Dry run complete.');
      return;
    }

    let encrypted = 0;
    await client.query('BEGIN');

    for (const row of res.rows) {
      const ssn = row.social_security_number ? encrypt(row.social_security_number) : null;
      const passport = row.passport_number ? encrypt(row.passport_number) : null;
      const bank = row.bank_account ? encrypt(row.bank_account) : null;
      const tax = row.tax_id ? encrypt(row.tax_id) : null;

      await client.query(`
        UPDATE employees SET
          social_security_number = $1,
          passport_number = $2,
          bank_account = $3,
          tax_id = $4,
          pii_encrypted = true
        WHERE id = $5
      `, [ssn, passport, bank, tax, row.id]);

      encrypted++;
      if (encrypted % 100 === 0) {
        console.log(`  Encrypted ${encrypted}/${res.rows.length} rows...`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Successfully encrypted PII data for ${encrypted} employees.\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Encryption migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
