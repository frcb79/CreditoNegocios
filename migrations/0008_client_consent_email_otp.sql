-- LEG-10 — consentimiento específico del cliente ante una financiera.
-- Aditiva, sólo para migración controlada; NO ejecutar en Staging/Producción
-- hasta verificar DB/Storage aislados y aprobar texto jurídico final.
--
-- No almacenar OTP ni tokens en claro. Evidencias inmutables;
-- revocaciones aditivas, nunca borrar la aceptación histórica.

CREATE TABLE IF NOT EXISTS public.client_consent_document_versions (
  id VARCHAR PRIMARY KEY,
  version VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_sha256 VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  effective_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_consent_document_version_unique UNIQUE (version),
  CONSTRAINT client_consent_published_integrity CHECK (
    status <> 'published' OR (effective_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.client_consent_challenges (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_id VARCHAR NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  target_id VARCHAR NOT NULL REFERENCES public.credit_submission_targets(id) ON DELETE RESTRICT,
  institution_id VARCHAR NOT NULL REFERENCES public.financial_institutions(id) ON DELETE RESTRICT,
  document_version_id VARCHAR NOT NULL REFERENCES public.client_consent_document_versions(id) ON DELETE RESTRICT,
  exact_document_content TEXT NOT NULL,
  exact_document_sha256 VARCHAR(64) NOT NULL,
  purpose VARCHAR(80) NOT NULL DEFAULT 'financial_institution_submission',
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_capacity VARCHAR(32) NOT NULL CHECK (signer_capacity IN ('client', 'legal_representative')),
  representation_review_status VARCHAR(24) NOT NULL DEFAULT 'not_applicable'
    CHECK (representation_review_status IN ('not_applicable','pending','verified','rejected')),
  requested_by VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  otp_hash VARCHAR(64),
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  otp_request_count INTEGER NOT NULL DEFAULT 0,
  otp_max_attempts INTEGER NOT NULL DEFAULT 5,
  otp_requested_at TIMESTAMPTZ,
  otp_resend_after TIMESTAMPTZ,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','expired','invalidated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_consent_challenge_scope_idx
  ON public.client_consent_challenges(tenant_id, client_id, target_id, institution_id);
CREATE INDEX IF NOT EXISTS client_consent_challenge_requested_idx
  ON public.client_consent_challenges(requested_by, created_at);

CREATE TABLE IF NOT EXISTS public.client_consent_evidences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  challenge_id VARCHAR NOT NULL UNIQUE REFERENCES public.client_consent_challenges(id) ON DELETE RESTRICT,
  tenant_id VARCHAR REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_id VARCHAR NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  target_id VARCHAR NOT NULL REFERENCES public.credit_submission_targets(id) ON DELETE RESTRICT,
  institution_id VARCHAR NOT NULL REFERENCES public.financial_institutions(id) ON DELETE RESTRICT,
  document_version_id VARCHAR NOT NULL REFERENCES public.client_consent_document_versions(id) ON DELETE RESTRICT,
  purpose VARCHAR(80) NOT NULL,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_capacity VARCHAR(32) NOT NULL,
  representation_review_status VARCHAR(24) NOT NULL,
  exact_document_content TEXT NOT NULL,
  exact_document_sha256 VARCHAR(64) NOT NULL,
  otp_method VARCHAR(32) NOT NULL DEFAULT 'email_otp',
  accepted_at TIMESTAMPTZ NOT NULL,
  accepted_ip INET,
  accepted_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_consent_evidence_scope_idx
  ON public.client_consent_evidences(tenant_id, client_id, target_id, institution_id, purpose, accepted_at);

CREATE TABLE IF NOT EXISTS public.client_consent_revocations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  evidence_id VARCHAR NOT NULL UNIQUE REFERENCES public.client_consent_evidences(id) ON DELETE RESTRICT,
  reason TEXT,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_ip INET,
  revoked_user_agent TEXT,
  revoked_by_email TEXT NOT NULL
);

-- Existing immutable/legal tables use the same append-only principle.
CREATE OR REPLACE FUNCTION public.reject_client_consent_evidence_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las evidencias LEG-10 son inmutables';
END;
$$;

DROP TRIGGER IF EXISTS client_consent_evidences_immutable ON public.client_consent_evidences;
CREATE TRIGGER client_consent_evidences_immutable
BEFORE UPDATE OR DELETE ON public.client_consent_evidences
FOR EACH ROW EXECUTE FUNCTION public.reject_client_consent_evidence_mutation();

DROP TRIGGER IF EXISTS client_consent_revocations_immutable ON public.client_consent_revocations;
CREATE TRIGGER client_consent_revocations_immutable
BEFORE UPDATE OR DELETE ON public.client_consent_revocations
FOR EACH ROW EXECUTE FUNCTION public.reject_client_consent_evidence_mutation();


-- Manual verification that an entity signatory has legal authority; an email
-- OTP verifies possession of the mailbox, NOT a power-of-attorney.
CREATE TABLE IF NOT EXISTS public.client_consent_representation_reviews (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  evidence_id VARCHAR NOT NULL UNIQUE REFERENCES public.client_consent_evidences(id) ON DELETE RESTRICT,
  supporting_document_id VARCHAR NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  reviewed_by VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  signer_name TEXT NOT NULL,
  capacity_notes TEXT NOT NULL,
  result VARCHAR(20) NOT NULL CHECK (result IN ('verified','rejected')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS client_consent_rep_reviews_immutable ON public.client_consent_representation_reviews;
CREATE TRIGGER client_consent_rep_reviews_immutable
BEFORE UPDATE OR DELETE ON public.client_consent_representation_reviews
FOR EACH ROW EXECUTE FUNCTION public.reject_client_consent_evidence_mutation();

-- A legal document becomes immutable after publication (not merely after signing).
CREATE OR REPLACE FUNCTION public.reject_published_client_consent_document_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'No se puede eliminar una versión LEG-10 publicada';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'No se puede editar una versión LEG-10 publicada';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS client_consent_documents_immutable ON public.client_consent_document_versions;
CREATE TRIGGER client_consent_documents_immutable
BEFORE UPDATE OR DELETE ON public.client_consent_document_versions
FOR EACH ROW EXECUTE FUNCTION public.reject_published_client_consent_document_change();
