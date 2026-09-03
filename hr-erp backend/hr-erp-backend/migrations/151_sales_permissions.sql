-- 151: a proper `sales.*` permission namespace.
--
-- Phase 3 shipped gated on `settings.edit` — the permission the billing and partner
-- surfaces already used. That is a poor proxy for "may see our pipeline": it conflates
-- someone who configures billing with someone who may read every prospect, expected
-- deal value and win probability we hold.
--
-- The namespace is introduced NOW, and granted to the roles that already had access, so
-- nothing changes for anyone today. The point is the direction of the future change:
-- when real salespeople (and later external agents) arrive, access is narrowed by
-- REMOVING a grant, not by retrofitting a permission namespace into live code and
-- re-testing every route.
--
-- The split is deliberate:
--   sales.view          — see the pipeline (still subject to owner row-scoping)
--   sales.edit          — create / modify leads, opportunities, quotes
--   sales.all.view      — see EVERY owner's rows, not just your own (manager)
--   sales.quotes.accept — accept a quote. Separate because accepting WRITES a contract
--                         and a billing rate: it is a money action, not an edit, and an
--                         external agent must never hold it.
--   sales.assign        — reassign owner_user_id (used from Phase 4)

BEGIN;

INSERT INTO permissions (slug, name, module, description)
VALUES
  ('sales.view',          'Értékesítési pipeline megtekintése', 'sales', 'Érdeklődők, lehetőségek és ajánlatok olvasása (a saját/megosztott sorokra szűrve).'),
  ('sales.edit',          'Értékesítési adatok szerkesztése',   'sales', 'Érdeklődő, lehetőség és ajánlat létrehozása és módosítása.'),
  ('sales.all.view',      'Teljes pipeline látása',             'sales', 'Minden tulajdonos sorai, nem csak a sajátok. Vezetői jog.'),
  ('sales.quotes.accept', 'Ajánlat elfogadása',                 'sales', 'Ajánlat elfogadása — szerződést ÉS éjszakadíjat hoz létre, ezért külön jog.'),
  ('sales.assign',        'Értékesítési tulajdonos átadása',    'sales', 'owner_user_id átállítása másik felhasználóra.')
ON CONFLICT (slug) DO NOTHING;

-- Grant the whole namespace to the roles that already reached these routes via
-- settings.edit, so this migration changes nobody's access on the day it lands.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.slug IN ('superadmin', 'admin')
   AND p.slug LIKE 'sales.%'
ON CONFLICT DO NOTHING;

COMMIT;
