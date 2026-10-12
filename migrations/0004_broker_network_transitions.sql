-- Gobernanza de movimientos Broker / Master Broker (MIG-01).
-- PROHIBIDO inferir atribución de operaciones históricas desde users.master_broker_id actual.
-- Este script es aditivo y fail-closed: ante un histórico sin snapshot, aborta.
-- Para datos legacy el operador debe reconstruir explícitamente la atribución
-- con evidencia fechada antes de crear origin_master_broker_id; NULL histórico sin
-- evidencia NO se puede considerar originación directa.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'credits'
      AND column_name = 'origin_master_broker_id'
  ) AND EXISTS (SELECT 1 FROM public.credits LIMIT 1) THEN
    RAISE EXCEPTION 'MIG-01: credits contiene registros historicos sin atribucion verificada. No se permite inferir Master desde afiliacion actual. Ejecutar conciliacion manual documentada antes de 0004.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'credit_submission_requests'
      AND column_name = 'origin_master_broker_id'
  ) AND EXISTS (SELECT 1 FROM public.credit_submission_requests LIMIT 1) THEN
    RAISE EXCEPTION 'MIG-01: credit_submission_requests contiene historicos sin atribucion verificada. Resolver con evidencia fechada antes de 0004.';
  END IF;
END
$$;

ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;
CREATE INDEX IF NOT EXISTS credits_origin_master_broker_idx
  ON public.credits (origin_master_broker_id);

ALTER TABLE public.credit_submission_requests
  ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;
CREATE INDEX IF NOT EXISTS credit_submissions_origin_master_idx
  ON public.credit_submission_requests (origin_master_broker_id);

-- En commercial_opportunities la columna master_broker_id ya existe y fue capturada en la originación.
-- Los registros con NULL representan legítimamente originación directa de plataforma y se preservan intactos.
CREATE INDEX IF NOT EXISTS opp_master_broker_idx
  ON public.commercial_opportunities (master_broker_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credits_origin_master_broker_fk'
  ) THEN
    ALTER TABLE public.credits
      ADD CONSTRAINT credits_origin_master_broker_fk
      FOREIGN KEY (origin_master_broker_id)
      REFERENCES public.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_submissions_origin_master_fk'
  ) THEN
    ALTER TABLE public.credit_submission_requests
      ADD CONSTRAINT credit_submissions_origin_master_fk
      FOREIGN KEY (origin_master_broker_id)
      REFERENCES public.users(id);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_credit_origin_master_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin_master_broker_id IS DISTINCT FROM OLD.origin_master_broker_id THEN
    RAISE EXCEPTION 'origin_master_broker_id is immutable after credit creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credits_origin_master_immutable ON public.credits;
CREATE TRIGGER trg_credits_origin_master_immutable
BEFORE UPDATE OF origin_master_broker_id ON public.credits
FOR EACH ROW
EXECUTE FUNCTION public.prevent_credit_origin_master_change();

CREATE OR REPLACE FUNCTION public.prevent_opportunity_origin_master_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.master_broker_id IS DISTINCT FROM OLD.master_broker_id THEN
    RAISE EXCEPTION 'commercial opportunity master_broker_id is immutable after origination';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_origin_master_immutable ON public.commercial_opportunities;
CREATE TRIGGER trg_opportunity_origin_master_immutable
BEFORE UPDATE OF master_broker_id ON public.commercial_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.prevent_opportunity_origin_master_change();

CREATE OR REPLACE FUNCTION public.prevent_submission_origin_master_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin_master_broker_id IS DISTINCT FROM OLD.origin_master_broker_id THEN
    RAISE EXCEPTION 'credit submission origin_master_broker_id is immutable after origination';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_origin_master_immutable ON public.credit_submission_requests;
CREATE TRIGGER trg_submission_origin_master_immutable
BEFORE UPDATE OF origin_master_broker_id ON public.credit_submission_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_submission_origin_master_change();

COMMIT;
