-- COM-CTA-002: campaign attribution and separate public lead intake.
-- Additive, no grants to public; all reads/writes go through API authorization.
CREATE TABLE IF NOT EXISTS public.commercial_campaign_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,
  owner_user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE SET NULL,
  template_id VARCHAR REFERENCES public.commercial_resource_templates(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMP,
  click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0)
);
-- A reusable general URL per person, plus one URL per published campaign.
CREATE UNIQUE INDEX IF NOT EXISTS commercial_campaign_owner_template_unique
  ON public.commercial_campaign_links(owner_user_id, COALESCE(template_id, '__general__'));
CREATE INDEX IF NOT EXISTS commercial_campaign_owner_idx
  ON public.commercial_campaign_links(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_marketing_leads (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id VARCHAR NOT NULL REFERENCES public.commercial_campaign_links(id) ON DELETE RESTRICT,
  owner_user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE SET NULL,
  template_id VARCHAR REFERENCES public.commercial_resource_templates(id) ON DELETE RESTRICT,
  source_channel VARCHAR(25),
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(160),
  product VARCHAR(40),
  amount_range VARCHAR(80),
  message VARCHAR(600),
  privacy_version VARCHAR(40) NOT NULL,
  consent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  linked_client_id VARCHAR REFERENCES public.clients(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS commercial_marketing_leads_owner
  ON public.commercial_marketing_leads(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_marketing_leads_contact
  ON public.commercial_marketing_leads(link_id, phone, created_at DESC);
-- Do not auto-create clients or opportunities from a marketing submission.
