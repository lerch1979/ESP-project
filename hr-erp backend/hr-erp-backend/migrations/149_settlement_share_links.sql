-- 149: expiring share links for the monthly settlement sheets.
--
-- Same model as accountant_share_links (mig 117): the admin mints a tokenised URL, the
-- partner opens it with no login, and the link dies on its own. Kept as a SEPARATE
-- table rather than widening the accountant one, because the two differ in what they
-- key on — an accountant link is (year, month) for the whole company, a settlement link
-- is (partner, kind, month) and must never serve a different partner's document.
--
-- Security shape, carried over deliberately:
--   • token = crypto.randomUUID() — 122 bits, URL-safe, UNIQUE
--   • expires_at AND revoked_at both checked on every public read
--   • truncated tokens in logs ("tok_…<last6>"), never the full value
--   • the token identifies the document; the URL carries no partner id, so guessing a
--     partner id gets you nothing

BEGIN;

CREATE TABLE IF NOT EXISTS settlement_share_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text NOT NULL UNIQUE,

  -- What this link is allowed to render. A link is bound to ONE partner, ONE kind and
  -- ONE month; it can never be pointed at another document by editing the URL.
  kind          varchar(16) NOT NULL,
  partner_id    uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  billing_month varchar(7) NOT NULL,

  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_by    uuid,
  notes         text,
  last_viewed_at timestamptz,
  last_viewed_ip varchar(45),
  view_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ssl_kind_chk  CHECK (kind IN ('landlord','client')),
  CONSTRAINT ssl_month_chk CHECK (billing_month ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_ssl_partner ON settlement_share_links (partner_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_ssl_live    ON settlement_share_links (expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE settlement_share_links IS
  'Lejáró, tokenes megosztás a havi elszámoló lapokhoz (szállásadó / megbízó). A token EGY partner + EGY típus + EGY hónap dokumentumához köt — az URL átírásával nem lehet másik partner lapját elérni.';

COMMIT;
