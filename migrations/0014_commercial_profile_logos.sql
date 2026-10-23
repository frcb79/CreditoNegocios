-- COM-RES-LOGO-SELF: users manage their own marketing PNG independently
-- of their avatar and of prior admin-only logo approvals.
CREATE TABLE IF NOT EXISTS public.commercial_profile_logos (
  user_id VARCHAR PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  image_data BYTEA NOT NULL,
  image_sha256 CHAR(64) NOT NULL CHECK (image_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_profile_logo_size CHECK (octet_length(image_data) BETWEEN 60 AND 1000000)
);
-- Do not migrate old manually approved images: the user must actively opt in
-- to the promotional use of their own logo.
