-- Migration: Employees (Szállásolt munkavállalók) modul
-- Dátum: 2026-02-14

-- 1. employee_status_types tábla létrehozása (ha nem létezik)
CREATE TABLE IF NOT EXISTS employee_status_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7)
);

-- Státuszok beszúrása (ha még nincsenek)
INSERT INTO employee_status_types (name, slug, description, color) VALUES
('Aktív', 'active', 'Aktív munkaviszony', '#10b981'),
('Fizetett szabadságon', 'paid_leave', 'Fizetett szabadság', '#3b82f6'),
('Fizetés nélküli szabadságon', 'unpaid_leave', 'Fizetés nélküli szabadság', '#f59e0b'),
('Felfüggesztve', 'suspended', 'Felfüggesztett státusz', '#f97316'),
('Kilépett', 'left', 'Megszűnt munkaviszony', '#ef4444'),
('Várakozó', 'waiting', 'Várakozó státusz', '#94a3b8')
ON CONFLICT (slug) DO NOTHING;

-- 2. employees tábla létrehozása (ha nem létezik)
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organizational_unit_id UUID REFERENCES organizational_units(id) ON DELETE SET NULL,
    employee_number VARCHAR(50),
    status_id UUID REFERENCES employee_status_types(id),
    position VARCHAR(255),
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on employee_number per tenant (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_employee_number'
    ) THEN
        ALTER TABLE employees ADD CONSTRAINT unique_employee_number UNIQUE (tenant_id, employee_number);
    END IF;
END
$$;

-- 3. accommodation_id oszlop hozzáadása az employees táblához
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'employees' AND column_name = 'accommodation_id'
    ) THEN
        ALTER TABLE employees ADD COLUMN accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- 4. Indexek
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status_id);
CREATE INDEX IF NOT EXISTS idx_employees_accommodation ON employees(accommodation_id);

-- 5. updated_at trigger (ha nem létezik)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_employees_updated_at'
    ) THEN
        CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- 6. Seed: employee rekordok a 4 meglévő accommodated_employee felhasználóhoz
INSERT INTO employees (user_id, tenant_id, employee_number, status_id, position, start_date)
SELECT
    u.id,
    u.tenant_id,
    'EMP-' || LPAD(ROW_NUMBER() OVER (ORDER BY u.created_at)::text, 4, '0'),
    (SELECT id FROM employee_status_types WHERE slug = 'active'),
    'Szállásolt munkavállaló',
    CURRENT_DATE
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id AND r.slug = 'accommodated_employee'
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.user_id = u.id
);
