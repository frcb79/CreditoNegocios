-- Migration: 0005_institution_offers_versioning.sql
-- Description: Evolución canónica a institution_products con versionado aditivo e inmutable (Bloque A1 / Corrección A1.1)
-- Idempotencia garantizada: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS e índices parciales

-- 1. Enriquecimiento aditivo de institution_products como catálogo canónico de ofertas
-- Nota crítica de orden de operaciones: status y current_version_number se agregan SIN DEFAULT
-- para que los registros históricos preexistentes conserven status IS NULL durante el backfill.
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS name VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS product_type VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS slug VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS status VARCHAR;
ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS current_version_number INTEGER;

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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices de consulta y unicidad de número de versión
CREATE INDEX IF NOT EXISTS "ipv_product_id_idx" ON public.institution_product_versions (institution_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS "ipv_product_version_unique" ON public.institution_product_versions (institution_product_id, version_number);
CREATE INDEX IF NOT EXISTS "ipv_status_idx" ON public.institution_product_versions (status);

-- 3. Regla física de integridad: Máximo una versión publicada vigente por oferta en PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS "ipv_published_unique" ON public.institution_product_versions (institution_product_id) WHERE status = 'published';

-- 3b. Migración aditiva y preservación de institution_products preexistentes (A1 - Corrección final PostgreSQL):
-- Se ejecuta UNA SOLA VEZ y distingue de forma inequívoca productos preexistentes (status IS NULL) de nuevas ofertas.
-- NUNCA convierte un borrador nuevo ('draft') en publicado.
CREATE TABLE IF NOT EXISTS public.app_migrations (
  id VARCHAR PRIMARY KEY,
  executed_at TIMESTAMP DEFAULT NOW()
);

DO $$
DECLARE
  unversioned_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_migrations WHERE id = '0005_legacy_institution_products_backfill_a1') THEN
    -- A. Actualizar únicamente productos legacy preexistentes activos
    UPDATE public.institution_products
    SET status = 'published', current_version_number = 1
    WHERE is_active = true 
      AND (status IS NULL OR current_version_number IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = institution_products.id
      );

    -- B. Actualizar únicamente productos legacy preexistentes inactivos (preservados como inactivos/archivados)
    UPDATE public.institution_products
    SET status = 'archived', current_version_number = 1
    WHERE is_active = false 
      AND (status IS NULL OR current_version_number IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = institution_products.id
      );

    -- C. Generar versión inicial 1 publicada para productos legacy activos con version_hash verificable
    INSERT INTO public.institution_product_versions (
      id,
      institution_product_id,
      version_number,
      status,
      effective_from,
      effective_to,
      conditions,
      requirements,
      required_documents,
      variables_configuration,
      change_reason,
      version_hash,
      published_at,
      published_by,
      created_by
    )
    SELECT
      gen_random_uuid(),
      ip.id,
      1,
      'published',
      NOW(),
      NULL,
      COALESCE(ip.configuration, '{}'::jsonb),
      jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
      ARRAY[]::text[],
      COALESCE(ip.active_variables, '{}'::jsonb),
      'Migración automática de producto institucional legacy activo',
      encode(
        sha256(
          convert_to(
            jsonb_build_object(
              'conditions', COALESCE(ip.configuration, '{}'::jsonb),
              'productId', ip.id,
              'requiredDocuments', '[]'::jsonb,
              'requirements', jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
              'variablesConfiguration', COALESCE(ip.active_variables, '{}'::jsonb),
              'versionNumber', 1
            )::text,
            'UTF8'
          )
        ),
        'hex'
      ),
      NOW(),
      ip.created_by,
      ip.created_by
    FROM public.institution_products ip
    WHERE ip.status = 'published' AND NOT EXISTS (
      SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
    );

    -- D. Generar versión inicial 1 archivada para productos legacy inactivos con version_hash verificable
    INSERT INTO public.institution_product_versions (
      id,
      institution_product_id,
      version_number,
      status,
      effective_from,
      effective_to,
      conditions,
      requirements,
      required_documents,
      variables_configuration,
      change_reason,
      version_hash,
      published_at,
      published_by,
      created_by
    )
    SELECT
      gen_random_uuid(),
      ip.id,
      1,
      'archived',
      COALESCE(ip.created_at, NOW()),
      NOW(),
      COALESCE(ip.configuration, '{}'::jsonb),
      jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
      ARRAY[]::text[],
      COALESCE(ip.active_variables, '{}'::jsonb),
      'Migración automática de producto institucional legacy inactivo',
      encode(
        sha256(
          convert_to(
            jsonb_build_object(
              'conditions', COALESCE(ip.configuration, '{}'::jsonb),
              'productId', ip.id,
              'requiredDocuments', '[]'::jsonb,
              'requirements', jsonb_build_object('targetProfiles', COALESCE(to_jsonb(ip.target_profiles), '[]'::jsonb)),
              'variablesConfiguration', COALESCE(ip.active_variables, '{}'::jsonb),
              'versionNumber', 1
            )::text,
            'UTF8'
          )
        ),
        'hex'
      ),
      NULL,
      NULL,
      ip.created_by
    FROM public.institution_products ip
    WHERE ip.status = 'archived' AND NOT EXISTS (
      SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
    );

    -- E. Verificación estricta de completitud: si algún producto quedó sin versión, abortar sin registrar éxito
    SELECT COUNT(*) INTO unversioned_count
    FROM public.institution_products ip
    WHERE NOT EXISTS (
      SELECT 1 FROM public.institution_product_versions ipv WHERE ipv.institution_product_id = ip.id
    );

    IF unversioned_count > 0 THEN
      RAISE EXCEPTION 'Backfill legacy incompleto: % productos sin versión asociada. Abortando registro en app_migrations.', unversioned_count;
    END IF;

    -- F. Registrar que el backfill fue ejecutado con éxito total para que jamás se repita
    INSERT INTO public.app_migrations (id, executed_at)
    VALUES ('0005_legacy_institution_products_backfill_a1', NOW())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 4. Establecer valores predeterminados para nuevas ofertas creadas a partir de ahora
ALTER TABLE public.institution_products ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.institution_products ALTER COLUMN current_version_number SET DEFAULT 1;

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
