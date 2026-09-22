-- 170: SZIGNÁLÁS — gazdátlan hibajegy nem maradhat + a megosztási linkek egyesítése.
--
-- AZ ESET, AMI ELŐHOZTA
-- ---------------------
-- Eszti a mobilappból nyitott két hibajegyet (#19, #20). Mindkettő SENKIRE nem került, és
-- senki nem is kapott róla értesítést. Az ok nem egy hiba volt, hanem három, egymástól
-- függetlenül is elegendő:
--   1. a szabályok `admin` és `facility_manager` szerepkörre mutatnak — MINDKETTŐBEN
--      nulla aktív felhasználó van (mind a négy valódi ember `superadmin`),
--   2. a "normál hibajegyek" szabály `medium`/`low` prioritásra vár, a rendszer viszont
--      `normal` értéket használ — így egyetlen szabály sem illeszkedett,
--   3. a végfogás azonos `contractor_id`-jú admint keres; Eszti fiókja a "Housing
--      Solutions Kft" partnersoron ül, a négy superadmin viszont a `00000000-…-0001`
--      alapértelmezett bérlőn — nulla találat.
--
-- Ez a migráció a 3. pontot oldja meg strukturálisan: a szignálásnak lesz egy KONFIGURÁLT
-- alapértelmezett felelőse, aki nem függ szerepkörtől, bérlőtől és szabálytól. A jegy
-- inkább kerüljön ideiglenesen rossz emberhez, mint senkihez.

BEGIN;

-- ── 1. SZIGNÁLÁSI BEÁLLÍTÁS ──────────────────────────────────────────────
-- Egysoros konfigurációs tábla, a consolidation_config / expiry_monitor_config
-- mintájára. A felelős NEM a kódba égetve: a tulajdonos bármikor átállíthatja,
-- anélkül hogy deployolni kellene.
CREATE TABLE IF NOT EXISTS ticket_assignment_config (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Az a felelős, aki MINDIG megkapja a jegyet, ha más nem illeszkedik. Ő osztja tovább.
  default_assignee_id    uuid REFERENCES users(id),
  -- Értesítés az új jegyről (appban mindig; e-mailben csak ha az SMTP be van állítva).
  notify_assignee        boolean NOT NULL DEFAULT true,
  -- Hány nap után szóljunk, ha a szállásadó nem jelzett vissza.
  landlord_notice_days   integer NOT NULL DEFAULT 3 CHECK (landlord_notice_days > 0),
  -- Hány napig érvényes a szállásadónak küldött link.
  share_link_days        integer NOT NULL DEFAULT 30 CHECK (share_link_days > 0),
  updated_by             uuid REFERENCES users(id),
  updated_at             timestamptz NOT NULL DEFAULT NOW(),
  created_at             timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ticket_assignment_config IS
  'Hibajegy-szignálás beállításai. A default_assignee_id az a felelős, akihez minden olyan jegy kerül, amire más szabály nem illeszkedik — gazdátlan jegy nem maradhat.';

-- Kezdőérték: Lerch-Fülöp Eszter. Ha nincs meg (más környezet), a sor akkor is
-- létrejön üres felelőssel, és a szolgáltatás ezt HANGOSAN jelzi, nem csendben tűri.
INSERT INTO ticket_assignment_config (default_assignee_id)
SELECT (SELECT id FROM users WHERE email = 'fulop.eszter87@gmail.com' AND is_active LIMIT 1)
 WHERE NOT EXISTS (SELECT 1 FROM ticket_assignment_config);

-- ── 2. KARBANTARTÁSI FELELŐSSÉG SZÁLLÁSONKÉNT ────────────────────────────
-- MIÉRT KÜLÖN TÁBLA, és nem egy mező az accommodations-ön: mert kategóriánként eltér.
-- Életszerűen a kazán a szállásadóé, a villanykörte a miénk — egy házszintű mező
-- kényszerítené, hogy az egész házra egyet mondjunk. Ugyanaz a minta, mint a hat soros
-- rezsi-mátrixnál.
CREATE TABLE IF NOT EXISTS accommodation_maintenance_rules (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id uuid NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  -- NULL = a ház MINDEN kategóriájára vonatkozik. Egy konkrét kategória felülírja.
  category_id      uuid REFERENCES ticket_categories(id) ON DELETE CASCADE,
  handled_by       varchar(16) NOT NULL CHECK (handled_by IN ('mi','szallasado')),
  note             text,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

-- Egy (ház, kategória) pár egyszer szerepelhet. A NULL kategóriát a Postgres nem tekinti
-- egyenlőnek önmagával, ezért a házszintű alapértelmezésre KÜLÖN részleges index kell —
-- enélkül ugyanarra a házra több, egymásnak ellentmondó alapértelmezés kerülhetne be.
CREATE UNIQUE INDEX IF NOT EXISTS uq_amr_acc_cat
  ON accommodation_maintenance_rules (accommodation_id, category_id)
  WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_amr_acc_default
  ON accommodation_maintenance_rules (accommodation_id)
  WHERE category_id IS NULL;

COMMENT ON TABLE accommodation_maintenance_rules IS
  'Ki intézi a karbantartást: mi vagy a szállásadó, szállásonként és kategóriánként. Ahol nincs sor, az alapértelmezés "mi" — a korábbi viselkedés.';

-- ── 3. MEGOSZTÁSI LINKEK — EGY TÁBLA HÁROM HELYETT ───────────────────────
-- A rendszerben HÁROM, egymástól független megosztási mechanizmus élt
-- (accountant_share_links mig 117, settlement_share_links mig 149, quotes.share_token
-- mig 150), mindhárom ugyanazzal a biztonsági alakzattal: uuid token az URL-ben,
-- expires_at ÉS revoked_at minden publikus olvasásnál, csonkolt token a logban,
-- megtekintés-számláló. Három másolat azt jelenti, hogy egy javítás (vagy egy megtalált
-- hiba) nem ér el a másik kettőhöz.
--
-- A tulajdonosi döntés 2026-09-03-án az volt, hogy Phase 4-ben egyesítjük. A hibajegy-
-- megosztás most azért hozza ezt előre, mert a kérés kifejezetten az volt: NE épüljön
-- negyedik mechanizmus. Így a jegy-link az egyesített tábla első ügyfele lesz, nem a
-- negyedik másolat.
--
-- A régi táblák MEGMARADNAK, csak már nem olvas belőlük senki — így egy elrontott
-- átállás visszagördíthető anélkül, hogy a könyvelői linkek elvesznének.
CREATE TABLE IF NOT EXISTS share_links (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token          text NOT NULL UNIQUE,
  -- MIRE mutat: 'accountant' | 'settlement' | 'quote' | 'ticket'
  target_type    varchar(24) NOT NULL CHECK (target_type IN ('accountant','settlement','quote','ticket')),
  target_id      uuid,
  -- A típusonként eltérő paraméterek (hónap, kind, partner) egy helyen, séma-változás
  -- nélkül. Egy új megosztás-típus így nem igényel új oszlopot.
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  created_by     uuid REFERENCES users(id),
  notes          text,
  last_viewed_at timestamptz,
  last_viewed_ip varchar(64),
  view_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_target ON share_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_share_links_live ON share_links (token) WHERE revoked_at IS NULL;

COMMENT ON TABLE share_links IS
  'EGYESÍTETT megosztási linkek. A könyvelői, elszámoló-lapi, árajánlat- és hibajegy-linkek egy táblában, egy feloldóval. A régi három tábla megmarad, de már nem olvas belőlük senki.';

-- A meglévő sorok átvétele. Élesben ez 2 + 1 + 0 sor, tehát a művelet kicsi és
-- ellenőrizhető — pont ezért érdemes MOST megtenni, nem akkor, amikor már sok lesz.
-- A három tábla ugyanazt a fogalmat MÁS OSZLOPNEVEKKEL tárolja: itt
-- accessed_count / last_accessed_at / last_accessed_ip, a settlementnél
-- view_count / last_viewed_at / last_viewed_ip. Ez önmagában is az egyesítés
-- indoka — a leképezés ezért nem 1:1 másolás.
INSERT INTO share_links (token, target_type, target_id, context, expires_at, revoked_at,
                         created_by, notes, last_viewed_at, last_viewed_ip, view_count, created_at)
SELECT a.token, 'accountant', NULL,
       jsonb_strip_nulls(jsonb_build_object('year', a.year, 'month', a.month)),
       a.expires_at, a.revoked_at, a.created_by, a.notes, a.last_accessed_at,
       a.last_accessed_ip, COALESCE(a.accessed_count, 0), a.created_at
  FROM accountant_share_links a
 WHERE NOT EXISTS (SELECT 1 FROM share_links s WHERE s.token = a.token);

INSERT INTO share_links (token, target_type, target_id, context, expires_at, revoked_at,
                         created_by, notes, last_viewed_at, last_viewed_ip, view_count, created_at)
SELECT s2.token, 'settlement', s2.partner_id,
       jsonb_strip_nulls(jsonb_build_object('kind', s2.kind, 'billing_month', s2.billing_month)),
       s2.expires_at, s2.revoked_at, s2.created_by, s2.notes, s2.last_viewed_at,
       s2.last_viewed_ip, COALESCE(s2.view_count, 0), s2.created_at
  FROM settlement_share_links s2
 WHERE NOT EXISTS (SELECT 1 FROM share_links s WHERE s.token = s2.token);

INSERT INTO share_links (token, target_type, target_id, context, created_at)
SELECT q.share_token, 'quote', q.id, '{}'::jsonb, COALESCE(q.created_at, NOW())
  FROM quotes q
 WHERE q.share_token IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM share_links s WHERE s.token = q.share_token);

-- ── 4. A SZÁLLÁSADÓI TOVÁBBÍTÁS NYOMA A JEGYEN ───────────────────────────
-- Nem külön tábla: egy jegyhez egy szállásadói értesítés tartozik, és a visszajelzés
-- a jegy állapota. Külön táblában ugyanez csak egy JOIN-nal messzebb lenne.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS landlord_notified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS landlord_contact_email    varchar(255),
  ADD COLUMN IF NOT EXISTS landlord_status           varchar(24),
  ADD COLUMN IF NOT EXISTS landlord_responded_at     timestamptz,
  ADD COLUMN IF NOT EXISTS landlord_reminded_at      timestamptz;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_landlord_status_chk;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_landlord_status_chk CHECK (
    landlord_status IS NULL OR landlord_status IN ('megkaptam','folyamatban','javitva')
  );

COMMENT ON COLUMN tickets.landlord_status IS
  'A szállásadó visszajelzése a lejáró linken keresztül: megkaptam / folyamatban / javitva. NULL = még nem jelzett vissza. A nálunk kijelölt felelős akkor is követi, ha a javítás a szállásadóé.';

COMMIT;
