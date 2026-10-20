-- 0008: enforce unique target -> credit linkage (OPE-06).
-- A credit can belong to only ONE target. Multiple different credits
-- belonging to different targets of the SAME request remain allowed.
-- Do not run on Staging/Production without backup, historical reconciliation
-- and verified rollback; no historical linkage is silently rewritten.

DO $$
DECLARE duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT credit_id
    FROM public.credit_submission_targets
    WHERE credit_id IS NOT NULL
    GROUP BY credit_id
    HAVING COUNT(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '0008_OPE06_DUPLICATE_CREDIT_LINKS: % credits linked to multiple targets; reconcile before migration.', duplicate_count;
  END IF;
END $$;

-- PostgreSQL UNIQUE permits multiple NULLs: pending targets stay unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS cst_credit_link_unique
  ON public.credit_submission_targets(credit_id);
