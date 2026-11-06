# Revisión de RLS — tablas comerciales (2026-11-05)

## Estado comprobado en producción
- Hay nueve tablas en `public` con `relrowsecurity = false`.
- Los roles `anon` y `authenticated` NO tienen SELECT, INSERT, UPDATE ni DELETE en ninguna de las nueve tablas, según `has_table_privilege`.
- `service_role` tiene SELECT. El backend utiliza consultas PostgreSQL desde `server/db.ts`; no depende de exponer estas tablas directamente en el navegador.
- No se detectaron políticas en `pg_policies` para estas nueve tablas.
- Por ello, el riesgo de lectura/escritura pública inmediata NO es el mismo que una tabla con grants abiertos; sin embargo, la falta de RLS debilita la defensa en profundidad.

## Migración PROPUESTA — NO ejecutada
**No aplicar en producción antes de un ensayo sobre staging.** No es una migración autodesplegable.

```sql
BEGIN;
ALTER TABLE public.origin_attribution_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_resource_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_resource_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_resource_artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_approved_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_profile_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_campaign_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_resource_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_resource_topics ENABLE ROW LEVEL SECURITY;
COMMIT;
```

## Pruebas de aprobación
1. En staging oficial Railway, ejecutar la migración en una transacción tras asegurar respaldo y capacidad de revertir. Confirmar conectividad del rol real que usa `DATABASE_URL` antes de ejecutar.
2. Validar lectura, edición y publicación de plantillas; imágenes/arte y logos, links públicos, captación de prospectos, atribución y control por tenant/broker.
3. Verificar bloqueo de acceso directo con roles `anon` y `authenticated`; sin conceder privilegios ni crear políticas indiscriminadas.
4. Confirmar que backend, jobs, migraciones y `service_role` mantienen sus accesos autorizados. Comprobar que `pg_class.relrowsecurity=true` en las nueve tablas.
5. Desplegar a producción únicamente después de QA y aprobación. Si alguna funcionalidad requiriera acceso directo de usuario, diseñar GRANTs y políticas RLS mínimas por operación y propietario/tenant.

## Coordinación con los PR
- PR #81 (matching, formulario público, Recursos Comerciales) está desplegado en producción. Este cambio NO está aplicado.
- PR #79 (Auditoría Resend) no depende de estas nueve tablas: el SQL de auditoría consulta bitácoras de envíos y `users`.
- La clave de Resend en `.replit` debe eliminarse del repo y rotarse en Resend de forma coordinada con Railway; eliminarla de la rama actual no borra su historial Git.

Documentación: https://supabase.com/docs/guides/database/postgres/row-level-security
