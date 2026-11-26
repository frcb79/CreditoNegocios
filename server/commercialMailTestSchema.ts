export const COMMERCIAL_MAIL_TEST_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.commercial_mail_tests (
  id varchar(36) PRIMARY KEY,
  draft_id varchar(36) NOT NULL,
  revision integer NOT NULL,
  step_day integer NOT NULL CHECK(step_day BETWEEN 1 AND 90),
  recipient varchar(254) NOT NULL,
  actor_id varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL CHECK(status IN ('claimed','sent','uncertain','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id varchar(255),
  FOREIGN KEY(draft_id,revision) REFERENCES public.commercial_mail_draft_revisions(draft_id,revision) ON DELETE RESTRICT
);
ALTER TABLE public.commercial_mail_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_mail_tests FROM PUBLIC;
DO $test_roles$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.commercial_mail_tests FROM %I',api_role);
  END LOOP;
END $test_roles$;
`;
