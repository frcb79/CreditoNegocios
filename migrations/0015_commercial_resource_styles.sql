-- COM-RES-LIBRARY-FILTERS: editorial style metadata is independent of immutable artworks.
-- Product and format come from the original approved template; no content mutation.
CREATE TABLE IF NOT EXISTS public.commercial_resource_styles (
  template_id VARCHAR PRIMARY KEY REFERENCES public.commercial_resource_templates(id) ON DELETE RESTRICT,
  style VARCHAR(20) NOT NULL CHECK (style IN ('llamativo','explicativo','institucional','promocional','informativo')),
  set_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commercial_resource_styles_filter_idx
  ON public.commercial_resource_styles(style);
