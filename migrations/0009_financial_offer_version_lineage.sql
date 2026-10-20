-- 0009 FIN-P0: exact canonical offer/version linkage.
-- PREPARED ONLY. DO NOT EXECUTE without historical 0004/0005 reconciliation,
-- isolated database backup, rollback rehearsal and explicit deployment approval.
-- Legacy rows stay NULL; NEVER infer offer solely from financialInstitutionId.
DO $$
DECLARE tbl text; constraint_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['credit_submission_targets','credits','commissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS institution_product_id VARCHAR', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version_number INTEGER', tbl);
    constraint_name := tbl || '_offer_identity_pair_ck';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name AND conrelid = format('public.%I',tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((institution_product_id IS NULL AND version_number IS NULL) OR (institution_product_id IS NOT NULL AND version_number IS NOT NULL AND version_number > 0)) NOT VALID', tbl,constraint_name);
    END IF;
    constraint_name := tbl || '_offer_version_fk';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name AND conrelid = format('public.%I',tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (institution_product_id,version_number) REFERENCES public.institution_product_versions(institution_product_id,version_number) NOT VALID', tbl,constraint_name);
    END IF;
  END LOOP;
END $$;
-- NOT VALID constraints still enforce NEW/UPDATED rows.
-- No historical backfill or foreign identity fabrication.
