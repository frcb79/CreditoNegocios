-- Bloque 3.1 — Actividad y Bitácora de Usuarios
-- Separa sesiones técnicas (public.sessions) de sesiones de uso y eventos significativos.

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE SET NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  heartbeat_count INTEGER NOT NULL DEFAULT 0,
  end_reason VARCHAR,
  entry_module VARCHAR,
  last_module VARCHAR,
  modules_visited JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_activity_sessions_user_started_idx
  ON public.user_activity_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_sessions_tenant_started_idx
  ON public.user_activity_sessions (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_sessions_last_activity_idx
  ON public.user_activity_sessions (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR REFERENCES public.user_activity_sessions(id) ON DELETE SET NULL,
  user_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE SET NULL,
  category VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,
  module VARCHAR,
  entity_type VARCHAR,
  entity_id VARCHAR,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  ip_address VARCHAR,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_activity_events_user_created_idx
  ON public.user_activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_events_tenant_created_idx
  ON public.user_activity_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_events_type_created_idx
  ON public.user_activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_events_session_idx
  ON public.user_activity_events (session_id);
