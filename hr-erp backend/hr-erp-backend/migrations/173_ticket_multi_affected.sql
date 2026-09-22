-- 173: TÖBB ÉRINTETT LAKÓ EGY JEGYEN + "egész szállás" hatókör.
--
-- AZ ESET: közös helyiségek (folyosó, konyha, mosókonyha) miatt egy hibajegy több lakóra
-- vonatkozhat. Ma egyetlen `linked_employee_id` van, tehát vagy egy embert jelölünk meg
-- húsz helyett, vagy senkit — és akkor a többiek nem látják az appban.
--
-- KÉT HATÓKÖR, NEM EGY
-- --------------------
--   scope='employee'       → konkrét, felsorolt lakók (ticket_affected_employees)
--   scope='accommodation'  → az EGÉSZ szállás, személyenkénti felsorolás NÉLKÜL
--
-- ⚠️ MIÉRT NEM SOROLJUK FEL AZ EGÉSZ SZÁLLÁST SZEMÉLYENKÉNT
-- Kézenfekvő volna a húsz lakót húsz sorként beírni. Két okból nem tesszük:
--
--   1. ADATSZIVÁRGÁS VEGYES SZÁLLÁSON. Sarród I./II. és Sopronhorpács vegyes: több
--      megbízó dolgozói laknak egy házban. Egy személyenként felsorolt "egész szállás"
--      jegyen a megbízói oldal MÁS CÉG dolgozóinak nevét látná — miközben a folyosón
--      égő lámpához semmi köze a névsornak. Ha a lista nem létezik, nincs mit
--      kiszivárogtatni: a közös helyiség a HÁZRÓL szól, nem emberekről.
--
--   2. A NÉVSOR ELAVUL. Egy beköltöző a jegy megnyitása után is ugyanazt a folyosót
--      használja; egy kiköltöző viszont már nem. A hatókör-alapú láthatóság magától
--      követi a mozgást, a befagyasztott névsor nem.
--
-- A megbízói oldal így a jegyet LÁTJA (van ott dolgozója), de a lakók névsorát nem kapja
-- meg — mert olyan nem is keletkezik.

BEGIN;

-- ── 1. Hatókör a jegyen ──────────────────────────────────────────────────
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS scope varchar(16) NOT NULL DEFAULT 'employee',
  -- Csak 'accommodation' hatókörnél töltjük: melyik házról szól.
  ADD COLUMN IF NOT EXISTS scope_accommodation_id uuid REFERENCES accommodations(id) ON DELETE SET NULL;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_scope_chk;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_scope_chk CHECK (scope IN ('employee', 'accommodation'));

-- Egy ház-hatókörű jegy ház nélkül értelmetlen: senki nem látná, és nem is derülne ki,
-- miért. Inkább ne lehessen létrehozni.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_scope_acc_chk;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_scope_acc_chk CHECK (
    scope <> 'accommodation' OR scope_accommodation_id IS NOT NULL
  );

-- ── 2. Több érintett lakó ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_affected_employees (
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_tae_employee ON ticket_affected_employees (employee_id);

COMMENT ON TABLE ticket_affected_employees IS
  'Egy jegy TÖBB érintett lakója (scope=employee). A ház-hatókörű jegyhez (scope=accommodation) SZÁNDÉKOSAN nem készül sor: a közös helyiség a házról szól, és egy személyenkénti felsorolás vegyes szálláson más megbízó dolgozóinak nevét adná ki.';

-- ── 3. A MEGLÉVŐ linked_employee_id átvétele ─────────────────────────────
-- A mező MEGMARAD (elsődleges érintett, visszafelé kompatibilitás), de a láthatóság
-- mostantól a kapcsolótáblát is nézi. A meglévő sorok átmásolása nélkül a mai jegyek
-- kiesnének a bővített feltételből.
INSERT INTO ticket_affected_employees (ticket_id, employee_id)
SELECT id, linked_employee_id FROM tickets
 WHERE linked_employee_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN tickets.scope IS
  'employee = a felsorolt lakókra vonatkozik (ticket_affected_employees); accommodation = az egész szállásra, névsor nélkül.';

COMMIT;
