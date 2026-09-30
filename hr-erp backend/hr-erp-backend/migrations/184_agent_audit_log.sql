-- 184 — Agent audit napló: a 123-as tábla KIEGÉSZÍTÉSE + APPEND-ONLY
--
-- ═══ A TULAJDONOS DÖNTÉSE (2026-09-30) ══════════════════════════════════════
-- "Az agent_audit_log meglévő szerkezetét NE dobd el – ALTER-rel egészítsd ki,
--  a régi sorok maradjanak."
--
-- Ez a migráció ennek megfelelően SEMMIT NEM DOB EL és egyetlen sort sem töröl.
-- A 123-as migráció táblája (uuid kulcs, agent_name/action, input/output, model +
-- token-számlálók) MEGMARAD, és megkapja a Triage spec 3. fejezetének oszlopait.
--
-- ═══ MIÉRT NEM MÁSODIK TÁBLA ════════════════════════════════════════════════
-- Egy audit naplóból egy van. Két "agent_audit_log"-féle táblából hat hónap múlva
-- senki nem tudná, melyikben kell keresni — és pont akkor kell majd keresni benne,
-- amikor valami elromlott.
--
-- ═══ A KÉT SZÓKINCS VISZONYA, KIMONDVA ══════════════════════════════════════
-- A táblában mostantól két elnevezés-készlet van egymás mellett. Ez nem szépséghiba,
-- hanem egy tudatos csere ára, ezért rögzítem, melyik mit jelent:
--
--   ÚJ (kanonikus, minden új írás ezt használja):  actor, event, details,
--                                                  action_id, message_id
--   RÉGI (befagyasztva, csak a meglévő sorokért):  agent_name, action
--
-- A `created_at` játssza a spec `ts` mezőjének a szerepét — nem vezetek be második
-- időbélyeget ugyanarra a tényre. A régi NOT NULL megszorítások lekerülnek az
-- `agent_name`/`action` oszlopokról (az új írások nem töltik őket), de egy CHECK
-- gondoskodik róla, hogy egyik szókinccsel se lehessen NÉVTELEN sort beírni: egy
-- audit sor, amiről nem tudható, ki és mit tett, nem audit sor.
--
-- ═══ HÁROM KIINDULÓ ÁLLAPOT, EGY VÉGÁLLAPOT ════════════════════════════════
-- A konvergenciát egy FÜGGVÉNY végzi, mert három különböző helyről kell ugyanoda
-- érkezni, és a 187-es migrációnak is ezt kell futtatnia:
--
--   (a) nincs tábla (friss CI adatbázis)            → létrehozás a végső alakban
--   (b) 123-as alak, uuid kulcs (ÉLES + a legtöbb)  → ALTER, sorok érintetlenül
--   (c) a 184 egy KORÁBBI, visszavont változatának   → újraépítés, a sorok ÁTMÁSOLVA
--       bigint-kulcsú táblája (dev + sandbox)
--
-- A (c) eset azért van, mert a 184 első változata eldobta és újra létrehozta a
-- táblát; devben és sandboxban ez már lefutott, a ledger szerint a 184 "applied".
-- Az a változat visszavonva — de a nyomát el kell tüntetni, különben a dev és az
-- éles adatbázis szerkezete eltérne, és a teszt azt mérné, ami élesben nincs.
--
-- ═══ AZ APPEND-ONLY KÉT RÉTEGE ══════════════════════════════════════════════
-- A spec egy REVOKE-ot ír elő. Ez ÖNMAGÁBAN NEM ELÉG EBBEN A RENDSZERBEN:
-- az alkalmazás `postgres` SUPERUSER-ként kapcsolódik, a superuser pedig MINDEN
-- jogosultság-ellenőrzést megkerül. A napló a spec szerinti REVOKE-kal is
-- szerkeszthető és törölhető maradna, miközben a dokumentum azt állítaná, hogy
-- append-only. Ezért:
--   1. TRIGGER — kivételt dob UPDATE/DELETE-re, a superuserre IS. EZ véd ma.
--   2. REVOKE + `hr_erp_app` NOLOGIN szerepkör — a spec szerinti réteg, a
--      nem-superuser kapcsolatra való átállás utánra készen.

BEGIN;

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

SELECT agent_audit_log_converge() AS agent_audit_log_allapot;

-- ── Megszorítás: NÉVTELEN audit sor nem létezhet ────────────────────────────
-- Egy sor, amiről nem tudható, ki és mit tett, nem audit sor. Bármelyik szókincs
-- megteszi, de az egyiknek ki kell lennie töltve.
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
-- A 123-as indexek (ix_agent_audit_log_agent, ix_agent_audit_log_entity) érintetlenek.

-- ── 1. réteg: TRIGGER (ez véd MA, a superuser ellen is) ─────────────────────
CREATE OR REPLACE FUNCTION agent_audit_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'agent_audit_log APPEND-ONLY: % nem megengedett. Az audit napló módosítása vagy '
    'törlése megsemmisítené azt a bizonyítékot, amiért a napló létezik. Ha valóban '
    'törölni kell (GDPR), azt külön, dokumentált eljárásban kell megtenni.',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_audit_log_no_update ON agent_audit_log;
CREATE TRIGGER trg_agent_audit_log_no_update
  BEFORE UPDATE ON agent_audit_log
  FOR EACH ROW EXECUTE FUNCTION agent_audit_log_append_only();

DROP TRIGGER IF EXISTS trg_agent_audit_log_no_delete ON agent_audit_log;
CREATE TRIGGER trg_agent_audit_log_no_delete
  BEFORE DELETE ON agent_audit_log
  FOR EACH ROW EXECUTE FUNCTION agent_audit_log_append_only();

-- ── 2. réteg: dedikált szerepkör + REVOKE (a spec szerinti, jövőre kész) ────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hr_erp_app') THEN
    CREATE ROLE hr_erp_app NOLOGIN;
  END IF;
END $$;

GRANT SELECT, INSERT ON agent_audit_log TO hr_erp_app;
REVOKE UPDATE, DELETE ON agent_audit_log FROM hr_erp_app;
-- Szekvencia-GRANT NINCS: a kulcs uuid `gen_random_uuid()` alapértelmezéssel, nem
-- szekvenciából jön. (A 184 első változata bigserial kulcsot feltételezett, és a
-- `GRANT ... ON SEQUENCE agent_audit_log_id_seq` minden olyan adatbázison hibára
-- futott volna, ahol a 123 lefutott — tehát mindenhol.)

COMMENT ON TABLE agent_audit_log IS
  'Agent audit napló, APPEND-ONLY. A 123-as tábla KIEGÉSZÍTVE a Triage spec v1 3. '
  'fejezetének oszlopaival (actor/event/details/action_id/message_id); a régi '
  'agent_name/action befagyasztva, a created_at játssza a spec ts szerepét. Trigger '
  'véd (superuser ellen is) + REVOKE a hr_erp_app szerepkörön.';
COMMENT ON COLUMN agent_audit_log.agent_name IS 'BEFAGYASZTVA (mig 123). Új írás az actor mezőt használja.';
COMMENT ON COLUMN agent_audit_log.action     IS 'BEFAGYASZTVA (mig 123). Új írás az event mezőt használja.';

COMMIT;
