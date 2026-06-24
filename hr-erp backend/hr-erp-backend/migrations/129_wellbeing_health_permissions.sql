-- Migration 129: lock down WellMind + CarePath + Wellbeing (GDPR Art 9 health
-- data) behind explicit permissions, and close a parallel documents leak.
--
-- WHY: the /wellmind, /carepath and /wellbeing APIs expose the highest-
-- sensitivity data we hold (mood pulses, burnout/mental-health assessments,
-- EAP counseling cases, conflict & predictive analytics). Audit findings:
--   1. /wellbeing/admin/* had NO gate at all — any authenticated user (incl.
--      a resident) could read cross-employee mental-health analytics, and the
--      handlers honoured a caller-supplied ?contractorId, so the leak crossed
--      contractor/tenant boundaries.
--   2. The self-service endpoints required only authentication, so residents
--      could reach a hidden, not-yet-launched health programme.
--   3. The /wellmind & /carepath admin/provider gates referenced permission
--      slugs (blue_colibri.*, eap.*) that were never defined — so they denied
--      everyone except superadmin by accident, and real HR/admins couldn't use
--      them. This migration defines those slugs for real.
--   4. SEPARATE pattern: the staff /documents API was reachable by residents
--      (accommodated_employee held documents.view) and returned any employee's
--      files (incl. medical) with no ownership scoping. Remove that grant here;
--      the controller adds self-scoping for non-staff in the same change.
--
-- Model (confirmed with product owner): residents get NOTHING (403 across the
-- board). Self-service (wellbeing.self) and the health-analytics tier go to
-- admin + data_controller only while the programme is dormant; the per-employee
-- self grant is added explicitly at launch. EAP provider slugs stay unassigned
-- (external counselors, granted per-user). superadmin bypasses via role.

BEGIN;

-- 1. Define the permission slugs the routers reference (and the new ones).
--    Idempotent via NOT EXISTS (the permissions table's slug column has no
--    guaranteed UNIQUE constraint in this schema, so we don't use ON CONFLICT).
INSERT INTO permissions (name, slug, module, action, display_name, description)
SELECT v.name, v.slug, v.module, v.action, v.display_name, v.description
FROM (VALUES
  ('Jóllét önkiszolgáló', 'wellbeing.self', 'wellbeing', 'self',
   'Jóllét önkiszolgáló', 'Saját jólléti/egészségügyi adatok kezelése (pulzus, kérdőív, EAP eset, foglalás)'),

  ('WellMind admin megtekintés', 'blue_colibri.admin.view', 'wellbeing', 'admin_view',
   'WellMind admin megtekintés', 'Szervezeti jólléti elemzések és kockázati adatok megtekintése'),
  ('WellMind admin kezelés', 'blue_colibri.admin.manage', 'wellbeing', 'admin_manage',
   'WellMind admin kezelés', 'Jólléti kérdések, beavatkozások és kockázati kezelés'),
  ('WellMind csapat megtekintés', 'blue_colibri.team.view', 'wellbeing', 'team_view',
   'WellMind csapat megtekintés', 'Csapatszintű (aggregált) jólléti mutatók megtekintése'),

  ('EAP statisztikák', 'eap.admin.stats', 'wellbeing', 'eap_stats',
   'EAP statisztikák', 'EAP (CarePath) használati statisztikák megtekintése'),
  ('EAP szolgáltatók kezelése', 'eap.providers.manage', 'wellbeing', 'eap_providers',
   'EAP szolgáltatók kezelése', 'EAP szolgáltatók létrehozása és szerkesztése'),
  ('EAP szolgáltatói munkamenet', 'eap.provider.sessions', 'wellbeing', 'eap_provider_sessions',
   'EAP szolgáltatói munkamenet', 'EAP szolgáltató: esetek és munkamenetek rögzítése'),

  ('Jóllét admin megtekintés', 'wellbeing.admin.view', 'wellbeing', 'wb_admin_view',
   'Jóllét admin megtekintés', 'Konfliktus- és prediktív jólléti elemzések megtekintése'),
  ('Jóllét admin kezelés', 'wellbeing.admin.manage', 'wellbeing', 'wb_admin_manage',
   'Jóllét admin kezelés', 'Jólléti kérdésrotáció és admin beállítások kezelése')
) AS v(name, slug, module, action, display_name, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.slug = v.slug);

-- 2. Grant the new permissions to the appropriate roles.
DO $$
DECLARE
    v_role_id UUID;
BEGIN
    -- superadmin: all new slugs (the role also bypasses checkPermission, but
    -- keep the grants consistent with the rest of the table).
    SELECT id INTO v_role_id FROM roles WHERE slug = 'superadmin';
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE slug IN ('wellbeing.self',
                       'blue_colibri.admin.view','blue_colibri.admin.manage','blue_colibri.team.view',
                       'eap.admin.stats','eap.providers.manage','eap.provider.sessions',
                       'wellbeing.admin.view','wellbeing.admin.manage')
        ON CONFLICT DO NOTHING;
    END IF;

    -- admin + data_controller: self-service + the health-analytics tier.
    -- NOT eap.provider.sessions (that is for external EAP counselors only).
    FOR v_role_id IN
        SELECT id FROM roles WHERE slug IN ('admin', 'data_controller')
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE slug IN ('wellbeing.self',
                       'blue_colibri.admin.view','blue_colibri.admin.manage','blue_colibri.team.view',
                       'eap.admin.stats','eap.providers.manage',
                       'wellbeing.admin.view','wellbeing.admin.manage')
        ON CONFLICT DO NOTHING;
    END LOOP;
END$$;

-- 3. Close the documents leak: residents (accommodated_employee) must not hold
--    documents.view — they read their own data through the residentSelf API,
--    never the staff /documents endpoints. (Controller self-scoping is added in
--    the same change as defense-in-depth.)
DELETE FROM role_permissions
WHERE role_id       = (SELECT id FROM roles       WHERE slug = 'accommodated_employee')
  AND permission_id = (SELECT id FROM permissions WHERE slug = 'documents.view');

COMMIT;
