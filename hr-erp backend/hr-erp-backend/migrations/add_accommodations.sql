-- Migration: Add Accommodations (Szálláshelyek) module
-- Date: 2026-02-14

-- Szálláshelyek tábla
CREATE TABLE IF NOT EXISTS accommodations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'studio',
    capacity INTEGER NOT NULL DEFAULT 1,
    current_contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'available',
    monthly_rent DECIMAL(12, 2),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Szálláshely bérlő történet tábla
CREATE TABLE IF NOT EXISTS accommodation_contractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    check_in DATE NOT NULL,
    check_out DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexek
CREATE INDEX IF NOT EXISTS idx_accommodations_status ON accommodations(status);
CREATE INDEX IF NOT EXISTS idx_accommodations_type ON accommodations(type);
CREATE INDEX IF NOT EXISTS idx_accommodations_current_contractor ON accommodations(current_contractor_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_contractors_accommodation ON accommodation_contractors(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_contractors_contractor ON accommodation_contractors(contractor_id);

-- Updated_at trigger (only if not exists)
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_accommodations_updated_at') THEN
CREATE TRIGGER update_accommodations_updated_at BEFORE UPDATE ON accommodations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END IF;
END $$;
