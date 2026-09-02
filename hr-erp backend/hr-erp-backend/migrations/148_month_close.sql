-- 148: month close (finalize / reopen) + elimination of superseded billing rows.
--
-- These are one problem, not two.
--
-- TODAY: `billingEngine.calculateMonthlyBilling` refuses to replace a run whose status
-- is 'finalized' — but NOTHING anywhere sets that status and there is no finalize
-- action, so every month stays `calculated` forever and is silently cancelled-and-
-- replaced by the next re-bill. A month that has been invoiced can therefore change
-- underneath the invoice, because the engine re-derives it from CURRENT occupancy,
-- expenses and rates.
--
-- AND: a re-bill cancels the old run but leaves its `accommodation_billings` rows in
-- place. On prod that is 71 dead rows against 40 live ones — more than half the table.
-- Any query filtering only on (accommodation_id, billing_month) can return a dead row.
-- That is not hypothetical: it produced a false PASS in a test (a re-bill looked like a
-- no-op because the stale row was read), and it made a July figure be reported as 0.00
-- when the live row said 1 116 000.
--
-- The two connect: once a month can be CLOSED, "which row is authoritative" must have
-- exactly one answer. So this migration deletes the dead rows and adds an index that
-- makes a second live row impossible, rather than relying on every future query
-- remembering to join billing_runs.
--
-- WHAT IS *NOT* DELETED: rows of a finalized run. A finalized run can never be replaced
-- (the engine refuses), so it never becomes superseded, so its rows are never in scope
-- of the cleanup below.

BEGIN;

-- ── finalization state on the run ───────────────────────────────────────────
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS finalized_by uuid;

COMMENT ON COLUMN billing_runs.finalized_at IS
  'Mikor zárták le a hónapot. Lezárt futás soha nem számolható újra — a billingEngine elutasítja. Feloldás csak explicit, indokolt reopen művelettel (billing_month_lock_events).';

-- ── audit trail: who closed/reopened a month, when, and why ─────────────────
-- A separate table rather than columns on billing_runs, because a month may be
-- reopened and re-closed more than once and each of those is a fact worth keeping.
CREATE TABLE IF NOT EXISTS billing_month_lock_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_run_id uuid REFERENCES billing_runs(id) ON DELETE SET NULL,
  billing_month  varchar(7) NOT NULL,
  run_type       varchar(16) NOT NULL DEFAULT 'incoming',
  action         varchar(16) NOT NULL,
  reason         text,
  acted_by       uuid,
  acted_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bmle_action_chk CHECK (action IN ('finalize','reopen')),
  -- Reopening a closed month is the dangerous direction: it makes an invoiced figure
  -- recalculable again. It must carry a reason, enforced here rather than trusted to
  -- the controller.
  CONSTRAINT bmle_reopen_reason_chk
    CHECK (action <> 'reopen' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_bmle_month ON billing_month_lock_events (billing_month, acted_at DESC);

COMMENT ON TABLE billing_month_lock_events IS
  'Hónapzárás / -nyitás naplója: ki, mikor, miért. A reopen indoklása kötelező (DB constraint), mert az teszi újra számolhatóvá egy már kiszámlázott hónap adatait.';

-- ── remove the superseded rows ──────────────────────────────────────────────
-- Irreversible except from backup. In scope: ONLY rows whose run was cancelled, i.e.
-- rows the application already treats as non-existent (profit.service, invoiceReport
-- and the run detail view all exclude them). Nothing that any read currently returns
-- is removed.
DO $$
DECLARE removed int;
BEGIN
  WITH doomed AS (
    DELETE FROM accommodation_billings ab
     USING billing_runs br
     WHERE br.id = ab.billing_run_id
       AND br.status = 'cancelled'
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM doomed;
  RAISE NOTICE '148: removed % superseded accommodation_billings row(s) belonging to cancelled runs', removed;
END $$;

-- Rows individually marked cancelled but whose run is still live are also dead weight
-- for the invariant below; the engine never writes them, but be explicit.
DELETE FROM accommodation_billings WHERE status = 'cancelled';

-- ── the invariant, enforced structurally ────────────────────────────────────
-- One LIVE billing row per (accommodation, billing client, month).
--
-- Per (accommodation, CLIENT) — not per accommodation. The engine groups by
-- `${accommodation_id}|${billing_client_id}`, so one site shared by two megbízók
-- legitimately produces two rows for the same month. An index on accommodation alone
-- would reject that real case.
--
-- partner_contractor_id is nullable and PG 14 has no NULLS NOT DISTINCT, so a NULL
-- client is folded onto a fixed sentinel to keep those rows constrained too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accommodation_billings_live
  ON accommodation_billings (
    accommodation_id,
    COALESCE(partner_contractor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    billing_month
  );

COMMIT;
