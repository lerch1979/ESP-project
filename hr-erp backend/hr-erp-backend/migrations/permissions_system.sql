-- ============================================
-- PERMISSIONS SYSTEM MIGRATION
-- Creates user_permissions table, seeds all permissions,
-- and assigns role_permissions mappings
-- ============================================

-- 1. Create user_permissions table (user-level permission overrides)
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT TRUE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id);

-- 2. Ensure permissions table has display_name and action columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'display_name') THEN
        ALTER TABLE permissions ADD COLUMN display_name VARCHAR(200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'action') THEN
        ALTER TABLE permissions ADD COLUMN action VARCHAR(50);
    END IF;
END$$;

-- 3. Seed all permissions
-- Clear existing permissions and role_permissions to avoid conflicts
DELETE FROM role_permissions;
DELETE FROM permissions;

-- Employees module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Munkavállalók megtekintése', 'employees.view', 'employees', 'view', 'Munkavállalók megtekintése', 'Munkavállalók listájának és részleteinek megtekintése'),
('Munkavállaló létrehozása', 'employees.create', 'employees', 'create', 'Munkavállaló létrehozása', 'Új munkavállaló hozzáadása a rendszerhez'),
('Munkavállaló szerkesztése', 'employees.edit', 'employees', 'edit', 'Munkavállaló szerkesztése', 'Meglévő munkavállaló adatainak módosítása'),
('Munkavállaló törlése', 'employees.delete', 'employees', 'delete', 'Munkavállaló törlése', 'Munkavállaló eltávolítása a rendszerből'),
('Munkavállalók exportálása', 'employees.export', 'employees', 'export', 'Munkavállalók exportálása', 'Munkavállalók adatainak exportálása fájlba'),
('Munkavállaló dokumentum feltöltés', 'employees.upload_documents', 'employees', 'upload_documents', 'Dokumentum feltöltés', 'Dokumentumok feltöltése munkavállalókhoz');

-- Tickets module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Hibajegyek megtekintése', 'tickets.view', 'tickets', 'view', 'Hibajegyek megtekintése', 'Hibajegyek listájának és részleteinek megtekintése'),
('Hibajegy létrehozása', 'tickets.create', 'tickets', 'create', 'Hibajegy létrehozása', 'Új hibajegy létrehozása'),
('Hibajegy szerkesztése', 'tickets.edit', 'tickets', 'edit', 'Hibajegy szerkesztése', 'Meglévő hibajegy módosítása'),
('Hibajegy törlése', 'tickets.delete', 'tickets', 'delete', 'Hibajegy törlése', 'Hibajegy eltávolítása'),
('Hibajegy kiosztása', 'tickets.assign', 'tickets', 'assign', 'Hibajegy kiosztása', 'Hibajegy hozzárendelése felhasználóhoz'),
('Hibajegy státusz változtatás', 'tickets.change_status', 'tickets', 'change_status', 'Státusz változtatás', 'Hibajegy státuszának módosítása');

-- Accommodations module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Szálláshelyek megtekintése', 'accommodations.view', 'accommodations', 'view', 'Szálláshelyek megtekintése', 'Szálláshelyek listájának és részleteinek megtekintése'),
('Szálláshely létrehozása', 'accommodations.create', 'accommodations', 'create', 'Szálláshely létrehozása', 'Új szálláshely hozzáadása'),
('Szálláshely szerkesztése', 'accommodations.edit', 'accommodations', 'edit', 'Szálláshely szerkesztése', 'Meglévő szálláshely módosítása'),
('Szálláshely törlése', 'accommodations.delete', 'accommodations', 'delete', 'Szálláshely törlése', 'Szálláshely eltávolítása');

-- Reports module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Riportok megtekintése', 'reports.view', 'reports', 'view', 'Riportok megtekintése', 'Riportok megtekintése és futtatása'),
('Riport létrehozása', 'reports.create', 'reports', 'create', 'Riport létrehozása', 'Új egyedi riport létrehozása'),
('Riport exportálása', 'reports.export', 'reports', 'export', 'Riport exportálása', 'Riportok exportálása fájlba'),
('Riport ütemezése', 'reports.schedule', 'reports', 'schedule', 'Riport ütemezése', 'Automatikus riport ütemezés beállítása');

-- Users module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Felhasználók megtekintése', 'users.view', 'users', 'view', 'Felhasználók megtekintése', 'Felhasználók listájának megtekintése'),
('Felhasználó létrehozása', 'users.create', 'users', 'create', 'Felhasználó létrehozása', 'Új felhasználó regisztrálása'),
('Felhasználó szerkesztése', 'users.edit', 'users', 'edit', 'Felhasználó szerkesztése', 'Felhasználó adatainak módosítása'),
('Felhasználó törlése', 'users.delete', 'users', 'delete', 'Felhasználó törlése', 'Felhasználó eltávolítása'),
('Jogosultság kezelés', 'users.manage_permissions', 'users', 'manage_permissions', 'Jogosultság kezelés', 'Felhasználói jogosultságok és szerepkörök kezelése');

-- Settings module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Beállítások megtekintése', 'settings.view', 'settings', 'view', 'Beállítások megtekintése', 'Rendszer beállítások megtekintése'),
('Beállítások szerkesztése', 'settings.edit', 'settings', 'edit', 'Beállítások szerkesztése', 'Rendszer beállítások módosítása');

-- Dashboard module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Dashboard megtekintése', 'dashboard.view', 'dashboard', 'view', 'Dashboard megtekintése', 'Irányítópult megtekintése'),
('Dashboard testreszabás', 'dashboard.customize', 'dashboard', 'customize', 'Dashboard testreszabás', 'Irányítópult elrendezésének módosítása');

-- Documents module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Dokumentumok megtekintése', 'documents.view', 'documents', 'view', 'Dokumentumok megtekintése', 'Dokumentumok listájának megtekintése és letöltése'),
('Dokumentum feltöltése', 'documents.upload', 'documents', 'upload', 'Dokumentum feltöltése', 'Új dokumentum feltöltése'),
('Dokumentum törlése', 'documents.delete', 'documents', 'delete', 'Dokumentum törlése', 'Dokumentum eltávolítása');

-- Calendar module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Naptár megtekintése', 'calendar.view', 'calendar', 'view', 'Naptár megtekintése', 'Naptár események megtekintése'),
('Naptár esemény létrehozása', 'calendar.create', 'calendar', 'create', 'Esemény létrehozása', 'Új naptár esemény létrehozása'),
('Naptár esemény szerkesztése', 'calendar.edit', 'calendar', 'edit', 'Esemény szerkesztése', 'Naptár esemény módosítása'),
('Naptár esemény törlése', 'calendar.delete', 'calendar', 'delete', 'Esemény törlése', 'Naptár esemény eltávolítása'),
('Google naptár szinkronizálás', 'calendar.sync_google', 'calendar', 'sync_google', 'Google szinkron', 'Google naptár szinkronizálás kezelése');

-- Videos module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('Videók megtekintése', 'videos.view', 'videos', 'view', 'Videók megtekintése', 'Oktatóvideók megtekintése'),
('Videó létrehozása', 'videos.create', 'videos', 'create', 'Videó létrehozása', 'Új oktatóvideó hozzáadása'),
('Videó szerkesztése', 'videos.edit', 'videos', 'edit', 'Videó szerkesztése', 'Oktatóvideó módosítása'),
('Videó törlése', 'videos.delete', 'videos', 'delete', 'Videó törlése', 'Oktatóvideó eltávolítása');

-- FAQ module
INSERT INTO permissions (name, slug, module, action, display_name, description) VALUES
('FAQ megtekintése', 'faq.view', 'faq', 'view', 'FAQ megtekintése', 'GYIK bejegyzések megtekintése'),
('FAQ szerkesztése', 'faq.edit', 'faq', 'edit', 'FAQ szerkesztése', 'GYIK bejegyzések szerkesztése'),
('FAQ videók kezelése', 'faq.manage_videos', 'faq', 'manage_videos', 'FAQ videók kezelése', 'FAQ-hoz kapcsolódó videók kezelése');

-- 4. Assign permissions to roles

-- Helper function to assign permissions to a role
DO $$
DECLARE
    v_superadmin_id UUID;
    v_data_controller_id UUID;
    v_admin_id UUID;
    v_task_owner_id UUID;
    v_contractor_id UUID;
    v_user_id UUID;
    v_accommodated_employee_id UUID;
    v_perm RECORD;
BEGIN
    -- Get role IDs
    SELECT id INTO v_superadmin_id FROM roles WHERE slug = 'superadmin';
    SELECT id INTO v_data_controller_id FROM roles WHERE slug = 'data_controller';
    SELECT id INTO v_admin_id FROM roles WHERE slug = 'admin';
    SELECT id INTO v_task_owner_id FROM roles WHERE slug = 'task_owner';
    SELECT id INTO v_contractor_id FROM roles WHERE slug = 'contractor';
    SELECT id INTO v_user_id FROM roles WHERE slug = 'user';
    SELECT id INTO v_accommodated_employee_id FROM roles WHERE slug = 'accommodated_employee';

    -- SUPERADMIN: All permissions
    IF v_superadmin_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_superadmin_id, id FROM permissions
        ON CONFLICT DO NOTHING;
    END IF;

    -- DATA_CONTROLLER (Admin level): All except users.manage_permissions
    IF v_data_controller_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_data_controller_id, id FROM permissions
        WHERE slug != 'users.manage_permissions'
        ON CONFLICT DO NOTHING;
    END IF;

    -- ADMIN (Manager level): View all + edit most things, no user/permission management
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_admin_id, id FROM permissions
        WHERE slug IN (
            -- Employees: full CRUD
            'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
            'employees.export', 'employees.upload_documents',
            -- Tickets: full CRUD
            'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.change_status',
            -- Accommodations: full CRUD
            'accommodations.view', 'accommodations.create', 'accommodations.edit', 'accommodations.delete',
            -- Reports: view and export
            'reports.view', 'reports.export',
            -- Users: view only
            'users.view',
            -- Dashboard
            'dashboard.view', 'dashboard.customize',
            -- Documents: full
            'documents.view', 'documents.upload', 'documents.delete',
            -- Calendar: full
            'calendar.view', 'calendar.create', 'calendar.edit', 'calendar.delete',
            -- Videos: full
            'videos.view', 'videos.create', 'videos.edit', 'videos.delete',
            -- FAQ: full
            'faq.view', 'faq.edit', 'faq.manage_videos',
            -- Settings: view
            'settings.view'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- TASK_OWNER: Tickets + limited view access
    IF v_task_owner_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_task_owner_id, id FROM permissions
        WHERE slug IN (
            'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.change_status',
            'employees.view',
            'accommodations.view',
            'dashboard.view',
            'calendar.view', 'calendar.create', 'calendar.edit', 'calendar.delete',
            'documents.view',
            'videos.view',
            'faq.view'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- CONTRACTOR: Very limited - view assigned tickets only
    IF v_contractor_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_contractor_id, id FROM permissions
        WHERE slug IN (
            'tickets.view', 'tickets.change_status',
            'dashboard.view',
            'faq.view'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- USER (Employee level): View only access
    IF v_user_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_user_id, id FROM permissions
        WHERE slug IN (
            'tickets.view', 'tickets.create',
            'dashboard.view',
            'calendar.view', 'calendar.create', 'calendar.edit', 'calendar.delete',
            'documents.view',
            'videos.view',
            'faq.view'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- ACCOMMODATED_EMPLOYEE: Same as user
    IF v_accommodated_employee_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_accommodated_employee_id, id FROM permissions
        WHERE slug IN (
            'tickets.view', 'tickets.create',
            'dashboard.view',
            'calendar.view', 'calendar.create', 'calendar.edit', 'calendar.delete',
            'documents.view',
            'videos.view',
            'faq.view'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Permission assignments completed successfully';
END$$;
