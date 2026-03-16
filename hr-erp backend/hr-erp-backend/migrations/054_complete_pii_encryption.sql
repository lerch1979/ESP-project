-- Migration 054: Complete PII Encryption
-- Extend encrypted fields to cover company_phone and mothers_name

-- company_phone → TEXT for encrypted storage
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'company_phone'
  ) THEN
    ALTER TABLE employees ALTER COLUMN company_phone TYPE TEXT;
  END IF;
END $$;

-- mothers_name → TEXT (legally protected PII in Hungary)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'mothers_name'
  ) THEN
    ALTER TABLE employees ALTER COLUMN mothers_name TYPE TEXT;
  END IF;
END $$;

-- Add comments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'company_phone') THEN
    COMMENT ON COLUMN employees.company_phone IS 'AES-256-CBC encrypted PII field';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'mothers_name') THEN
    COMMENT ON COLUMN employees.mothers_name IS 'AES-256-CBC encrypted PII field (legally protected in Hungary)';
  END IF;
END $$;
