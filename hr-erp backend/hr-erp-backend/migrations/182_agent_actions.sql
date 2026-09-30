-- 182 — Triage Agent: tervezett és végrehajtott akciók, L-szint kapuval
--
-- KÉT DOLOG, AMI ITT NEM ALKU TÁRGYA (spec 1.3 és 1.5):
--
-- 1. `idempotency_key` UNIQUE. A spec szavaival: "dupla feldolgozás fizikailag
--    lehetetlen". Nem a kód vigyáz rá, hanem az adatbázis — a kódban lévő ellenőrzést
--    egy jövőbeli átírás kikerülhetné, az egyedi indexet nem.
--
-- 2. `autonomy_level` a policy táblából MÁSOLVA, nem hivatkozva. Ha hivatkoznánk, egy
--    későbbi policy-módosítás visszamenőleg átírná, milyen szinten futott egy már
--    végrehajtott akció — vagyis a napló hazudna arról, mi történt.
--
-- Az 1. héten ide SEM kerül sor: akció-végrehajtás nincs.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_actions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT REFERENCES inbound_messages(id),
  classification_id BIGINT REFERENCES agent_classifications(id),
  action_type TEXT NOT NULL,               -- spec 6. táblázat
  payload JSONB NOT NULL,
  autonomy_level SMALLINT NOT NULL,        -- 0..3, a policy táblából MÁSOLVA
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','approved','executed','rejected','failed','rolled_back')),
  executed_at TIMESTAMPTZ,
  executed_by TEXT,                        -- 'agent' | user email
  rollback_payload JSONB,                  -- mit kell visszaállítani
  attempts SMALLINT DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_status
  ON agent_actions (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_message
  ON agent_actions (message_id);

-- ŐRSZEM A LEGSÚLYOSABB HIBÁRA (spec 7.5): "bármely L1 akció agent által" — ez
-- elvileg lehetetlen, és ha mégis megtörténik, az bug. Az adatbázis is mondja ki:
-- L1-es akciót az AGENT nem hajthat végre, csak ember.
ALTER TABLE agent_actions DROP CONSTRAINT IF EXISTS agent_actions_l1_not_by_agent_chk;
ALTER TABLE agent_actions ADD CONSTRAINT agent_actions_l1_not_by_agent_chk CHECK (
  NOT (autonomy_level <= 1 AND status = 'executed' AND executed_by = 'agent')
);

COMMENT ON TABLE agent_actions IS
  'Triage Agent (spec v1, 3.): tervezett akciók. Az idempotency_key UNIQUE teszi '
  'fizikailag lehetetlenné a dupla végrehajtást; a CHECK zárja ki, hogy L1-es akciót '
  'az agent hajtson végre.';

COMMIT;
