/** Private, additive schema for prospect-originated internal preapplications (not credits). */
export const PROSPECT_AUTO_MATCHING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.prospect_preapplications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id VARCHAR NOT NULL UNIQUE REFERENCES public.commercial_marketing_leads(id) ON DELETE RESTRICT,
  owner_user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_id VARCHAR REFERENCES public.clients(id) ON DELETE RESTRICT,
  completion_link_id VARCHAR NOT NULL REFERENCES public.prospect_completion_links(id) ON DELETE RESTRICT,
  profile_snapshot JSONB NOT NULL,
  financing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  privacy_version VARCHAR(40) NOT NULL,
  consent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(24) NOT NULL CHECK (status IN ('awaiting_details','identity_review','pending','evaluating','evaluated','failed')),
  input_hash VARCHAR(64) NOT NULL,
  summary JSONB,
  details JSONB,
  catalog_hash VARCHAR(64),
  evaluated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prospect_preapplications_owner_created_idx
  ON public.prospect_preapplications(owner_user_id,created_at DESC);
ALTER TABLE public.prospect_preapplications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_preapplications FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.prospect_matching_evaluations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  preapplication_id VARCHAR NOT NULL REFERENCES public.prospect_preapplications(id) ON DELETE RESTRICT,
  input_hash VARCHAR(64) NOT NULL,
  catalog_hash VARCHAR(64) NOT NULL,
  summary JSONB NOT NULL,
  details JSONB NOT NULL,
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (preapplication_id,input_hash,catalog_hash)
);
ALTER TABLE public.prospect_matching_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_matching_evaluations FROM PUBLIC;
DO $preapp_roles$ DECLARE r TEXT; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.prospect_preapplications,public.prospect_matching_evaluations FROM %I',r);
  END LOOP;
END $preapp_roles$;
`;
