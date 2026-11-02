/** Shared by startup and the reviewed SQL migration. All new data is API-only. */
export const PROSPECT_INTAKE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.user_access_history (
  user_id VARCHAR PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  first_access_at TIMESTAMP,
  last_access_at TIMESTAMP,
  evidence_source VARCHAR(40) NOT NULL
);
ALTER TABLE public.user_access_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_access_history FROM PUBLIC;
INSERT INTO public.user_access_history (user_id,first_access_at,last_access_at,evidence_source)
SELECT performed_by,MIN(created_at),MAX(created_at),'historical_audit'
FROM public.commercial_audit_logs
WHERE entity_type='administrative_activity' AND new_state='success'
  AND action IN ('login_success','session_access','account_registered')
  AND performed_by IN (SELECT id FROM public.users)
GROUP BY performed_by ON CONFLICT (user_id) DO NOTHING;
-- A saved Passport identity proves access, but session expiration does NOT prove
-- its original login date. Preserve that evidence without inventing timestamps.
INSERT INTO public.user_access_history (user_id,evidence_source)
SELECT DISTINCT u.id,'historical_session' FROM public.sessions s JOIN public.users u
ON u.id=COALESCE(s.sess#>>'{passport,user,claims,sub}',s.sess#>>'{passport,user,id}')
ON CONFLICT (user_id) DO NOTHING;
ALTER TABLE public.commercial_marketing_leads ADD COLUMN IF NOT EXISTS profile_data JSONB;
ALTER TABLE public.commercial_marketing_leads ADD COLUMN IF NOT EXISTS profile_received_at TIMESTAMP;
ALTER TABLE public.commercial_marketing_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_marketing_leads FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.prospect_completion_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  owner_user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_id VARCHAR REFERENCES public.clients(id) ON DELETE RESTRICT,
  lead_id VARCHAR REFERENCES public.commercial_marketing_leads(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMP,
  disabled_at TIMESTAMP
);
ALTER TABLE public.prospect_completion_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_completion_links FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.prospect_profile_submissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_link_id VARCHAR NOT NULL UNIQUE REFERENCES public.prospect_completion_links(id) ON DELETE RESTRICT,
  lead_id VARCHAR NOT NULL REFERENCES public.commercial_marketing_leads(id) ON DELETE RESTRICT,
  profile_data JSONB NOT NULL,
  privacy_version VARCHAR(40) NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE public.prospect_profile_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_profile_submissions FROM PUBLIC;
DO $api_roles$ DECLARE api_role TEXT; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.user_access_history, public.commercial_marketing_leads, public.prospect_completion_links, public.prospect_profile_submissions FROM %I',api_role);
  END LOOP;
END $api_roles$;
CREATE INDEX IF NOT EXISTS prospect_completion_links_owner ON public.prospect_completion_links(owner_user_id);
`;

export async function checkProspectIntakeSchemaReadiness(db: { query: (...args: any[]) => Promise<any> }) {
  const required: Record<string,string[]> = {
    user_access_history: ["user_id","first_access_at","last_access_at","evidence_source"],
    commercial_marketing_leads: ["profile_data","profile_received_at"],
    prospect_completion_links: ["token_hash","owner_user_id","tenant_id","client_id","lead_id","expires_at","used_at","disabled_at"],
    prospect_profile_submissions: ["completion_link_id","lead_id","profile_data","privacy_version","submitted_at"],
  };
  const result = await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])", [Object.keys(required)]);
  const present = new Set(result.rows.map((r: any) => `${r.table_name}.${r.column_name}`));
  const missing = Object.entries(required).flatMap(([table, columns]) => columns.filter(column => !present.has(`${table}.${column}`)));
  return {ready: missing.length === 0, missingCount: missing.length};
}
