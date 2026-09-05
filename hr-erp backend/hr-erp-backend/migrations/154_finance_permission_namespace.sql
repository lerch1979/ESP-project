-- 154: split `finance.*` out of `settings.*`, and disarm the "Megbízó" role trap.
--
-- WHY finance.* HAS TO EXIST
-- --------------------------
-- Every money surface in the system — billing, profit, salary, invoices, expenses,
-- compensations, fines, cost centres, operating costs, settlement sheets, accountant
-- shares: eighteen route files — is guarded by `settings.view` / `settings.edit`. That
-- same permission opens the partner module and the rate editor.
--
-- So "a szállásfelelős sees no financial data" is not expressible today: the only way to
-- keep them out of billing is to keep them out of settings, and the only way to let them
-- do their job is to let them in. A separate namespace is the prerequisite for the whole
-- role model, not a tidy-up.
--
-- Granted immediately to superadmin and admin, i.e. to exactly the roles that reach those
-- routes today via settings.*, so this migration changes nobody's access on the day it
-- lands. The routes move to finance.* in the same release.
--
-- THE "MEGBÍZÓ" TRAP
-- ------------------
-- `data_controller` is displayed as "Megbízó (Adatkezelő)" and holds 62 of 69
-- permissions — everything except sales.*. It is the role an operator would most
-- plausibly pick when onboarding a real client, and doing so would hand Autoliv the whole
-- system. Renaming it is not cosmetic: the display name IS the interface an admin chooses
-- from. The genuine client role arrives with the megbízó work, scoped to tickets about
-- its own workers.

BEGIN;

INSERT INTO permissions (slug, name, module, description) VALUES
  ('finance.view', 'Pénzügyi adatok megtekintése', 'finance',
   'Bérleti díjak, költségek, árrés, profit, számlázás, bérek, elszámoló lapok olvasása.'),
  ('finance.edit', 'Pénzügyi adatok szerkesztése', 'finance',
   'Díjszabás, költségek, számlázási futások és elszámolások módosítása.')
ON CONFLICT (slug) DO NOTHING;

-- Nobody loses access today: whoever holds settings.view/edit gets the finance twin.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions sp ON sp.id = rp.permission_id AND sp.slug = 'settings.view'
  CROSS JOIN permissions p WHERE p.slug = 'finance.view'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions sp ON sp.id = rp.permission_id AND sp.slug = 'settings.edit'
  CROSS JOIN permissions p WHERE p.slug = 'finance.edit'
ON CONFLICT DO NOTHING;

-- ── disarm the trap ─────────────────────────────────────────────────────────
UPDATE roles
   SET name = 'Adatkezelő — belső',
       description = 'BELSŐ adatkezelői szerepkör, közel teljes hozzáféréssel. '
                  || 'NEM a megbízó (ügyfél) szerepkör! Ügyfélnek SOHA ne ezt add: '
                  || 'a valódi megbízó szerepkör csak a saját munkavállalóit érintő '
                  || 'hibajegyeket látja (billing_client_id szerint szűrve).'
 WHERE slug = 'data_controller';

COMMIT;
