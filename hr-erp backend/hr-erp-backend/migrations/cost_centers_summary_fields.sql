-- Migration: Add summary fields to cost_centers for quick overview
-- Date: 2026-02-24

-- 1. Add summary columns
ALTER TABLE cost_centers
ADD COLUMN IF NOT EXISTS total_invoices INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_net_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_vat_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_gross_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_invoice_date DATE,
ADD COLUMN IF NOT EXISTS last_invoice_date DATE;

-- 2. Create trigger function to auto-update cost center summaries
CREATE OR REPLACE FUNCTION update_cost_center_summary()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE cost_centers
    SET
      total_invoices = (
        SELECT COUNT(*) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_net_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_vat_amount = (
        SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_gross_amount = (
        SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      first_invoice_date = (
        SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      last_invoice_date = (
        SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      )
    WHERE id = NEW.cost_center_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE cost_centers
    SET
      total_invoices = (
        SELECT COUNT(*) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_net_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_vat_amount = (
        SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_gross_amount = (
        SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      first_invoice_date = (
        SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      last_invoice_date = (
        SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      )
    WHERE id = OLD.cost_center_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger on invoices table
DROP TRIGGER IF EXISTS invoice_cost_center_summary_trigger ON invoices;
CREATE TRIGGER invoice_cost_center_summary_trigger
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_cost_center_summary();

-- 4. Initial calculation for existing cost centers
UPDATE cost_centers cc
SET
  total_invoices = (SELECT COUNT(*) FROM invoices WHERE cost_center_id = cc.id),
  total_net_amount = (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = cc.id),
  total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = cc.id),
  total_gross_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = cc.id),
  first_invoice_date = (SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = cc.id),
  last_invoice_date = (SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = cc.id);
