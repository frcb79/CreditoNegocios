-- MIG-01: captura histórica con evidencia auditada, NUNCA inferida de users.master_broker_id.
-- Ejecutar manualmente preflight_0004_origin_attribution_reviews.sql en entorno autorizado
-- y llenar SOLO filas con evidencia verificable antes de migrar bases con créditos existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.origin_attribution_reviews (
  record_type VARCHAR NOT NULL CHECK (record_type IN ('credits','credit_submission_requests')),
  record_id VARCHAR NOT NULL,
  channel_type VARCHAR NOT NULL CHECK (channel_type IN ('master_network','direct')),
  origin_master_broker_id VARCHAR REFERENCES public.users(id),
  evidence_reference TEXT NOT NULL CHECK (length(btrim(evidence_reference)) > 0),
  reviewed_by VARCHAR NOT NULL CHECK (length(btrim(reviewed_by)) > 0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_type, record_id),
  CHECK ((channel_type = 'direct' AND origin_master_broker_id IS NULL) OR
         (channel_type = 'master_network' AND origin_master_broker_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.app_migrations (
  id VARCHAR PRIMARY KEY,
  executed_at TIMESTAMP DEFAULT NOW()
);

DO $$
DECLARE
  missing_credits BIGINT;
  missing_submissions BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_migrations WHERE id = '0004_origin_attribution_reviewed_v1'
  ) THEN
    SELECT COUNT(*) INTO missing_credits
    FROM public.credits c LEFT JOIN public.origin_attribution_reviews r
      ON r.record_type = 'credits' AND r.record_id = c.id
    WHERE r.record_id IS NULL;

    SELECT COUNT(*) INTO missing_submissions
    FROM public.credit_submission_requests s LEFT JOIN public.origin_attribution_reviews r
      ON r.record_type = 'credit_submission_requests' AND r.record_id = s.id
    WHERE r.record_id IS NULL;

    IF missing_credits > 0 OR missing_submissions > 0 THEN
      RAISE EXCEPTION 'MIG-01: hay % creditos y % solicitudes sin revision historica documentada. No ejecutar 0004; completar origin_attribution_reviews primero.', missing_credits, missing_submissions;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.origin_attribution_reviews r
      LEFT JOIN public.users u ON u.id = r.origin_master_broker_id
      WHERE r.channel_type = 'master_network' AND (u.id IS NULL OR u.role <> 'master_broker')
    ) THEN
      RAISE EXCEPTION 'MIG-01: Master historico revisado invalido; verificar identidad y rol.';
    END IF;
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_migrations WHERE id = '0004_origin_attribution_reviewed_v1'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.credits c JOIN public.origin_attribution_reviews r
        ON r.record_type='credits' AND r.record_id=c.id
      WHERE c.origin_master_broker_id IS NOT NULL
        AND c.origin_master_broker_id IS DISTINCT FROM r.origin_master_broker_id
    ) OR EXISTS (
      SELECT 1 FROM public.credit_submission_requests s JOIN public.origin_attribution_reviews r
        ON r.record_type='credit_submission_requests' AND r.record_id=s.id
      WHERE s.origin_master_broker_id IS NOT NULL
        AND s.origin_master_broker_id IS DISTINCT FROM r.origin_master_broker_id
    ) THEN
      RAISE EXCEPTION 'MIG-01: snapshot historico preexistente contradice revision. Abortado sin sobrescribir.';
    END IF;

    UPDATE public.credits c SET origin_master_broker_id = r.origin_master_broker_id
    FROM public.origin_attribution_reviews r
    WHERE r.record_type='credits' AND r.record_id=c.id
      AND c.origin_master_broker_id IS DISTINCT FROM r.origin_master_broker_id;
    UPDATE public.credit_submission_requests s SET origin_master_broker_id = r.origin_master_broker_id
    FROM public.origin_attribution_reviews r
    WHERE r.record_type='credit_submission_requests' AND r.record_id=s.id
      AND s.origin_master_broker_id IS DISTINCT FROM r.origin_master_broker_id;
    INSERT INTO public.app_migrations(id) VALUES ('0004_origin_attribution_reviewed_v1')
      ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

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
