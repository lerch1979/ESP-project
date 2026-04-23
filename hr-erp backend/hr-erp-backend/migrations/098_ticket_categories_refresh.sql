-- Replace the seed ticket categories with the 8 operational ones the team
-- actually uses. Old categories are deactivated (not dropped) so any
-- historical references stay resolvable; new categories are added with
-- sort_order, icon, color. Existing tickets re-pointed to Általános.
BEGIN;

ALTER TABLE ticket_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Deactivate all existing rows (keeps FK integrity on historical tickets)
UPDATE ticket_categories SET is_active = FALSE;

-- Insert new categories (NULL contractor_id — platform-level catalog).
-- Unique constraint is (contractor_id, slug); NULL contractor_id is treated
-- as distinct, so if this migration is re-run it will try to duplicate.
-- Guard with WHERE NOT EXISTS on (slug, contractor_id IS NULL).
INSERT INTO ticket_categories (slug, name, icon, color, sort_order, is_active)
SELECT slug, name, icon, color, sort_order, TRUE
FROM (VALUES
  ('general',        'Általános',              '📋', '#64748b', 10),
  ('accommodation',  'Szállás',                '🏠', '#2563eb', 20),
  ('cleaning',       'Takarítás',              '🧹', '#06b6d4', 30),
  ('moving',         'Költözés',               '📦', '#f59e0b', 40),
  ('other',          'Egyéb',                  '❓', '#94a3b8', 50),
  ('workplace',      'Munkahely',              '🏭', '#8b5cf6', 60),
  ('administration', 'Adminisztráció',         '🗂️', '#0891b2', 70),
  ('medical',        'Orvosi / Egészségügyi',  '🩺', '#ec4899', 80)
) AS new(slug, name, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_categories tc
  WHERE tc.slug = new.slug AND tc.contractor_id IS NULL
);

-- If migration is re-run, make sure the platform-level rows are active with
-- the latest name/icon/color/sort_order.
UPDATE ticket_categories tc SET
  name       = v.name,
  icon       = v.icon,
  color      = v.color,
  sort_order = v.sort_order,
  is_active  = TRUE
FROM (VALUES
  ('general',        'Általános',              '📋', '#64748b', 10),
  ('accommodation',  'Szállás',                '🏠', '#2563eb', 20),
  ('cleaning',       'Takarítás',              '🧹', '#06b6d4', 30),
  ('moving',         'Költözés',               '📦', '#f59e0b', 40),
  ('other',          'Egyéb',                  '❓', '#94a3b8', 50),
  ('workplace',      'Munkahely',              '🏭', '#8b5cf6', 60),
  ('administration', 'Adminisztráció',         '🗂️', '#0891b2', 70),
  ('medical',        'Orvosi / Egészségügyi',  '🩺', '#ec4899', 80)
) AS v(slug, name, icon, color, sort_order)
WHERE tc.slug = v.slug AND tc.contractor_id IS NULL;

-- Re-point any live tickets whose category was just deactivated to "Általános".
UPDATE tickets
   SET category_id = (SELECT id FROM ticket_categories WHERE slug = 'general')
 WHERE category_id IN (SELECT id FROM ticket_categories WHERE is_active = FALSE);

COMMIT;
