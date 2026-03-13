-- Migration 040: Encrypt PII Data
-- Alter PII columns to TEXT type to accommodate encrypted values (longer than plaintext).
-- Actual data encryption is handled at the application level via encryption.service.js.
-- A companion script (migrations/run_encrypt_pii.js) can be run to encrypt existing plaintext data.

-- Step 1: Alter column types to TEXT for encrypted storage
-- social_security_number: VARCHAR(50) -> TEXT
DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN social_security_number TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- passport_number: VARCHAR(100) -> TEXT
DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN passport_number TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- bank_account: VARCHAR(100) -> TEXT
DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN bank_account TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- tax_id: VARCHAR(50) -> TEXT
DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN tax_id TYPE TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 2: Add a metadata column to track encryption status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'pii_encrypted'
  ) THEN
    ALTER TABLE employees ADD COLUMN pii_encrypted BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN employees.social_security_number IS 'AES-256-CBC encrypted. Decrypt via encryption.service.js';
COMMENT ON COLUMN employees.passport_number IS 'AES-256-CBC encrypted. Decrypt via encryption.service.js';
COMMENT ON COLUMN employees.bank_account IS 'AES-256-CBC encrypted. Decrypt via encryption.service.js';
COMMENT ON COLUMN employees.tax_id IS 'AES-256-CBC encrypted. Decrypt via encryption.service.js';
COMMENT ON COLUMN employees.pii_encrypted IS 'Whether PII fields have been encrypted (for migration tracking)';
