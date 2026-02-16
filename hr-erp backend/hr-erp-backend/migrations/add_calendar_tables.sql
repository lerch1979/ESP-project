-- Migration: Personal Calendar tables
-- Tables: shifts, medical_appointments, personal_events

-- ============================================================
-- 1. Shifts (Műszakok)
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_start_time TIME NOT NULL,
  shift_end_time TIME NOT NULL,
  shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'night', 'full_day')),
  location VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_employee_date ON shifts(employee_id, shift_date);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_shifts_updated_at'
  ) THEN
    CREATE TRIGGER set_shifts_updated_at
      BEFORE UPDATE ON shifts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 2. Medical Appointments (Orvosi vizsgálatok)
-- ============================================================
CREATE TABLE IF NOT EXISTS medical_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME,
  doctor_name VARCHAR(255),
  clinic_location VARCHAR(255),
  appointment_type VARCHAR(20) NOT NULL CHECK (appointment_type IN ('general', 'specialist', 'emergency', 'dental', 'eye', 'other')),
  notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_appointments_employee_date ON medical_appointments(employee_id, appointment_date);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_medical_appointments_updated_at'
  ) THEN
    CREATE TRIGGER set_medical_appointments_updated_at
      BEFORE UPDATE ON medical_appointments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 3. Personal Events (Személyes események)
-- ============================================================
CREATE TABLE IF NOT EXISTS personal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('birthday', 'meeting', 'reminder', 'holiday', 'other')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_events_employee_date ON personal_events(employee_id, event_date);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_personal_events_updated_at'
  ) THEN
    CREATE TRIGGER set_personal_events_updated_at
      BEFORE UPDATE ON personal_events
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
