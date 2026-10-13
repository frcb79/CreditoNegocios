-- 0008: OPE-06 request-scoped unique winner backstop (additive).
-- DO NOT run on Production or Staging until the independent historical
-- reconciliation and rollback/backup preflight authorize this migration.
-- Executing this file on any environment performs the DDL. No automatic backfill.
--
-- A winner is considered claimed if any of these legacy/modern indicators hold.
-- Historical conflicts must be examined, NOT silently resolved by migration.
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT request_id
    FROM public.credit_submission_targets
    WHERE is_winner IS TRUE OR credit_id IS NOT NULL
       OR status IN ('selected_winner', 'dispersed')
    GROUP BY request_id HAVING COUNT(*) > 1
  ) duplicate_requests;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '0008_OPE06_DUPLICATE_WINNERS: % requests have competing winner targets. Review history before retrying.', duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cst_one_winner_per_request_idx
  ON public.credit_submission_targets(request_id)
  WHERE is_winner IS TRUE OR credit_id IS NOT NULL
     OR status IN ('selected_winner', 'dispersed');
