-- Migración: Tabla de Solicitudes de Estado Operativo (Master Broker -> Super Admin)
-- Permite que los Master Brokers soliciten formalmente la Baja o Reactivación de brokers de su red.
-- Super Admin revisa y aprueba o rechaza con bitácora inmutable.

CREATE TABLE IF NOT EXISTS public.user_status_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id VARCHAR NOT NULL REFERENCES public.users(id),
  target_user_id VARCHAR NOT NULL REFERENCES public.users(id),
  requested_status VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR REFERENCES public.users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS "idx_usr_req_requester" ON public.user_status_requests (requester_id);
CREATE INDEX IF NOT EXISTS "idx_usr_req_target" ON public.user_status_requests (target_user_id);
CREATE INDEX IF NOT EXISTS "idx_usr_req_status" ON public.user_status_requests (status);

-- Índice único parcial para evitar carreras concurrentes de solicitudes duplicadas pendientes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_usr_req_unique_pending" 
  ON public.user_status_requests (requester_id, target_user_id, requested_status) 
  WHERE status = 'pending';
