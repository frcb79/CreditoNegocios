# Preflight de aislamiento — Railway, PostgreSQL, Supabase Storage y auto-deploy

**Fecha:** 14-oct-2026. **Solo lectura realizada.** Ningún servicio, BD, secreto, rama, volumen ni despliegue se modificó.

## Inventario observado directamente (API Railway OAuth)
- Proyecto: `graceful-perfection` (`de7f01a4-20f6-42d1-a7ab-bfe92005f473`)
- Servicio web: `CreditoNegocios` (`04a0ae42-8736-4252-94d2-63e5ee5fabb4`), estado live en ambos entornos
- Entorno `staging`: `e3134695-aaec-41e2-8622-41e3701ed985`. Origen declarado `frcb79/CreditoNegocios`, rama `main`, despliegue SUCCESS del 8-oct-2026.
- Entorno `production`: `ef78e3eb-2937-4c51-8fed-771d78240773`. Origen declarado `frcb79/CreditoNegocios` (la rama no está explícita en este objeto; verificar comportamiento efectivo), despliegue SUCCESS del 8-oct-2026.
- Ambos web tienen `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `SESSION_SECRET` declaradas.
- Railway OAuth oculta **valores** de variables. La presencia de un nombre **no prueba** aislamiento. Se prohíbe publicar las credenciales completas en issues, logs, ChatGPT o artefactos.
- Servicio `Postgres` (`8fdee276-8543-40e4-8531-825af7c921f9`) existe en `staging` con configuración live y volumen. En `production` la consulta `describe_service` indicó *no configuration in this environment*; esto NO determina qué base usa el servicio web de Producción ni si Staging usa el Postgres de Railway en vez de Supabase.
- **NO VERIFICADO:** valores/identidad DB; aislamiento de Storage y buckets; destino real de correos y OTP; comportamiento auto-deploy completo (especialmente Producción cuando cambia main); política de backup/recovery.

## Evidencia privada requerida antes de cualquier E2E Staging
Operador con acceso a Railway y Supabase:
1. Abra las variables **del servicio web y del entorno correcto** (no editar) y identifique para Staging y Producción qué backend se utiliza: proyecto Supabase/servidor PostgreSQL, base, servicio Railway y rol de conexión. Compare destino real, no sólo alias o nombre de variable.
2. Verifique que host/instancia/proyecto y base de datos difieren **físicamente**; un puerto/usuario distinto en un mismo cluster compartido no basta para nuestra estrategia de aislamiento. No copie aquí ni a GitHub `DATABASE_URL`, contraseñas o claves de servicio. Si se necesita evidencia pública, aporte sólo identificadores no sensibles o un dictamen firmado de 'distintos' y constancia del operador.
3. Compare `SUPABASE_URL` por proyecto, `SUPABASE_STORAGE_BUCKET` y las políticas RLS/buckets con prefijo, credenciales y permisos independientes. Evite reutilizar la misma `SUPABASE_SERVICE_ROLE_KEY`.
4. Confirme `ALLOWED_ORIGINS`, `FRONTEND_BASE_URL`, webhooks/callbacks, correo saliente, OTP, sesiones y rate limits: Staging no debe enviar comunicaciones ni operar contra clientes reales. Prueba con datos sintéticos y dominios de prueba.
5. Revise la fuente de despliegue web de **ambos** entornos. Staging ya figura conectado a `main`, no al SHA candidato. Antes de merge: detener/aislar el auto-deploy de Producción por medio de configuración autorizada y verificable, preferentemente fijando estrategia de aprobación manual/branch protegido. Esta revisión no autoriza modificar ajustes.
6. Realice y verifique backup/restauración con datos *sintéticos* y un preflight repetible de migraciones sobre copia. Nunca `DROP/TRUNCATE` en entornos operativos sin instrucción separada.
7. Documente quién revisó, fecha, IDs de proyecto/entorno/servicio (sin secretos), evidencia de backup y resultado `PASS/FAIL/BLOCKED` por ítem. Dos pares de credenciales diferentes por sí solos no certifican bases diferentes.

## Decisión y controles de corte
- El PR #10 permanece **Draft / NO MERGE**. El código de LEG-10 impide marcar envíos a financieras hasta existir evidencia legal válida.
- Para probar el SHA candidato, preparar primero una instancia de Staging **realmente aislada y apuntando al commit candidato**, no tocar Producción ni presumir que el Staging conectado a main prueba esa versión.
- Si el proyecto tiene datos de pruebas que se quieran borrar, preparar inventario y respaldo; el borrado se autoriza únicamente como operación explícita de cutover. Nunca borrar evidencias legales o bitácoras sin clasificación de retención.
- Mantener `main` fijo hasta GO comercial+legal+QA, autorización específica de infraestructura y política anti-auto-deploy. Un CI verde no autoriza merge si las bases no están comprobadas como distintas.

## Resultado de lectura actual
| Gate | Dictamen |
|---|---|
| Dos nombres de entorno Railway | OBSERVADO |
| Staging y Producción con URL DB declarada | OBSERVADO, valor oculto |
| Staging y Producción en clusters y Storage independientes | **BLOCKED: sin acceso a valores/identidad** |
| Auto-deploy de Producción inocuo al merge | **NO DEMOSTRADO** |
| Branch candidata desplegada en Staging | **NO**: la configuración observada de Staging apunta a `main` |
| Autorización para migraciones/limpieza/cambio de servicio | **NO concedida** |

Este documento es evidencia de observación y checklist; **no implica** migración ejecutada, cambio de variables, aprobación de datos reales, deploy ni GO.
