-- 121: employees.nationality — the primary key for per-attribute expiry rules.
--
-- There was no nationality/citizenship column; permanent_address_country is an
-- address field (empty for all rows) and semantically wrong for citizenship-driven
-- permit lead times. This adds a dedicated ISO-3166 alpha-2 code (e.g. 'PH', 'UA').
--
-- NULLABLE on purpose: all existing employees stay NULL until HR data-gathering
-- fills it in. In the expiry monitor, NULL nationality → the default threshold rule
-- (graceful fallback, not an error). Additive + idempotent. No backfill.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality VARCHAR(2);
