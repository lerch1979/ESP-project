-- 167: szerződéshez csatolt iratok — EGY mechanizmus, több fájllal.
--
-- A HELYZET
-- ---------
-- A mig 144 a `documents` táblára rátette a party-linket (contractor_id, accommodation_id,
-- lead_id), de SZERZŐDÉSHEZ csak visszafelé lehetett kötni: `partner_contracts.document_id`
-- egyetlen dokumentumra mutatott. Egy bérleti szerződéshez viszont jellemzően több irat
-- tartozik — az eredeti, a módosítások, a mellékletek —, amit egy mező nem tud tárolni.
--
-- MIÉRT VEZETJÜK KI A RÉGI MEZŐT
-- ------------------------------
-- Két párhuzamos mechanizmus ugyanarra a kapcsolatra pontosan az a minta, ami ebben a
-- repóban már kétszer okozott csendes adatvesztést (két számla-tábla, két cost-tracking
-- pipeline). Most fájdalommentes: a rendszerben 1 szerződés van, annak is üres a
-- document_id mezője, és összesen 0 dokumentum. Később nem lenne az.
--
-- AZ ALÁÍRT PÉLDÁNY KÜLÖN JELÖLÉS, NEM TÍPUS
-- ------------------------------------------
-- A típus (szerződés / módosítás / melléklet / egyéb) és az aláírtság KÉT KÜLÖN dimenzió:
-- egy módosítás is lehet aláírt, egy szerződés-tervezet pedig nem az. Egyetlen enumba
-- gyúrva nem lehetne megválaszolni azt a kérdést, ami miatt az egész kell: "megvan-e az
-- ALÁÍRT példány?" — egy melléklet megléte ugyanis nem helyettesíti.

BEGIN;

-- ── a szerződés-link ──────────────────────────────────────────────────────
-- SET NULL, nem CASCADE: egy szerződés törlése ne vigye magával a beszkennelt iratot.
-- A fájl a bizonyíték; ha a szerződés-sor téves volt, az irat akkor is a partneré marad.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES partner_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_contract ON documents(contract_id)
  WHERE contract_id IS NOT NULL AND deleted_at IS NULL;

-- ── az irat kelte és az aláírtság ─────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_date  date,
  ADD COLUMN IF NOT EXISTS is_signed_copy boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN documents.document_date IS
  'Az irat KELTE (mikor írták alá / mikor kelt) — nem azonos a feltöltés idejével.';
COMMENT ON COLUMN documents.is_signed_copy IS
  'TRUE = ez az aláírt példány. A Szerződések tábla ezt mutatja, nem a fájlok puszta számát: egy melléklet megléte nem helyettesíti az aláírt szerződést.';

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_type_chk
    CHECK (document_type IS NULL OR document_type IN
           ('szerzodes', 'modositas', 'melleklet', 'egyeb',
            -- a munkavállalói iratok meglévő típusai érintetlenül maradnak
            'passport', 'id_card', 'contract', 'certificate', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── a régi egy-az-egy link kivezetése ─────────────────────────────────────
-- Ami benne van, átkerül az új linkre. (Ma nulla sor — a lépés attól még kötelező:
-- egy üres migráció és egy adatvesztő migráció között a különbség egyetlen sor adat.)
UPDATE documents d
   SET contract_id = pc.id
  FROM partner_contracts pc
 WHERE pc.document_id = d.id AND d.contract_id IS NULL;

ALTER TABLE partner_contracts DROP COLUMN IF EXISTS document_id;

COMMIT;
