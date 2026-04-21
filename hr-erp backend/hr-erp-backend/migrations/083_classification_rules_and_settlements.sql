-- Migration 083: Invoice classification rules + Housing Solutions settlements
--
-- Why: extend the existing cost_centers hierarchy with 12 Housing Solutions
-- settlement cost centers, then add a DB-driven rule table so admins can
-- manage partner→cost-center mappings without code changes.
--
-- This migration is ADDITIVE and idempotent:
--   - New cost centers inserted only if their code is not yet present
--   - New `invoice_classification_rules` table via CREATE IF NOT EXISTS
--   - New email_inbox columns via information_schema guards
--   - Rule seed uses NOT EXISTS to avoid duplicates on re-run
--
-- Schema compatibility with existing 24 cost_centers:
--   - Uses existing columns (code, name, level, parent_id, path)
--   - New settlements are LEVEL-4 children under a new LEVEL-3 parent
--     `OPR-SZALL-HS` (Housing Solutions) under `OPR-SZALL`
--   - Does NOT alter existing rows

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- Part 1 — Add Housing Solutions settlement cost centers
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_szall_id UUID;
  v_hs_id UUID;
  v_hs_path TEXT;
  v_settlements TEXT[][] := ARRAY[
    ['OPR-SZALL-HS-ROJT',  'Röjtökmuzsaj szálló'],
    ['OPR-SZALL-HS-BELED', 'Beled szálló'],
    ['OPR-SZALL-HS-BUK',   'Bük szálló'],
    ['OPR-SZALL-HS-SARR',  'Sarród szálló'],
    ['OPR-SZALL-HS-PETO',  'Petőháza szálló'],
    ['OPR-SZALL-HS-SOPRH', 'Sopronhorpács szálló'],
    ['OPR-SZALL-HS-FERTR', 'Fertőrákos szálló'],
    ['OPR-SZALL-HS-GYOR',  'Győr szálló'],
    ['OPR-SZALL-HS-SZIGS', 'Szigetszentmiklós szálló'],
    ['OPR-SZALL-HS-BPEST', 'Budapest szálló (Housing Solutions)'],
    ['OPR-SZALL-HS-FERTD', 'Fertőd szálló'],
    ['OPR-SZALL-HS-FERTS', 'Fertőszéplak szálló']
  ];
  v_code TEXT;
  v_name TEXT;
  v_new_id UUID;
BEGIN
  SELECT id, path INTO v_szall_id, v_hs_path FROM cost_centers WHERE code = 'OPR-SZALL';
  IF v_szall_id IS NULL THEN
    RAISE EXCEPTION 'Parent cost center OPR-SZALL not found — aborting';
  END IF;

  -- Create parent OPR-SZALL-HS if missing
  SELECT id, path INTO v_hs_id, v_hs_path FROM cost_centers WHERE code = 'OPR-SZALL-HS';
  IF v_hs_id IS NULL THEN
    INSERT INTO cost_centers (code, name, level, parent_id, is_active)
    VALUES ('OPR-SZALL-HS', 'Housing Solutions szállások', 3, v_szall_id, true)
    RETURNING id INTO v_hs_id;

    SELECT path INTO v_hs_path FROM cost_centers WHERE id = v_szall_id;
    UPDATE cost_centers SET path = COALESCE(v_hs_path, v_szall_id::text) || '.' || v_hs_id::text
      WHERE id = v_hs_id;
    SELECT path INTO v_hs_path FROM cost_centers WHERE id = v_hs_id;
    RAISE NOTICE 'Created parent OPR-SZALL-HS (id=%)', v_hs_id;
  END IF;

  -- Create each settlement if missing
  FOR i IN 1..array_length(v_settlements, 1) LOOP
    v_code := v_settlements[i][1];
    v_name := v_settlements[i][2];
    IF NOT EXISTS (SELECT 1 FROM cost_centers WHERE code = v_code) THEN
      INSERT INTO cost_centers (code, name, level, parent_id, is_active)
      VALUES (v_code, v_name, 4, v_hs_id, true)
      RETURNING id INTO v_new_id;
      UPDATE cost_centers SET path = v_hs_path || '.' || v_new_id::text WHERE id = v_new_id;
      RAISE NOTICE 'Inserted %', v_code;
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- Part 2 — invoice_classification_rules table
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('partner', 'settlement', 'keyword', 'combined')),
  partner_name VARCHAR(255),
  settlement_name VARCHAR(255),
  keyword VARCHAR(255),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  confidence_boost INTEGER NOT NULL DEFAULT 20 CHECK (confidence_boost BETWEEN 0 AND 50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT rule_has_criteria CHECK (
    partner_name IS NOT NULL OR settlement_name IS NOT NULL OR keyword IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_classification_rules_active
  ON invoice_classification_rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_classification_rules_cost_center
  ON invoice_classification_rules(cost_center_id);

-- ════════════════════════════════════════════════════════════════════
-- Part 3 — Seed 8 partner rules
-- ════════════════════════════════════════════════════════════════════
INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Rent-Haus Kft → Sopronhorpács', 'combined', 'Rent-Haus', 'Sopronhorpács', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-SOPRH'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Rent-Haus Kft → Sopronhorpács');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Tri-Home → Röjtökmuzsaj', 'combined', 'Tri-Home', 'Röjtökmuzsaj', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-ROJT'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Tri-Home → Röjtökmuzsaj');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Petőháza Önkormányzat', 'combined', 'Petőháza Önkormányzat', 'Petőháza', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-PETO'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Petőháza Önkormányzat');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Kroisfood Kft → Fertőrákos', 'combined', 'Kroisfood', 'Fertőrákos', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-FERTR'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Kroisfood Kft → Fertőrákos');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Zöld-Lak Bt → Fertőszéplak', 'combined', 'Zöld-Lak', 'Fertőszéplak', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-FERTS'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Zöld-Lak Bt → Fertőszéplak');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Sözen-Barczáné → Beled', 'combined', 'Sözen', 'Beled', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-BELED'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Sözen-Barczáné → Beled');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Barki Csabáné → Bük', 'combined', 'Barki', 'Bük', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-BUK'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Barki Csabáné → Bük');

INSERT INTO invoice_classification_rules (name, rule_type, partner_name, settlement_name, cost_center_id, priority, confidence_boost)
SELECT 'Barcza Gyula → Sarród', 'combined', 'Barcza', 'Sarród', id, 1, 30
FROM cost_centers WHERE code = 'OPR-SZALL-HS-SARR'
  AND NOT EXISTS (SELECT 1 FROM invoice_classification_rules WHERE name = 'Barcza Gyula → Sarród');

-- ════════════════════════════════════════════════════════════════════
-- Part 4 — Seed 12 settlement keyword rules (lower priority fallback)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO invoice_classification_rules (name, rule_type, settlement_name, cost_center_id, priority, confidence_boost)
SELECT
  REGEXP_REPLACE(name, ' szálló.*$', '') || ' település kulcsszó',
  'settlement',
  REGEXP_REPLACE(name, ' szálló.*$', ''),
  id,
  5,
  15
FROM cost_centers
WHERE code LIKE 'OPR-SZALL-HS-%' AND code != 'OPR-SZALL-HS'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_classification_rules r
    WHERE r.cost_center_id = cost_centers.id AND r.rule_type = 'settlement'
  );

-- ════════════════════════════════════════════════════════════════════
-- Part 5 — email_inbox columns for classification result
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='cost_center_id') THEN
    ALTER TABLE email_inbox ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='classification_reason') THEN
    ALTER TABLE email_inbox ADD COLUMN classification_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='auto_classified') THEN
    ALTER TABLE email_inbox ADD COLUMN auto_classified BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_inbox_cost_center ON email_inbox(cost_center_id)
  WHERE cost_center_id IS NOT NULL;

COMMIT;
