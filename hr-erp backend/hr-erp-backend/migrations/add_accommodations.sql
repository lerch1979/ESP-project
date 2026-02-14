-- Migration: Add Accommodations (Szálláshelyek) module
-- Date: 2026-02-14

-- Szálláshelyek tábla
CREATE TABLE IF NOT EXISTS accommodations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'studio',
    capacity INTEGER NOT NULL DEFAULT 1,
    current_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'available',
    monthly_rent DECIMAL(12, 2),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Szálláshely bérlő történet tábla
CREATE TABLE IF NOT EXISTS accommodation_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    check_in DATE NOT NULL,
    check_out DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexek
CREATE INDEX IF NOT EXISTS idx_accommodations_status ON accommodations(status);
CREATE INDEX IF NOT EXISTS idx_accommodations_type ON accommodations(type);
CREATE INDEX IF NOT EXISTS idx_accommodations_current_tenant ON accommodations(current_tenant_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_tenants_accommodation ON accommodation_tenants(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_tenants_tenant ON accommodation_tenants(tenant_id);

-- Updated_at trigger
CREATE TRIGGER update_accommodations_updated_at BEFORE UPDATE ON accommodations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
