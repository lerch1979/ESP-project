-- Accommodation rooms table for room-level tracking
-- Run: psql -U postgres -d hr_erp_db -f migrations/add_accommodation_rooms.sql

-- Accommodation rooms table
CREATE TABLE IF NOT EXISTS accommodation_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_number VARCHAR(20) NOT NULL,
  floor INTEGER,
  beds INTEGER NOT NULL DEFAULT 1,
  room_type VARCHAR(50) DEFAULT 'standard',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(accommodation_id, room_number)
);

-- Add room_id FK to employees
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'room_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN room_id UUID REFERENCES accommodation_rooms(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accommodation_rooms_accommodation ON accommodation_rooms(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_employees_room_id ON employees(room_id);

-- Trigger for updated_at auto-update
CREATE OR REPLACE FUNCTION update_accommodation_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accommodation_rooms_updated_at ON accommodation_rooms;
CREATE TRIGGER trigger_accommodation_rooms_updated_at
  BEFORE UPDATE ON accommodation_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_accommodation_rooms_updated_at();
