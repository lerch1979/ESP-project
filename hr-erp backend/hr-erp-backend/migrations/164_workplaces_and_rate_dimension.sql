-- 164: a MUNKAHELY mint díjszabási dimenzió — a meglévő workplaces táblára építve.
--
-- AMI MÁR MEGVOLT (mig 095, 2026-04)
-- ----------------------------------
-- A `workplaces` tábla létezik és él (Autoliv Kft, Ikea + két inaktív), az
-- `employees.workplace_id` oszlop szintén — a videó-modul már erre célozza a közleményeket.
-- AMI VISZONT HIÁNYZOTT: a kapcsolat FELTÖLTÉSE. Egyetlen dolgozónál sem volt kitöltve,
-- csak a szabad szöveges `workplace` mező. Emiatt a videó munkahely-célzása ma nulla
-- címzettet talál — csendben, mert nem hibázik, csak nem talál semmit.
--
-- A PROBLÉMA, AMIT MOST OLDUNK MEG
-- --------------------------------
-- A megbízó ugyanabban a házban eltérő díjat fizet aszerint, hogy a lakó hol dolgozik
-- (Autoliv 3 476, IKEA 3 950 Ft/fő/éj). Öt ház vegyes — Sopronhorpácson 42 Autoliv-os és
-- 17 IKEA-s lakik —, tehát a (megbízó × szállás) pár nem elég a díj eldöntéséhez.
--
-- A FELOLDÁS RENDJE (a meglévő mintát követi, egy szinttel mélyebben)
--   (megbízó, szállás, munkahely)  ← legspecifikusabb
--   (megbízó, szállás, NULL)          minden munkahelyre az adott házban
--   (megbízó, NULL,    munkahely)     az adott munkahely minden házban
--   (megbízó, NULL,    NULL)          a megbízó alapdíja

BEGIN;

-- ── a dolgozók hozzákötése a meglévő munkahely-entitásokhoz ────────────
-- Explicit leképezés, nem mintaillesztés: a szabad szöveges mező négy írásmódban él
-- ("Autoliv Kft", "Autoliv", "Ikea", "IKEA"), és ha a díj függ tőle, egy félreillesztés
-- pénzbe kerül. Amit itt nem sorolunk fel, az kötetlen marad és a lefedettségben látszik.
UPDATE employees e SET workplace_id = w.id
  FROM workplaces w
 WHERE e.workplace_id IS NULL
   AND w.name = 'Autoliv Kft'
   AND lower(btrim(coalesce(e.workplace, ''))) IN ('autoliv kft', 'autoliv');

UPDATE employees e SET workplace_id = w.id
  FROM workplaces w
 WHERE e.workplace_id IS NULL
   AND w.name = 'Ikea'
   AND lower(btrim(coalesce(e.workplace, ''))) IN ('ikea');

CREATE INDEX IF NOT EXISTS idx_employees_workplace ON employees(workplace_id)
  WHERE workplace_id IS NOT NULL;

-- ── a díjsor munkahely-dimenziója ──────────────────────────────────────
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS workplace_id uuid REFERENCES workplaces(id);
CREATE INDEX IF NOT EXISTS idx_rates_workplace ON client_night_rates(workplace_id)
  WHERE workplace_id IS NOT NULL;

COMMENT ON COLUMN client_night_rates.workplace_id IS
  'Melyik munkahelyen dolgozó lakóra vonatkozik a díj. NULL = az adott (megbízó × szállás) minden lakójára.';

-- ⚠️ AZ ÁGYBLOKK NEM OSZTHATÓ MUNKAHELY SZERINT.
-- A lekötött ágyszám és a foglaltsági küszöb a HÁZHOZ tartozik: ha munkahelyenként külön
-- díjsor is vinné a blokkot, a garantált minimum kétszer érvényesülne és az üres ágyak
-- kétszer számítanának — vagyis ugyanazt a szerződést kétszer számláznánk ki.
DO $$ BEGIN
  ALTER TABLE client_night_rates ADD CONSTRAINT cnr_workplace_no_block_chk
    CHECK (workplace_id IS NULL OR contracted_beds IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── a számlázási sor is munkahelyenként áll elő ────────────────────────
-- Egy házban két díjkör lakhat, és mindegyik a saját díján számlázódik — tehát két billing
-- sor keletkezik ugyanarra a (ház, megbízó, hónap) hármasra. A meglévő egyedi index ezt
-- megtiltaná, és a futás a MÁSODIK csoportnál állna meg: a ház fele kiszámlázva, a másik
-- fele sehol.
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS workplace_id uuid REFERENCES workplaces(id);

COMMENT ON COLUMN accommodation_billings.workplace_id IS
  'Melyik munkahely dolgozóira vonatkozik ez a sor. NULL = a ház összes lakója egy körben.';

DROP INDEX IF EXISTS uq_accommodation_billings_live;
CREATE UNIQUE INDEX uq_accommodation_billings_live
  ON accommodation_billings (
    accommodation_id,
    COALESCE(partner_contractor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(workplace_id,          '00000000-0000-0000-0000-000000000000'::uuid),
    billing_month);

COMMIT;
