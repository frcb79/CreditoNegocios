-- COM-RES-GRAPHIC-V4: immutable PNG bytes per template version.
-- Separate table prevents binary content from appearing in template JSON/list endpoints.
-- Published visibility is enforced by the asset route, not by direct DB access.
CREATE TABLE IF NOT EXISTS public.commercial_resource_artworks (
  template_id VARCHAR PRIMARY KEY REFERENCES public.commercial_resource_templates(id) ON DELETE RESTRICT,
  image_data BYTEA NOT NULL,
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  width INTEGER NOT NULL CHECK (width = 1080),
  height INTEGER NOT NULL CHECK (height IN (1080,1350,1920)),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_resource_artwork_nonempty CHECK (octet_length(image_data) BETWEEN 40 AND 3000000)
);
-- This migration creates storage only; it never inserts or publishes artwork.
