-- 180 — Triage Agent: bejövő üzenetek egységes tárolása
--
-- A Triage-Agent-Spec v1 3. fejezete szerint. Ez az agent-szál ELSŐ migrációja; az
-- 1. hét célja a determinisztikus váz — LLM-hívás, akció-végrehajtás NINCS benne.
--
-- MIÉRT EGY KÖZÖS TÁBLA három csatornára (chat, hibajegy-űrlap, email): mert a
-- feldolgozás (normalizálás → dedup → szabálymotor) csatornafüggetlen. Ha csatornánként
-- külön táblát vezetnénk, a dedup nem látna át rajtuk — pedig pont az a leggyakoribb
-- eset, hogy ugyanazt a csöpögő csapot bejelentik chaten IS, jegyen IS.

BEGIN;

CREATE TABLE IF NOT EXISTS inbound_messages (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('chat','ticket_form','email','push_reply')),
  source_id TEXT NOT NULL,              -- chat msg id / email Message-ID / ticket id
  -- sha256(channel + source_id + body). A UNIQUE rajta azt jelenti, hogy ugyanaz az
  -- üzenet FIZIKAILAG nem kerülhet be kétszer — nem a kódra bízzuk.
  source_hash TEXT NOT NULL,
  sender_type TEXT CHECK (sender_type IN ('resident','partner','landlord','authority','staff','unknown')),
  sender_ref BIGINT,                    -- employees.id / partners.id ha azonosítva
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lang TEXT,                            -- hu/en/tl/uk/unknown (detektált)
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','normalized','classified','planned','executed','review','failed','ignored')),
  error TEXT,
  UNIQUE (source_hash)
);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_status
  ON inbound_messages (status, received_at);

COMMENT ON TABLE inbound_messages IS
  'Triage Agent (spec v1, 3.): minden bejövő üzenet egy helyen, csatornafüggetlenül. '
  'A source_hash UNIQUE adja a fizikai dedup-védelmet.';
COMMENT ON COLUMN inbound_messages.status IS
  'ignored = szándékosan nem dolgozzuk fel (pl. visszatöltött történeti adat), '
  'de a golden set alapja lehet.';

-- ── A meglévő tickets tábla bővítése (spec 3., záró bekezdés) ────────────────
-- Azért ITT, és nem külön migrációban: a source_message_id az imént létrehozott
-- táblára mutat, tehát a kettő egy tranzakcióban tartozik össze.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS created_by_agent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_message_id BIGINT REFERENCES inbound_messages(id),
  -- Duplikátum-jelölés: a jegy egy MÁSIK jegy ismétlése. Nem töröljük az ismétlést,
  -- mert a lakó látta, hogy bejelentette — csak összekötjük.
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES tickets(id);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by_agent
  ON tickets (created_by_agent) WHERE created_by_agent;
CREATE INDEX IF NOT EXISTS idx_tickets_duplicate_of
  ON tickets (duplicate_of) WHERE duplicate_of IS NOT NULL;

COMMIT;
