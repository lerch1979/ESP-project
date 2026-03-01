-- Email Inbox: Universal document processing
CREATE TABLE IF NOT EXISTS email_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_from VARCHAR(300),
  email_subject VARCHAR(500),
  email_date TIMESTAMP,
  attachment_filename VARCHAR(300),
  attachment_path VARCHAR(500),

  -- AI Classification
  document_type VARCHAR(50), -- invoice, damage_report, employee_contract, service_contract, rental_contract, tax_document, payment_reminder, other
  confidence_score INTEGER, -- 0-100
  classification_reasoning TEXT,

  -- OCR
  extracted_text TEXT,
  extracted_data JSONB,

  -- Auto-routing
  status VARCHAR(50) DEFAULT 'pending', -- pending, processed, failed, needs_review
  routed_to VARCHAR(100), -- invoice_drafts, tickets, documents
  routed_id UUID,
  needs_review BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),

  contractor_id UUID REFERENCES contractors(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Document routing log
CREATE TABLE IF NOT EXISTS document_routing_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_inbox_id UUID REFERENCES email_inbox(id) ON DELETE CASCADE,
  document_type VARCHAR(50),
  action_taken VARCHAR(100),
  target_table VARCHAR(50),
  target_id UUID,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_inbox_status ON email_inbox(status);
CREATE INDEX IF NOT EXISTS idx_email_inbox_type ON email_inbox(document_type);
CREATE INDEX IF NOT EXISTS idx_email_inbox_created ON email_inbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_inbox_contractor ON email_inbox(contractor_id);
CREATE INDEX IF NOT EXISTS idx_routing_log_inbox ON document_routing_log(email_inbox_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_email_inbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_inbox_updated_at ON email_inbox;
CREATE TRIGGER email_inbox_updated_at
  BEFORE UPDATE ON email_inbox
  FOR EACH ROW EXECUTE FUNCTION update_email_inbox_updated_at();
