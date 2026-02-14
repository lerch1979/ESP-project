-- ============================================
-- Migration: Rename Tenants → Contractors
-- Alvállalkozók (Contractors) rename
-- ============================================

BEGIN;

-- 1. Rename tables
ALTER TABLE tenants RENAME TO contractors;
ALTER TABLE accommodation_tenants RENAME TO accommodation_contractors;

-- 2. Rename columns across all tables
ALTER TABLE users RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE employees RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE tickets RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE user_roles RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE organizational_units RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE ticket_categories RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE notifications RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE email_logs RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE cost_centers RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE projects RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE notification_templates RENAME COLUMN tenant_id TO contractor_id;
ALTER TABLE accommodations RENAME COLUMN current_tenant_id TO current_contractor_id;
ALTER TABLE accommodation_contractors RENAME COLUMN tenant_id TO contractor_id;

-- 3. Rename indexes (IF EXISTS for safety)
ALTER INDEX IF EXISTS idx_tenants_slug RENAME TO idx_contractors_slug;
ALTER INDEX IF EXISTS idx_tenants_is_active RENAME TO idx_contractors_is_active;
ALTER INDEX IF EXISTS idx_users_tenant_id RENAME TO idx_users_contractor_id;
ALTER INDEX IF EXISTS idx_tickets_tenant_id RENAME TO idx_tickets_contractor_id;
ALTER INDEX IF EXISTS idx_employees_tenant_id RENAME TO idx_employees_contractor_id;
ALTER INDEX IF EXISTS idx_user_roles_tenant_id RENAME TO idx_user_roles_contractor_id;
ALTER INDEX IF EXISTS idx_accommodation_tenants_accommodation_id RENAME TO idx_accommodation_contractors_accommodation_id;
ALTER INDEX IF EXISTS idx_accommodation_tenants_tenant_id RENAME TO idx_accommodation_contractors_contractor_id;
ALTER INDEX IF EXISTS idx_accommodations_current_tenant_id RENAME TO idx_accommodations_current_contractor_id;
ALTER INDEX IF EXISTS idx_ticket_categories_tenant_id RENAME TO idx_ticket_categories_contractor_id;
ALTER INDEX IF EXISTS idx_notifications_tenant_id RENAME TO idx_notifications_contractor_id;
ALTER INDEX IF EXISTS idx_email_logs_tenant_id RENAME TO idx_email_logs_contractor_id;
ALTER INDEX IF EXISTS idx_cost_centers_tenant_id RENAME TO idx_cost_centers_contractor_id;
ALTER INDEX IF EXISTS idx_projects_tenant_id RENAME TO idx_projects_contractor_id;
ALTER INDEX IF EXISTS idx_notification_templates_tenant_id RENAME TO idx_notification_templates_contractor_id;
ALTER INDEX IF EXISTS idx_organizational_units_tenant_id RENAME TO idx_organizational_units_contractor_id;

-- 4. Rename FK constraints (drop + re-add for safety)
-- users.contractor_id → contractors
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_tenant;
ALTER TABLE users ADD CONSTRAINT fk_users_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- tickets.contractor_id → contractors
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS fk_tickets_tenant;
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- employees.contractor_id → contractors
ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_tenant;
ALTER TABLE employees ADD CONSTRAINT fk_employees_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- user_roles.contractor_id → contractors
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS fk_user_roles_tenant;
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- organizational_units.contractor_id → contractors
ALTER TABLE organizational_units DROP CONSTRAINT IF EXISTS fk_organizational_units_tenant;
ALTER TABLE organizational_units ADD CONSTRAINT fk_organizational_units_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- ticket_categories.contractor_id → contractors
ALTER TABLE ticket_categories DROP CONSTRAINT IF EXISTS fk_ticket_categories_tenant;
ALTER TABLE ticket_categories ADD CONSTRAINT fk_ticket_categories_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- notifications.contractor_id → contractors
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_tenant;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- email_logs.contractor_id → contractors
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS fk_email_logs_tenant;
ALTER TABLE email_logs ADD CONSTRAINT fk_email_logs_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- cost_centers.contractor_id → contractors
ALTER TABLE cost_centers DROP CONSTRAINT IF EXISTS fk_cost_centers_tenant;
ALTER TABLE cost_centers ADD CONSTRAINT fk_cost_centers_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- projects.contractor_id → contractors
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_tenant;
ALTER TABLE projects ADD CONSTRAINT fk_projects_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- notification_templates.contractor_id → contractors
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS fk_notification_templates_tenant;
ALTER TABLE notification_templates ADD CONSTRAINT fk_notification_templates_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- accommodations.current_contractor_id → contractors
ALTER TABLE accommodations DROP CONSTRAINT IF EXISTS fk_accommodations_current_tenant;
ALTER TABLE accommodations ADD CONSTRAINT fk_accommodations_current_contractor
  FOREIGN KEY (current_contractor_id) REFERENCES contractors(id);

-- accommodation_contractors.contractor_id → contractors
ALTER TABLE accommodation_contractors DROP CONSTRAINT IF EXISTS fk_accommodation_tenants_tenant;
ALTER TABLE accommodation_contractors ADD CONSTRAINT fk_accommodation_contractors_contractor
  FOREIGN KEY (contractor_id) REFERENCES contractors(id);

-- accommodation_contractors.accommodation_id → accommodations
ALTER TABLE accommodation_contractors DROP CONSTRAINT IF EXISTS fk_accommodation_tenants_accommodation;
ALTER TABLE accommodation_contractors ADD CONSTRAINT fk_accommodation_contractors_accommodation
  FOREIGN KEY (accommodation_id) REFERENCES accommodations(id);

-- 5. Rename unique constraint on contractors.slug
ALTER INDEX IF EXISTS tenants_slug_key RENAME TO contractors_slug_key;

-- 6. Rename unique constraint on ticket_categories (slug, contractor_id)
ALTER INDEX IF EXISTS unique_category_slug_per_tenant RENAME TO unique_category_slug_per_contractor;

COMMIT;
