-- Documents table for storing employee and company documents
-- Run: psql -U postgres -d hr_erp_db -f migrations/add_documents.sql

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  document_type VARCHAR(50) NOT NULL DEFAULT 'other',
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add columns if table already exists (idempotent)
DO $$
BEGIN
  -- Make employee_id nullable if it was NOT NULL in original schema
  ALTER TABLE documents ALTER COLUMN employee_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'description') THEN
    ALTER TABLE documents ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'document_type') THEN
    ALTER TABLE documents ADD COLUMN document_type VARCHAR(50) NOT NULL DEFAULT 'other';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'file_size') THEN
    ALTER TABLE documents ADD COLUMN file_size BIGINT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'mime_type') THEN
    ALTER TABLE documents ADD COLUMN mime_type VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'deleted_at') THEN
    ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'uploaded_by') THEN
    ALTER TABLE documents ADD COLUMN uploaded_by UUID REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'updated_at') THEN
    ALTER TABLE documents ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
