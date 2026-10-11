-- Bloque: Gobernanza de movimientos Broker / Master Broker
-- Reservamos 0004 porque Bloque 3.1 de actividad utiliza 0003 en su rama paralela.
--
-- IMPORTANTE: NULL en origin_master_broker_id significa legítimamente
-- "originado directo bajo Crédito Negocios". El backfill sólo puede ocurrir
-- cuando la columna se crea por primera vez.

DO $$
DECLARE
  origin_column_already_existed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credits'
      AND column_name = 'origin_master_broker_id'
  ) INTO origin_column_already_existed;

  ALTER TABLE public.credits
    ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;

  IF NOT origin_column_already_existed THEN
    -- Congelar la afiliación existente únicamente al crear la columna por primera vez.
    -- Si el broker no tenía Master Broker (o pertenecía directamente a Crédito Negocios),
    -- se preserva NULL de manera estricta para respetar la originación directa de plataforma.
    UPDATE public.credits AS c
    SET origin_master_broker_id = CASE
      WHEN u.role = 'master_broker' THEN u.id
      WHEN u.role = 'broker' AND mb.role = 'master_broker' THEN mb.id
      ELSE NULL
    END
    FROM public.users AS u
    LEFT JOIN public.users AS mb ON mb.id = u.master_broker_id
    WHERE c.broker_id = u.id
      AND c.origin_master_broker_id IS NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS credits_origin_master_broker_idx
  ON public.credits (origin_master_broker_id);

DO $$
DECLARE
  sub_origin_column_already_existed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_submission_requests'
      AND column_name = 'origin_master_broker_id'
  ) INTO sub_origin_column_already_existed;

  ALTER TABLE public.credit_submission_requests
    ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;

  IF NOT sub_origin_column_already_existed THEN
    -- Congelar la afiliación existente únicamente al crear la columna por primera vez.
    -- Se preserva NULL si no hay Master Broker activo para respetar la originación directa de plataforma.
    UPDATE public.credit_submission_requests AS submission
    SET origin_master_broker_id = CASE
      WHEN broker.role = 'master_broker' THEN broker.id
      WHEN broker.role = 'broker' AND parent_master.role = 'master_broker' THEN parent_master.id
      ELSE NULL
    END
    FROM public.users AS broker
    LEFT JOIN public.users AS parent_master ON parent_master.id = broker.master_broker_id
    WHERE submission.broker_id = broker.id
      AND submission.origin_master_broker_id IS NULL;
  END IF;
END
$$;

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
