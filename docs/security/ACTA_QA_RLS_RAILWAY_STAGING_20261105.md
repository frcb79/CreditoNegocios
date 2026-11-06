# Auditoría RLS — Railway staging (2026-11-05/06)

## Alcance e infraestructura

- Objetivo: ensayo y verificación de RLS de nueve tablas comerciales. Staging reside en Railway PostgreSQL, exclusivamente. La base de Producción reside en Supabase y **no se modifica** con esta auditoría.
- Rama staging: `staging/prod-parity-guard-20261103`. PR #85 aporta el script `scripts/staging-rls-hardening.cjs` y los tests.
- El servicio de documentos de staging usa volumen privado Railway en `/data/cn-documents`. La prueba de PDF es sintética, sin dependencia de Supabase.
- La inspección de producción anterior identificó las nueve tablas sin RLS pero sin permisos directos `anon`/`authenticated`; no se propone alterar permisos públicos.

## Línea base comprobada en staging antes del ensayo

- Aplicación online y despliegue SUCCESS tras PR #85; GitHub Actions 11/11.
- Documento: `[STAGING_VOLUME_PDF_QA] PASS synthetic PDF write/read/download/delete, bytes=600`.
- Auditoría `[STAGING_RLS_QA] before: tables=8/9 enabled=0`; falta `origin_attribution_reviews` en staging, pero existe la definición canónica sin DML en `migrations/preflight_0004_origin_attribution_reviews.sql`.
- La inspección es lectura únicamente. No se interpretará un despliegue SUCCESS sin logs explícitos de `[STAGING_RLS_DDL] PASS`, `[STAGING_RLS_QA] PASS` y `[STAGING_RLS_ONE_TIME] PASS` como habilitación de RLS.

## Procedimiento de aplicación únicamente staging

1. Validar `RAILWAY_ENVIRONMENT_NAME=staging`, ID de staging esperado y host interno `postgres.railway.internal`.
2. Con la autorización temporal `STAGING_RLS_APPLY=true`, ejecutar dentro de una transacción solo el DDL `CREATE TABLE IF NOT EXISTS public.origin_attribution_reviews` de la migración canónica, **sin ejecutar consultas ni DML de revisión de atribución**.
3. Ejecutar el script `scripts/staging-rls-hardening.cjs --apply` que habilita RLS de forma transaccional en las nueve tablas, verifica catálogo, permisos y lecturas del rol de backend y revierte si encuentra un problema.
4. Verificar los logs y healthcheck. Restablecer `STAGING_RLS_APPLY=false` y retirar del predeploy la rutina temporal de creación/activación, conservando la inspección ordinaria.
5. Registrar cualquier anomalía sin inferir protección de producción a partir de las pruebas de staging.

## Fuera de alcance

- Ninguna migración ni cambio de grants, RLS o datos en Supabase producción.
- No cerrar ni fusionar PR históricos, ni ejecutar newsletters o envíos de Resend.
- No reutilizar Supabase staging antiguo ni borrar documentos de producción.
