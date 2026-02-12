-- HR-ERP Rendszer Adatbázis Séma
-- PostgreSQL 16+
-- Verzió: 1.0
-- Dátum: 2024-02-09

-- Engedélyezzük a UUID generálást
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES - Alapvető rendszer táblák
-- ============================================

-- Megbízó cégek (Multi-tenant)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Szerepkörök
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false, -- Rendszer szerepkör (nem törölhető)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jogosultságok
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL, -- pl: tickets, users, finance
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Szerepkör-jogosultság kapcsolótábla
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Felhasználók
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_email_per_tenant UNIQUE (tenant_id, email)
);

-- Felhasználó-szerepkör kapcsolótábla
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id, tenant_id)
);

-- ============================================
-- HR MODUL
-- ============================================

-- Szervezeti egységek
CREATE TABLE organizational_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES organizational_units(id) ON DELETE SET NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Munkavállalói státuszok (lookup table)
CREATE TABLE employee_status_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) -- Hex szín kód (pl: #10b981)
);

-- Munkavállalók
CREATE TABLE employees (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_number UNIQUE (tenant_id, employee_number)
);

-- Dokumentumok
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER, -- bytes
    mime_type VARCHAR(100),
    document_type VARCHAR(100), -- pl: contract, certificate, id_card
    is_private BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TICKETING MODUL
-- ============================================

-- Ticket kategóriák
CREATE TABLE ticket_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_category_slug UNIQUE (tenant_id, slug)
);

-- Ticket státuszok
CREATE TABLE ticket_statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7),
    order_index INTEGER DEFAULT 0,
    is_final BOOLEAN DEFAULT false, -- Végső státusz (lezárt)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prioritások
CREATE TABLE priorities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    level INTEGER NOT NULL, -- 1=alacsony, 2=normál, 3=sürgős, 4=kritikus
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticketek
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    status_id UUID REFERENCES ticket_statuses(id) ON DELETE SET NULL,
    priority_id UUID REFERENCES priorities(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket megjegyzések
CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false, -- Belső megjegyzés (csak adminok látják)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket csatolmányok
CREATE TABLE ticket_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES ticket_comments(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket történet (audit log)
CREATE TABLE ticket_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- created, status_changed, assigned, commented, etc.
    field_name VARCHAR(100), -- Melyik mező változott
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- KOMMUNIKÁCIÓ MODUL
-- ============================================

-- Értesítési sablonok
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    subject VARCHAR(500),
    body_html TEXT,
    body_text TEXT,
    event_type VARCHAR(100) NOT NULL, -- ticket_created, status_changed, etc.
    language VARCHAR(5) DEFAULT 'hu',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_template_slug UNIQUE (tenant_id, slug, language)
);

-- Értesítések
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- email, push, sms, in_app
    title VARCHAR(255),
    message TEXT NOT NULL,
    data JSONB, -- További adatok (pl: ticket_id, link, stb.)
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email küldési napló
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    status VARCHAR(50) NOT NULL, -- pending, sent, failed, bounced
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PÉNZÜGYI MODUL (Alapok)
-- ============================================

-- Költséghelyek
CREATE TABLE cost_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cost_center_code UNIQUE (tenant_id, code)
);

-- Projektek
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_date DATE,
    end_date DATE,
    budget DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_project_code UNIQUE (tenant_id, code)
);

-- ============================================
-- INDEXEK ÉS OPTIMALIZÁLÁS
-- ============================================

-- Tenant ID indexek (multi-tenant lekérdezésekhez)
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);

-- Email keresés
CREATE INDEX idx_users_email ON users(email);

-- Ticket keresések
CREATE INDEX idx_tickets_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_status ON tickets(status_id);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);

-- Értesítések
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- INITIAL DATA (Alapvető adatok)
-- ============================================

-- Szerepkörök
INSERT INTO roles (name, slug, description, is_system) VALUES
('Szuperadmin', 'superadmin', 'Teljes rendszer hozzáférés', true),
('Megbízó (Adatkezelő)', 'data_controller', 'Saját cég teljes adatkezelése', true),
('Általános Adminisztrátor', 'admin', 'HR és ticket kezelés', true),
('Feladat-felelős', 'task_owner', 'Ticketek kezelése', true),
('Külső Alvállalkozó', 'contractor', 'Korlátozott ticket hozzáférés', true),
('Felhasználó', 'user', 'Alapvető felhasználói jogok', true);

-- Munkavállalói státuszok
INSERT INTO employee_status_types (name, slug, description, color) VALUES
('Aktív', 'active', 'Aktív munkaviszony', '#10b981'),
('Szabadságon (fizetett)', 'paid_leave', 'Fizetett szabadság', '#3b82f6'),
('Szabadságon (fizetés nélküli)', 'unpaid_leave', 'Fizetés nélküli szabadság', '#f59e0b'),
('Szüneteltetett', 'suspended', 'Szüneteltetett munkaviszony', '#94a3b8'),
('Kilépett', 'left', 'Megszűnt munkaviszony', '#ef4444'),
('Felfüggesztett', 'on_hold', 'Felfüggesztett státusz', '#f97316');

-- Ticket státuszok
INSERT INTO ticket_statuses (name, slug, description, color, order_index, is_final) VALUES
('Új (feldolgozásra vár)', 'new', 'Új bejelentés', '#3b82f6', 1, false),
('Folyamatban', 'in_progress', 'Aktív feldolgozás', '#f59e0b', 2, false),
('Anyagra várunk', 'waiting_material', 'Beszerzés folyamatban', '#ec4899', 3, false),
('Számlázás folyamatban', 'invoicing', 'Számlázási folyamat', '#8b5cf6', 4, false),
('Pénzügyi teljesítés folyamatban', 'payment_pending', 'Fizetésre vár', '#f59e0b', 5, false),
('Várakozik', 'waiting', 'Egyéb ok miatt várakozik', '#94a3b8', 6, false),
('Továbbítva másik területnek', 'transferred', 'Átadva más területnek', '#06b6d4', 7, false),
('Sikeresen lezárva', 'completed', 'Sikeresen befejezve', '#10b981', 8, true),
('Elutasítva', 'rejected', 'Elutasított kérés', '#ef4444', 9, true),
('Nem megvalósítható', 'not_feasible', 'Nem kivitelezhető', '#6b7280', 10, true);

-- Prioritások
INSERT INTO priorities (name, slug, level, color) VALUES
('Alacsony', 'low', 1, '#10b981'),
('Normál', 'normal', 2, '#64748b'),
('Sürgős', 'urgent', 3, '#f59e0b'),
('Kritikus', 'critical', 4, '#ef4444');

-- ============================================
-- AUDIT TRIGGER FÜGGVÉNYEK
-- ============================================

-- Updated_at automatikus frissítése
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggerek létrehozása
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizational_units_updated_at BEFORE UPDATE ON organizational_units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- KOMMENTEK
-- ============================================

COMMENT ON TABLE tenants IS 'Megbízó cégek (multi-tenant architektúra)';
COMMENT ON TABLE users IS 'Összes felhasználó (minden tenant)';
COMMENT ON TABLE roles IS 'Szerepkörök a jogosultságkezeléshez';
COMMENT ON TABLE tickets IS 'Hibajegyek / bejelentések';
COMMENT ON TABLE ticket_history IS 'Teljes audit log minden ticket módosításról';
COMMENT ON TABLE notifications IS 'Összes értesítés (push, email, in-app)';
