-- Migration 054: Complete PII Encryption
-- Extends encrypted PII fields to cover ALL sensitive personal data.
-- Adds key version tracking for rotation support.

-- Step 1: Extend employees PII columns to TEXT for encrypted storage
-- company_phone
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'company_phone'
  ) THEN
    ALTER TABLE employees ALTER COLUMN company_phone TYPE TEXT;
  END IF;
END $$;

-- mothers_name (legally protected PII in Hungary)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'mothers_name'
  ) THEN
    ALTER TABLE employees ALTER COLUMN mothers_name TYPE TEXT;
  END IF;
END $$;

-- company_email
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'company_email'
  ) THEN
    ALTER TABLE employees ALTER COLUMN company_email TYPE TEXT;
  END IF;
END $$;

-- permanent_address_street
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'permanent_address_street'
  ) THEN
    ALTER TABLE employees ALTER COLUMN permanent_address_street TYPE TEXT;
  END IF;
END $$;

-- permanent_address_city
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'permanent_address_city'
  ) THEN
    ALTER TABLE employees ALTER COLUMN permanent_address_city TYPE TEXT;
  END IF;
END $$;

-- permanent_address_zip
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'permanent_address_zip'
  ) THEN
    ALTER TABLE employees ALTER COLUMN permanent_address_zip TYPE TEXT;
  END IF;
END $$;

-- permanent_address_number
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'permanent_address_number'
  ) THEN
    ALTER TABLE employees ALTER COLUMN permanent_address_number TYPE TEXT;
  END IF;
END $$;

-- Step 2: Add encryption key version tracking columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'encryption_key_version'
  ) THEN
    ALTER TABLE employees ADD COLUMN encryption_key_version INTEGER DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encryption_key_version'
  ) THEN
    ALTER TABLE users ADD COLUMN encryption_key_version INTEGER DEFAULT 1;
  END IF;
END $$;

-- Step 3: Ensure users table PII fields are TEXT
DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN email TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN phone TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 4: Create encryption key rotation tracking table
CREATE TABLE IF NOT EXISTS encryption_key_versions (
  id SERIAL PRIMARY KEY,
  key_version INTEGER NOT NULL UNIQUE,
  algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-cbc',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  rotated_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  rotated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert initial key version
INSERT INTO encryption_key_versions (key_version, algorithm, is_active)
VALUES (1, 'aes-256-cbc', true)
ON CONFLICT (key_version) DO NOTHING;

-- Step 5: Add comments
COMMENT ON COLUMN employees.encryption_key_version IS 'Version of encryption key used for PII fields';
COMMENT ON COLUMN users.encryption_key_version IS 'Version of encryption key used for PII fields';
COMMENT ON TABLE encryption_key_versions IS 'Tracks encryption key versions for rotation support';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'company_phone') THEN
    COMMENT ON COLUMN employees.company_phone IS 'AES-256-CBC encrypted PII field';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'mothers_name') THEN
    COMMENT ON COLUMN employees.mothers_name IS 'AES-256-CBC encrypted PII field (legally protected in Hungary)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'company_email') THEN
    COMMENT ON COLUMN employees.company_email IS 'AES-256-CBC encrypted PII field';
  END IF;
END $$;
