-- Migration: 0005_institution_offers_versioning.sql
-- Description: Creación de tablas de ofertas por financiera con versionado aditivo histórico (Bloque A1)
-- Idempotencia: CREATE TABLE IF NOT EXISTS e índices seguros

CREATE TABLE IF NOT EXISTS public.financial_institution_offers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id VARCHAR NOT NULL REFERENCES public.financial_institutions(id) ON DELETE CASCADE,
  template_id VARCHAR REFERENCES public.product_templates(id),
  institution_product_id VARCHAR REFERENCES public.institution_products(id),
  name VARCHAR NOT NULL,
  slug VARCHAR,
  product_type VARCHAR NOT NULL,
  description TEXT,
  current_version_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS "fio_institution_idx" ON public.financial_institution_offers (institution_id);
CREATE INDEX IF NOT EXISTS "fio_template_idx" ON public.financial_institution_offers (template_id);
CREATE INDEX IF NOT EXISTS "fio_product_type_idx" ON public.financial_institution_offers (product_type);
CREATE INDEX IF NOT EXISTS "fio_is_active_idx" ON public.financial_institution_offers (is_active);

-- Tabla de versiones históricas inmutables y aditivas
CREATE TABLE IF NOT EXISTS public.financial_institution_offer_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id VARCHAR NOT NULL REFERENCES public.financial_institution_offers(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR NOT NULL DEFAULT 'active',
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP,
  conditions JSONB DEFAULT '{}',
  requirements JSONB DEFAULT '{}',
  required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
  variables_configuration JSONB DEFAULT '{}',
  change_reason TEXT,
  version_hash VARCHAR,
  created_by VARCHAR REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para trazabilidad y unicidad de versión por oferta
CREATE INDEX IF NOT EXISTS "fio_versions_offer_idx" ON public.financial_institution_offer_versions (offer_id);
CREATE UNIQUE INDEX IF NOT EXISTS "fio_versions_offer_version_unique" ON public.financial_institution_offer_versions (offer_id, version_number);
CREATE INDEX IF NOT EXISTS "fio_versions_status_idx" ON public.financial_institution_offer_versions (status);
