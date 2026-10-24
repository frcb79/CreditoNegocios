-- COM-RES-LOGO-V1: immutable proof of a Super Admin-approved promotional logo.
-- Not derived from client-supplied profileData or arbitrary external URLs.
CREATE TABLE IF NOT EXISTS public.commercial_approved_logos (
  user_id VARCHAR PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  image_data BYTEA NOT NULL,
  image_sha256 CHAR(64) NOT NULL CHECK (image_sha256 ~ '^[a-f0-9]{64}$'),
  approved_by VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_approved_logo_size CHECK (octet_length(image_data) BETWEEN 50 AND 1000000)
);
