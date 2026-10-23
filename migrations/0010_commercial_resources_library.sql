-- COM-RES-001. Library owned by platform Super Admin.
-- Additive only; no seed that could publish unreviewed content.
CREATE TABLE IF NOT EXISTS public.commercial_resource_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name VARCHAR(100) NOT NULL,
  product VARCHAR(40) NOT NULL,
  channel VARCHAR(25) NOT NULL,
  definition JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','retired')),
  created_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  published_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP,
  retired_at TIMESTAMP,
  CONSTRAINT commercial_resource_slug_version_unique UNIQUE(slug,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_resource_one_published_slug
  ON public.commercial_resource_templates(slug) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS commercial_resource_published_lookup
  ON public.commercial_resource_templates(status,product,channel,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_resource_suggestions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE SET NULL,
  product VARCHAR(40),
  channel VARCHAR(25),
  suggestion TEXT NOT NULL CHECK (char_length(suggestion) BETWEEN 10 AND 1000),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commercial_resource_suggestions_inbox
  ON public.commercial_resource_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_resource_suggestions_submitter
  ON public.commercial_resource_suggestions(user_id,created_at DESC);
-- Deliberately no suggestion status, moderation, assignment, notes or notifications.
