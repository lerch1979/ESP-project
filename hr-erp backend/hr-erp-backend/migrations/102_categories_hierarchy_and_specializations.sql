-- ============================================================
-- 102_categories_hierarchy_and_specializations.sql
--
-- Part 1 of "simplified categories + AI auto-classification" plan:
--
--   (a) Make ticket_categories hierarchical (parent_id self-FK).
--       Existing 8 leaf categories (from migration 098) are RE-PARENTED
--       under the new 5-parent taxonomy — we don't touch tickets.category_id,
--       so historical tickets keep resolving.
--   (b) Add default_specialization column so the AI agent / auto-assigner
--       has a single place to read "this category type → this worker kind".
--   (c) New worker_specializations table for matching tickets to workers.
--
-- The new taxonomy (Hungarian, with parent slugs in ENGLISH and sub slugs
-- prefixed for namespace clarity):
--
--   technical  Műszaki hiba
--     tech_electrical    Elektromos hálózat
--     tech_plumbing      Vízhálózat
--     tech_heating       Fűtés / Hűtés
--     tech_gas           Gáz (CSAK vészhelyzet)
--     tech_other         Egyéb műszaki
--
--   furniture  Berendezések
--     furn_furniture       Bútorok
--     furn_doors_windows   Nyílászárók
--     furn_surfaces        Padló / Fal / Mennyezet
--
--   appliance  Eszközök
--     appl_large           Nagy háztartási
--     appl_small           Kisgépek
--     appl_electronics     Elektronika
--
--   hygiene  Higiénia
--     cleaning             Takarítás   ← reuses existing 'cleaning' row
--     hyg_pests            Rovar / Rágcsáló
--
--   emergency  Egyéb / Vészhelyzet
--     emrg_emergency       Vészhelyzet
--     emrg_security        Biztonsági
--     accommodation        Lakhatási   ← reuses existing 'accommodation'
--     administration       Adminisztráció ← reuses existing
--     workplace            Munkahely      ← reuses existing
--     medical              Egészségügy    ← reuses existing
--     moving               Költözés       ← reuses existing
--     other                Egyéb          ← reuses existing
--     general              Általános      ← reuses existing
-- ============================================================

BEGIN;

-- ── ticket_categories: hierarchy + default specialization ───────
ALTER TABLE ticket_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES ticket_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_specialization varchar(50);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent
  ON ticket_categories (parent_id) WHERE parent_id IS NOT NULL;

-- ── Insert the 5 parent rows (idempotent on slug per platform) ──
INSERT INTO ticket_categories (slug, name, icon, color, sort_order, is_active, parent_id, default_specialization)
SELECT slug, name, icon, color, sort_order, TRUE, NULL, NULL
FROM (VALUES
  ('technical',  'Műszaki hiba',         '🔧', '#2563eb', 100),
  ('furniture',  'Berendezések',         '🛋️', '#8b5cf6', 200),
  ('appliance',  'Eszközök',             '🔌', '#06b6d4', 300),
  ('hygiene',    'Higiénia',             '🧼', '#16a34a', 400),
  ('emergency',  'Egyéb / Vészhelyzet',  '🚨', '#dc2626', 500)
) AS new(slug, name, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_categories tc
  WHERE tc.slug = new.slug AND tc.contractor_id IS NULL
);

-- Refresh icon/color/sort_order/is_active on these parents if rerun
UPDATE ticket_categories tc SET
  name = v.name, icon = v.icon, color = v.color, sort_order = v.sort_order, is_active = TRUE
FROM (VALUES
  ('technical',  'Műszaki hiba',         '🔧', '#2563eb', 100),
  ('furniture',  'Berendezések',         '🛋️', '#8b5cf6', 200),
  ('appliance',  'Eszközök',             '🔌', '#06b6d4', 300),
  ('hygiene',    'Higiénia',             '🧼', '#16a34a', 400),
  ('emergency',  'Egyéb / Vészhelyzet',  '🚨', '#dc2626', 500)
) AS v(slug, name, icon, color, sort_order)
WHERE tc.slug = v.slug AND tc.contractor_id IS NULL;

-- ── Insert the new sub-categories (idempotent) ─────────────────
INSERT INTO ticket_categories (slug, name, icon, color, sort_order, is_active, parent_id, default_specialization)
SELECT
  v.slug, v.name, v.icon, v.color, v.sort_order, TRUE,
  (SELECT id FROM ticket_categories WHERE slug = v.parent_slug AND contractor_id IS NULL),
  v.spec
FROM (VALUES
  -- Műszaki hiba
  ('tech_electrical', 'Elektromos hálózat',   '⚡',  '#fde68a', 110, 'technical', 'electrical'),
  ('tech_plumbing',   'Vízhálózat',           '💧',  '#bfdbfe', 120, 'technical', 'plumbing'),
  ('tech_heating',    'Fűtés / Hűtés',        '🌡️',  '#fed7aa', 130, 'technical', 'heating'),
  ('tech_gas',        'Gáz (vészhelyzet)',    '🔥',  '#fecaca', 140, 'technical', 'gas'),
  ('tech_other',      'Egyéb műszaki',        '🔧',  '#e5e7eb', 190, 'technical', 'general'),

  -- Berendezések
  ('furn_furniture',     'Bútorok',                  '🪑', '#ddd6fe', 210, 'furniture', 'furniture'),
  ('furn_doors_windows', 'Nyílászárók',              '🚪', '#ddd6fe', 220, 'furniture', 'furniture'),
  ('furn_surfaces',      'Padló / Fal / Mennyezet',  '🧱', '#ddd6fe', 230, 'furniture', 'general'),

  -- Eszközök
  ('appl_large',       'Nagy háztartási',  '🧺', '#cffafe', 310, 'appliance', 'general'),
  ('appl_small',       'Kisgépek',         '🔌', '#cffafe', 320, 'appliance', 'general'),
  ('appl_electronics', 'Elektronika',      '💻', '#cffafe', 330, 'appliance', 'electrical'),

  -- Higiénia (cleaning row already exists — see below; we add only pests here)
  ('hyg_pests',  'Rovar / Rágcsáló', '🐀', '#bbf7d0', 420, 'hygiene', 'cleaning'),

  -- Egyéb / Vészhelyzet (other emrg* sub-cats; remaining ones are existing rows re-parented below)
  ('emrg_emergency', 'Vészhelyzet', '🚨', '#fecaca', 510, 'emergency', 'general'),
  ('emrg_security',  'Biztonsági',  '🛡️', '#fecaca', 520, 'emergency', 'general')
) AS v(slug, name, icon, color, sort_order, parent_slug, spec)
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_categories tc
  WHERE tc.slug = v.slug AND tc.contractor_id IS NULL
);

-- Refresh existing new-sub rows (idempotent on rerun)
UPDATE ticket_categories tc SET
  name = v.name, icon = v.icon, color = v.color, sort_order = v.sort_order,
  is_active = TRUE,
  parent_id = (SELECT id FROM ticket_categories WHERE slug = v.parent_slug AND contractor_id IS NULL),
  default_specialization = v.spec
FROM (VALUES
  ('tech_electrical', 'Elektromos hálózat',   '⚡',  '#fde68a', 110, 'technical', 'electrical'),
  ('tech_plumbing',   'Vízhálózat',           '💧',  '#bfdbfe', 120, 'technical', 'plumbing'),
  ('tech_heating',    'Fűtés / Hűtés',        '🌡️',  '#fed7aa', 130, 'technical', 'heating'),
  ('tech_gas',        'Gáz (vészhelyzet)',    '🔥',  '#fecaca', 140, 'technical', 'gas'),
  ('tech_other',      'Egyéb műszaki',        '🔧',  '#e5e7eb', 190, 'technical', 'general'),
  ('furn_furniture',     'Bútorok',                  '🪑', '#ddd6fe', 210, 'furniture', 'furniture'),
  ('furn_doors_windows', 'Nyílászárók',              '🚪', '#ddd6fe', 220, 'furniture', 'furniture'),
  ('furn_surfaces',      'Padló / Fal / Mennyezet',  '🧱', '#ddd6fe', 230, 'furniture', 'general'),
  ('appl_large',       'Nagy háztartási',  '🧺', '#cffafe', 310, 'appliance', 'general'),
  ('appl_small',       'Kisgépek',         '🔌', '#cffafe', 320, 'appliance', 'general'),
  ('appl_electronics', 'Elektronika',      '💻', '#cffafe', 330, 'appliance', 'electrical'),
  ('hyg_pests',  'Rovar / Rágcsáló', '🐀', '#bbf7d0', 420, 'hygiene', 'cleaning'),
  ('emrg_emergency', 'Vészhelyzet', '🚨', '#fecaca', 510, 'emergency', 'general'),
  ('emrg_security',  'Biztonsági',  '🛡️', '#fecaca', 520, 'emergency', 'general')
) AS v(slug, name, icon, color, sort_order, parent_slug, spec)
WHERE tc.slug = v.slug AND tc.contractor_id IS NULL;

-- ── Re-parent the 8 existing leaf categories under the new parents ─
UPDATE ticket_categories tc SET
  name       = COALESCE(v.new_name, tc.name),
  parent_id  = (SELECT id FROM ticket_categories WHERE slug = v.parent_slug AND contractor_id IS NULL),
  sort_order = v.sort_order,
  default_specialization = v.spec,
  is_active  = TRUE
FROM (VALUES
  ('cleaning',       'Takarítás',       'hygiene',   410, 'cleaning'),
  ('accommodation',  'Lakhatási',       'emergency', 530, 'general'),
  ('administration', 'Adminisztráció',  'emergency', 540, 'general'),
  ('workplace',      'Munkahely',       'emergency', 550, 'general'),
  ('medical',        'Egészségügy',     'emergency', 560, 'general'),
  ('moving',         'Költözés',        'emergency', 570, 'general'),
  ('other',          'Egyéb',           'emergency', 580, 'general'),
  ('general',        'Általános',       'emergency', 590, 'general')
) AS v(slug, new_name, parent_slug, sort_order, spec)
WHERE tc.slug = v.slug AND tc.contractor_id IS NULL;

-- Sanity guard: a parent must not also have a parent_id (no grandkids)
UPDATE ticket_categories
   SET parent_id = NULL
 WHERE slug IN ('technical','furniture','appliance','hygiene','emergency')
   AND contractor_id IS NULL;

-- ── worker_specializations table ───────────────────────────────
CREATE TABLE IF NOT EXISTS worker_specializations (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization       varchar(50) NOT NULL,
  -- canonical values: 'electrical', 'plumbing', 'heating', 'gas',
  -- 'general', 'cleaning', 'furniture'
  is_active            boolean NOT NULL DEFAULT TRUE,
  is_primary           boolean NOT NULL DEFAULT FALSE,
  certification_expiry date,
  notes                text,
  created_at           timestamp NOT NULL DEFAULT NOW(),
  updated_at           timestamp NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, specialization)
);

CREATE INDEX IF NOT EXISTS idx_worker_spec_user   ON worker_specializations (user_id);
CREATE INDEX IF NOT EXISTS idx_worker_spec_active ON worker_specializations (specialization, is_active) WHERE is_active = TRUE;

COMMIT;
