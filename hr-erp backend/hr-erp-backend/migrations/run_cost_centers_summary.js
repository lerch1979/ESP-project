/**
 * Migration runner: Add summary fields to cost_centers
 * Run: node migrations/run_cost_centers_summary.js
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting cost_centers summary fields migration...\n');

    // 1. Add summary columns
    console.log('1. Adding summary columns...');
    await client.query(`
      ALTER TABLE cost_centers
      ADD COLUMN IF NOT EXISTS total_invoices INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_net_amount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_vat_amount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_gross_amount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS first_invoice_date DATE,
      ADD COLUMN IF NOT EXISTS last_invoice_date DATE
    `);
    console.log('   Columns added successfully.');

    // 2. Create trigger function
    console.log('2. Creating trigger function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_cost_center_summary()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          UPDATE cost_centers
          SET
            total_invoices = (SELECT COUNT(*) FROM invoices WHERE cost_center_id = NEW.cost_center_id),
            total_net_amount = (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id),
            total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id),
            total_gross_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id),
            first_invoice_date = (SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id),
            last_invoice_date = (SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id)
          WHERE id = NEW.cost_center_id;
        END IF;

        IF TG_OP = 'DELETE' THEN
          UPDATE cost_centers
          SET
            total_invoices = (SELECT COUNT(*) FROM invoices WHERE cost_center_id = OLD.cost_center_id),
            total_net_amount = (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id),
            total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id),
            total_gross_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id),
            first_invoice_date = (SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id),
            last_invoice_date = (SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id)
          WHERE id = OLD.cost_center_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log('   Trigger function created.');

    // 3. Create trigger
    console.log('3. Creating trigger on invoices table...');
    await client.query('DROP TRIGGER IF EXISTS invoice_cost_center_summary_trigger ON invoices');
    await client.query(`
      CREATE TRIGGER invoice_cost_center_summary_trigger
      AFTER INSERT OR UPDATE OR DELETE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_cost_center_summary()
    `);
    console.log('   Trigger created.');

    // 4. Initial calculation
    console.log('4. Running initial calculation for existing data...');
    const result = await client.query(`
      UPDATE cost_centers cc
      SET
        total_invoices = (SELECT COUNT(*) FROM invoices WHERE cost_center_id = cc.id),
        total_net_amount = (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = cc.id),
        total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = cc.id),
        total_gross_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = cc.id),
        first_invoice_date = (SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = cc.id),
        last_invoice_date = (SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = cc.id)
    `);
    console.log(`   Updated ${result.rowCount} cost centers.`);

    // 5. Verify
    const verify = await client.query(`
      SELECT name, code, total_invoices, total_gross_amount, first_invoice_date, last_invoice_date
      FROM cost_centers
      WHERE total_invoices > 0
      ORDER BY total_gross_amount DESC
    `);
    if (verify.rows.length > 0) {
      console.log('\n   Cost centers with invoices:');
      verify.rows.forEach(r => {
        console.log(`   - ${r.name} (${r.code}): ${r.total_invoices} invoices, ${Number(r.total_gross_amount).toLocaleString('hu-HU')} HUF`);
      });
    } else {
      console.log('   No cost centers have invoices yet.');
    }

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(() => process.exit(1));
