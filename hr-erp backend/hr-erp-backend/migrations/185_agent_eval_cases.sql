-- 185 — Triage Agent: golden set, címkézett minták a méréshez
--
-- A spec 7.1 szerint MÉRÉS NÉLKÜL NINCS ÉLESÍTÉS. Ez a tábla tartja a kézzel
-- címkézett elvárt kimeneteket, amikhez a precision/recall mérődik.
--
-- Az 1. héten a tábla ÜRESEN jön létre: a címkézés a 2. hét feladata (Eszti + Timi,
-- ~200 minta). A backfill viszont már most feltölti az `inbound_messages`-t a meglévő
-- jegyekből és üzenetekből — azokból lesznek a minták.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_eval_cases (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT REFERENCES inbound_messages(id),
  expected JSONB NOT NULL,                 -- kézzel címkézett elvárt kimenet
  tags TEXT[],                             -- 'injection','duplicate','multi_issue','tl','uk',...
  labeled_by TEXT,
  labeled_at TIMESTAMPTZ DEFAULT now()
);

-- Egy üzenethez EGY címkézés tartozzon: két egymásnak ellentmondó elvárás a mérést
-- tenné értelmetlenné (melyikhez képest mérünk?).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_eval_cases_message
  ON agent_eval_cases (message_id) WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_eval_cases_tags
  ON agent_eval_cases USING GIN (tags);

COMMENT ON TABLE agent_eval_cases IS
  'Triage Agent (spec v1, 7.1): golden set. Mérés nélkül nincs élesítés — ehhez a '
  'táblához mérjük a precision/recall értékeket.';

COMMIT;
