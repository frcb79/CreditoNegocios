import {COMMERCIAL_MAIL_PLAN_SCHEMA_SQL} from "./commercialMailPlanSchema";
export const COMMERCIAL_MAIL_DRAFT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.commercial_mail_draft_revisions (
  draft_id varchar(36) NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  content jsonb NOT NULL,
  created_by varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY(draft_id,revision)
);
ALTER TABLE public.commercial_mail_draft_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_mail_draft_revisions FROM PUBLIC;
DO $mail_roles$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.commercial_mail_draft_revisions FROM %I',api_role);
  END LOOP;
END $mail_roles$;
DO $engagement$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.resend_delivery_events'::regclass AND conname='resend_delivery_events_event_type_check' AND pg_get_constraintdef(oid) NOT LIKE '%email.opened%') THEN
    ALTER TABLE public.resend_delivery_events DROP CONSTRAINT resend_delivery_events_event_type_check;
    ALTER TABLE public.resend_delivery_events ADD CONSTRAINT resend_delivery_events_event_type_check CHECK(event_type IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed','email.complained','email.suppressed','email.opened','email.clicked'));
  END IF;
END $engagement$;
${COMMERCIAL_MAIL_PLAN_SCHEMA_SQL}
`;
