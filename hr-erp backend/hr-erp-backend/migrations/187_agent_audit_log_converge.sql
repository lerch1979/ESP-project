-- 187 — agent_audit_log: a szerkezet egységesítése MINDEN adatbázison
--
-- MIÉRT KELL, HA A 184 EZT MÁR MEGTESZI: mert a 184-nek volt egy VISSZAVONT
-- változata, ami eldobta és bigint kulccsal újra létrehozta a táblát, és ez a
-- változat devben ÉS sandboxban már LEFUTOTT — a ledger szerint a 184 "applied",
-- tehát a javított tartalma ott többé nem fut le.
--
-- Enélkül a dev és az éles adatbázis szerkezete ELTÉRNE (bigint vs uuid kulcs,
-- hiányzó 123-as oszlopok), és a tesztek azt mérnék, ami élesben nincs. Ez a
-- leglassabban kiderülő hibafajta: minden zöld, aztán élesben nem működik.
--
-- A 184 a konvergenciát egy FÜGGVÉNYBE tette éppen ezért. Ez a migráció csak
-- meghívja. Ahol a 184 javított tartalma futott (éles, friss CI), ez NO-OP.
-- A függvény sort nem töröl: a (c) ágon átmásolja őket.

BEGIN;

-- A FÜGGVÉNY DEFINÍCIÓJA ITT IS SZEREPEL, és ez nem figyelmetlenség: egy migráció nem
-- támaszkodhat arra, hogy egy MÁSIK migráció JELENLEGI tartalma lefutott. A 184 a
-- ledgerben devben és sandboxban már "applied" — a javított tartalma ott soha nem fut
-- le, tehát a függvény sem jönne létre. Az első próbálkozásom pontosan ezen hasalt el.
-- A `CREATE OR REPLACE` idempotens, tehát ahol a 184 már definiálta, itt nem változik.

CREATE OR REPLACE FUNCTION agent_audit_log_converge()
RETURNS TEXT AS $fn$
DECLARE
  van_tabla   BOOLEAN;
  van_legacy  BOOLEAN;   -- 123-as oszlop → uuid-kulcsú alak
  atmasolt    BIGINT := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'agent_audit_log')
    INTO van_tabla;

  -- ── (a) nincs tábla: a VÉGSŐ alakot hozzuk létre egyben ──────────────────
  IF NOT van_tabla THEN
    CREATE TABLE agent_audit_log (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- ÚJ, kanonikus szókincs (Triage spec v1, 3.)
      actor         TEXT,                    -- 'agent:triage' | 'user:<email>'
      event         TEXT,                    -- classified|planned|executed|rejected|rolled_back|error|mode_change
      details       JSONB,
      action_id     BIGINT,
      message_id    BIGINT,
      -- RÉGI szókincs (mig 123), befagyasztva
      agent_name    VARCHAR(80),
      action        VARCHAR(80),
      entity_type   VARCHAR(40),
      entity_id     UUID,
      input         JSONB NOT NULL DEFAULT '{}'::jsonb,
      output        JSONB NOT NULL DEFAULT '{}'::jsonb,
      status        VARCHAR(20) NOT NULL DEFAULT 'ok',
      error         TEXT,
      -- A spec 7.5 NAPI KÖLTSÉG-riportot kér; oszlopból lehet összegezni, JSONB-ből
      -- kényelmetlen. Az 1. héten mindhárom NULL, mert LLM-hívás nincs.
      model         VARCHAR(80),
      tokens_input  INTEGER,
      tokens_output INTEGER,
      -- Ez játssza a spec `ts` mezőjének a szerepét.
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    RETURN 'létrehozva (friss adatbázis)';
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'agent_audit_log' AND column_name = 'agent_name')
    INTO van_legacy;

  -- ── (c) a visszavont 184-variáns bigint-kulcsú táblája: ÚJRAÉPÍTÉS ───────
  -- A sorokat ÁTMÁSOLJUK. A régi `entity_id` bigint volt, az új uuid — a számot
  -- nem lehet uuid-ba tenni, ezért a `details`-be kerül `legacy_entity_id` néven,
  -- nem pedig a kukába.
  IF NOT van_legacy THEN
    ALTER TABLE agent_audit_log RENAME TO agent_audit_log_old_184;
    DROP TRIGGER IF EXISTS trg_agent_audit_log_no_update ON agent_audit_log_old_184;
    DROP TRIGGER IF EXISTS trg_agent_audit_log_no_delete ON agent_audit_log_old_184;

    PERFORM agent_audit_log_converge();      -- (a) ág: létrehozza a végső alakot

    INSERT INTO agent_audit_log
      (actor, event, details, action_id, message_id, entity_type,
       model, tokens_input, tokens_output, created_at)
    SELECT o.actor, o.event,
           COALESCE(o.details, '{}'::jsonb)
             || CASE WHEN o.entity_id IS NULL THEN '{}'::jsonb
                     ELSE jsonb_build_object('legacy_entity_id', o.entity_id) END,
           o.action_id, NULL, o.entity_type,
           o.model, o.tokens_input, o.tokens_output, o.ts
      FROM agent_audit_log_old_184 o
     ORDER BY o.id;
    SELECT count(*) FROM agent_audit_log_old_184 INTO atmasolt;

    DROP TABLE agent_audit_log_old_184;
    RETURN format('újraépítve a visszavont 184-variánsból, %s sor átmásolva', atmasolt);
  END IF;

  -- ── (b) 123-as alak: CSAK KIEGÉSZÍTÉS, sor nem mozdul ───────────────────
  ALTER TABLE agent_audit_log
    ADD COLUMN IF NOT EXISTS actor      TEXT,
    ADD COLUMN IF NOT EXISTS event      TEXT,
    ADD COLUMN IF NOT EXISTS details    JSONB,
    ADD COLUMN IF NOT EXISTS action_id  BIGINT,
    ADD COLUMN IF NOT EXISTS message_id BIGINT;

  -- Az új írások nem töltik a régi oszlopokat, tehát a NOT NULL le kell kerüljön.
  -- A meglévő sorok ettől nem változnak.
  ALTER TABLE agent_audit_log ALTER COLUMN agent_name DROP NOT NULL;
  ALTER TABLE agent_audit_log ALTER COLUMN action     DROP NOT NULL;
  RETURN 'kiegészítve (a 123-as tábla megőrizve)';
END;
$fn$ LANGUAGE plpgsql;

DO $$
DECLARE allapot TEXT;
BEGIN
  SELECT agent_audit_log_converge() INTO allapot;
  RAISE NOTICE 'agent_audit_log: %', allapot;
END $$;

-- A 184 utáni lépések megismétlése, hogy a (c) ágon újraépített táblán is meglegyenek.
ALTER TABLE agent_audit_log DROP CONSTRAINT IF EXISTS agent_audit_log_kitoltott_chk;
ALTER TABLE agent_audit_log ADD CONSTRAINT agent_audit_log_kitoltott_chk CHECK (
  (actor IS NOT NULL AND event IS NOT NULL)
  OR (agent_name IS NOT NULL AND action IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_log_created ON agent_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_event   ON agent_audit_log (event, created_at DESC)
  WHERE event IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_action  ON agent_audit_log (action_id)
  WHERE action_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_agent_audit_log_no_update ON agent_audit_log;
CREATE TRIGGER trg_agent_audit_log_no_update
  BEFORE UPDATE ON agent_audit_log
  FOR EACH ROW EXECUTE FUNCTION agent_audit_log_append_only();

DROP TRIGGER IF EXISTS trg_agent_audit_log_no_delete ON agent_audit_log;
CREATE TRIGGER trg_agent_audit_log_no_delete
  BEFORE DELETE ON agent_audit_log
  FOR EACH ROW EXECUTE FUNCTION agent_audit_log_append_only();

GRANT SELECT, INSERT ON agent_audit_log TO hr_erp_app;
REVOKE UPDATE, DELETE ON agent_audit_log FROM hr_erp_app;

COMMIT;
