-- 186 — Triage Agent: AGENT_MODE tárolása (kill switch, spec 1.6)
--
-- MIÉRT VAN EZ A MIGRÁCIÓ, HA A SPEC 3. FEJEZETE NEM ÍRJA ELŐ: a spec 1.6 pontja
-- "`AGENT_MODE=off|shadow|live` env + admin UI kapcsoló"-t kér. Az env-hez nem kell
-- tábla, az ADMIN KAPCSOLÓHOZ igen — egy kapcsoló, ami újraindításig él, nem kapcsoló.
-- A 180–185 pontosan a spec 3. fejezete; ez a 186 a felületi kapcsoló tárolója.
--
-- A HÁZI KONVENCIÓT követi (`chatbot_config`, `nlp_sentiment_config`,
-- `expiry_monitor_config`): egysoros config tábla, uuid kulcs, updated_by/updated_at.
--
-- A KÉT FORRÁS VISZONYA — ez a lényeg, és a kódban is így van (src/agent/mode.js):
-- a SZIGORÚBB győz. Ha az env `off`, a felületi kapcsoló nem tudja `live`-ra tenni.
-- Így egy éles incidensnél az env-ből (deploy) le lehet fogni az agentet úgy, hogy
-- azt egy admin-kattintás ne tudja visszaengedni.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_triage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'shadow', 'live')),
  -- Miért váltott utoljára valaki üzemmódot. Egy `live` → `shadow` váltás incidens;
  -- hat hónap múlva senki nem fogja emlékezni, miért.
  reason TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EGYETLEN SOR lehet: a "melyik config sor az igazi" kérdésre nincs jó válasz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_triage_config_egy_sor
  ON agent_triage_config ((true));

INSERT INTO agent_triage_config (mode, reason)
SELECT 'off', 'Kezdeti állapot (mig 186) — az 1. hét célja a váz, nem az élesítés.'
WHERE NOT EXISTS (SELECT 1 FROM agent_triage_config);

COMMENT ON TABLE agent_triage_config IS
  'Triage Agent kill switch (spec 1.6). Az env AGENT_MODE-dal együtt érvényes: a '
  'SZIGORÚBB győz, tehát env=off esetén a felületi kapcsoló nem tud live-ra váltani.';

COMMIT;
