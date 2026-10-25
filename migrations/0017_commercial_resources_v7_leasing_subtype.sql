-- COM-RES-V7: additive leasing subtype metadata, independent of graphic definitions.
-- Do not touch approved copy, historic drafts or PNG bytes.
ALTER TABLE public.commercial_resource_topics
  ADD COLUMN IF NOT EXISTS leasing_subtype VARCHAR(24)
    CHECK (leasing_subtype IN ('vehicular','maquinaria_equipo'));
CREATE INDEX IF NOT EXISTS commercial_resource_topics_leasing_subtype_idx
  ON public.commercial_resource_topics(leasing_subtype)
  WHERE leasing_subtype IS NOT NULL;
