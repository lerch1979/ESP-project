-- ============================================
-- Invoice Drafts - Email Invoice Automation
-- Sprint 5: Gmail MCP + Claude OCR
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS invoice_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_from VARCHAR(300),
  email_subject VARCHAR(500),
  email_message_id VARCHAR(300),
  pdf_file_path VARCHAR(500),
  invoice_number VARCHAR(100),
  vendor_name VARCHAR(200),
  vendor_tax_number VARCHAR(50),
  net_amount DECIMAL(15,2),
  vat_amount DECIMAL(15,2),
  gross_amount DECIMAL(15,2),
  invoice_date DATE,
  due_date DATE,
  beneficiary_iban VARCHAR(50),
  description TEXT,
  extracted_data JSONB,
  suggested_cost_center_id UUID REFERENCES cost_centers(id),
  cost_center_confidence INTEGER,
  suggestion_reasoning TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  final_invoice_id UUID REFERENCES invoices(id),
  contractor_id UUID REFERENCES contractors(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_invoice_drafts_status ON invoice_drafts(status);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_created ON invoice_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_vendor ON invoice_drafts(vendor_name);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_email_msg ON invoice_drafts(email_message_id);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_contractor ON invoice_drafts(contractor_id);

-- ============================================
-- Trigger: auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_invoice_draft_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_draft_updated_at_trigger ON invoice_drafts;
CREATE TRIGGER invoice_draft_updated_at_trigger
BEFORE UPDATE ON invoice_drafts
FOR EACH ROW
EXECUTE FUNCTION update_invoice_draft_updated_at();
