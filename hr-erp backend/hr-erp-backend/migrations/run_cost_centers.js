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

async function run() {
  const client = await pool.connect();
  try {
    // Step 1: Add missing columns to existing cost_centers table
    const alters = [
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES cost_centers(id)',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS path TEXT',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS budget DECIMAL(15,2)',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS color VARCHAR(20)',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS icon VARCHAR(50)',
      'ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)',
    ];

    for (const sql of alters) {
      await client.query(sql);
    }
    console.log('OK: cost_centers columns added');

    // Step 2: Create invoice_categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50),
        color VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    console.log('OK: invoice_categories table');

    // Step 3: Create invoices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number VARCHAR(100),
        vendor_name VARCHAR(200),
        vendor_tax_number VARCHAR(50),
        amount DECIMAL(15,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'HUF',
        vat_amount DECIMAL(15,2),
        total_amount DECIMAL(15,2),
        invoice_date DATE NOT NULL,
        due_date DATE,
        payment_date DATE,
        payment_status VARCHAR(50) DEFAULT 'pending',
        cost_center_id UUID REFERENCES cost_centers(id) NOT NULL,
        category_id UUID REFERENCES invoice_categories(id),
        description TEXT,
        notes TEXT,
        file_path VARCHAR(500),
        ocr_data JSONB,
        contractor_id UUID REFERENCES contractors(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('OK: invoices table');

    // Step 4: Indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_cost_centers_parent ON cost_centers(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_cost_centers_path ON cost_centers(path)',
      'CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON cost_centers(code)',
      'CREATE INDEX IF NOT EXISTS idx_cost_centers_active ON cost_centers(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_cost_center ON invoices(cost_center_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category_id)',
    ];
    for (const sql of indexes) {
      await client.query(sql);
    }
    console.log('OK: indexes');

    // Step 5: Path trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_cost_center_path()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.parent_id IS NULL THEN
          NEW.level := 1;
          NEW.path := NEW.id::TEXT;
        ELSE
          SELECT level + 1, path || '.' || NEW.id::TEXT
          INTO NEW.level, NEW.path
          FROM cost_centers
          WHERE id = NEW.parent_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query('DROP TRIGGER IF EXISTS cost_center_path_trigger ON cost_centers');
    await client.query(`
      CREATE TRIGGER cost_center_path_trigger
      BEFORE INSERT OR UPDATE ON cost_centers
      FOR EACH ROW
      EXECUTE FUNCTION update_cost_center_path()
    `);
    console.log('OK: path trigger');

    // Step 6: Updated_at triggers
    await client.query(`
      CREATE OR REPLACE FUNCTION update_cost_center_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query('DROP TRIGGER IF EXISTS cost_center_updated_at_trigger ON cost_centers');
    await client.query(`
      CREATE TRIGGER cost_center_updated_at_trigger
      BEFORE UPDATE ON cost_centers
      FOR EACH ROW
      EXECUTE FUNCTION update_cost_center_updated_at()
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_invoice_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query('DROP TRIGGER IF EXISTS invoice_updated_at_trigger ON invoices');
    await client.query(`
      CREATE TRIGGER invoice_updated_at_trigger
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_invoice_updated_at()
    `);
    console.log('OK: updated_at triggers');

    // Step 7: Fix existing rows (set path/level for rows that existed before hierarchy)
    await client.query(`
      UPDATE cost_centers SET path = id::TEXT, level = 1 WHERE path IS NULL AND parent_id IS NULL
    `);
    console.log('OK: existing rows fixed');

    // Step 8: Seed cost centers (hierarchy)
    // Level 1 roots
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon) VALUES
        ('Operatív költségek', 'OPR', NULL, 'Napi működési költségek', '#3b82f6', '📊'),
        ('Stratégiai befektetések', 'STR', NULL, 'Hosszú távú befektetések', '#10b981', '📈'),
        ('Emberi erőforrás', 'HR', NULL, 'Munkaerő költségek', '#8b5cf6', '👥')
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 2 under OPR
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Budapest Projekt', 'OPR-BP', id, 'Budapesti építkezés', '#f59e0b', '🏗️'
      FROM cost_centers WHERE code = 'OPR'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Szálláshelyek', 'OPR-SZALL', id, 'Szálláshely költségek', '#ec4899', '🏢'
      FROM cost_centers WHERE code = 'OPR'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Irodai költségek', 'OPR-IRODA', id, 'Irodai működés', '#6366f1', '🏬'
      FROM cost_centers WHERE code = 'OPR'
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 2 under STR
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Ingatlan vásárlás', 'STR-INGAT', id, 'Új ingatlan beszerzés', '#10b981', '🏘️'
      FROM cost_centers WHERE code = 'STR'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'IT fejlesztés', 'STR-IT', id, 'Szoftverfejlesztés és rendszerek', '#06b6d4', '💻'
      FROM cost_centers WHERE code = 'STR'
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 2 under HR
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Bérek és juttatások', 'HR-BER', id, 'Fizetések, bónuszok', '#8b5cf6', '💰'
      FROM cost_centers WHERE code = 'HR'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Képzés és oktatás', 'HR-KEPZES', id, 'Tréningek, továbbképzés', '#a855f7', '🎓'
      FROM cost_centers WHERE code = 'HR'
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 3 under OPR-BP
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Rezsi', 'OPR-BP-REZSI', id, 'Közüzemi költségek', '#f59e0b', '⚡'
      FROM cost_centers WHERE code = 'OPR-BP'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Anyagok', 'OPR-BP-ANYAG', id, 'Építőanyag beszerzés', '#3b82f6', '🔨'
      FROM cost_centers WHERE code = 'OPR-BP'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Alvállalkozók', 'OPR-BP-ALVAL', id, 'Alvállalkozói díjak', '#ef4444', '👷'
      FROM cost_centers WHERE code = 'OPR-BP'
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 3 under OPR-SZALL
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Budapest Lakás 101', 'OPR-SZALL-BP101', id, 'Budapest lakás', '#ec4899', '🏠'
      FROM cost_centers WHERE code = 'OPR-SZALL'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Budapest Lakás 202', 'OPR-SZALL-BP202', id, 'Budapest lakás 2', '#f472b6', '🏠'
      FROM cost_centers WHERE code = 'OPR-SZALL'
      ON CONFLICT (code) DO NOTHING
    `);

    // Level 4 under OPR-SZALL-BP101
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Áram', 'OPR-SZALL-BP101-ARAM', id, 'Villanyáram', '#f59e0b', '⚡'
      FROM cost_centers WHERE code = 'OPR-SZALL-BP101'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Víz', 'OPR-SZALL-BP101-VIZ', id, 'Vízfogyasztás', '#3b82f6', '💧'
      FROM cost_centers WHERE code = 'OPR-SZALL-BP101'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Gáz', 'OPR-SZALL-BP101-GAZ', id, 'Gázfogyasztás', '#ef4444', '🔥'
      FROM cost_centers WHERE code = 'OPR-SZALL-BP101'
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
      SELECT 'Internet', 'OPR-SZALL-BP101-NET', id, 'Internet szolgáltatás', '#06b6d4', '🌐'
      FROM cost_centers WHERE code = 'OPR-SZALL-BP101'
      ON CONFLICT (code) DO NOTHING
    `);
    console.log('OK: cost center seeds');

    // Step 9: Seed invoice categories
    await client.query(`
      INSERT INTO invoice_categories (name, icon, color) VALUES
        ('Rezsi (Utilities)', '⚡', '#f59e0b'),
        ('Anyagköltség', '🔨', '#3b82f6'),
        ('Bérköltség', '👷', '#10b981'),
        ('Szolgáltatás', '🛠️', '#8b5cf6'),
        ('Beszerzés', '📦', '#ec4899'),
        ('Marketing', '📢', '#ef4444'),
        ('Egyéb', '📋', '#6b7280')
    `);
    console.log('OK: invoice category seeds');

    // Verify
    const cc = await client.query('SELECT id, name, code, level, path FROM cost_centers ORDER BY path, name');
    console.log('\nCost centers (' + cc.rows.length + '):');
    cc.rows.forEach(r => {
      const indent = '  '.repeat((r.level || 1) - 1);
      console.log('  ' + indent + (r.code || '?') + ' - ' + r.name + ' (L' + (r.level || '?') + ')');
    });

    const ic = await client.query('SELECT * FROM invoice_categories ORDER BY name');
    console.log('\nInvoice categories: ' + ic.rows.length);

    console.log('\nMigration complete!');
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
