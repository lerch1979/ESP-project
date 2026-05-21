-- Migration 117: accountant share links (rewrites earlier 117 draft)
--
-- Pivot from the per-month-package model (PDF + Excel + ZIP saved to disk,
-- emailed to accountant) to a public-link model:
--   • Admin generates a tokenised share link for (year, month)
--   • Accountant opens https://.../public/accountant/<token> — no login
--   • Page shows the confirmed-expense list for that month + "Download all"
--   • ZIP is built on-demand and streamed; nothing persisted to disk
--   • Link expires automatically (default 14 days) and can be revoked
--
-- Schema rationale:
--   • token TEXT UNIQUE — crypto.randomUUID() in app, but DB-agnostic.
--     UNIQUE index doubles as the lookup index.
--   • expires_at + revoked_at as separate columns — semantic distinction:
--     expired = passive timeout; revoked = active admin action. Audit
--     trail benefits.
--   • accessed_count + last_accessed_at + last_accessed_ip — minimal
--     forensic trail without a separate access-log table. Single most-
--     recent IP only (no JSONB history; that's tech debt if needed).
--   • No CHECK on year > current — accountant might back-fill historical
--     periods after migrating data; just bound 2000-2100 sanity.

-- Tear down the prior accountant_packages table (uncommitted, ~zero data)
DROP TABLE IF EXISTS accountant_packages CASCADE;

CREATE TABLE IF NOT EXISTS accountant_share_links (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year              INTEGER NOT NULL,
  month             INTEGER NOT NULL,          -- 1-12
  token             TEXT NOT NULL UNIQUE,      -- crypto.randomUUID()
  expires_at        TIMESTAMP NOT NULL,
  revoked_at        TIMESTAMP,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accessed_count    INTEGER NOT NULL DEFAULT 0,
  last_accessed_at  TIMESTAMP,
  last_accessed_ip  TEXT,
  notes             TEXT,
  CHECK (month BETWEEN 1 AND 12),
  CHECK (year BETWEEN 2000 AND 2100)
);

CREATE INDEX IF NOT EXISTS idx_accountant_share_period
  ON accountant_share_links(year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_accountant_share_active
  ON accountant_share_links(expires_at)
  WHERE revoked_at IS NULL;
