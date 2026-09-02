#!/usr/bin/env node
/**
 * Scan label fields for partner names.
 *
 * A room labelled "201-IKEA" leaks client attribution onto the SZÁLLÁSADÓ settlement
 * sheet — a document that is specifically supposed to hide which client a worker
 * belongs to. The sheet masks such labels at render time, but masking is a safety net;
 * the fix is renaming the field. This lists what needs renaming.
 *
 * READ-ONLY. Changes nothing.
 *   node scripts/scan-partner-name-leaks.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Free-text fields a partner name could end up in and then be shown to someone else.
const TARGETS = [
  { table: 'accommodation_rooms', id: 'id', field: 'room_number', label: 'szoba felirat' },
  { table: 'accommodations',      id: 'id', field: 'name',        label: 'szálláshely név' },
  { table: 'accommodations',      id: 'id', field: 'address',     label: 'szálláshely cím' },
  { table: 'accommodations',      id: 'id', field: 'notes',       label: 'szálláshely megjegyzés' },
  { table: 'employees',           id: 'id', field: 'workplace',   label: 'munkahely' },
  { table: 'partner_contacts',    id: 'id', field: 'role_title',  label: 'kapcsolattartó beosztás' },
];

const deaccent = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const squash = (v) => deaccent(v).replace(/[^a-z0-9]/g, '');

(async () => {
  const client = await pool.connect();
  try {
    const partners = (await client.query(
      `SELECT c.id, c.name,
              COALESCE(array_agg(cr.role) FILTER (WHERE cr.role IS NOT NULL), '{}') AS roles
         FROM contractors c
         LEFT JOIN contractor_roles cr ON cr.contractor_id = c.id
        WHERE c.name IS NOT NULL AND length(btrim(c.name)) >= 4
        GROUP BY c.id, c.name`)).rows;

    console.log(`scanning ${TARGETS.length} field(s) against ${partners.length} partner name(s)\n`);
    let hits = 0;

    for (const t of TARGETS) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [t.table, t.field]);
      if (exists.rows.length === 0) { console.log(`  (skip ${t.table}.${t.field} — nincs ilyen oszlop)`); continue; }

      const rows = (await client.query(
        `SELECT ${t.id} AS id, ${t.field} AS val FROM ${t.table}
          WHERE ${t.field} IS NOT NULL AND length(btrim(${t.field})) > 0`)).rows;

      for (const r of rows) {
        for (const p of partners) {
          // Match the squashed forms so "201-TesztMegbizoZrt" and "Teszt Megbízó Zrt"
          // meet, without flagging a two-letter coincidence.
          const needle = squash(p.name);
          if (needle.length < 5) continue;
          if (!squash(r.val).includes(needle)) continue;
          // A workplace legitimately naming the client it belongs to is not a leak on
          // the CLIENT sheet — it is only a problem where the landlord can see it.
          hits += 1;
          console.log(`  ⚠ ${t.label.padEnd(26)} "${r.val}"`);
          console.log(`     └─ tartalmazza: "${p.name}"  [${(p.roles || []).join(',') || 'nincs szerep'}]  ${t.table}.${t.id}=${r.id}`);
        }
      }
    }

    console.log(hits === 0
      ? '\n✓ nincs partnernevet tartalmazó címke — a szállásadói lap maszkolása nem aktiválódik'
      : `\n${hits} találat. Ezeket érdemes átnevezni; addig a szállásadói lap elrejti őket.`);
  } catch (err) {
    console.error('SCAN FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
