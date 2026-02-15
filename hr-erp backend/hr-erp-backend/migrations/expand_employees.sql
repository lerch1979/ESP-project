-- Migration: Expand employees table with comprehensive fields
-- Datum: 2026-02-15

-- Personal Info
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='first_name') THEN ALTER TABLE employees ADD COLUMN first_name VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='last_name') THEN ALTER TABLE employees ADD COLUMN last_name VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='gender') THEN ALTER TABLE employees ADD COLUMN gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='birth_date') THEN ALTER TABLE employees ADD COLUMN birth_date DATE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='birth_place') THEN ALTER TABLE employees ADD COLUMN birth_place VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='mothers_name') THEN ALTER TABLE employees ADD COLUMN mothers_name VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='tax_id') THEN ALTER TABLE employees ADD COLUMN tax_id VARCHAR(50); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='passport_number') THEN ALTER TABLE employees ADD COLUMN passport_number VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='social_security_number') THEN ALTER TABLE employees ADD COLUMN social_security_number VARCHAR(50); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='marital_status') THEN ALTER TABLE employees ADD COLUMN marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')); END IF; END $$;

-- Work Info
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='arrival_date') THEN ALTER TABLE employees ADD COLUMN arrival_date DATE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='visa_expiry') THEN ALTER TABLE employees ADD COLUMN visa_expiry DATE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='room_number') THEN ALTER TABLE employees ADD COLUMN room_number VARCHAR(50); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='bank_account') THEN ALTER TABLE employees ADD COLUMN bank_account VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='workplace') THEN ALTER TABLE employees ADD COLUMN workplace VARCHAR(255); END IF; END $$;

-- Address
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_zip') THEN ALTER TABLE employees ADD COLUMN permanent_address_zip VARCHAR(20); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_country') THEN ALTER TABLE employees ADD COLUMN permanent_address_country VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_county') THEN ALTER TABLE employees ADD COLUMN permanent_address_county VARCHAR(100); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_city') THEN ALTER TABLE employees ADD COLUMN permanent_address_city VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_street') THEN ALTER TABLE employees ADD COLUMN permanent_address_street VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='permanent_address_number') THEN ALTER TABLE employees ADD COLUMN permanent_address_number VARCHAR(50); END IF; END $$;

-- Company
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='company_name') THEN ALTER TABLE employees ADD COLUMN company_name VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='company_email') THEN ALTER TABLE employees ADD COLUMN company_email VARCHAR(255); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='company_phone') THEN ALTER TABLE employees ADD COLUMN company_phone VARCHAR(50); END IF; END $$;
