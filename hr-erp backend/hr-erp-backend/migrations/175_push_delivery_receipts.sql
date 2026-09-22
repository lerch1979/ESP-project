-- 175: PUSH-KÉZBESÍTÉS ELLENŐRZÉSE — a ticket nem bizonyíték.
--
-- AZ ESET (2026-09-22): "a push nem érkezik meg". A rendszer `{"sent":1}`-et jelentett,
-- ami sikernek látszott. Kiderült, hogy a `sendToUser` CSAK az Expo PUSH TICKET-jét
-- nézi — az viszont mindössze annyit mond, hogy az Expo ÁTVETTE a küldést. A tényleges
-- kézbesítés eredménye a RECEIPT-ben van, amit külön kell lekérdezni, és ahol az APNs/FCM
-- hibák megjelennek (hiányzó hitelesítés, rossz bundle, letiltott eszköz).
--
-- Az akkori hiba végül máshol volt, de a vizsgálat kimutatta a vakfoltot: ha az APNs
-- ELUTASÍTJA a küldést, a rendszer ma AKKOR IS sikert jelentene, és senki nem tudná meg.
--
-- ⚠️ A FOGALMI KÜLÖNBSÉG, AMIT A TÁBLA RÖGZÍT
--   'atveve'     → az Expo átvette (ticket ok). NEM jelenti, hogy a telefon megkapta.
--   'kezbesitve' → a receipt is ok. Ez a tényleges siker.
--   'hibas'      → a receipt hibát adott. Itt derül ki az APNs/FCM probléma.
-- A kettő összemosása pontosan az a csendes degradálódás, ami miatt fél napot kerestünk
-- egy nem létező APNs-hibát.

BEGIN;

CREATE TABLE IF NOT EXISTS push_deliveries (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  expo_push_token  text NOT NULL,
  -- Az Expo ticket azonosítója; ezzel kérdezhető le később a receipt. NULL, ha már a
  -- ticket is hibát adott — olyankor nincs mit lekérdezni.
  ticket_id        text,
  notification_type varchar(48),
  status           varchar(16) NOT NULL DEFAULT 'atveve',
  error_code       varchar(64),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  checked_at       timestamptz,

  CONSTRAINT push_deliveries_status_chk CHECK (status IN ('atveve','kezbesitve','hibas'))
);

-- A nyugta-lekérdező ezt a sort keresi: átvett, még nem ellenőrzött, van ticket-azonosítója.
CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
  ON push_deliveries (created_at)
  WHERE status = 'atveve' AND ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_deliveries_user ON push_deliveries (user_id, created_at DESC);

COMMENT ON TABLE push_deliveries IS
  'Push-küldések kézbesítési nyoma. Az "atveve" csak annyit jelent, hogy az Expo átvette; a tényleges kézbesítést a RECEIPT igazolja (kezbesitve), a hibát pedig az mutatja meg (hibas). A kettő összemosása rejtette el korábban, hogy egy push nem ért célba.';

COMMIT;
