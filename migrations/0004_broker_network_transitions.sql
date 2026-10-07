-- Bloque: Gobernanza de movimientos Broker / Master Broker
-- Reservamos 0004 porque Bloque 3.1 de actividad utiliza 0003 en su rama paralela.

ALTER TABLE IF EXISTS public.credits
  ADD COLUMN IF NOT EXISTS origin_master_broker_id VARCHAR;

-- Congelar para créditos existentes la afiliación que existe antes de habilitar movimientos de red.
UPDATE public.credits AS c
SET origin_master_broker_id = CASE
  WHEN u.role = 'master_broker' THEN u.id
  WHEN u.role = 'broker' THEN u.master_broker_id
  ELSE NULL
END
FROM public.users AS u
WHERE c.broker_id = u.id
  AND c.origin_master_broker_id IS NULL;

CREATE INDEX IF NOT EXISTS credits_origin_master_broker_idx
  ON public.credits (origin_master_broker_id);

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
END $$;

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
