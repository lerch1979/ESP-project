-- ============================================
-- Invoice API enhancements
-- Add missing columns for full CRUD support
-- ============================================

-- Add soft-delete and status tracking columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name VARCHAR(200);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID;

-- Index for soft deletes
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_name);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

-- Sequence for auto-increment invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;
