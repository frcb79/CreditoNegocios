-- PREPARACION MANUAL MIG-01: ejecutar solo tras respaldo, revisión y aprobación operativa.
-- NO contiene mapeos ni ejecuta inferencias. Cada operación LEGACY requiere una fila
-- con canal comprobado, evidencia y responsable; usar la fecha de originación.
-- 'direct' = sin Master en esa originación; no utilizarlo como sustituto de desconocido.
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

-- Reporte sólo lectura para revisión manual: cuantos registros legacy faltan.
SELECT 'credits' AS record_type, c.id AS record_id, c.broker_id
FROM public.credits c LEFT JOIN public.origin_attribution_reviews r
  ON r.record_type='credits' AND r.record_id=c.id
WHERE r.record_id IS NULL
UNION ALL
SELECT 'credit_submission_requests', s.id, s.broker_id
FROM public.credit_submission_requests s LEFT JOIN public.origin_attribution_reviews r
  ON r.record_type='credit_submission_requests' AND r.record_id=s.id
WHERE r.record_id IS NULL;
