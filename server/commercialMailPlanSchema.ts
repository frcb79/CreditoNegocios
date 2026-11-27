export const COMMERCIAL_MAIL_PLAN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.commercial_mail_plans (
  id varchar(36) PRIMARY KEY,
  draft_id varchar(36) NOT NULL,
  revision integer NOT NULL,
  starts_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','cancelled')),
  created_by varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by varchar REFERENCES public.users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  FOREIGN KEY(draft_id,revision) REFERENCES public.commercial_mail_draft_revisions(draft_id,revision) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_mail_one_plan_per_draft
  ON public.commercial_mail_plans(draft_id) WHERE state='planned';
CREATE TABLE IF NOT EXISTS public.commercial_mail_plan_jobs (
  plan_id varchar(36) NOT NULL REFERENCES public.commercial_mail_plans(id) ON DELETE RESTRICT,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  step_day integer NOT NULL CHECK(step_day BETWEEN 1 AND 90),
  scheduled_for timestamptz NOT NULL,
  PRIMARY KEY(plan_id,user_id,step_day)
);
ALTER TABLE public.commercial_mail_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_mail_plan_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_mail_plans,public.commercial_mail_plan_jobs FROM PUBLIC;
DO $plan_roles$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.commercial_mail_plans,public.commercial_mail_plan_jobs FROM %I',api_role);
  END LOOP;
END $plan_roles$;
`;

export const INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL = `
INSERT INTO public.commercial_mail_plan_jobs(plan_id,user_id,step_day,scheduled_for)
SELECT $1,recipient,day,$2::timestamptz+(day-1)*interval '24 hours'
FROM unnest($3::varchar[]) AS recipient CROSS JOIN unnest($4::int[]) AS day
`;
export const LIST_COMMERCIAL_MAIL_PLANS_SQL = `
SELECT p.id,p.draft_id AS "draftId",p.revision,p.starts_at AS "startsAt",p.state,
       r.content->>'name' AS name,r.content->>'audience' AS audience,
       count(DISTINCT j.user_id)::int AS "recipientCount",count(j.user_id)::int AS "jobCount",
       EXISTS(SELECT 1 FROM public.commercial_mail_approvals a WHERE a.plan_id=p.id) AS approved,
       (SELECT count(*)::int FROM public.commercial_mail_dispatches d WHERE d.plan_id=p.id AND d.status='sent') AS "sentCount",
       (SELECT count(*)::int FROM public.commercial_mail_dispatches d WHERE d.plan_id=p.id AND d.status IN ('claimed','uncertain')) AS "uncertainCount",
       (SELECT count(*)::int FROM public.commercial_mail_dispatches d WHERE d.plan_id=p.id AND d.status IN ('expired','skipped')) AS "skippedCount"
FROM public.commercial_mail_plans p
JOIN public.commercial_mail_draft_revisions r ON r.draft_id=p.draft_id AND r.revision=p.revision
JOIN public.commercial_mail_plan_jobs j ON j.plan_id=p.id
GROUP BY p.id,r.content ORDER BY p.created_at DESC LIMIT 100
`;
