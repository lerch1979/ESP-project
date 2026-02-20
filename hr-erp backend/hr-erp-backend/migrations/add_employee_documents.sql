-- ============================================================
-- Employee Documents (Munkavállalói dokumentumok)
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL DEFAULT 'other',  -- passport, taj_card, visa, contract, address_card, other
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER DEFAULT 0,
  mime_type VARCHAR(100),
  thumbnail_path VARCHAR(500),
  scanned_file_path VARCHAR(500),
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON employee_documents (employee_id);
