-- 183 — Triage Agent: policy tábla + a spec 6. fejezetének seedje
--
-- A spec 1.5 alapelve: "L-szint a kódban, nem a promptban." Az executor EBBŐL a
-- táblából olvassa, melyik akció melyik szinten futhat — a prompt nem tudja felülírni.
--
-- A seed PONTOSAN a 6. fejezet táblázata. Az `enabled` MINDENHOL false: az 1. hét
-- célja a váz, nem az élesítés. Élesíteni az admin felületen, tételesen kell.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_action_policy (
  action_type TEXT PRIMARY KEY,
  max_autonomy_level SMALLINT NOT NULL,
  min_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.900,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AZ ÖRÖK L1 ZÓNA VÉDELME (spec 6., utolsó sor: "Soha nem L2. Policy táblában
-- hard-coded max 1."). Egy elgépelt admin-kattintás nem emelheti L2-re azt, ami
-- pénzhez, szerződéshez, munkaviszonyhoz vagy hatósághoz nyúl. Ezt az adatbázis
-- mondja ki, nem a felület — a felületet meg lehet kerülni.
ALTER TABLE agent_action_policy DROP CONSTRAINT IF EXISTS agent_action_policy_l1_zone_chk;
ALTER TABLE agent_action_policy ADD CONSTRAINT agent_action_policy_l1_zone_chk CHECK (
  action_type NOT IN (
    'draft_email_reply','extract_attachment_data','close_ticket',
    'change_room','terminate','unlock_account'
  ) OR max_autonomy_level <= 1
);

ALTER TABLE agent_action_policy DROP CONSTRAINT IF EXISTS agent_action_policy_level_chk;
ALTER TABLE agent_action_policy ADD CONSTRAINT agent_action_policy_level_chk
  CHECK (max_autonomy_level BETWEEN 0 AND 3);

-- ── Seed: a spec 6. fejezetének táblázata, soronként ────────────────────────
INSERT INTO agent_action_policy (action_type, max_autonomy_level, min_confidence, enabled) VALUES
  -- L2-ig futhat (visszavonható, lakó felé nem kötelezettségvállalás)
  ('ack_resident',            2, 0.900, false),
  ('create_ticket',           2, 0.900, false),
  ('link_duplicate',          2, 0.950, false),   -- rossz összekötés rosszabb, mint dupla jegy
  ('bump_urgency',            2, 0.900, false),
  ('assign_ticket',           2, 0.900, false),
  ('notify_staff',            2, 0.900, false),
  ('faq_reply',               2, 0.900, false),
  ('create_todo',             2, 0.900, false),
  ('remind_staff',            2, 0.900, false),
  ('escalate_admin',          2, 0.900, false),
  -- ÖRÖK L1: ember dönt, mindig
  ('draft_email_reply',       1, 0.900, false),
  ('extract_attachment_data', 1, 0.900, false),
  ('close_ticket',            1, 0.900, false),
  ('change_room',             1, 0.900, false),
  ('terminate',               1, 0.900, false),
  ('unlock_account',          1, 0.900, false)
ON CONFLICT (action_type) DO NOTHING;

COMMENT ON TABLE agent_action_policy IS
  'Triage Agent (spec v1, 6.): melyik akció milyen szinten futhat. Az executor INNEN '
  'olvas, a prompt nem írja felül. A CHECK zárja ki, hogy az örök-L1 akciók L2-re '
  'kerüljenek — egy elgépelt kattintás sem emelheti.';

COMMIT;
