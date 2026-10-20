-- CN MVP: 6 product families; retire duplicate template variants without losing history.
-- Approved catalog decision 2026-10-20. No DELETE and no Storage changes.
-- Economic lender-specific restrictions live in published offer versions, not here.
-- In particular, matching MUST NOT assume an unconfigured variable is satisfied.
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.product_templates) <> 12
     OR (SELECT count(*) FROM public.product_templates WHERE is_active IS TRUE) <> 12
     OR (SELECT count(*) FROM public.institution_products) <> 0
     OR (SELECT count(*) FROM public.credits) <> 0
     OR (SELECT count(*) FROM public.credit_submission_requests) <> 0
     OR (SELECT count(*) FROM public.commercial_opportunities) <> 0 THEN
    RAISE EXCEPTION 'PRODUCT-FAMILY PRECHECK FAILED: expected 12 untouched templates and no linked deals/offers. Do not auto-migrate.';
  END IF;
  IF (SELECT count(DISTINCT name) FROM public.product_templates WHERE name IN (
     'Simple','Crédito Revolvente','Arrendamiento Puro / Financiero',
     'Hipotecario Empresarial','Factoraje Financiero','Anticipo de Ventas (Terminal TPV)',
     'Crédito Simple con garantia y C. Agropecuario','PFAE Simple con Gartantia',
     'Simple con garantia','Simple Con garantia (Liquidez)',
     'Simple sobre flujos con TPV','Arrendamiento Vehicular'
  )) <> 12 THEN
    RAISE EXCEPTION 'PRODUCT-FAMILY PRECHECK FAILED: legacy template identities changed.';
  END IF;
END
$preflight$;

-- Keep the original canonical IDs so historical associations remain valid.
UPDATE public.product_templates
SET name = 'Crédito Simple',
    category = 'business',
    description = 'Financiamiento simple para PM o PFAE; garantía, destino (liquidez, trabajo, agropecuario) y evaluación por TPV dependen de cada oferta publicada.',
    target_profiles = ARRAY['persona_moral','fisica_empresarial']::text[],
    available_variables = '{"requiere_garantia":{"type":"select","required":false},"tipo_garantia":{"type":"select","required":false},"destino_financiamiento":{"type":"select","required":false},"usa_flujos_tpv":{"type":"boolean","required":false}}'::jsonb,
    base_configuration = '{"catalog_family":"credito_simple","variants":["con_garantia","sin_garantia","liquidez","agropecuario","flujos_tpv"],"policy":"Las condiciones se verifican por oferta/version contra información capturada; no presumir coincidencia si falta el dato."}'::jsonb,
    is_active = true, updated_at = now()
WHERE name = 'Simple';

UPDATE public.product_templates
SET name = 'Crédito Revolvente',
    category = 'revolvente',
    description = 'Línea revolvente para tesorería y capital de trabajo de PM o PFAE. Condiciones específicas según oferta/version.',
    target_profiles = ARRAY['persona_moral','fisica_empresarial']::text[],
    available_variables = '{"requiere_garantia":{"type":"select","required":false},"destino_financiamiento":{"type":"select","required":false}}'::jsonb,
    base_configuration = '{"catalog_family":"credito_revolvente","variants":["con_garantia","sin_garantia","capital_trabajo"],"policy":"Matching sujeto a condiciones capturadas de la oferta publicada."}'::jsonb,
    is_active = true,updated_at=now()
WHERE name = 'Crédito Revolvente';

UPDATE public.product_templates
SET name = 'Arrendamiento',
    category = 'arrendamiento',
    description = 'Arrendamiento puro o financiero de vehículos, maquinaria, equipo y tecnología para PM o PFAE.',
    target_profiles = ARRAY['persona_moral','fisica_empresarial']::text[],
    available_variables = '{"modalidad_arrendamiento":{"type":"select","required":false},"tipo_activo_arrendado":{"type":"select","required":false}}'::jsonb,
    base_configuration = '{"catalog_family":"arrendamiento","variants":["puro","financiero","vehicular","maquinaria","equipo","tecnologia"],"policy":"Modalidad y activo se determinan por oferta publicada."}'::jsonb,
    is_active=true,updated_at=now()
WHERE name = 'Arrendamiento Puro / Financiero';

UPDATE public.product_templates
SET name='Hipotecario',
    category='hipotecario',
    description='Familia hipotecaria con modalidades independientes vivienda y empresarial; NO equiparar vivienda con garantía inmobiliaria de empresa al hacer matching.',
    target_profiles=ARRAY['persona_moral','fisica_empresarial','fisica']::text[],
    available_variables='{"segmento_hipotecario":{"type":"select","required":false},"destino_financiamiento":{"type":"select","required":false},"requiere_garantia":{"type":"select","required":false}}'::jsonb,
    base_configuration='{"catalog_family":"hipotecario","variants":["vivienda","empresarial"],"policy":"Vivienda y empresarial son segmentos incompatibles salvo aceptación explícita de la oferta. No inferir compatibilidad automáticamente."}'::jsonb,
    is_active=true,updated_at=now()
WHERE name='Hipotecario Empresarial';

UPDATE public.product_templates
SET name='Factoraje',
    category='factoraje',
    description='Factoraje financiero sobre cuentas por cobrar y facturas; requisitos y elegibilidad de deudor determinados por cada oferta.',
    target_profiles=ARRAY['persona_moral','fisica_empresarial']::text[],
    available_variables='{"destino_financiamiento":{"type":"select","required":false}}'::jsonb,
    base_configuration='{"catalog_family":"factoraje","variants":["cuentas_por_cobrar","facturas"],"policy":"Requisitos comerciales por financiera/oferta."}'::jsonb,
    is_active=true,updated_at=now()
WHERE name='Factoraje Financiero';

UPDATE public.product_templates
SET name='Anticipo de Ventas (TPV)',
    category='anticipo_ventas',
    description='Anticipo vinculado a ventas por terminal punto de venta, diferente de un crédito simple respaldado por flujos TPV.',
    target_profiles=ARRAY['persona_moral','fisica_empresarial','sin_sat']::text[],
    available_variables='{"usa_flujos_tpv":{"type":"boolean","required":false}}'::jsonb,
    base_configuration='{"catalog_family":"anticipo_ventas_tpv","variants":["anticipo_tpv"],"policy":"Determinar disponibilidad con flujos TPV reales y criterios de la oferta."}'::jsonb,
    is_active=true,updated_at=now()
WHERE name='Anticipo de Ventas (Terminal TPV)';

-- Preserve old IDs and their original labels for historical traceability and audit.
UPDATE public.product_templates
SET is_active=false,
    base_configuration=coalesce(base_configuration,'{}'::jsonb)||'{"consolidated_into_family":"credito_simple","catalog_legacy":true}'::jsonb,
    updated_at=now()
WHERE name IN ('Crédito Simple con garantia y C. Agropecuario','PFAE Simple con Gartantia',
               'Simple con garantia','Simple Con garantia (Liquidez)','Simple sobre flujos con TPV');

UPDATE public.product_templates
SET is_active=false,
    base_configuration=coalesce(base_configuration,'{}'::jsonb)||'{"consolidated_into_family":"arrendamiento","catalog_legacy":true}'::jsonb,
    updated_at=now()
WHERE name='Arrendamiento Vehicular';

-- Definitions are OPTIONAL; never require six extra fields before making a
-- request. Matching uses a lender's published offer conditions and actual
-- captured client data; missing data must remain "info insuficiente".
WITH rules (name,display_name,description,data_type,options_json) AS (
 VALUES
 ('requiere_garantia','Garantía requerida','Distingue oferta con garantía, sin garantía o indistinta.','select','["con_garantia","sin_garantia","indistinta"]'::jsonb),
 ('tipo_garantia','Tipo de garantía','Tipo de garantía aceptada en una oferta concreta.','select','["inmobiliaria","prendaria","aval","fiduciaria","otra","ninguna"]'::jsonb),
 ('destino_financiamiento','Destino del financiamiento','Capital de trabajo, liquidez, agropecuario, activo fijo u otro.','select','["capital_trabajo","liquidez","agropecuario","activo_fijo","inmueble","otro"]'::jsonb),
 ('modalidad_arrendamiento','Modalidad de arrendamiento','Puro o financiero, según financiera.','select','["puro","financiero"]'::jsonb),
 ('tipo_activo_arrendado','Tipo de activo arrendado','Vehículo, maquinaria, equipo o tecnología.','select','["vehiculo","maquinaria","equipo","tecnologia","otro"]'::jsonb),
 ('segmento_hipotecario','Segmento hipotecario','Diferencia vivienda de empresarial para evitar coincidencias indebidas.','select','["vivienda","empresarial"]'::jsonb),
 ('usa_flujos_tpv','Opera con flujos TPV','La financiera requiere ventas verificables por terminal TPV.','boolean',NULL::jsonb)
)
INSERT INTO public.product_variables
 (id,name,display_name,description,category,data_type,options,is_required,is_active,created_by,created_at,updated_at)
SELECT gen_random_uuid()::text,r.name,r.display_name,r.description,
       'product_conditions',r.data_type,r.options_json,false,true,
       (SELECT id FROM public.users WHERE role='super_admin' LIMIT 1),now(),now()
FROM rules r WHERE NOT EXISTS (SELECT 1 FROM public.product_variables p WHERE p.name=r.name);

DO $postcheck$
BEGIN
  IF (SELECT count(*) FROM public.product_templates) <> 12 OR
     (SELECT count(*) FROM public.product_templates WHERE is_active IS TRUE) <> 6 OR
     (SELECT count(*) FROM public.product_templates WHERE is_active IS FALSE) <> 6 OR
     (SELECT count(DISTINCT name) FROM public.product_templates WHERE is_active IS TRUE) <> 6 OR
     (SELECT count(*) FROM public.product_variables WHERE name IN (
       'requiere_garantia','tipo_garantia','destino_financiamiento','modalidad_arrendamiento',
       'tipo_activo_arrendado','segmento_hipotecario','usa_flujos_tpv')) <> 7 THEN
    RAISE EXCEPTION 'PRODUCT-FAMILY POSTCHECK FAILED: catalog not exactly 6 active/6 archived/7 optional dimensions';
  END IF;
END
$postcheck$;
