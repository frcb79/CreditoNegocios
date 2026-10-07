-- Bloque 3.1 — Actividad y Bitácora de Usuarios
-- Source-of-truth for product usage sessions + immutable significant events.
-- Intentionally separate from technical auth sessions and commercial/commission audit logs.
-- Historical sessions before deployment are intentionally not reconstructed.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES public.users(id),
  tenant_id VARCHAR REFERENCES public.tenants(id),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  end_reason VARCHAR(32),
  active_seconds INTEGER NOT NULL DEFAULT 0,
  last_module_id VARCHAR(64),
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uas_user_started
  ON public.user_activity_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_uas_tenant_started
  ON public.user_activity_sessions(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_uas_open_last_active
  ON public.user_activity_sessions(last_active_at)
  WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_uas_one_open_per_user
  ON public.user_activity_sessions(user_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_activity_session_modules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR NOT NULL REFERENCES public.user_activity_sessions(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id),
  tenant_id VARCHAR REFERENCES public.tenants(id),
  module_id VARCHAR(64) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  active_seconds INTEGER NOT NULL DEFAULT 0,
  enter_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(session_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_uasm_user_module
  ON public.user_activity_session_modules(user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_uasm_tenant_module
  ON public.user_activity_session_modules(tenant_id, module_id);

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR REFERENCES public.users(id),
  tenant_id VARCHAR REFERENCES public.tenants(id),
  session_id VARCHAR REFERENCES public.user_activity_sessions(id) ON DELETE SET NULL,
  category VARCHAR(32) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  module_id VARCHAR(64),
  entity_type VARCHAR(64),
  entity_id VARCHAR,
  outcome VARCHAR(32) NOT NULL DEFAULT 'success',
  actor_role VARCHAR(32),
  ip_address VARCHAR(64),
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uae_user_occurred
  ON public.user_activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_tenant_occurred
  ON public.user_activity_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_type_occurred
  ON public.user_activity_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_category_occurred
  ON public.user_activity_events(category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_session
  ON public.user_activity_events(session_id);

COMMENT ON TABLE public.user_activity_events IS
  'Append-only significant user/security events. No clickstream and no document/client payload values.';
