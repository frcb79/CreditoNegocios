-- COM-RES-CATALOG-V2: metadata only, no changes to published artworks/copy.
-- Batch IDs group future ZIP imports; legacy imports remain safely selectable individually.
ALTER TABLE public.commercial_resource_templates
  ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS commercial_resource_import_batch_idx
  ON public.commercial_resource_templates(import_batch_id)
  WHERE import_batch_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.commercial_resource_topics (
  template_id VARCHAR PRIMARY KEY REFERENCES public.commercial_resource_templates(id) ON DELETE RESTRICT,
  topic VARCHAR(160) NOT NULL CHECK (char_length(topic) BETWEEN 3 AND 160),
  set_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
