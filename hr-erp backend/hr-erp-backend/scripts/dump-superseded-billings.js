#!/usr/bin/env node
/**
 * Dump the accommodation_billings rows that migration 148 is about to delete.
 *
 * 148 removes rows belonging to CANCELLED billing runs — dead data that every
 * application read already excludes, but data nonetheless. A full pg_restore to recover
 * a handful of superseded rows is a blunt instrument, so this writes them as ready-to-run
 * INSERT statements next to the backups.
 *
 * Run BEFORE the migration:
 *   node scripts/dump-superseded-billings.js [--out DIR]
 *
 * Exit codes: 0 = dumped (or nothing to dump), 1 = failed. Non-zero means DO NOT proceed
 * with the migration — the point of this script is that the delete is recoverable.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const outDir = (() => {
  const i = process.argv.indexOf('--out');
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
})();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

/** Quote a JS value as a Postgres literal. */
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

(async () => {
  const client = await pool.connect();
  try {
    const cols = (await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'accommodation_billings' ORDER BY ordinal_position`
    )).rows.map((r) => r.column_name);

    const rows = (await client.query(
      `SELECT ab.* FROM accommodation_billings ab
         JOIN billing_runs br ON br.id = ab.billing_run_id
        WHERE br.status = 'cancelled'
        ORDER BY ab.billing_month, ab.accommodation_id`
    )).rows;

    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const file = path.join(outDir, `superseded-billings-${stamp}.sql`);

    const header = [
      '-- Superseded accommodation_billings rows, dumped before migration 148 deleted them.',
      `-- Database : ${process.env.DB_NAME}`,
      `-- Taken    : ${new Date().toISOString()}`,
      `-- Rows     : ${rows.length}`,
      '--',
      '-- These belong to CANCELLED billing runs, i.e. rows every application read already',
      '-- excludes (profit.service, invoiceReport, the run detail view). They are dumped so',
      '-- the delete is reversible without a full pg_restore.',
      '--',
      '-- ⚠ Re-inserting these will VIOLATE the unique index mig 148 adds',
      '--   (uq_accommodation_billings_live) if a live row already exists for the same',
      '--   (accommodation_id, partner_contractor_id, billing_month). Restore into a scratch',
      '--   database to inspect, rather than replaying blindly into production.',
      '',
      'BEGIN;',
      '',
    ].join('\n');

    const body = rows.map((r) => {
      const vals = cols.map((c) => lit(r[c])).join(', ');
      return `INSERT INTO accommodation_billings (${cols.join(', ')}) VALUES (${vals});`;
    }).join('\n');

    fs.writeFileSync(file, `${header}${body}\n\nCOMMIT;\n`, 'utf8');

    // Read it back and count the statements, so "the dump exists" is proven rather
    // than assumed — a zero-byte or truncated file must not look like success.
    const written = fs.readFileSync(file, 'utf8');
    const stmts = (written.match(/^INSERT INTO accommodation_billings /gm) || []).length;
    if (stmts !== rows.length) {
      throw new Error(`dump verification failed: ${rows.length} rows selected but ${stmts} INSERTs written`);
    }

    console.log(`rows_selected=${rows.length}`);
    console.log(`inserts_written=${stmts}`);
    console.log(`bytes=${Buffer.byteLength(written)}`);
    console.log(`file=${file}`);
    console.log(rows.length === 0 ? 'NOTHING TO DUMP — migration 148 will delete nothing' : 'DUMP OK');
  } catch (err) {
    console.error('DUMP FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
