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
    -- Congelar la afiliación existente antes de habilitar movimientos de red.
    UPDATE public.credits AS c
    SET origin_master_broker_id = CASE
      WHEN u.role = 'master_broker' THEN u.id
      WHEN u.role = 'broker' AND mb.role = 'master_broker' THEN mb.id
      ELSE NULL
    END
    FROM public.users AS u
    LEFT JOIN public.users AS mb ON mb.id = u.master_broker_id
    WHERE c.broker_id = u.id;

    -- Legacy Casa Matriz links (broker -> admin/super_admin) are direct platform brokers.
    UPDATE public.users AS broker
    SET master_broker_id = NULL,
        updated_at = NOW()
    WHERE broker.role = 'broker'
      AND broker.master_broker_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users AS parent_user
        WHERE parent_user.id = broker.master_broker_id
          AND parent_user.role = 'master_broker'
      );
  END IF;
END
$$;

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
