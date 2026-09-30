-- 181 — Triage Agent: az osztályozás eredménye (szabály + LLM)
--
-- MIÉRT EGY TÁBLÁBAN a szabály- és az LLM-eredmény: mert a spec 1. alapelve szerint az
-- LLM SOSEM dönt egyedül. A `rule_hits` és az `llm_output` egymás mellett áll, a
-- `final_source` pedig megmondja, ki döntött. Ha külön táblában lennének, egy vitában
-- utólag nem lehetne rekonstruálni, hogy a szabály vagy a modell mondta-e.
--
-- Az 1. héten az `llm_*` mezők ÜRESEN maradnak — LLM-hívás ezen a héten nincs.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_classifications (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES inbound_messages(id),
  rule_hits JSONB NOT NULL DEFAULT '[]',   -- melyik determinisztikus szabály talált
  llm_model TEXT,
  llm_output JSONB,                        -- a validált JSON (spec 5.)
  category TEXT NOT NULL,
  subcategory TEXT,
  urgency TEXT CHECK (urgency IN ('low','normal','high','critical')),
  confidence NUMERIC(4,3),
  duplicate_of_ticket BIGINT,
  final_source TEXT CHECK (final_source IN ('rule','llm','rule+llm','human')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_classifications_message
  ON agent_classifications (message_id, created_at DESC);

COMMENT ON TABLE agent_classifications IS
  'Triage Agent (spec v1, 3.): a szabálymotor ÉS az LLM eredménye egymás mellett. '
  'A final_source mondja meg, ki döntött — enélkül utólag nem rekonstruálható.';

COMMIT;
