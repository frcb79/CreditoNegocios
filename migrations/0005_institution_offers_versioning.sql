-- Migration: 0005_institution_offers_versioning.sql
-- Description: Evolución canónica a institution_products con versionado aditivo e inmutable (Bloque A1 / Corrección A1.1)
-- Idempotencia garantizada: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS e índices parciales

-- 1. Enriquecimiento aditivo de institution_products como catálogo canónico de ofertas
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS name VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS product_type VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS slug VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft';
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS current_version_number INTEGER DEFAULT 1;

-- Permitir template_id opcional si la financiera crea una oferta personalizada sin template base
ALTER TABLE public.institution_products ALTER COLUMN template_id DROP NOT NULL;

-- Índices eficientes para búsqueda de ofertas
CREATE INDEX IF NOT EXISTS "inst_prod_type_idx" ON public.institution_products (product_type);
CREATE INDEX IF NOT EXISTS "inst_prod_status_idx" ON public.institution_products (status);

-- 2. Tabla histórica de versiones por oferta de producto
CREATE TABLE IF NOT EXISTS public.institution_product_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_product_id VARCHAR NOT NULL REFERENCES public.institution_products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR NOT NULL DEFAULT 'draft',
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  conditions JSONB DEFAULT '{}',
  requirements JSONB DEFAULT '{}',
  required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
  variables_configuration JSONB DEFAULT '{}',
  change_reason TEXT,
  version_hash VARCHAR,
  published_at TIMESTAMP,
  published_by VARCHAR REFERENCES public.users(id),
  created_by VARCHAR REFERENCES public.users(id),
  createdAt TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices de consulta y unicidad de número de versión
CREATE INDEX IF NOT EXISTS "ipv_product_id_idx" ON public.institution_product_versions (institution_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS "ipv_product_version_unique" ON public.institution_product_versions (institution_product_id, version_number);
CREATE INDEX IF NOT EXISTS "ipv_status_idx" ON public.institution_product_versions (status);

-- 3. Regla física de integridad: Máximo una versión publicada vigente por oferta en PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS "ipv_published_unique" ON public.institution_product_versions (institution_product_id) WHERE status = 'published';

-- 4. Vista de compatibilidad retrocompatible para lecturas legacy
CREATE OR REPLACE VIEW public.financial_institution_offers AS
  SELECT 
    id,
    institution_id,
    template_id,
    id AS institution_product_id,
    COALESCE(name, custom_name, 'Oferta') AS name,
    slug,
    product_type,
    description,
    current_version_number,
    is_active,
    created_by,
    created_at,
    updated_at
  FROM public.institution_products;
