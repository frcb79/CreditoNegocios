-- Migración Aditiva: Snapshots Legales Personalizados y OTP de Formalización (Fase 1A.3B / 1A.4)
-- Este archivo es aditivo, independiente y no es ejecutado automáticamente por el servidor en tiempo de arranque.
-- Preserva la inmutabilidad de evidencias legales y el desacoplamiento de almacenamiento histórico (LEG-13).

-- 1. Asegurar tabla de solicitudes OTP de formalización de convenios
CREATE TABLE IF NOT EXISTS public.formalization_otp_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_email VARCHAR NOT NULL,
  user_name VARCHAR,
  user_role VARCHAR(64) NOT NULL,
  documents_snapshot JSONB NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  resend_available_at TIMESTAMP NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMP,
  invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  invalidated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formalization_otp_user_id ON public.formalization_otp_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_formalization_otp_created_at ON public.formalization_otp_requests(created_at);

-- 2. Asegurar columnas de snapshots personalizados y dual-hash en evidencias legales (legal_acceptances)
ALTER TABLE public.legal_acceptances
  ADD COLUMN IF NOT EXISTS template_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS personalized_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS personalized_snapshot JSONB;

-- 3. Índices para búsqueda por hash de evidencia
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_personalized_sha256 ON public.legal_acceptances(personalized_sha256);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_template_sha256 ON public.legal_acceptances(template_sha256);
