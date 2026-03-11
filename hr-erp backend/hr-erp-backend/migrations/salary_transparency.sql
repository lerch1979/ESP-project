-- Migration: Salary Transparency (Bértranszparencia) modul
-- Datum: 2026-03-11

-- ============================================
-- 1. Salary Bands (Bérsávok) tábla
-- ============================================
CREATE TABLE IF NOT EXISTS salary_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  level VARCHAR(50) CHECK (level IN ('junior', 'medior', 'senior', 'lead', 'manager', 'director')),
  min_salary NUMERIC(12,2) NOT NULL,
  max_salary NUMERIC(12,2) NOT NULL,
  median_salary NUMERIC(12,2),
  currency VARCHAR(10) DEFAULT 'HUF',
  employment_type VARCHAR(50) DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract')),
  location VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================
-- 2. Employee Salaries (Munkavállalói bérek) tábla
-- ============================================
CREATE TABLE IF NOT EXISTS employee_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  gross_salary NUMERIC(12,2) NOT NULL,
  net_salary NUMERIC(12,2),
  currency VARCHAR(10) DEFAULT 'HUF',
  salary_band_id UUID REFERENCES salary_bands(id),
  effective_date DATE NOT NULL,
  end_date DATE,
  change_reason VARCHAR(255),
  change_type VARCHAR(50) CHECK (change_type IN ('initial', 'raise', 'promotion', 'adjustment', 'demotion', 'annual_review')),
  approved_by UUID REFERENCES users(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================
-- 3. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_salary_bands_department ON salary_bands(department);
CREATE INDEX IF NOT EXISTS idx_salary_bands_position ON salary_bands(position_name);
CREATE INDEX IF NOT EXISTS idx_salary_bands_level ON salary_bands(level);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee ON employee_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_band ON employee_salaries(salary_band_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_effective ON employee_salaries(effective_date);
