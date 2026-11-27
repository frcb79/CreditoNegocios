// Separate approval and delivery ledger: preparing a calendar never authorizes dispatch.
export const COMMERCIAL_MAIL_DISPATCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.commercial_mail_approvals (
  plan_id varchar(36) PRIMARY KEY REFERENCES public.commercial_mail_plans(id) ON DELETE RESTRICT,
  approved_by varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  recipient_hashes jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.commercial_mail_dispatches (
  plan_id varchar(36) NOT NULL, user_id varchar NOT NULL, step_day integer NOT NULL,
  status varchar(16) NOT NULL CHECK(status IN ('claimed','sent','skipped','expired','uncertain')),
  reason varchar(80), recipient_email varchar(254), provider_message_id varchar(150),
  claimed_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  PRIMARY KEY(plan_id,user_id,step_day),
  FOREIGN KEY(plan_id,user_id,step_day) REFERENCES public.commercial_mail_plan_jobs(plan_id,user_id,step_day) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS commercial_mail_dispatch_user_idx ON public.commercial_mail_dispatches(user_id,claimed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_mail_provider_idx ON public.commercial_mail_dispatches(provider_message_id) WHERE provider_message_id IS NOT NULL;
ALTER TABLE public.commercial_mail_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_mail_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_mail_approvals,public.commercial_mail_dispatches FROM PUBLIC;
DO $dispatch_roles$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.commercial_mail_approvals,public.commercial_mail_dispatches FROM %I',api_role);
  END LOOP;
END $dispatch_roles$;
`;
export const DUE_COMMERCIAL_MAIL_SQL = `
SELECT j.plan_id,j.user_id,j.step_day,j.scheduled_for,r.content,a.recipient_hashes
FROM public.commercial_mail_plan_jobs j
JOIN public.commercial_mail_plans p ON p.id=j.plan_id AND p.state='planned'
JOIN public.commercial_mail_approvals a ON a.plan_id=p.id
JOIN public.commercial_mail_draft_revisions r ON r.draft_id=p.draft_id AND r.revision=p.revision
WHERE j.scheduled_for<=now() AND j.scheduled_for>=now()-interval '24 hours'
AND r.content->>'audience' IN ('registered_no_requests','individual','newsletter')
AND NOT EXISTS(SELECT 1 FROM public.commercial_mail_dispatches d WHERE d.plan_id=j.plan_id AND d.user_id=j.user_id AND d.step_day=j.step_day)
ORDER BY j.scheduled_for,j.plan_id,j.user_id,j.step_day LIMIT 25
`;
export const EXPIRE_COMMERCIAL_MAIL_SQL = `
INSERT INTO public.commercial_mail_dispatches(plan_id,user_id,step_day,status,reason)
SELECT j.plan_id,j.user_id,j.step_day,'expired','outside_window'
FROM public.commercial_mail_plan_jobs j JOIN public.commercial_mail_approvals a ON a.plan_id=j.plan_id
JOIN public.commercial_mail_plans p ON p.id=j.plan_id AND p.state='planned'
WHERE j.scheduled_for<now()-interval '24 hours'
ON CONFLICT(plan_id,user_id,step_day) DO NOTHING
`;
export const CLAIM_COMMERCIAL_MAIL_SQL = `
INSERT INTO public.commercial_mail_dispatches(plan_id,user_id,step_day,status,recipient_email)
SELECT j.plan_id,j.user_id,j.step_day,'claimed',$4
FROM public.commercial_mail_plan_jobs j
JOIN public.commercial_mail_plans p ON p.id=j.plan_id AND p.state='planned'
JOIN public.commercial_mail_approvals a ON a.plan_id=p.id
WHERE j.plan_id=$1 AND j.user_id=$2 AND j.step_day=$3
AND j.scheduled_for<=now() AND j.scheduled_for>=now()-interval '24 hours'
AND NOT EXISTS(SELECT 1 FROM public.commercial_mail_dispatches d WHERE d.user_id=j.user_id
 AND (d.status IN ('claimed','uncertain') OR (d.status='sent' AND d.claimed_at>now()-interval '24 hours')))
ON CONFLICT(plan_id,user_id,step_day) DO NOTHING RETURNING plan_id
`;
