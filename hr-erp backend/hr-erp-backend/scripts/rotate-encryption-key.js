#!/usr/bin/env node
/**
 * Encryption Key Rotation Script
 *
 * Re-encrypts all PII data with a new encryption key.
 * Supports zero-downtime rotation by using two env vars:
 *   ENCRYPTION_KEY     = current (old) key
 *   ENCRYPTION_KEY_NEW = new key to rotate to
 *
 * Usage:
 *   ENCRYPTION_KEY_NEW=<new-64-hex> node scripts/rotate-encryption-key.js
 *   ENCRYPTION_KEY_NEW=<new-64-hex> node scripts/rotate-encryption-key.js --dry-run
 *
 * After successful rotation:
 *   1. Set ENCRYPTION_KEY=<new key>
 *   2. Remove ENCRYPTION_KEY_NEW
 *   3. Update ENCRYPTION_KEY_VERSION
 */

require('dotenv').config();
const { Pool } = require('pg');

const {
  decrypt,
  encrypt,
  isEncrypted,
  PII_FIELDS,
  USER_PII_FIELDS,
  generateEncryptionKey,
} = require('../src/services/encryption.service');

const DRY_RUN = process.argv.includes('--dry-run');
const GENERATE = process.argv.includes('--generate');

// ─── Database ─────────────────────────────────────────────────────────────

function getPool() {
  const sslConfig = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
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

// ─── Rotation Logic ───────────────────────────────────────────────────────

async function rotateTable(client, tableName, fields, oldKeyEnv, newKeyEnv) {
  console.log(`\n  Processing ${tableName}...`);

  const result = await client.query(`SELECT id, ${fields.join(', ')} FROM ${tableName}`);
  let rotated = 0;
  let skipped = 0;

  for (const row of result.rows) {
    const updates = {};
    let hasChanges = false;

    for (const field of fields) {
      const value = row[field];
      if (value == null || value === '') {
        skipped++;
        continue;
      }

      // Decrypt with old key
      const oldKey = process.env[oldKeyEnv];
      process.env.ENCRYPTION_KEY = oldKey;
      const plaintext = decrypt(value);

      if (plaintext == null) {
        skipped++;
        continue;
      }

      // Encrypt with new key
      const newKey = process.env[newKeyEnv];
      process.env.ENCRYPTION_KEY = newKey;
      const newEncrypted = encrypt(plaintext);

      // Restore old key for next iteration
      process.env.ENCRYPTION_KEY = oldKey;

      updates[field] = newEncrypted;
      hasChanges = true;
    }

    if (hasChanges && !DRY_RUN) {
      const setClauses = Object.keys(updates).map((f, i) => `${f} = $${i + 2}`);
      const values = [row.id, ...Object.values(updates)];

      // Update key version too
      const newVersion = parseInt(process.env.ENCRYPTION_KEY_VERSION_NEW) || 2;
      setClauses.push(`encryption_key_version = $${values.length + 1}`);
      values.push(newVersion);

      await client.query(
        `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = $1`,
        values
      );
      rotated++;
    } else if (hasChanges) {
      rotated++;
    }
  }

  console.log(`    ${rotated} rows re-encrypted, ${skipped} fields skipped (null/empty)`);
  return rotated;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔄 Encryption Key Rotation');
  console.log('═'.repeat(50));

  if (GENERATE) {
    const newKey = generateEncryptionKey();
    console.log(`\n  New key generated: ${newKey}`);
    console.log(`\n  Set ENCRYPTION_KEY_NEW=${newKey} and run again without --generate`);
    return;
  }

  if (!process.env.ENCRYPTION_KEY) {
    console.error('  ✗ ENCRYPTION_KEY not set');
    process.exit(1);
  }

  if (!process.env.ENCRYPTION_KEY_NEW) {
    console.error('  ✗ ENCRYPTION_KEY_NEW not set. Use --generate to create a new key.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('  ⚠ DRY RUN — no data will be modified\n');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let totalRotated = 0;

    // Rotate employees PII
    totalRotated += await rotateTable(
      client, 'employees', PII_FIELDS, 'ENCRYPTION_KEY', 'ENCRYPTION_KEY_NEW'
    );

    // Rotate users PII (if encrypted)
    try {
      totalRotated += await rotateTable(
        client, 'users', USER_PII_FIELDS, 'ENCRYPTION_KEY', 'ENCRYPTION_KEY_NEW'
      );
    } catch (err) {
      console.log('    Users table rotation skipped:', err.message);
    }

    // Record the rotation in tracking table
    if (!DRY_RUN) {
      const newVersion = parseInt(process.env.ENCRYPTION_KEY_VERSION_NEW) || 2;
      await client.query(
        `INSERT INTO encryption_key_versions (key_version, algorithm, is_active)
         VALUES ($1, 'aes-256-cbc', true)
         ON CONFLICT (key_version) DO UPDATE SET rotated_at = NOW()`,
        [newVersion]
      );

      // Deactivate old version
      const oldVersion = parseInt(process.env.ENCRYPTION_KEY_VERSION) || 1;
      await client.query(
        `UPDATE encryption_key_versions SET is_active = false, rotated_at = NOW()
         WHERE key_version = $1`,
        [oldVersion]
      );
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n  ⚠ DRY RUN complete — rolled back all changes');
    } else {
      await client.query('COMMIT');
      console.log(`\n  ✅ Key rotation complete. ${totalRotated} rows updated.`);
      console.log('\n  Next steps:');
      console.log('    1. Set ENCRYPTION_KEY to the new key value');
      console.log('    2. Remove ENCRYPTION_KEY_NEW');
      console.log('    3. Update ENCRYPTION_KEY_VERSION');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n  ✗ Rotation failed: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
