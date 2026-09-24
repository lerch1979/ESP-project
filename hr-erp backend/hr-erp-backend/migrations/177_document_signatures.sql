-- 177 — EGYSÉGES aláírás-tábla
--
-- MIÉRT EGY TÁBLA. Ma három félkész aláírás-tároló van:
--   damage_reports.employee/manager/witness_signature_data  (mig 073)
--   inspections.digital_signature                            (mig 086)
--   compensation_residents.signature_data                    (mig 090)
-- Egyikhez sincs teljes lánc, és élesben MIND A HÁROMBAN NULLA adat van. Ez a
-- legolcsóbb pillanat egyesíteni: a migrációnak most nincs adatköltsége. Ugyanaz az
-- elv, amit a megosztó linkeknél kimondtunk — egy mechanizmus, egy igazság.
--
-- A RÉGI OSZLOPOKAT NEM TÖRLI EZ A MIGRÁCIÓ. Az olvasó kód még hivatkozik rájuk;
-- előbb az új táblára kell átállni, és csak utána takarítani. Amíg mindkettő létezik,
-- az ÚJ tábla az igazság.

BEGIN;

CREATE TABLE IF NOT EXISTS document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── MIHEZ tartozik ────────────────────────────────────────────────────────
  -- Nem idegen kulcs, mert négyféle táblára mutat. A subject_type + subject_id
  -- páros a hivatkozás; a törlést a takarító feladat kezeli, nem a CASCADE.
  subject_type varchar(32) NOT NULL
    CHECK (subject_type IN ('damage_report','inspection','compensation_resident','document')),
  subject_id   uuid NOT NULL,

  -- ── KI írta alá ───────────────────────────────────────────────────────────
  -- A három blokk (lakó / vezető / tanú) így EGY táblában él, nem három oszlopban.
  signer_role varchar(16) NOT NULL
    CHECK (signer_role IN ('resident','staff','witness')),
  signer_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  signer_user_id     uuid REFERENCES users(id)     ON DELETE SET NULL,
  -- A tanú nem felhasználónk és nem dolgozónk — a nevét viszont mindig tudni kell.
  signer_name text NOT NULL,

  -- ── A BIZONYÍTÓ ERŐ MAGJA — mind KÖTELEZŐ, utólag nem pótolható ───────────
  -- Tulajdonosi kikötés (2026-09-24). Egy utólag kitöltött eszközazonosító vagy
  -- nyelv semmit nem bizonyít; ha a rögzítéskor nincs meg, akkor nincs meg.
  --
  -- signed_text: a PONTOS szöveg, amit aláírt — SZÓ SZERINT, nem hivatkozásként.
  -- Ha sablonra hivatkoznánk, egy későbbi sablonmódosítás visszamenőleg HAZUDNA
  -- arról, mit írt alá.
  signed_text         text NOT NULL,
  signed_text_version varchar(32) NOT NULL,
  -- Amilyen nyelven ELOLVASTA. Egy magyar jegyzőkönyv ukrán aláírással jogilag
  -- értéktelen, tehát ez nem megjelenítési beállítás, hanem bizonyíték.
  language varchar(5) NOT NULL CHECK (language IN ('hu','en','uk','tl','de')),
  -- A megjelenített ADATOK pillanatképe + a (szöveg + adatok) ujjlenyomata. Ebből a
  -- PDF bármikor reprodukálható, és bizonyítható, hogy a bemutatott dokumentum
  -- ugyanaz. Szándékosan NEM a renderelt PDF hash-e: a PDF-készítés (Chrome) lassú
  -- és elbukhat — a helyszínen álló lakó aláírása nem múlhat ezen.
  signed_snapshot jsonb NOT NULL,
  content_sha256  char(64) NOT NULL,

  signed_at  timestamptz NOT NULL DEFAULT NOW(),
  -- 'staff_device': a szállásfelelős telefonján, a lakó jelenlétében (alapeset).
  -- 'own_phone'   : a lakó SAJÁT fiókjából, saját eszközén — jogilag erősebb.
  signed_on  varchar(16) NOT NULL CHECK (signed_on IN ('staff_device','own_phone')),
  ip         inet NOT NULL,
  user_agent text NOT NULL,
  -- KI volt belépve a készüléken. Személyzeti eszköznél ez azonosítja a másik felet
  -- ("ki tartotta a telefont"); saját telefonnál egybeesik az aláíróval.
  operator_user_id uuid NOT NULL REFERENCES users(id),

  -- ── AZ ALÁÍRÁS, VAGY ANNAK MEGTAGADÁSA ────────────────────────────────────
  -- A megtagadás rögzítése a gyakorlatban FONTOSABB, mint az aláírás: egy vitában
  -- az "aláírást megtagadta, tanú jelenlétében" bejegyzés többet ér, mint a
  -- hiányzó sor, amiről semmit nem lehet tudni.
  signature_png text,
  refused_at    timestamptz,
  refusal_reason text,

  created_at timestamptz NOT NULL DEFAULT NOW(),

  -- Vagy aláírás van, vagy megtagadás — a kettő együtt értelmetlen, egyik sem pedig
  -- egy üres sor, aminek semmi bizonyító ereje nincs.
  CONSTRAINT document_signatures_alairas_vagy_megtagadas CHECK (
    (signature_png IS NOT NULL AND refused_at IS NULL)
    OR (signature_png IS NULL AND refused_at IS NOT NULL)
  )
);

-- Egy szerep EGYSZER ír alá egy dokumentumot. Újraaláírás = a régi visszavonása és új
-- sor — nem felülírás, mert a felülírás bizonyítékot semmisítene meg.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_signatures_subject_role
  ON document_signatures (subject_type, subject_id, signer_role);

CREATE INDEX IF NOT EXISTS idx_document_signatures_subject
  ON document_signatures (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signer
  ON document_signatures (signer_employee_id) WHERE signer_employee_id IS NOT NULL;

COMMENT ON TABLE document_signatures IS
  'Egységes aláírás-tár (mig 177). A bizonyító erőhöz tartozó mezők KÖTELEZŐK: '
  'szöveg, szövegverzió, nyelv, pillanatkép, ujjlenyomat, idő, eszköz, IP, kezelő. '
  'Utólag nem pótolhatók — ha rögzítéskor nincsenek meg, nincs bizonyíték.';

COMMIT;
