-- Migration: Employee notes table for timeline feature

CREATE TABLE IF NOT EXISTS employee_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note_type VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'warning', 'positive', 'document')),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_employee_id ON employee_notes(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_notes_created_at ON employee_notes(employee_id, created_at);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_employee_notes_updated_at'
  ) THEN
    CREATE TRIGGER set_employee_notes_updated_at
      BEFORE UPDATE ON employee_notes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
